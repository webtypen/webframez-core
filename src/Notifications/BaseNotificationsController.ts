import { Controller } from "../Controller/Controller";
import { Request } from "../Router/Request";
import { Response } from "../Router/Response";
import { Notification } from "./Notification";
import { NotificationService } from "./NotificationService";

export class BaseNotificationsController extends Controller {
    async endpoint(req: Request, res: Response) {
        const requestType = req.body?.__type;
        if (requestType === "list") {
            return await this.list(req, res);
        }
        if (requestType === "details") {
            return await this.details(req, res);
        }
        if (requestType === "mark_one_as_read") {
            return await this.markOneAsRead(req, res);
        }
        if (requestType === "mark_all_as_read") {
            return await this.markAllAsRead(req, res);
        }
        if (requestType === "mark_all_as_viewed") {
            return await this.markAllAsViewed(req, res);
        }

        return res.status(400).send({
            status: "error",
            message: "Invalid notification request.",
        });
    }

    protected async getUserId(req: Request) {
        const configuredResolver = NotificationService.notificationsConfig?.getUserIdByRequest;
        if (typeof configuredResolver === "function") {
            return await configuredResolver(req);
        }
        return req.user?._id ?? req.user?.id ?? null;
    }

    protected getNotificationReference(req: Request) {
        return req.body?._notification ?? req.body?.notification ?? req.body?._id ?? req.body?.id ?? null;
    }

    protected serializeNotification(notification: Notification) {
        return notification.toArray();
    }

    private parsePaginationValue(value: any, fallback: number, maximum?: number) {
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || parsed < 0) return fallback;
        const integer = Math.floor(parsed);
        return maximum !== undefined ? Math.min(integer, maximum) : integer;
    }

    private unauthorized(res: Response) {
        return res.status(401).send({
            status: "error",
            message: "Authenticated user required.",
        });
    }

    private notificationNotFound(res: Response) {
        return res.status(404).send({
            status: "error",
            message: "Notification not found.",
        });
    }

    async list(req: Request, res: Response) {
        const userId = await this.getUserId(req);
        if (!userId) return this.unauthorized(res);

        const offset = this.parsePaginationValue(req.body?.offset, 0);
        const limit = this.parsePaginationValue(req.body?.limit, 10, 100) || 10;
        const [loadedNotifications, unreadCount, unviewedCount] = await Promise.all([
            NotificationService.loadNotifications({
                _user: userId,
                offset,
                limit: limit + 1,
                request: req,
            }),
            NotificationService.getUserUnreadCount(userId, req),
            NotificationService.getUserUnviewedCount(userId, req),
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
    }

    async details(req: Request, res: Response) {
        const userId = await this.getUserId(req);
        if (!userId) return this.unauthorized(res);

        const notificationRef = this.getNotificationReference(req);
        if (!notificationRef) return this.notificationNotFound(res);

        const notification = await NotificationService.getNotificationForUser(notificationRef, userId, req);
        if (!notification) return this.notificationNotFound(res);

        return res.send({
            status: "success",
            data: {
                entry: this.serializeNotification(notification),
            },
        });
    }

    async markOneAsRead(req: Request, res: Response) {
        const userId = await this.getUserId(req);
        if (!userId) return this.unauthorized(res);

        const notificationRef = this.getNotificationReference(req);
        if (!notificationRef) return this.notificationNotFound(res);

        const notification = await NotificationService.getNotificationForUser(notificationRef, userId, req);
        if (!notification) return this.notificationNotFound(res);

        const updatedNotification = await NotificationService.markAsRead(notification);
        return res.send({
            status: "success",
            data: {
                entry: this.serializeNotification(updatedNotification),
                message: "Notification marked as read.",
            },
        });
    }

    async markAllAsRead(req: Request, res: Response) {
        const userId = await this.getUserId(req);
        if (!userId) return this.unauthorized(res);

        await NotificationService.markAllAsRead(userId, req);
        return res.send({
            status: "success",
            data: {
                message: "All notifications marked as read.",
            },
        });
    }

    async markAllAsViewed(req: Request, res: Response) {
        const userId = await this.getUserId(req);
        if (!userId) return this.unauthorized(res);

        await NotificationService.markAllAsViewed(userId, req);
        return res.send({
            status: "success",
            data: {
                message: "All notifications marked as viewed.",
            },
        });
    }
}
