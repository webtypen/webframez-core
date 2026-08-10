import type { ObjectId } from "mongodb";
import { Model } from "../Database/Model";
import type { Notification } from "../Notifications/Notification";

export class QueueJob extends Model {
    declare notification_queue_job?: boolean;
    declare _notification?: ObjectId;
    declare notification?: Notification;

    __table = "queue_jobs";
}
