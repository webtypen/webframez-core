import { Controller } from "../Controller/Controller";
import { Request } from "../Router/Request";
import { Response } from "../Router/Response";
import { Notification } from "./Notification";
import {
    NotificationPayloadValidationError,
    NotificationService,
    NotificationTargetContext,
    NotificationTargetValidationError,
} from "./NotificationService";

export class BaseNotificationsController extends Controller {
    async endpoint(req: Request, res: Response) {
        const actionName = this.getActionName(req.body?.__type);
        const action = actionName ? (this as any)[actionName] : null;
        if (typeof action !== "function") {
            return res.status(400).send({ status: "error", message: "Invalid notification request." });
        }
        return await action.call(this, req, res);
    }

    private getActionName(type: any) {
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
        }[type as string];
    }

    protected getNotificationReference(req: Request) {
        return req.body?._notification ?? req.body?.notification ?? req.body?._id ?? req.body?.id ?? null;
    }

    protected serializeNotification(notification: Notification) {
        return notification.toArray();
    }

    protected async createNotification(
        req: Request,
        key: string,
        payload: Record<string, any>,
        targetContext: NotificationTargetContext,
    ) {
        return await NotificationService.create(key, payload, { ...targetContext, request: req });
    }

    private parsePaginationValue(value: any, fallback: number, maximum?: number) {
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || parsed < 0) return fallback;
        const integer = Math.floor(parsed);
        return maximum !== undefined ? Math.min(integer, maximum) : integer;
    }

    private notificationNotFound(res: Response) {
        return res.status(404).send({ status: "error", message: "Notification not found." });
    }

    private async getAuthorizedTarget(req: Request, res: Response): Promise<NotificationTargetContext | null> {
        try {
            const context = await NotificationService.authorizeTarget({
                target: req.body?.target,
                target_id: req.body?.target_id,
                request: req,
            });
            if (!context) {
                res.status(404).send({ status: "error", message: "Notification target not found." });
                return null;
            }
            return context;
        } catch (error: any) {
            if (error instanceof NotificationTargetValidationError) {
                res.status(400).send({ status: "error", message: error.message });
                return null;
            }
            throw error;
        }
    }

    private getTypeForTarget(key: string, target: string) {
        const type = NotificationService.getTypeOrFail(key);
        return type.targets.includes(target) ? type : null;
    }

    async definition(req: Request, res: Response) {
        const context = await this.getAuthorizedTarget(req, res);
        if (!context) return;
        const key = req.body?.key;
        if (typeof key !== "string" || key.trim() === "") {
            return res.status(400).send({ status: "error", message: "Notification type key required." });
        }
        try {
            if (!this.getTypeForTarget(key, context.target)) throw new Error("not available");
            return res.send({
                status: "success",
                data: { definition: NotificationService.getPublicTypeDefinition(key) },
            });
        } catch (_error) {
            return res.status(404).send({ status: "error", message: "Notification type not found." });
        }
    }

    async create(req: Request, res: Response) {
        const context = await this.getAuthorizedTarget(req, res);
        if (!context) return;
        const key = req.body?.key;
        if (typeof key !== "string" || key.trim() === "") {
            return res.status(400).send({ status: "error", message: "Notification type key required." });
        }
        const payload = req.body?.payload;
        if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
            return res.status(400).send({ status: "error", message: "Notification payload must be an object." });
        }

        let type;
        try {
            type = this.getTypeForTarget(key, context.target);
        } catch (_error) {
            type = null;
        }
        if (!type) return res.status(404).send({ status: "error", message: "Notification type not found." });
        if ((type.mode || "fixed") !== "changing" || !type.queueJobAutomation) {
            return res.status(400).send({
                status: "error",
                message: "Notification type does not start an automated queue job.",
            });
        }

        try {
            const notification = await this.createNotification(req, key, payload, context);
            if (!notification) {
                return res.status(403).send({ status: "error", message: "Notification type is disabled." });
            }
            return res.send({ status: "success", data: { entry: this.serializeNotification(notification) } });
        } catch (error: any) {
            return res
                .status(
                    error instanceof NotificationPayloadValidationError ||
                        error instanceof NotificationTargetValidationError
                        ? 400
                        : 500,
                )
                .send({ status: "error", message: error?.message || "Notification could not be created." });
        }
    }

    async preferences(req: Request, res: Response) {
        const context = await this.getAuthorizedTarget(req, res);
        if (!context) return;
        const preferences = await NotificationService.getTargetPreferences(context);
        if (!preferences) {
            return res.status(404).send({ status: "error", message: "Notification target not found." });
        }
        return res.send({ status: "success", data: preferences });
    }

    async savePreferences(req: Request, res: Response) {
        const context = await this.getAuthorizedTarget(req, res);
        if (!context) return;
        const key = req.body?.key;
        const enabled = req.body?.enabled;
        const outputChannels = req.body?.output_channels;
        if (typeof key !== "string" || key.trim() === "") {
            return res.status(400).send({ status: "error", message: "Notification type key required." });
        }
        if (typeof enabled !== "boolean") {
            return res.status(400).send({ status: "error", message: "Enabled must be a boolean." });
        }
        if (!Array.isArray(outputChannels) || outputChannels.some((channel: any) => typeof channel !== "string")) {
            return res.status(400).send({ status: "error", message: "Output channels must be an array of strings." });
        }
        try {
            const entry = await NotificationService.saveTargetPreference(
                key,
                { enabled, output_channels: outputChannels },
                context,
            );
            if (!entry) return res.status(404).send({ status: "error", message: "Notification target not found." });
            return res.send({ status: "success", data: { entry } });
        } catch (error: any) {
            return res.status(400).send({ status: "error", message: error?.message || "Preferences could not be saved." });
        }
    }

    async list(req: Request, res: Response) {
        const context = await this.getAuthorizedTarget(req, res);
        if (!context) return;
        const offset = this.parsePaginationValue(req.body?.offset, 0);
        const limit = this.parsePaginationValue(req.body?.limit, 10, 100) || 10;
        const [loaded, unreadCount, unviewedCount] = await Promise.all([
            NotificationService.loadNotifications({ ...context, offset, limit: limit + 1 }),
            NotificationService.getUnreadCount(context),
            NotificationService.getUnviewedCount(context),
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
    }

    async counts(req: Request, res: Response) {
        const context = await this.getAuthorizedTarget(req, res);
        if (!context) return;
        const [unreadCount, unviewedCount] = await Promise.all([
            NotificationService.getUnreadCount(context),
            NotificationService.getUnviewedCount(context),
        ]);
        return res.send({ status: "success", data: { unread_count: unreadCount, unviewed_count: unviewedCount } });
    }

    async details(req: Request, res: Response) {
        const context = await this.getAuthorizedTarget(req, res);
        if (!context) return;
        const notification = await NotificationService.getNotificationForTarget(
            this.getNotificationReference(req),
            context,
        );
        if (!notification) return this.notificationNotFound(res);
        return res.send({ status: "success", data: { entry: this.serializeNotification(notification) } });
    }

    async markOneAsRead(req: Request, res: Response) {
        const context = await this.getAuthorizedTarget(req, res);
        if (!context) return;
        const notification = await NotificationService.getNotificationForTarget(
            this.getNotificationReference(req),
            context,
        );
        if (!notification) return this.notificationNotFound(res);
        const entry = await NotificationService.markAsRead(notification);
        return res.send({ status: "success", data: { entry: this.serializeNotification(entry) } });
    }

    async markAllAsRead(req: Request, res: Response) {
        const context = await this.getAuthorizedTarget(req, res);
        if (!context) return;
        await NotificationService.markAllAsRead(context);
        return res.send({ status: "success", data: { message: "All notifications marked as read." } });
    }

    async markAllAsViewed(req: Request, res: Response) {
        const context = await this.getAuthorizedTarget(req, res);
        if (!context) return;
        await NotificationService.markAllAsViewed(context);
        return res.send({ status: "success", data: { message: "All notifications marked as viewed." } });
    }
}
