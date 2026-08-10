import { ObjectId } from "mongodb";
import { Request } from "../Router/Request";
import { Notification } from "./Notification";
export type NotificationModes = "fixed" | "changing";
export type NotificationReadStatus = "unread" | "read";
export type NotificationViewStatus = "unviewed" | "viewed";
export type NotificationChangingStatus = "pending" | "running" | "success" | "error";
export type NotificationOptions = {
    showAt?: Date;
    baseData?: {
        [key: string]: any;
    };
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
    baseData?: {
        [key: string]: any;
    };
    payload?: {
        [key: string]: any;
    };
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
declare class NotificationServiceFacade {
    registy: {
        [key: string]: NotificationDefinition;
    };
    notificationsConfig: any;
    init(): void;
    getTypeOrFail(typeKey: string): NotificationDefinition;
    private getErrorMessage;
    private normalizeUserId;
    private getLoadMatch;
    private enrichNotification;
    create(typeKey: string, payload: NotificationPayload, options?: NotificationOptions): Promise<Notification>;
    getNotification(notificationRef: Notification | ObjectId | string | null): Promise<Notification>;
    markAsRead(notification: Notification | ObjectId | string | null): Promise<Notification>;
    markAsViewed(notification: Notification | ObjectId | string | null): Promise<Notification>;
    markAllAsRead(_user: ObjectId | string, request?: Request): Promise<void>;
    markAllAsViewed(_user: ObjectId | string, request?: Request): Promise<void>;
    getNotificationForUser(notificationRef: Notification | ObjectId | string | null, _user: ObjectId | string, request?: Request): Promise<Notification | null>;
    private countByStatus;
    getUserUnreadCount(_user: ObjectId | string, request?: Request): Promise<number>;
    getUserUnviewedCount(_user: ObjectId | string, request?: Request): Promise<number>;
    countUnreadNotifications(options: {
        _user: ObjectId | string;
        request?: Request;
    }): Promise<number>;
    updateNotification(notification: Notification | ObjectId | string | null, updateData: {
        payload?: NotificationPayload;
        _user?: ObjectId | string;
        show_at?: Date | null;
        read_status?: NotificationReadStatus;
        read_at?: Date | null;
        view_status?: NotificationViewStatus;
        viewed_at?: Date | null;
    }): Promise<Notification>;
    setChangingStatus(notification: Notification | ObjectId | string | null, status: NotificationChangingStatus, error?: string | null): Promise<Notification>;
    loadNotifications(options?: {
        _user: ObjectId | string;
        offset?: number;
        limit?: number;
        request?: Request;
    }): Promise<Notification[]>;
}
export declare const NotificationService: NotificationServiceFacade;
export {};
