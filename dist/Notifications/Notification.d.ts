import type { ObjectId } from "mongodb";
import { Model } from "../Database/Model";
import type { NotificationChangingStatus, NotificationModes, NotificationReadStatus, NotificationViewStatus } from "./NotificationService";
export declare class Notification extends Model {
    target?: string;
    target_id?: ObjectId;
    targetModel?: any;
    key?: string;
    mode?: NotificationModes;
    changing_status?: NotificationChangingStatus;
    changing_error?: string | null;
    _queue_job?: ObjectId;
    _files?: ObjectId[];
    read_status?: NotificationReadStatus;
    read_at?: Date | null;
    view_status?: NotificationViewStatus;
    viewed_at?: Date | null;
    __table: string;
}
