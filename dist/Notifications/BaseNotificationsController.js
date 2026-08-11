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
exports.BaseNotificationsController = void 0;
const Controller_1 = require("../Controller/Controller");
const NotificationService_1 = require("./NotificationService");
class BaseNotificationsController extends Controller_1.Controller {
    endpoint(req, res) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            const actionName = this.getActionName((_a = req.body) === null || _a === void 0 ? void 0 : _a.__type);
            const action = actionName ? this[actionName] : null;
            if (typeof action !== "function") {
                return res.status(400).send({ status: "error", message: "Invalid notification request." });
            }
            return yield action.call(this, req, res);
        });
    }
    getActionName(type) {
        return {
            list: "list",
            counts: "counts",
            details: "details",
            mark_one_as_read: "markOneAsRead",
            mark_all_as_read: "markAllAsRead",
            mark_all_as_viewed: "markAllAsViewed",
            definition: "definition",
            create: "create",
            preferences: "preferences",
            save_preferences: "savePreferences",
        }[type];
    }
    getNotificationReference(req) {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        return (_h = (_f = (_d = (_b = (_a = req.body) === null || _a === void 0 ? void 0 : _a._notification) !== null && _b !== void 0 ? _b : (_c = req.body) === null || _c === void 0 ? void 0 : _c.notification) !== null && _d !== void 0 ? _d : (_e = req.body) === null || _e === void 0 ? void 0 : _e._id) !== null && _f !== void 0 ? _f : (_g = req.body) === null || _g === void 0 ? void 0 : _g.id) !== null && _h !== void 0 ? _h : null;
    }
    serializeNotification(notification) {
        return notification.toArray();
    }
    createNotification(req, key, payload, targetContext) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield NotificationService_1.NotificationService.create(key, payload, Object.assign(Object.assign({}, targetContext), { request: req }));
        });
    }
    parsePaginationValue(value, fallback, maximum) {
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || parsed < 0)
            return fallback;
        const integer = Math.floor(parsed);
        return maximum !== undefined ? Math.min(integer, maximum) : integer;
    }
    notificationNotFound(res) {
        return res.status(404).send({ status: "error", message: "Notification not found." });
    }
    getAuthorizedTarget(req, res) {
        var _a, _b;
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const context = yield NotificationService_1.NotificationService.authorizeTarget({
                    target: (_a = req.body) === null || _a === void 0 ? void 0 : _a.target,
                    target_id: (_b = req.body) === null || _b === void 0 ? void 0 : _b.target_id,
                    request: req,
                });
                if (!context) {
                    res.status(404).send({ status: "error", message: "Notification target not found." });
                    return null;
                }
                return context;
            }
            catch (error) {
                if (error instanceof NotificationService_1.NotificationTargetValidationError) {
                    res.status(400).send({ status: "error", message: error.message });
                    return null;
                }
                throw error;
            }
        });
    }
    getTypeForTarget(key, target) {
        const type = NotificationService_1.NotificationService.getTypeOrFail(key);
        return type.targets.includes(target) ? type : null;
    }
    definition(req, res) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            const context = yield this.getAuthorizedTarget(req, res);
            if (!context)
                return;
            const key = (_a = req.body) === null || _a === void 0 ? void 0 : _a.key;
            if (typeof key !== "string" || key.trim() === "") {
                return res.status(400).send({ status: "error", message: "Notification type key required." });
            }
            try {
                if (!this.getTypeForTarget(key, context.target))
                    throw new Error("not available");
                return res.send({
                    status: "success",
                    data: { definition: NotificationService_1.NotificationService.getPublicTypeDefinition(key) },
                });
            }
            catch (_error) {
                return res.status(404).send({ status: "error", message: "Notification type not found." });
            }
        });
    }
    create(req, res) {
        var _a, _b;
        return __awaiter(this, void 0, void 0, function* () {
            const context = yield this.getAuthorizedTarget(req, res);
            if (!context)
                return;
            const key = (_a = req.body) === null || _a === void 0 ? void 0 : _a.key;
            if (typeof key !== "string" || key.trim() === "") {
                return res.status(400).send({ status: "error", message: "Notification type key required." });
            }
            const payload = (_b = req.body) === null || _b === void 0 ? void 0 : _b.payload;
            if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
                return res.status(400).send({ status: "error", message: "Notification payload must be an object." });
            }
            let type;
            try {
                type = this.getTypeForTarget(key, context.target);
            }
            catch (_error) {
                type = null;
            }
            if (!type)
                return res.status(404).send({ status: "error", message: "Notification type not found." });
            if ((type.mode || "fixed") !== "changing" || !type.queueJobAutomation) {
                return res.status(400).send({
                    status: "error",
                    message: "Notification type does not start an automated queue job.",
                });
            }
            try {
                const notification = yield this.createNotification(req, key, payload, context);
                if (!notification) {
                    return res.status(403).send({ status: "error", message: "Notification type is disabled." });
                }
                return res.send({ status: "success", data: { entry: this.serializeNotification(notification) } });
            }
            catch (error) {
                return res
                    .status(error instanceof NotificationService_1.NotificationPayloadValidationError ||
                    error instanceof NotificationService_1.NotificationTargetValidationError
                    ? 400
                    : 500)
                    .send({ status: "error", message: (error === null || error === void 0 ? void 0 : error.message) || "Notification could not be created." });
            }
        });
    }
    preferences(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            const context = yield this.getAuthorizedTarget(req, res);
            if (!context)
                return;
            const preferences = yield NotificationService_1.NotificationService.getTargetPreferences(context);
            if (!preferences) {
                return res.status(404).send({ status: "error", message: "Notification target not found." });
            }
            return res.send({ status: "success", data: preferences });
        });
    }
    savePreferences(req, res) {
        var _a, _b, _c;
        return __awaiter(this, void 0, void 0, function* () {
            const context = yield this.getAuthorizedTarget(req, res);
            if (!context)
                return;
            const key = (_a = req.body) === null || _a === void 0 ? void 0 : _a.key;
            const enabled = (_b = req.body) === null || _b === void 0 ? void 0 : _b.enabled;
            const outputChannels = (_c = req.body) === null || _c === void 0 ? void 0 : _c.output_channels;
            if (typeof key !== "string" || key.trim() === "") {
                return res.status(400).send({ status: "error", message: "Notification type key required." });
            }
            if (typeof enabled !== "boolean") {
                return res.status(400).send({ status: "error", message: "Enabled must be a boolean." });
            }
            if (!Array.isArray(outputChannels) || outputChannels.some((channel) => typeof channel !== "string")) {
                return res.status(400).send({ status: "error", message: "Output channels must be an array of strings." });
            }
            try {
                const entry = yield NotificationService_1.NotificationService.saveTargetPreference(key, { enabled, output_channels: outputChannels }, context);
                if (!entry)
                    return res.status(404).send({ status: "error", message: "Notification target not found." });
                return res.send({ status: "success", data: { entry } });
            }
            catch (error) {
                return res.status(400).send({ status: "error", message: (error === null || error === void 0 ? void 0 : error.message) || "Preferences could not be saved." });
            }
        });
    }
    list(req, res) {
        var _a, _b;
        return __awaiter(this, void 0, void 0, function* () {
            const context = yield this.getAuthorizedTarget(req, res);
            if (!context)
                return;
            const offset = this.parsePaginationValue((_a = req.body) === null || _a === void 0 ? void 0 : _a.offset, 0);
            const limit = this.parsePaginationValue((_b = req.body) === null || _b === void 0 ? void 0 : _b.limit, 10, 100) || 10;
            const [loaded, unreadCount, unviewedCount] = yield Promise.all([
                NotificationService_1.NotificationService.loadNotifications(Object.assign(Object.assign({}, context), { offset, limit: limit + 1 })),
                NotificationService_1.NotificationService.getUnreadCount(context),
                NotificationService_1.NotificationService.getUnviewedCount(context),
            ]);
            return res.send({
                status: "success",
                data: {
                    entries: loaded.slice(0, limit).map((entry) => this.serializeNotification(entry)),
                    unread_count: unreadCount,
                    unviewed_count: unviewedCount,
                    has_more: loaded.length > limit,
                },
            });
        });
    }
    counts(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            const context = yield this.getAuthorizedTarget(req, res);
            if (!context)
                return;
            const [unreadCount, unviewedCount] = yield Promise.all([
                NotificationService_1.NotificationService.getUnreadCount(context),
                NotificationService_1.NotificationService.getUnviewedCount(context),
            ]);
            return res.send({ status: "success", data: { unread_count: unreadCount, unviewed_count: unviewedCount } });
        });
    }
    details(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            const context = yield this.getAuthorizedTarget(req, res);
            if (!context)
                return;
            const notification = yield NotificationService_1.NotificationService.getNotificationForTarget(this.getNotificationReference(req), context);
            if (!notification)
                return this.notificationNotFound(res);
            return res.send({ status: "success", data: { entry: this.serializeNotification(notification) } });
        });
    }
    markOneAsRead(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            const context = yield this.getAuthorizedTarget(req, res);
            if (!context)
                return;
            const notification = yield NotificationService_1.NotificationService.getNotificationForTarget(this.getNotificationReference(req), context);
            if (!notification)
                return this.notificationNotFound(res);
            const entry = yield NotificationService_1.NotificationService.markAsRead(notification);
            return res.send({ status: "success", data: { entry: this.serializeNotification(entry) } });
        });
    }
    markAllAsRead(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            const context = yield this.getAuthorizedTarget(req, res);
            if (!context)
                return;
            yield NotificationService_1.NotificationService.markAllAsRead(context);
            return res.send({ status: "success", data: { message: "All notifications marked as read." } });
        });
    }
    markAllAsViewed(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            const context = yield this.getAuthorizedTarget(req, res);
            if (!context)
                return;
            yield NotificationService_1.NotificationService.markAllAsViewed(context);
            return res.send({ status: "success", data: { message: "All notifications marked as viewed." } });
        });
    }
}
exports.BaseNotificationsController = BaseNotificationsController;
