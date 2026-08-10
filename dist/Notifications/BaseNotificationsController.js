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
            const requestType = (_a = req.body) === null || _a === void 0 ? void 0 : _a.__type;
            if (requestType === "list") {
                return yield this.list(req, res);
            }
            if (requestType === "details") {
                return yield this.details(req, res);
            }
            if (requestType === "mark_one_as_read") {
                return yield this.markOneAsRead(req, res);
            }
            if (requestType === "mark_all_as_read") {
                return yield this.markAllAsRead(req, res);
            }
            if (requestType === "mark_all_as_viewed") {
                return yield this.markAllAsViewed(req, res);
            }
            return res.status(400).send({
                status: "error",
                message: "Invalid notification request.",
            });
        });
    }
    getUserId(req) {
        var _a, _b, _c, _d, _e;
        return __awaiter(this, void 0, void 0, function* () {
            const configuredResolver = (_a = NotificationService_1.NotificationService.notificationsConfig) === null || _a === void 0 ? void 0 : _a.getUserIdByRequest;
            if (typeof configuredResolver === "function") {
                return yield configuredResolver(req);
            }
            return (_e = (_c = (_b = req.user) === null || _b === void 0 ? void 0 : _b._id) !== null && _c !== void 0 ? _c : (_d = req.user) === null || _d === void 0 ? void 0 : _d.id) !== null && _e !== void 0 ? _e : null;
        });
    }
    getNotificationReference(req) {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        return (_h = (_f = (_d = (_b = (_a = req.body) === null || _a === void 0 ? void 0 : _a._notification) !== null && _b !== void 0 ? _b : (_c = req.body) === null || _c === void 0 ? void 0 : _c.notification) !== null && _d !== void 0 ? _d : (_e = req.body) === null || _e === void 0 ? void 0 : _e._id) !== null && _f !== void 0 ? _f : (_g = req.body) === null || _g === void 0 ? void 0 : _g.id) !== null && _h !== void 0 ? _h : null;
    }
    serializeNotification(notification) {
        return notification.toArray();
    }
    parsePaginationValue(value, fallback, maximum) {
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || parsed < 0)
            return fallback;
        const integer = Math.floor(parsed);
        return maximum !== undefined ? Math.min(integer, maximum) : integer;
    }
    unauthorized(res) {
        return res.status(401).send({
            status: "error",
            message: "Authenticated user required.",
        });
    }
    notificationNotFound(res) {
        return res.status(404).send({
            status: "error",
            message: "Notification not found.",
        });
    }
    list(req, res) {
        var _a, _b;
        return __awaiter(this, void 0, void 0, function* () {
            const userId = yield this.getUserId(req);
            if (!userId)
                return this.unauthorized(res);
            const offset = this.parsePaginationValue((_a = req.body) === null || _a === void 0 ? void 0 : _a.offset, 0);
            const limit = this.parsePaginationValue((_b = req.body) === null || _b === void 0 ? void 0 : _b.limit, 10, 100) || 10;
            const [loadedNotifications, unreadCount, unviewedCount] = yield Promise.all([
                NotificationService_1.NotificationService.loadNotifications({
                    _user: userId,
                    offset,
                    limit: limit + 1,
                    request: req,
                }),
                NotificationService_1.NotificationService.getUserUnreadCount(userId, req),
                NotificationService_1.NotificationService.getUserUnviewedCount(userId, req),
            ]);
            const hasMore = loadedNotifications.length > limit;
            const entries = loadedNotifications.slice(0, limit).map((notification) => this.serializeNotification(notification));
            return res.send({
                status: "success",
                data: {
                    entries,
                    unread_count: unreadCount,
                    unviewed_count: unviewedCount,
                    has_more: hasMore,
                },
            });
        });
    }
    details(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            const userId = yield this.getUserId(req);
            if (!userId)
                return this.unauthorized(res);
            const notificationRef = this.getNotificationReference(req);
            if (!notificationRef)
                return this.notificationNotFound(res);
            const notification = yield NotificationService_1.NotificationService.getNotificationForUser(notificationRef, userId, req);
            if (!notification)
                return this.notificationNotFound(res);
            return res.send({
                status: "success",
                data: {
                    entry: this.serializeNotification(notification),
                },
            });
        });
    }
    markOneAsRead(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            const userId = yield this.getUserId(req);
            if (!userId)
                return this.unauthorized(res);
            const notificationRef = this.getNotificationReference(req);
            if (!notificationRef)
                return this.notificationNotFound(res);
            const notification = yield NotificationService_1.NotificationService.getNotificationForUser(notificationRef, userId, req);
            if (!notification)
                return this.notificationNotFound(res);
            const updatedNotification = yield NotificationService_1.NotificationService.markAsRead(notification);
            return res.send({
                status: "success",
                data: {
                    entry: this.serializeNotification(updatedNotification),
                    message: "Notification marked as read.",
                },
            });
        });
    }
    markAllAsRead(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            const userId = yield this.getUserId(req);
            if (!userId)
                return this.unauthorized(res);
            yield NotificationService_1.NotificationService.markAllAsRead(userId, req);
            return res.send({
                status: "success",
                data: {
                    message: "All notifications marked as read.",
                },
            });
        });
    }
    markAllAsViewed(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            const userId = yield this.getUserId(req);
            if (!userId)
                return this.unauthorized(res);
            yield NotificationService_1.NotificationService.markAllAsViewed(userId, req);
            return res.send({
                status: "success",
                data: {
                    message: "All notifications marked as viewed.",
                },
            });
        });
    }
}
exports.BaseNotificationsController = BaseNotificationsController;
