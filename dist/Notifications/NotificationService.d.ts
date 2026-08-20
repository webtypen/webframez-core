import { ObjectId } from "mongodb";
import { Request } from "../Router/Request";
import { Notification } from "./Notification";
export type NotificationModes = "fixed" | "changing";
export type NotificationReadStatus = "unread" | "read";
export type NotificationViewStatus = "unviewed" | "viewed";
export type NotificationChangingStatus = "pending" | "running" | "success" | "error";
export type NotificationParameterType = "string" | "integer" | "float" | "date" | "datetime";
export type NotificationParameterDefinition = {
    type: NotificationParameterType;
    label?: string;
    required?: boolean;
};
export type NotificationTargetContext = {
    target: string;
    target_id: ObjectId | string;
    targetModel?: any;
    request?: Request;
};
export type NotificationTargetDefinition = {
    collection?: string;
    preferencesField?: string;
    resolve?: (context: NotificationTargetContext) => Promise<any | null>;
    authorize?: (context: NotificationTargetContext) => boolean | Promise<boolean>;
};
export type NotificationAggregationOperation = "list" | "details";
export type NotificationAggregationStage = Record<string, any>;
export type NotificationAggregationContext = NotificationTargetContext & {
    operation: NotificationAggregationOperation;
};
export type NotificationOptions = {
    showAt?: Date;
    baseData?: {
        [key: string]: any;
    };
} & NotificationTargetContext;
export type NotificationPayload = {
    [key: string]: any;
};
export type NotificationQueueJobAutomation = {
    job: string;
    check?: (notification: Notification) => boolean | Promise<boolean>;
};
export type NotificationDefinition = {
    key: string;
    targets: string[];
    mode?: NotificationModes;
    subscribable?: boolean;
    settingsGroup?: string;
    settingsTitle?: string;
    settingsDescription?: string;
    parameters?: Record<string, NotificationParameterDefinition>;
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
export type NotificationPublicTypeDefinition = {
    key: string;
    targets: string[];
    mode: NotificationModes;
    queue_job_automation: boolean;
    subscribable: boolean;
    settings_group: string | null;
    settings_title: string | null;
    settings_description: string | null;
    title: string | null;
    description: string | null;
    link: string | null;
    parameters: Record<string, NotificationParameterDefinition>;
};
export type NotificationTargetPreference = {
    enabled: boolean;
    output_channels: string[];
};
export type NotificationTargetPreferences = Record<string, NotificationTargetPreference>;
export type NotificationOutputChannelDefinition = {
    key: string;
    label: string;
};
export type NotificationPreferenceEntry = {
    key: string;
    title: string;
    description: string | null;
    settings_group: string | null;
    subscribable: boolean;
    enabled: boolean;
    output_channels: string[];
};
export type NotificationEffectivePreference = NotificationTargetPreference & {
    owner_exists: boolean;
};
export declare class NotificationPayloadValidationError extends Error {
    constructor(message: string);
}
export declare class NotificationTargetValidationError extends Error {
    constructor(message: string);
}
declare class NotificationServiceFacade {
    registry: {
        [key: string]: NotificationDefinition;
    };
    notificationsConfig: any;
    targetRegistry: Record<string, NotificationTargetDefinition>;
    /** @deprecated Use registry instead. */
    get registy(): {
        [key: string]: NotificationDefinition;
    };
    /** @deprecated Use registry instead. */
    set registy(registry: {
        [key: string]: NotificationDefinition;
    });
    private getObjectIdString;
    private normalizeObjectId;
    private getNotificationReferenceId;
    init(): void;
    registerType(type: NotificationDefinition): this;
    registerTypes(types: NotificationDefinition | NotificationDefinition[]): this;
    getTypeOrFail(typeKey: string): NotificationDefinition;
    getPublicTypeDefinition(typeKey: string): NotificationPublicTypeDefinition;
    getAvailableOutputChannels(target?: string): NotificationOutputChannelDefinition[];
    private getTargetDefinition;
    private normalizeTargetId;
    normalizeTargetContext(context: NotificationTargetContext): NotificationTargetContext;
    resolveTarget(context: NotificationTargetContext): Promise<NotificationTargetContext | null>;
    authorizeTarget(context: NotificationTargetContext): Promise<NotificationTargetContext | null>;
    attachTargetModel(notification: Notification, targetModel: any): Notification;
    private getModelId;
    private getPreferencesField;
    private normalizeStoredPreferences;
    private preferenceForType;
    getEffectiveTargetPreference(typeKey: string, context: NotificationTargetContext): Promise<NotificationEffectivePreference>;
    getTargetPreferences(context: NotificationTargetContext): Promise<{
        entries: NotificationPreferenceEntry[];
        output_channels: NotificationOutputChannelDefinition[];
    } | null>;
    saveTargetPreference(typeKey: string, preference: NotificationTargetPreference, context: NotificationTargetContext): Promise<NotificationPreferenceEntry | null>;
    private getErrorMessage;
    private isMissingRequiredValue;
    private normalizeDate;
    private normalizeDateTime;
    private normalizeParameterValue;
    private normalizePayload;
    private getLoadMatch;
    private getLoadAggregation;
    private enrichNotification;
    create(typeKey: string, payload: NotificationPayload, options: NotificationOptions): Promise<Notification | null>;
    getNotification(notificationRef: Notification | ObjectId | string | null): Promise<Notification>;
    setQueueJobFailureStatus(notificationRef: ObjectId | string | null, error?: string | null): Promise<boolean>;
    markAsRead(notification: Notification | ObjectId | string | null): Promise<Notification>;
    markAsViewed(notification: Notification | ObjectId | string | null): Promise<Notification>;
    markAllAsRead(context: NotificationTargetContext): Promise<void>;
    markAllAsViewed(context: NotificationTargetContext): Promise<void>;
    getNotificationForTarget(notificationRef: Notification | ObjectId | string | null, context: NotificationTargetContext): Promise<Notification | null>;
    private countByStatus;
    getUnreadCount(context: NotificationTargetContext): Promise<number>;
    getUnviewedCount(context: NotificationTargetContext): Promise<number>;
    updateNotification(notification: Notification | ObjectId | string | null, updateData: {
        payload?: NotificationPayload;
        show_at?: Date | null;
        read_status?: NotificationReadStatus;
        read_at?: Date | null;
        view_status?: NotificationViewStatus;
        viewed_at?: Date | null;
    }): Promise<Notification>;
    setChangingStatus(notification: Notification | ObjectId | string | null, status: NotificationChangingStatus, error?: string | null): Promise<Notification>;
    loadNotifications(options: {
        target: string;
        target_id: ObjectId | string;
        targetModel?: any;
        offset?: number;
        limit?: number;
        request?: Request;
    }): Promise<Notification[]>;
}
export declare const NotificationService: NotificationServiceFacade;
export {};
