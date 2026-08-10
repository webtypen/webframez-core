"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationService = void 0;
const mongodb_1 = require("mongodb");
const Notification_1 = require("./Notification");
const Config_1 = require("../Config");
const DBConnection_1 = require("../Database/DBConnection");
const QueueJobsRegisty_1 = require("../Queue/QueueJobsRegisty");
class NotificationServiceFacade {
    constructor() {
        this.registy = {};
        this.notificationsConfig = {};
    }
    init() {
        this.registy = {};
        this.notificationsConfig = Config_1.Config.get("notifications") || {};
        if (Array.isArray(this.notificationsConfig.types)) {
            for (let t of this.notificationsConfig.types) {
                this.registy[t.key] = t;
            }
        }
    }
    getTypeOrFail(typeKey) {
        if (this.registy[typeKey]) {
            return this.registy[typeKey];
        }
        throw new Error("Invalid notification-type '" + typeKey + "' ...");
    }
    getErrorMessage(error) {
        if ((error === null || error === void 0 ? void 0 : error.message) && error.message.toString().trim() !== "") {
            return error.message.toString();
        }
        if (error && error.toString().trim() !== "") {
            return error.toString();
        }
        return "Unknown notification queue-job error";
    }
    normalizeUserId(_user) {
        return typeof _user === "string" && _user.length === 24 && mongodb_1.ObjectId.isValid(_user) ? new mongodb_1.ObjectId(_user) : _user;
    }
    getLoadMatch(options) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            const additionalMatch = ((_a = this.notificationsConfig) === null || _a === void 0 ? void 0 : _a.onLoadNotificationsMatch)
                ? yield this.notificationsConfig.onLoadNotificationsMatch(options)
                : {};
            return Object.assign(Object.assign({}, (additionalMatch || {})), { _user: this.normalizeUserId(options._user), key: { $in: Object.keys(this.registy) }, show_at: { $lte: new Date() } });
        });
    }
    enrichNotification(notification) {
        return __awaiter(this, void 0, void 0, function* () {
            const notType = (notification === null || notification === void 0 ? void 0 : notification.key) ? this.registy[notification.key] : null;
            if (!notType)
                return null;
            notification.title = notType.getTitle
                ? yield notType.getTitle(notification)
                : notType.title !== undefined
                    ? notType.title
                    : null;
            notification.description = notType.getDescription
                ? yield notType.getDescription(notification)
                : notType.description !== undefined
                    ? notType.description
                    : null;
            notification.link = notType.getLink
                ? yield notType.getLink(notification)
                : notType.link !== undefined
                    ? notType.link
                    : null;
            return notification;
        });
    }
    create(typeKey, payload, options) {
        var _a, _b;
        return __awaiter(this, void 0, void 0, function* () {
            const notType = this.getTypeOrFail(typeKey);
            const notificationMode = notType.mode || "fixed";
            if (notType.queueJobAutomation && notificationMode !== "changing") {
                throw new Error(`Notification-type '${notType.key}' can only use queueJobAutomation in changing mode.`);
            }
            const notification = new Notification_1.Notification();
            notification.key = notType.key;
            notification.mode = notificationMode;
            notification.group_key = notType.getGroupKey ? yield notType.getGroupKey(payload, options) : null;
            if (options === null || options === void 0 ? void 0 : options.baseData) {
                for (let key in options.baseData) {
                    notification[key] = options.baseData[key];
                }
            }
            if (notification.payload) {
                notification.payload = Object.assign(Object.assign({}, notification.payload), payload);
            }
            else {
                notification.payload = payload;
            }
            notification.key = notType.key;
            notification.mode = notificationMode;
            notification.created_at = new Date();
            notification.read_status = "unread";
            notification.read_at = null;
            notification.view_status = "unviewed";
            notification.viewed_at = null;
            notification.show_at = (options === null || options === void 0 ? void 0 : options.showAt) || new Date();
            if (notification.mode === "changing") {
                notification.changing_status = "pending";
                notification.changing_error = null;
            }
            if (options === null || options === void 0 ? void 0 : options._user) {
                if (typeof options._user === "string" && options._user.length === 24) {
                    notification._user = new mongodb_1.ObjectId(options._user);
                }
                else {
                    notification._user = options._user;
                }
            }
            if ((_a = this.notificationsConfig) === null || _a === void 0 ? void 0 : _a.beforeNotificationSave) {
                yield this.notificationsConfig.beforeNotificationSave(notification);
            }
            if (notType.beforeSave) {
                yield notType.beforeSave(notification);
            }
            yield notification.save();
            if (notType.queueJobAutomation) {
                try {
                    const shouldCreateJob = notType.queueJobAutomation.check
                        ? yield notType.queueJobAutomation.check(notification)
                        : true;
                    if (!shouldCreateJob) {
                        yield this.setChangingStatus(notification, "success");
                    }
                    else {
                        const queueJobType = QueueJobsRegisty_1.QueueJobsRegisty.getJobOrFail(notType.queueJobAutomation.job);
                        const queueJob = yield queueJobType.create({
                            status: "initializing",
                            notification_queue_job: true,
                            _notification: notification._id,
                        });
                        notification._queue_job = queueJob._id;
                        yield notification.save();
                        queueJob.status = "pending";
                        yield queueJob.save();
                    }
                }
                catch (error) {
                    yield this.setChangingStatus(notification, "error", this.getErrorMessage(error));
                    throw error;
                }
            }
            if ((_b = this.notificationsConfig) === null || _b === void 0 ? void 0 : _b.afterNotificationSave) {
                yield this.notificationsConfig.afterNotificationSave(notification);
            }
            if (notType.afterSave) {
                yield notType.afterSave(notification);
            }
            return notification;
        });
    }
    getNotification(notificationRef) {
        return __awaiter(this, void 0, void 0, function* () {
            if (notificationRef instanceof Notification_1.Notification) {
                return notificationRef;
            }
            if (typeof notificationRef === "string" || notificationRef instanceof mongodb_1.ObjectId) {
                const loadNotification = yield Notification_1.Notification.where("_id", "=", yield Notification_1.Notification.objectId(notificationRef)).first();
                if (loadNotification) {
                    return loadNotification;
                }
            }
            throw new Error("Invalid notification type provided: " + (notificationRef === null || notificationRef === void 0 ? void 0 : notificationRef.toString()));
        });
    }
    markAsRead(notification) {
        return __awaiter(this, void 0, void 0, function* () {
            notification = yield this.getNotification(notification);
            if (notification.read_status === "read" && notification.view_status === "viewed") {
                return notification;
            }
            const now = new Date();
            notification.read_at = notification.read_at || now;
            notification.read_status = "read";
            notification.viewed_at = notification.viewed_at || now;
            notification.view_status = "viewed";
            yield notification.save();
            return notification;
        });
    }
    markAsViewed(notification) {
        return __awaiter(this, void 0, void 0, function* () {
            notification = yield this.getNotification(notification);
            if (notification.view_status === "viewed") {
                return notification;
            }
            notification.viewed_at = new Date();
            notification.view_status = "viewed";
            yield notification.save();
            return notification;
        });
    }
    markAllAsRead(_user, request) {
        return __awaiter(this, void 0, void 0, function* () {
            const connection = yield DBConnection_1.DBConnection.getConnection();
            const now = new Date();
            yield connection.client
                .db(null)
                .collection(new Notification_1.Notification().__table)
                .updateMany(Object.assign(Object.assign({}, (yield this.getLoadMatch({ _user, request }))), { $or: [{ read_status: "unread" }, { view_status: "unviewed" }] }), [
                {
                    $set: {
                        read_at: { $ifNull: ["$read_at", now] },
                        read_status: "read",
                        viewed_at: { $ifNull: ["$viewed_at", now] },
                        view_status: "viewed",
                    },
                },
            ]);
        });
    }
    markAllAsViewed(_user, request) {
        return __awaiter(this, void 0, void 0, function* () {
            const connection = yield DBConnection_1.DBConnection.getConnection();
            yield connection.client
                .db(null)
                .collection(new Notification_1.Notification().__table)
                .updateMany(Object.assign(Object.assign({}, (yield this.getLoadMatch({ _user, request }))), { view_status: "unviewed" }), {
                $set: {
                    viewed_at: new Date(),
                    view_status: "viewed",
                },
            });
        });
    }
    getNotificationForUser(notificationRef, _user, request) {
        return __awaiter(this, void 0, void 0, function* () {
            const notificationId = notificationRef instanceof Notification_1.Notification ? notificationRef._id : notificationRef;
            if (!notificationId)
                return null;
            let objectId;
            if (notificationId instanceof mongodb_1.ObjectId) {
                objectId = notificationId;
            }
            else if (typeof notificationId === "string" && mongodb_1.ObjectId.isValid(notificationId)) {
                objectId = new mongodb_1.ObjectId(notificationId);
            }
            else {
                return null;
            }
            const notifications = yield Notification_1.Notification.aggregate([
                {
                    $match: Object.assign(Object.assign({}, (yield this.getLoadMatch({ _user, request }))), { _id: objectId }),
                },
                { $limit: 1 },
            ]);
            if (!notifications || notifications.length === 0)
                return null;
            const notification = DBConnection_1.DBConnection.mapDataToModel(Notification_1.Notification, notifications[0]);
            return yield this.enrichNotification(notification);
        });
    }
    countByStatus(options, match) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield Notification_1.Notification.aggregate([
                {
                    $match: Object.assign(Object.assign({}, (yield this.getLoadMatch(options))), match),
                },
                { $count: "count" },
            ]);
            return result && result[0] && typeof result[0].count === "number" ? result[0].count : 0;
        });
    }
    getUserUnreadCount(_user, request) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.countByStatus({ _user, request }, { read_status: "unread" });
        });
    }
    getUserUnviewedCount(_user, request) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.countByStatus({ _user, request }, { view_status: "unviewed" });
        });
    }
    countUnreadNotifications(options) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.getUserUnreadCount(options._user, options.request);
        });
    }
    updateNotification(notification, updateData) {
        return __awaiter(this, void 0, void 0, function* () {
            notification = yield this.getNotification(notification);
            if (updateData.payload) {
                notification.payload = Object.assign(Object.assign({}, notification.payload), updateData.payload);
            }
            if (updateData._user !== undefined) {
                if (typeof updateData._user === "string" && updateData._user.length === 24) {
                    notification._user = new mongodb_1.ObjectId(updateData._user);
                }
                else {
                    notification._user = updateData._user;
                }
            }
            if (updateData.show_at !== undefined) {
                notification.show_at = updateData.show_at;
            }
            if (updateData.read_status !== undefined) {
                notification.read_status = updateData.read_status;
            }
            if (updateData.read_at !== undefined) {
                notification.read_at = updateData.read_at;
            }
            if (updateData.view_status !== undefined) {
                notification.view_status = updateData.view_status;
            }
            if (updateData.viewed_at !== undefined) {
                notification.viewed_at = updateData.viewed_at;
            }
            yield notification.save();
            return notification;
        });
    }
    setChangingStatus(notification, status, error) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            notification = yield this.getNotification(notification);
            if (notification.mode !== "changing") {
                throw new Error(`Notification '${(_a = notification._id) === null || _a === void 0 ? void 0 : _a.toString()}' is not in changing mode.`);
            }
            notification.changing_status = status;
            notification.changing_error = status === "error" ? error || "Unknown notification error" : null;
            yield notification.save();
            return notification;
        });
    }
    loadNotifications(options) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!(options === null || options === void 0 ? void 0 : options._user))
                return [];
            const notifications = yield Notification_1.Notification.aggregate([
                {
                    $match: yield this.getLoadMatch(options),
                },
                {
                    $sort: { show_at: -1 },
                },
                {
                    $skip: (options === null || options === void 0 ? void 0 : options.offset) || 0,
                },
                {
                    $limit: (options === null || options === void 0 ? void 0 : options.limit) || 10,
                },
            ]);
            if (!notifications || notifications.length === 0)
                return [];
            const out = [];
            for (const notificationData of notifications) {
                const el = DBConnection_1.DBConnection.mapDataToModel(Notification_1.Notification, notificationData);
                const enrichedNotification = yield this.enrichNotification(el);
                if (enrichedNotification)
                    out.push(enrichedNotification);
            }
            return out;
        });
    }
}
exports.NotificationService = new NotificationServiceFacade();
