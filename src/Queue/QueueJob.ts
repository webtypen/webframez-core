import type { DatabaseId } from "../Database/DatabaseAdapter";
import { Model } from "../Database/Model";
import type { Notification } from "../Notifications/Notification";

export class QueueJob extends Model {
    declare notification_queue_job?: boolean;
    declare _notification?: DatabaseId;
    declare notification?: Notification;

    __table = "queue_jobs";
}
