import { Notification } from "./Notification";
export declare class NotificationOutputChannel {
    key: string;
    activated: boolean;
    handle(notification: Notification): Promise<{
        status: boolean;
        payload?: any;
    }>;
}
