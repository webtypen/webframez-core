import { Notification } from "./Notification";

export class NotificationOutputChannel {
    key: string = "example-output-channel";
    activated: boolean = false;

    async handle(notification: Notification): Promise<{ status: boolean; payload?: any }> {
        return { status: true };
    }
}
