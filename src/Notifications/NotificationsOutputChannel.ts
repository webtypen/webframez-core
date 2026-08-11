import { Notification } from "./Notification";

export type NotificationOutputChannelHandleResult = {
    status: boolean;
    error_message?: string;
    payload?: Record<string, any>;
};

export class NotificationOutputChannel {
    key: string = "example-output-channel";
    activated: boolean = false;

    async handle(notification: Notification): Promise<NotificationOutputChannelHandleResult> {
        return { status: true };
    }
}
