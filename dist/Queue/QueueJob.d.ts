import type { ObjectId } from "mongodb";
import { Model } from "../Database/Model";
import type { Notification } from "../Notifications/Notification";
export declare class QueueJob extends Model {
    notification_queue_job?: boolean;
    _notification?: ObjectId;
    notification?: Notification;
    __table: string;
}
