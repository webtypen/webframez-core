import { ObjectId } from "mongodb";
import { Request } from "../Router/Request";
import { Notification } from "./Notification";
import { Config } from "../Config";
import { DBConnection } from "../Database/DBConnection";
import { QueueJobsRegisty } from "../Queue/QueueJobsRegisty";

export type NotificationModes = "fixed" | "changing";
export type NotificationReadStatus = "unread" | "read";
export type NotificationViewStatus = "unviewed" | "viewed";
export type NotificationChangingStatus = "pending" | "running" | "success" | "error";
export type NotificationOptions = {
    showAt?: Date;
    baseData?: { [key: string]: any };
    _user: ObjectId | string;
};

export type NotificationPayload = {
    [key: string]: any;
};

export type NotificationQueueJobAutomation = {
    job: string;
    check?: (notification: Notification) => boolean | Promise<boolean>;
};

export type NotificationDefinition = {
    key: string;
    mode?: NotificationModes;
    baseData?: { [key: string]: any };
    payload?: { [key: string]: any };
    title?: string | null;
    getTitle?: (notification: Notification) => Promise<String | null>;
    description?: string | null;
    getDescription?: (notification: Notification) => Promise<String | null>;
    link?: string | null;
    getLink?: (notification: Notification) => Promise<String | null>;
    groupKey?: string | null;
    getGroupKey?: (payload?: NotificationPayload, options?: NotificationOptions) => Promise<String | null>;
    beforeSave?: (notification: Notification) => Promise<void>;
    afterSave?: (notification: Notification) => Promise<void>;
    queueJobAutomation?: NotificationQueueJobAutomation;
};

class NotificationServiceFacade {
    registy: { [key: string]: NotificationDefinition } = {};
    notificationsConfig: any = {};

    init() {
        this.registy = {};
        this.notificationsConfig = Config.get("notifications") || {};

        if (Array.isArray(this.notificationsConfig.types)) {
            for (let t of this.notificationsConfig.types) {
                this.registy[t.key] = t;
            }
        }
    }

    getTypeOrFail(typeKey: string) {
        if (this.registy[typeKey]) {
            return this.registy[typeKey];
        }
        throw new Error("Invalid notification-type '" + typeKey + "' ...");
    }

    private getErrorMessage(error: any) {
        if (error?.message && error.message.toString().trim() !== "") {
            return error.message.toString();
        }
        if (error && error.toString().trim() !== "") {
            return error.toString();
        }
        return "Unknown notification queue-job error";
    }

    private normalizeUserId(_user: ObjectId | string) {
        return typeof _user === "string" && _user.length === 24 && ObjectId.isValid(_user) ? new ObjectId(_user) : _user;
    }

    private async getLoadMatch(options: { _user: ObjectId | string; request?: Request }) {
        const additionalMatch = this.notificationsConfig?.onLoadNotificationsMatch
            ? await this.notificationsConfig.onLoadNotificationsMatch(options)
            : {};

        return {
            ...(additionalMatch || {}),
            _user: this.normalizeUserId(options._user),
            key: { $in: Object.keys(this.registy) },
            show_at: { $lte: new Date() },
        };
    }

    private async enrichNotification(notification: Notification): Promise<Notification | null> {
        const notType = notification?.key ? this.registy[notification.key] : null;
        if (!notType) return null;

        notification.title = notType.getTitle
            ? await notType.getTitle(notification)
            : notType.title !== undefined
              ? notType.title
              : null;
        notification.description = notType.getDescription
            ? await notType.getDescription(notification)
            : notType.description !== undefined
              ? notType.description
              : null;
        notification.link = notType.getLink
            ? await notType.getLink(notification)
            : notType.link !== undefined
              ? notType.link
              : null;
        return notification;
    }

    async create(typeKey: string, payload: NotificationPayload, options?: NotificationOptions): Promise<Notification> {
        const notType = this.getTypeOrFail(typeKey);
        const notificationMode = notType.mode || "fixed";
        if (notType.queueJobAutomation && notificationMode !== "changing") {
            throw new Error(`Notification-type '${notType.key}' can only use queueJobAutomation in changing mode.`);
        }

        const notification = new Notification();
        notification.key = notType.key;
        notification.mode = notificationMode;
        notification.group_key = notType.getGroupKey ? await notType.getGroupKey(payload, options) : null;

        if (options?.baseData) {
            for (let key in options.baseData) {
                notification[key] = options.baseData[key];
            }
        }

        if (notification.payload) {
            notification.payload = { ...notification.payload, ...payload };
        } else {
            notification.payload = payload;
        }

        notification.key = notType.key;
        notification.mode = notificationMode;
        notification.created_at = new Date();
        notification.read_status = "unread";
        notification.read_at = null;
        notification.view_status = "unviewed";
        notification.viewed_at = null;
        notification.show_at = options?.showAt || new Date();
        if (notification.mode === "changing") {
            notification.changing_status = "pending";
            notification.changing_error = null;
        }

        if (options?._user) {
            if (typeof options._user === "string" && options._user.length === 24) {
                notification._user = new ObjectId(options._user);
            } else {
                notification._user = options._user;
            }
        }

        if (this.notificationsConfig?.beforeNotificationSave) {
            await this.notificationsConfig.beforeNotificationSave(notification);
        }

        if (notType.beforeSave) {
            await notType.beforeSave(notification);
        }

        await notification.save();

        if (notType.queueJobAutomation) {
            try {
                const shouldCreateJob = notType.queueJobAutomation.check
                    ? await notType.queueJobAutomation.check(notification)
                    : true;

                if (!shouldCreateJob) {
                    await this.setChangingStatus(notification, "success");
                } else {
                    const queueJobType = QueueJobsRegisty.getJobOrFail(notType.queueJobAutomation.job);
                    const queueJob = await queueJobType.create({
                        status: "initializing",
                        notification_queue_job: true,
                        _notification: notification._id,
                    });

                    notification._queue_job = queueJob._id;
                    await notification.save();

                    queueJob.status = "pending";
                    await queueJob.save();
                }
            } catch (error: any) {
                await this.setChangingStatus(notification, "error", this.getErrorMessage(error));
                throw error;
            }
        }

        if (this.notificationsConfig?.afterNotificationSave) {
            await this.notificationsConfig.afterNotificationSave(notification);
        }

        if (notType.afterSave) {
            await notType.afterSave(notification);
        }

        return notification;
    }

    async getNotification(notificationRef: Notification | ObjectId | string | null): Promise<Notification> {
        if (notificationRef instanceof Notification) {
            return notificationRef;
        }

        if (typeof notificationRef === "string" || notificationRef instanceof ObjectId) {
            const loadNotification = await Notification.where("_id", "=", await Notification.objectId(notificationRef)).first();

            if (loadNotification) {
                return loadNotification;
            }
        }
        throw new Error("Invalid notification type provided: " + notificationRef?.toString());
    }

    async markAsRead(notification: Notification | ObjectId | string | null): Promise<Notification> {
        notification = await this.getNotification(notification);
        if (notification.read_status === "read" && notification.view_status === "viewed") {
            return notification;
        }

        const now = new Date();
        notification.read_at = notification.read_at || now;
        notification.read_status = "read";
        notification.viewed_at = notification.viewed_at || now;
        notification.view_status = "viewed";
        await notification.save();
        return notification;
    }

    async markAsViewed(notification: Notification | ObjectId | string | null): Promise<Notification> {
        notification = await this.getNotification(notification);
        if (notification.view_status === "viewed") {
            return notification;
        }

        notification.viewed_at = new Date();
        notification.view_status = "viewed";
        await notification.save();
        return notification;
    }

    async markAllAsRead(_user: ObjectId | string, request?: Request): Promise<void> {
        const connection = await DBConnection.getConnection();
        const now = new Date();
        await connection.client
            .db(null)
            .collection(new Notification().__table)
            .updateMany(
                {
                    ...(await this.getLoadMatch({ _user, request })),
                    $or: [{ read_status: "unread" }, { view_status: "unviewed" }],
                },
                [
                    {
                        $set: {
                            read_at: { $ifNull: ["$read_at", now] },
                            read_status: "read",
                            viewed_at: { $ifNull: ["$viewed_at", now] },
                            view_status: "viewed",
                        },
                    },
                ],
            );
    }

    async markAllAsViewed(_user: ObjectId | string, request?: Request): Promise<void> {
        const connection = await DBConnection.getConnection();
        await connection.client
            .db(null)
            .collection(new Notification().__table)
            .updateMany(
                {
                    ...(await this.getLoadMatch({ _user, request })),
                    view_status: "unviewed",
                },
                {
                    $set: {
                        viewed_at: new Date(),
                        view_status: "viewed",
                    },
                },
            );
    }

    async getNotificationForUser(
        notificationRef: Notification | ObjectId | string | null,
        _user: ObjectId | string,
        request?: Request,
    ): Promise<Notification | null> {
        const notificationId = notificationRef instanceof Notification ? notificationRef._id : notificationRef;
        if (!notificationId) return null;

        let objectId: ObjectId;
        if (notificationId instanceof ObjectId) {
            objectId = notificationId;
        } else if (typeof notificationId === "string" && ObjectId.isValid(notificationId)) {
            objectId = new ObjectId(notificationId);
        } else {
            return null;
        }

        const notifications = await Notification.aggregate([
            {
                $match: {
                    ...(await this.getLoadMatch({ _user, request })),
                    _id: objectId,
                },
            },
            { $limit: 1 },
        ]);
        if (!notifications || notifications.length === 0) return null;

        const notification = DBConnection.mapDataToModel(Notification, notifications[0]) as Notification;
        return await this.enrichNotification(notification);
    }

    private async countByStatus(
        options: { _user: ObjectId | string; request?: Request },
        match: { [key: string]: any },
    ): Promise<number> {
        const result = await Notification.aggregate([
            {
                $match: {
                    ...(await this.getLoadMatch(options)),
                    ...match,
                },
            },
            { $count: "count" },
        ]);
        return result && result[0] && typeof result[0].count === "number" ? result[0].count : 0;
    }

    async getUserUnreadCount(_user: ObjectId | string, request?: Request): Promise<number> {
        return await this.countByStatus({ _user, request }, { read_status: "unread" });
    }

    async getUserUnviewedCount(_user: ObjectId | string, request?: Request): Promise<number> {
        return await this.countByStatus({ _user, request }, { view_status: "unviewed" });
    }

    async countUnreadNotifications(options: { _user: ObjectId | string; request?: Request }): Promise<number> {
        return await this.getUserUnreadCount(options._user, options.request);
    }

    async updateNotification(
        notification: Notification | ObjectId | string | null,
        updateData: {
            payload?: NotificationPayload;
            _user?: ObjectId | string;
            show_at?: Date | null;
            read_status?: NotificationReadStatus;
            read_at?: Date | null;
            view_status?: NotificationViewStatus;
            viewed_at?: Date | null;
        },
    ): Promise<Notification> {
        notification = await this.getNotification(notification);

        if (updateData.payload) {
            notification.payload = { ...notification.payload, ...updateData.payload };
        }

        if (updateData._user !== undefined) {
            if (typeof updateData._user === "string" && updateData._user.length === 24) {
                notification._user = new ObjectId(updateData._user);
            } else {
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

        await notification.save();
        return notification;
    }

    async setChangingStatus(
        notification: Notification | ObjectId | string | null,
        status: NotificationChangingStatus,
        error?: string | null,
    ): Promise<Notification> {
        notification = await this.getNotification(notification);
        if (notification.mode !== "changing") {
            throw new Error(`Notification '${notification._id?.toString()}' is not in changing mode.`);
        }

        notification.changing_status = status;
        notification.changing_error = status === "error" ? error || "Unknown notification error" : null;
        await notification.save();
        return notification;
    }

    async loadNotifications(options?: {
        _user: ObjectId | string;
        offset?: number;
        limit?: number;
        request?: Request;
    }): Promise<Notification[]> {
        if (!options?._user) return [];

        const notifications = await Notification.aggregate([
            {
                $match: await this.getLoadMatch(options),
            },
            {
                $sort: { show_at: -1 },
            },
            {
                $skip: options?.offset || 0,
            },
            {
                $limit: options?.limit || 10,
            },
        ]);
        if (!notifications || notifications.length === 0) return [];

        const out = [];
        for (const notificationData of notifications) {
            const el = DBConnection.mapDataToModel(Notification, notificationData) as Notification;
            const enrichedNotification = await this.enrichNotification(el);
            if (enrichedNotification) out.push(enrichedNotification);
        }
        return out;
    }
}

export const NotificationService = new NotificationServiceFacade();
