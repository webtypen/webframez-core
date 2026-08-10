import type { ObjectId } from "mongodb";
import { Model } from "../Database/Model";
import type {
    NotificationChangingStatus,
    NotificationModes,
    NotificationReadStatus,
    NotificationViewStatus,
} from "./NotificationService";

export class Notification extends Model {
    declare key?: string;
    declare mode?: NotificationModes;
    declare changing_status?: NotificationChangingStatus;
    declare changing_error?: string | null;
    declare _queue_job?: ObjectId;
    declare read_status?: NotificationReadStatus;
    declare read_at?: Date | null;
    declare view_status?: NotificationViewStatus;
    declare viewed_at?: Date | null;

    __table = "notifications";
}
