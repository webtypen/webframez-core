import { ObjectId } from "mongodb";
import { Request } from "../Router/Request";
import { Notification } from "./Notification";
import { Config } from "../Config";
import { DBConnection } from "../Database/DBConnection";
import { QueueJobsRegisty } from "../Queue/QueueJobsRegisty";

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
    baseData?: { [key: string]: any };
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
    baseData?: { [key: string]: any };
    payload?: { [key: string]: any };
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

export class NotificationPayloadValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "NotificationPayloadValidationError";
    }
}

export class NotificationTargetValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "NotificationTargetValidationError";
    }
}

class NotificationServiceFacade {
    registry: { [key: string]: NotificationDefinition } = {};
    notificationsConfig: any = {};
    targetRegistry: Record<string, NotificationTargetDefinition> = {
        user: { collection: "users" },
    };

    /** @deprecated Use registry instead. */
    get registy() {
        return this.registry;
    }

    /** @deprecated Use registry instead. */
    set registy(registry: { [key: string]: NotificationDefinition }) {
        this.registry = registry;
    }

    private getNotificationReferenceId(notificationRef: ObjectId | string | null): string | null {
        const notificationId =
            typeof notificationRef === "string"
                ? notificationRef
                : notificationRef && typeof (notificationRef as any).toString === "function"
                  ? (notificationRef as any).toString()
                  : null;

        return notificationId && notificationId.length === 24 && ObjectId.isValid(notificationId)
            ? notificationId
            : null;
    }

    init() {
        this.registry = {};
        this.notificationsConfig = Config.get("notifications") || {};
        const configuredTargets = this.notificationsConfig.targets || {};
        const { user: configuredUserTarget, ...projectTargets } = configuredTargets;
        this.targetRegistry = {
            user: { collection: "users", ...(configuredUserTarget || {}) },
            ...projectTargets,
        };
        for (const [key, definition] of Object.entries(this.targetRegistry)) {
            if (!key.trim() || !definition || typeof definition !== "object") {
                throw new Error(`Invalid notification target '${key}'.`);
            }
        }
        for (const channel of this.notificationsConfig.output_channels || []) {
            if (!Array.isArray(channel?.targets)) continue;
            for (const target of channel.targets) {
                if (!this.targetRegistry[target]) {
                    throw new Error(`Notification output-channel '${channel.key}' uses unknown target '${target}'.`);
                }
            }
        }

        if (Array.isArray(this.notificationsConfig.types)) {
            this.registerTypes(this.notificationsConfig.types);
        }
    }

    registerType(type: NotificationDefinition) {
        if (!type || typeof type.key !== "string" || type.key.trim() === "") {
            throw new Error("Notification type requires a non-empty key.");
        }
        if (!Array.isArray(type.targets) || type.targets.length === 0) {
            throw new Error(`Notification type '${type.key}' requires at least one target.`);
        }
        for (const target of type.targets) {
            if (typeof target !== "string" || target.trim() === "" || !this.targetRegistry[target]) {
                throw new Error(`Notification type '${type.key}' uses unknown target '${target}'.`);
            }
        }
        this.registry[type.key] = type;
        return this;
    }

    registerTypes(types: NotificationDefinition | NotificationDefinition[]) {
        const definitions = Array.isArray(types) ? types : [types];
        for (const definition of definitions) {
            this.registerType(definition);
        }
        return this;
    }

    getTypeOrFail(typeKey: string) {
        if (this.registry[typeKey]) {
            return this.registry[typeKey];
        }
        throw new Error("Invalid notification-type '" + typeKey + "' ...");
    }

    getPublicTypeDefinition(typeKey: string): NotificationPublicTypeDefinition {
        const type = this.getTypeOrFail(typeKey);
        const parameters: Record<string, NotificationParameterDefinition> = {};
        for (const key of Object.keys(type.parameters || {})) {
            const parameter = type.parameters?.[key] as NotificationParameterDefinition;
            parameters[key] = {
                type: parameter.type,
                ...(parameter.label !== undefined ? { label: parameter.label } : {}),
                ...(parameter.required !== undefined ? { required: parameter.required } : {}),
            };
        }
        return {
            key: type.key,
            targets: [...type.targets],
            mode: type.mode || "fixed",
            queue_job_automation: !!type.queueJobAutomation,
            subscribable: type.subscribable === true,
            settings_group: type.settingsGroup?.trim() || null,
            settings_title: type.settingsTitle !== undefined ? type.settingsTitle : null,
            settings_description: type.settingsDescription !== undefined ? type.settingsDescription : null,
            title: type.title !== undefined ? type.title : null,
            description: type.description !== undefined ? type.description : null,
            link: type.link !== undefined ? type.link : null,
            parameters,
        };
    }

    getAvailableOutputChannels(target?: string): NotificationOutputChannelDefinition[] {
        const channels = Array.isArray(this.notificationsConfig?.output_channels)
            ? this.notificationsConfig.output_channels
            : [];
        const available: NotificationOutputChannelDefinition[] = [];
        const keys = new Set<string>();
        for (const channel of channels) {
            if (!channel?.key || !channel?.is_active || !channel?.driver) continue;
            if (target && Array.isArray(channel.targets) && !channel.targets.includes(target)) continue;
            if (keys.has(channel.key)) {
                throw new Error(`Duplicate notification output-channel key '${channel.key}'.`);
            }
            const driver = new channel.driver();
            if (!driver?.activated) continue;
            keys.add(channel.key);
            available.push({ key: channel.key, label: channel.label || channel.name || channel.key });
        }
        return available;
    }

    private getTargetDefinition(target: string) {
        return this.targetRegistry[target] || null;
    }

    private normalizeTargetId(targetId: ObjectId | string) {
        if (targetId instanceof ObjectId) return targetId;
        const value = typeof targetId === "string" ? targetId : (targetId as any)?.toString?.();
        if (typeof value !== "string" || value.length !== 24 || !ObjectId.isValid(value)) {
            throw new NotificationTargetValidationError("Invalid notification target_id.");
        }
        return new ObjectId(value);
    }

    normalizeTargetContext(context: NotificationTargetContext): NotificationTargetContext {
        if (!context || typeof context.target !== "string" || context.target.trim() === "") {
            throw new NotificationTargetValidationError("Notification target required.");
        }
        const target = context.target.trim();
        if (!this.getTargetDefinition(target)) {
            throw new NotificationTargetValidationError(`Unknown notification target '${target}'.`);
        }
        if (!context.target_id) {
            throw new NotificationTargetValidationError("Notification target_id required.");
        }
        return { ...context, target, target_id: this.normalizeTargetId(context.target_id) };
    }

    async resolveTarget(context: NotificationTargetContext): Promise<NotificationTargetContext | null> {
        const normalized = this.normalizeTargetContext(context);
        if (normalized.targetModel) {
            return this.getModelId(normalized.targetModel)?.equals(normalized.target_id as ObjectId) ? normalized : null;
        }
        const definition = this.getTargetDefinition(normalized.target)!;
        let targetModel: any = null;
        if (definition.resolve) {
            targetModel = await definition.resolve(normalized);
        } else if (
            normalized.target === "user" &&
            normalized.request?.user &&
            this.getModelId(normalized.request.user)?.equals(normalized.target_id as ObjectId)
        ) {
            targetModel = normalized.request.user;
        } else if (definition.collection) {
            const connection = await DBConnection.getConnection();
            targetModel = await connection.client
                .db(null)
                .collection(definition.collection)
                .findOne({ _id: normalized.target_id });
        }
        const modelId = this.getModelId(targetModel);
        return modelId?.equals(normalized.target_id as ObjectId) ? { ...normalized, targetModel } : null;
    }

    async authorizeTarget(context: NotificationTargetContext): Promise<NotificationTargetContext | null> {
        const resolved = await this.resolveTarget(context);
        if (!resolved) return null;
        const definition = this.getTargetDefinition(resolved.target)!;
        if (definition.authorize) {
            return (await definition.authorize(resolved)) ? resolved : null;
        }
        if (!resolved.request) return resolved;
        const requestUserId = this.getModelId(resolved.request.user);
        return requestUserId?.equals(resolved.target_id as ObjectId) ? resolved : null;
    }

    attachTargetModel(notification: Notification, targetModel: any) {
        Object.defineProperty(notification, "targetModel", {
            value: targetModel,
            writable: true,
            configurable: true,
            enumerable: false,
        });
        return notification;
    }

    private getModelId(model: any): ObjectId | null {
        const value = model?._id ?? model?.id;
        if (value instanceof ObjectId) return value;
        const stringValue = typeof value === "string" ? value : value?.toString?.();
        if (typeof stringValue === "string" && stringValue.length === 24 && ObjectId.isValid(stringValue)) {
            return new ObjectId(stringValue);
        }
        return null;
    }

    private getPreferencesField(target: string) {
        const field = this.getTargetDefinition(target)?.preferencesField;
        return typeof field === "string" && field.trim() !== "" ? field.trim() : "notification_preferences";
    }

    private normalizeStoredPreferences(value: any): NotificationTargetPreferences {
        if (!value || typeof value !== "object" || Array.isArray(value)) return {};
        const preferences: NotificationTargetPreferences = {};
        for (const key of Object.keys(value)) {
            const entry = value[key];
            if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
            preferences[key] = {
                enabled: entry.enabled === true,
                output_channels: Array.isArray(entry.output_channels)
                    ? entry.output_channels.filter((channel: any) => typeof channel === "string")
                    : [],
            };
        }
        return preferences;
    }

    private preferenceForType(
        type: NotificationDefinition,
        preferences: NotificationTargetPreferences,
        availableChannels: NotificationOutputChannelDefinition[],
    ): NotificationTargetPreference {
        const stored = preferences[type.key];
        const availableKeys = new Set(availableChannels.map((channel) => channel.key));
        const outputChannels = stored
            ? stored.output_channels.filter((channel) => availableKeys.has(channel))
            : type.subscribable
              ? []
              : availableChannels.map((channel) => channel.key);
        return {
            enabled: type.subscribable ? stored?.enabled === true : true,
            output_channels: Array.from(new Set(outputChannels)),
        };
    }

    async getEffectiveTargetPreference(
        typeKey: string,
        context: NotificationTargetContext,
    ): Promise<NotificationEffectivePreference> {
        const type = this.getTypeOrFail(typeKey);
        if (!type.targets.includes(context.target)) {
            return { enabled: false, output_channels: [], owner_exists: false };
        }
        const resolved = await this.resolveTarget(context);
        if (!resolved?.targetModel) {
            return { enabled: false, output_channels: [], owner_exists: false };
        }
        const preferences = this.normalizeStoredPreferences(resolved.targetModel[this.getPreferencesField(resolved.target)]);
        const preference = this.preferenceForType(type, preferences, this.getAvailableOutputChannels(resolved.target));
        return {
            ...preference,
            output_channels: preference.enabled ? preference.output_channels : [],
            owner_exists: true,
        };
    }

    async getTargetPreferences(context: NotificationTargetContext): Promise<{
        entries: NotificationPreferenceEntry[];
        output_channels: NotificationOutputChannelDefinition[];
    } | null> {
        const resolved = await this.resolveTarget(context);
        if (!resolved?.targetModel) return null;
        const availableChannels = this.getAvailableOutputChannels(resolved.target);
        const preferences = this.normalizeStoredPreferences(
            resolved.targetModel[this.getPreferencesField(resolved.target)],
        );
        const entries = Object.values(this.registry)
            .filter((type) => type.targets.includes(resolved.target))
            .map((type) => {
                const preference = this.preferenceForType(type, preferences, availableChannels);
                return {
                    key: type.key,
                    title: type.settingsTitle || type.title || type.key,
                    description: type.settingsDescription || type.description || null,
                    settings_group: type.settingsGroup?.trim() || null,
                    subscribable: type.subscribable === true,
                    enabled: preference.enabled,
                    output_channels: preference.output_channels,
                };
            })
            .sort((left, right) => {
                const groupComparison = (left.settings_group || "").localeCompare(right.settings_group || "");
                return groupComparison || left.title.localeCompare(right.title);
            });
        return { entries, output_channels: availableChannels };
    }

    async saveTargetPreference(
        typeKey: string,
        preference: NotificationTargetPreference,
        context: NotificationTargetContext,
    ): Promise<NotificationPreferenceEntry | null> {
        const type = this.getTypeOrFail(typeKey);
        const resolved = await this.resolveTarget(context);
        if (!resolved?.targetModel) return null;
        if (!type.targets.includes(resolved.target)) {
            throw new NotificationPayloadValidationError(
                `Notification type '${typeKey}' is not available for target '${resolved.target}'.`,
            );
        }
        const owner = resolved.targetModel;
        const availableChannels = this.getAvailableOutputChannels(resolved.target);
        const availableKeys = new Set(availableChannels.map((channel) => channel.key));
        const unknownChannel = preference.output_channels.find((channel) => !availableKeys.has(channel));
        if (unknownChannel) {
            throw new NotificationPayloadValidationError(`Unknown notification output-channel '${unknownChannel}'.`);
        }

        const preferencesField = this.getPreferencesField(resolved.target);
        const preferences = this.normalizeStoredPreferences(owner[preferencesField]);
        preferences[typeKey] = {
            enabled: type.subscribable ? preference.enabled === true : true,
            output_channels: Array.from(new Set(preference.output_channels)),
        };
        owner[preferencesField] = preferences;
        if (typeof owner.save === "function") {
            await owner.save();
        } else if (this.getTargetDefinition(resolved.target)?.collection && owner._id) {
            const connection = await DBConnection.getConnection();
            await connection.client
                .db(null)
                .collection(this.getTargetDefinition(resolved.target)!.collection!)
                .updateOne({ _id: owner._id }, { $set: { [preferencesField]: preferences } });
        } else {
            throw new Error("Notification target preferences cannot be saved.");
        }

        const stored = this.preferenceForType(type, preferences, availableChannels);
        return {
            key: type.key,
            title: type.settingsTitle || type.title || type.key,
            description: type.settingsDescription || type.description || null,
            settings_group: type.settingsGroup?.trim() || null,
            subscribable: type.subscribable === true,
            enabled: stored.enabled,
            output_channels: stored.output_channels,
        };
    }

    private getErrorMessage(error: any) {
        if (error?.message && error.message.toString().trim() !== "") {
            return error.message.toString();
        }
        if (error && error.toString().trim() !== "") {
            return error.toString();
        }
        return "Unknown notification queue-job error";
    }

    private isMissingRequiredValue(value: any) {
        return value === undefined || value === null || (typeof value === "string" && value.trim() === "");
    }

    private normalizeDate(value: any, parameterKey: string) {
        if (value instanceof Date) {
            if (Number.isNaN(value.getTime())) {
                throw new NotificationPayloadValidationError(
                    `Invalid notification parameter '${parameterKey}': expected date.`,
                );
            }
            return value.toISOString().substring(0, 10);
        }

        if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
            throw new NotificationPayloadValidationError(
                `Invalid notification parameter '${parameterKey}': expected date.`,
            );
        }
        const parsed = new Date(`${value}T00:00:00.000Z`);
        if (Number.isNaN(parsed.getTime()) || parsed.toISOString().substring(0, 10) !== value) {
            throw new NotificationPayloadValidationError(
                `Invalid notification parameter '${parameterKey}': expected date.`,
            );
        }
        return value;
    }

    private normalizeDateTime(value: any, parameterKey: string) {
        let parsed: Date | null = null;
        if (value instanceof Date) {
            parsed = value;
        } else if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
            parsed = new Date(value);
        }
        if (!parsed || Number.isNaN(parsed.getTime())) {
            throw new NotificationPayloadValidationError(
                `Invalid notification parameter '${parameterKey}': expected datetime.`,
            );
        }
        return parsed.toISOString();
    }

    private normalizeParameterValue(key: string, value: any, definition: NotificationParameterDefinition) {
        if (value === null || value === undefined) return value;

        if (definition.type === "string") {
            if (typeof value !== "string") {
                throw new NotificationPayloadValidationError(
                    `Invalid notification parameter '${key}': expected string.`,
                );
            }
            return value;
        }

        if (definition.type === "integer") {
            const normalized = typeof value === "string" && /^-?\d+$/.test(value.trim()) ? Number(value.trim()) : value;
            if (typeof normalized !== "number" || !Number.isSafeInteger(normalized)) {
                throw new NotificationPayloadValidationError(
                    `Invalid notification parameter '${key}': expected integer.`,
                );
            }
            return normalized;
        }

        if (definition.type === "float") {
            const normalized = typeof value === "string" && value.trim() !== "" ? Number(value.trim()) : value;
            if (typeof normalized !== "number" || !Number.isFinite(normalized)) {
                throw new NotificationPayloadValidationError(
                    `Invalid notification parameter '${key}': expected float.`,
                );
            }
            return normalized;
        }

        if (definition.type === "date") {
            return this.normalizeDate(value, key);
        }

        if (definition.type === "datetime") {
            return this.normalizeDateTime(value, key);
        }

        throw new NotificationPayloadValidationError(`Invalid notification parameter definition '${key}'.`);
    }

    private normalizePayload(type: NotificationDefinition, payload: NotificationPayload) {
        if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
            throw new NotificationPayloadValidationError(`Invalid payload for notification-type '${type.key}'.`);
        }
        if (type.parameters === undefined) return { ...payload };

        const unknownKeys = Object.keys(payload).filter((key) => !type.parameters?.[key]);
        if (unknownKeys.length > 0) {
            throw new NotificationPayloadValidationError(
                `Unknown notification parameter '${unknownKeys[0]}' for type '${type.key}'.`,
            );
        }

        const normalized: NotificationPayload = {};
        for (const key of Object.keys(type.parameters)) {
            const definition = type.parameters[key];
            const value = payload[key];
            if (definition.required && this.isMissingRequiredValue(value)) {
                throw new NotificationPayloadValidationError(
                    `Missing required notification parameter '${key}' for type '${type.key}'.`,
                );
            }
            if (value !== undefined) {
                normalized[key] = this.normalizeParameterValue(key, value, definition);
            }
        }
        return normalized;
    }

    private async getLoadMatch(options: NotificationTargetContext) {
        const context = this.normalizeTargetContext(options);
        const additionalMatch = this.notificationsConfig?.onLoadNotificationsMatch
            ? await this.notificationsConfig.onLoadNotificationsMatch(context)
            : {};

        return {
            ...(additionalMatch || {}),
            target: context.target,
            target_id: context.target_id,
            key: { $in: Object.keys(this.registry) },
            show_at: { $lte: new Date() },
        };
    }

    private async getLoadAggregation(
        context: NotificationTargetContext,
        operation: NotificationAggregationOperation,
    ): Promise<NotificationAggregationStage[]> {
        const callback = this.notificationsConfig?.onLoadNotificationsAggregation;
        if (typeof callback !== "function") return [];

        const normalizedContext = this.normalizeTargetContext(context);
        const aggregation = await callback({ ...normalizedContext, operation });
        if (aggregation === undefined || aggregation === null) return [];
        if (!Array.isArray(aggregation)) {
            throw new Error("Notification load aggregation must be an array.");
        }

        const reservedStages = new Set(["$sort", "$skip", "$limit", "$out", "$merge"]);
        for (const stage of aggregation) {
            if (!stage || typeof stage !== "object" || Array.isArray(stage) || Object.keys(stage).length !== 1) {
                throw new Error("Notification load aggregation contains an invalid stage.");
            }
            const operator = Object.keys(stage)[0];
            if (reservedStages.has(operator)) {
                throw new Error(`Notification load aggregation cannot use reserved stage '${operator}'.`);
            }
        }
        return aggregation;
    }

    private async enrichNotification(notification: Notification): Promise<Notification | null> {
        const notType = notification?.key ? this.registry[notification.key] : null;
        if (!notType) return null;

        notification.title = notType.getTitle
            ? await notType.getTitle(notification)
            : notType.title !== undefined
              ? notType.title
              : null;
        notification.description = notType.getDescription
            ? await notType.getDescription(notification)
            : notType.description !== undefined
              ? notType.description
              : null;
        notification.link = notType.getLink
            ? await notType.getLink(notification)
            : notType.link !== undefined
              ? notType.link
              : null;
        return notification;
    }

    async create(typeKey: string, payload: NotificationPayload, options: NotificationOptions): Promise<Notification | null> {
        const notType = this.getTypeOrFail(typeKey);
        const targetContext = await this.resolveTarget(options);
        if (!targetContext?.targetModel) {
            throw new NotificationTargetValidationError("Notification target not found.");
        }
        if (!notType.targets.includes(targetContext.target)) {
            throw new NotificationTargetValidationError(
                `Notification type '${notType.key}' is not available for target '${targetContext.target}'.`,
            );
        }
        if (notType.subscribable) {
            const preference = await this.getEffectiveTargetPreference(typeKey, targetContext);
            if (!preference.owner_exists || !preference.enabled) return null;
        }
        const normalizedPayload = this.normalizePayload(notType, payload);
        const notificationMode = notType.mode || "fixed";
        if (notType.queueJobAutomation && notificationMode !== "changing") {
            throw new Error(`Notification-type '${notType.key}' can only use queueJobAutomation in changing mode.`);
        }

        const notification = new Notification();
        notification.target = targetContext.target;
        notification.target_id = targetContext.target_id as ObjectId;
        this.attachTargetModel(notification, targetContext.targetModel);
        notification.key = notType.key;
        notification.mode = notificationMode;
        notification.group_key = notType.getGroupKey ? await notType.getGroupKey(normalizedPayload, targetContext) : null;

        if (options?.baseData) {
            for (let key in options.baseData) {
                if (["_user", "target", "target_id", "targetModel"].includes(key)) continue;
                notification[key] = options.baseData[key];
            }
        }

        if (notification.payload) {
            notification.payload = { ...notification.payload, ...normalizedPayload };
        } else {
            notification.payload = normalizedPayload;
        }

        notification.key = notType.key;
        notification.mode = notificationMode;
        notification.created_at = new Date();
        notification.read_status = "unread";
        notification.read_at = null;
        notification.view_status = "unviewed";
        notification.viewed_at = null;
        notification.show_at = options.showAt || new Date();
        if (notification.mode === "changing") {
            notification.changing_status = "pending";
            notification.changing_error = null;
        }

        if (this.notificationsConfig?.beforeNotificationSave) {
            await this.notificationsConfig.beforeNotificationSave(notification);
        }

        if (notType.beforeSave) {
            await notType.beforeSave(notification);
        }

        await notification.save();

        if (notType.queueJobAutomation) {
            try {
                const shouldCreateJob = notType.queueJobAutomation.check
                    ? await notType.queueJobAutomation.check(notification)
                    : true;

                if (!shouldCreateJob) {
                    await this.setChangingStatus(notification, "success");
                } else {
                    const queueJobType = QueueJobsRegisty.getJobOrFail(notType.queueJobAutomation.job);
                    const queueJob = await queueJobType.create({
                        status: "initializing",
                        notification_queue_job: true,
                        _notification: notification._id,
                    });

                    notification._queue_job = queueJob._id;
                    await notification.save();

                    queueJob.status = "pending";
                    await queueJob.save();
                }
            } catch (error: any) {
                await this.setChangingStatus(notification, "error", this.getErrorMessage(error));
                throw error;
            }
        }

        if (this.notificationsConfig?.afterNotificationSave) {
            await this.notificationsConfig.afterNotificationSave(notification);
        }

        if (notType.afterSave) {
            await notType.afterSave(notification);
        }

        return notification;
    }

    async getNotification(notificationRef: Notification | ObjectId | string | null): Promise<Notification> {
        if (notificationRef instanceof Notification) {
            return notificationRef;
        }

        const notificationId = this.getNotificationReferenceId(notificationRef);

        if (notificationId && notificationId.length === 24 && ObjectId.isValid(notificationId)) {
            const loadNotification = await Notification.where(
                "_id",
                "=",
                await Notification.objectId(notificationId),
            ).first();

            if (loadNotification) {
                return loadNotification;
            }
        }
        throw new Error("Invalid notification type provided: " + notificationRef?.toString());
    }

    async setQueueJobFailureStatus(
        notificationRef: ObjectId | string | null,
        error?: string | null,
    ): Promise<boolean> {
        const notificationId = this.getNotificationReferenceId(notificationRef);
        if (!notificationId) {
            throw new Error("Invalid notification reference provided: " + notificationRef?.toString());
        }

        const connection = await DBConnection.getConnection();
        const completedAt = new Date();
        const result = await connection.client
            .db(null)
            .collection(new Notification().__table)
            .updateOne(
                { _id: await Notification.objectId(notificationId) },
                {
                    $set: {
                        changing_status: "error",
                        changing_error: error || "Unknown notification queue-job error",
                        read_status: "unread",
                        read_at: null,
                        view_status: "unviewed",
                        viewed_at: null,
                        show_at: completedAt,
                        updated_at: completedAt,
                    },
                },
            );
        return result.matchedCount > 0;
    }

    async markAsRead(notification: Notification | ObjectId | string | null): Promise<Notification> {
        notification = await this.getNotification(notification);
        if (notification.read_status === "read" && notification.view_status === "viewed") {
            return notification;
        }

        const now = new Date();
        notification.read_at = notification.read_at || now;
        notification.read_status = "read";
        notification.viewed_at = notification.viewed_at || now;
        notification.view_status = "viewed";
        notification.updated_at = now;
        await notification.update({
            read_at: notification.read_at,
            read_status: notification.read_status,
            viewed_at: notification.viewed_at,
            view_status: notification.view_status,
            updated_at: notification.updated_at,
        });
        return notification;
    }

    async markAsViewed(notification: Notification | ObjectId | string | null): Promise<Notification> {
        notification = await this.getNotification(notification);
        if (notification.view_status === "viewed") {
            return notification;
        }

        notification.viewed_at = new Date();
        notification.view_status = "viewed";
        notification.updated_at = notification.viewed_at;
        await notification.update({
            viewed_at: notification.viewed_at,
            view_status: notification.view_status,
            updated_at: notification.updated_at,
        });
        return notification;
    }

    async markAllAsRead(context: NotificationTargetContext): Promise<void> {
        const connection = await DBConnection.getConnection();
        const now = new Date();
        await connection.client
            .db(null)
            .collection(new Notification().__table)
            .updateMany(
                {
                    ...(await this.getLoadMatch(context)),
                    $or: [{ read_status: "unread" }, { view_status: "unviewed" }],
                },
                [
                    {
                        $set: {
                            read_at: { $ifNull: ["$read_at", now] },
                            read_status: "read",
                            viewed_at: { $ifNull: ["$viewed_at", now] },
                            view_status: "viewed",
                        },
                    },
                ],
            );
    }

    async markAllAsViewed(context: NotificationTargetContext): Promise<void> {
        const connection = await DBConnection.getConnection();
        await connection.client
            .db(null)
            .collection(new Notification().__table)
            .updateMany(
                {
                    ...(await this.getLoadMatch(context)),
                    view_status: "unviewed",
                },
                {
                    $set: {
                        viewed_at: new Date(),
                        view_status: "viewed",
                    },
                },
            );
    }

    async getNotificationForTarget(
        notificationRef: Notification | ObjectId | string | null,
        context: NotificationTargetContext,
    ): Promise<Notification | null> {
        const notificationId = notificationRef instanceof Notification ? notificationRef._id : notificationRef;
        if (!notificationId) return null;

        let objectId: ObjectId;
        if (notificationId instanceof ObjectId) {
            objectId = notificationId;
        } else if (typeof notificationId === "string" && ObjectId.isValid(notificationId)) {
            objectId = new ObjectId(notificationId);
        } else {
            return null;
        }

        const notifications = await Notification.aggregate([
            {
                $match: {
                    ...(await this.getLoadMatch(context)),
                    _id: objectId,
                },
            },
            { $limit: 1 },
            ...(await this.getLoadAggregation(context, "details")),
        ]);
        if (!notifications || notifications.length === 0) return null;

        const notification = DBConnection.mapDataToModel(Notification, notifications[0]) as Notification;
        if (context.targetModel) this.attachTargetModel(notification, context.targetModel);
        return await this.enrichNotification(notification);
    }

    private async countByStatus(
        context: NotificationTargetContext,
        match: { [key: string]: any },
    ): Promise<number> {
        const result = await Notification.aggregate([
            {
                $match: {
                    ...(await this.getLoadMatch(context)),
                    ...match,
                },
            },
            { $count: "count" },
        ]);
        return result && result[0] && typeof result[0].count === "number" ? result[0].count : 0;
    }

    async getUnreadCount(context: NotificationTargetContext): Promise<number> {
        return await this.countByStatus(context, { read_status: "unread" });
    }

    async getUnviewedCount(context: NotificationTargetContext): Promise<number> {
        return await this.countByStatus(context, { view_status: "unviewed" });
    }

    async updateNotification(
        notification: Notification | ObjectId | string | null,
        updateData: {
            payload?: NotificationPayload;
            show_at?: Date | null;
            read_status?: NotificationReadStatus;
            read_at?: Date | null;
            view_status?: NotificationViewStatus;
            viewed_at?: Date | null;
        },
    ): Promise<Notification> {
        notification = await this.getNotification(notification);

        if (updateData.payload) {
            notification.payload = { ...notification.payload, ...updateData.payload };
        }

        if (updateData.show_at !== undefined) {
            notification.show_at = updateData.show_at;
        }

        if (updateData.read_status !== undefined) {
            notification.read_status = updateData.read_status;
        }

        if (updateData.read_at !== undefined) {
            notification.read_at = updateData.read_at;
        }

        if (updateData.view_status !== undefined) {
            notification.view_status = updateData.view_status;
        }

        if (updateData.viewed_at !== undefined) {
            notification.viewed_at = updateData.viewed_at;
        }

        await notification.save();
        return notification;
    }

    async setChangingStatus(
        notification: Notification | ObjectId | string | null,
        status: NotificationChangingStatus,
        error?: string | null,
    ): Promise<Notification> {
        notification = await this.getNotification(notification);
        if (notification.mode !== "changing") {
            throw new Error(`Notification '${notification._id?.toString()}' is not in changing mode.`);
        }

        notification.changing_status = status;
        notification.changing_error = status === "error" ? error || "Unknown notification error" : null;
        if (status === "success" || status === "error") {
            notification.read_status = "unread";
            notification.read_at = null;
            notification.view_status = "unviewed";
            notification.viewed_at = null;
            notification.show_at = new Date();
        }
        await notification.save();
        return notification;
    }

    async loadNotifications(options: {
        target: string;
        target_id: ObjectId | string;
        targetModel?: any;
        offset?: number;
        limit?: number;
        request?: Request;
    }): Promise<Notification[]> {
        const notifications = await Notification.aggregate([
            {
                $match: await this.getLoadMatch(options),
            },
            {
                $sort: { show_at: -1 },
            },
            {
                $skip: options?.offset || 0,
            },
            {
                $limit: options?.limit || 10,
            },
            ...(await this.getLoadAggregation(options, "list")),
        ]);
        if (!notifications || notifications.length === 0) return [];

        const out = [];
        for (const notificationData of notifications) {
            const el = DBConnection.mapDataToModel(Notification, notificationData) as Notification;
            if (options.targetModel) this.attachTargetModel(el, options.targetModel);
            const enrichedNotification = await this.enrichNotification(el);
            if (enrichedNotification) out.push(enrichedNotification);
        }
        return out;
    }
}

export const NotificationService = new NotificationServiceFacade();
