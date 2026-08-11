import { Notification } from "./Notification";
export type NotificationOutputChannelHandleResult = {
    status: boolean;
    error_message?: string;
    payload?: Record<string, any>;
};
export declare class NotificationOutputChannel {
    key: string;
    activated: boolean;
    handle(notification: Notification): Promise<NotificationOutputChannelHandleResult>;
}
