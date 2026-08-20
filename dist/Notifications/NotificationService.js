"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationService = exports.NotificationTargetValidationError = exports.NotificationPayloadValidationError = void 0;
const mongodb_1 = require("mongodb");
const Notification_1 = require("./Notification");
const Config_1 = require("../Config");
const DBConnection_1 = require("../Database/DBConnection");
const QueueJobsRegisty_1 = require("../Queue/QueueJobsRegisty");
class NotificationPayloadValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = "NotificationPayloadValidationError";
    }
}
exports.NotificationPayloadValidationError = NotificationPayloadValidationError;
class NotificationTargetValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = "NotificationTargetValidationError";
    }
}
exports.NotificationTargetValidationError = NotificationTargetValidationError;
class NotificationServiceFacade {
    constructor() {
        this.registry = {};
        this.notificationsConfig = {};
        this.targetRegistry = {
            user: { collection: "users" },
        };
    }
    /** @deprecated Use registry instead. */
    get registy() {
        return this.registry;
    }
    /** @deprecated Use registry instead. */
    set registy(registry) {
        this.registry = registry;
    }
    getObjectIdString(value) {
        const objectIdString = typeof value === "string"
            ? value
            : value && typeof value.toString === "function"
                ? value.toString()
                : null;
        return objectIdString && objectIdString.length === 24 && mongodb_1.ObjectId.isValid(objectIdString)
            ? objectIdString
            : null;
    }
    normalizeObjectId(value) {
        const objectIdString = this.getObjectIdString(value);
        return objectIdString ? new mongodb_1.ObjectId(objectIdString) : null;
    }
    getNotificationReferenceId(notificationRef) {
        return this.getObjectIdString(notificationRef);
    }
    init() {
        this.registry = {};
        this.notificationsConfig = Config_1.Config.get("notifications") || {};
        const configuredTargets = this.notificationsConfig.targets || {};
        const { user: configuredUserTarget } = configuredTargets, projectTargets = __rest(configuredTargets, ["user"]);
        this.targetRegistry = Object.assign({ user: Object.assign({ collection: "users" }, (configuredUserTarget || {})) }, projectTargets);
        for (const [key, definition] of Object.entries(this.targetRegistry)) {
            if (!key.trim() || !definition || typeof definition !== "object") {
                throw new Error(`Invalid notification target '${key}'.`);
            }
        }
        for (const channel of this.notificationsConfig.output_channels || []) {
            if (!Array.isArray(channel === null || channel === void 0 ? void 0 : channel.targets))
                continue;
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
    registerType(type) {
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
    registerTypes(types) {
        const definitions = Array.isArray(types) ? types : [types];
        for (const definition of definitions) {
            this.registerType(definition);
        }
        return this;
    }
    getTypeOrFail(typeKey) {
        if (this.registry[typeKey]) {
            return this.registry[typeKey];
        }
        throw new Error("Invalid notification-type '" + typeKey + "' ...");
    }
    getPublicTypeDefinition(typeKey) {
        var _a, _b;
        const type = this.getTypeOrFail(typeKey);
        const parameters = {};
        for (const key of Object.keys(type.parameters || {})) {
            const parameter = (_a = type.parameters) === null || _a === void 0 ? void 0 : _a[key];
            parameters[key] = Object.assign(Object.assign({ type: parameter.type }, (parameter.label !== undefined ? { label: parameter.label } : {})), (parameter.required !== undefined ? { required: parameter.required } : {}));
        }
        return {
            key: type.key,
            targets: [...type.targets],
            mode: type.mode || "fixed",
            queue_job_automation: !!type.queueJobAutomation,
            subscribable: type.subscribable === true,
            settings_group: ((_b = type.settingsGroup) === null || _b === void 0 ? void 0 : _b.trim()) || null,
            settings_title: type.settingsTitle !== undefined ? type.settingsTitle : null,
            settings_description: type.settingsDescription !== undefined ? type.settingsDescription : null,
            title: type.title !== undefined ? type.title : null,
            description: type.description !== undefined ? type.description : null,
            link: type.link !== undefined ? type.link : null,
            parameters,
        };
    }
    getAvailableOutputChannels(target) {
        var _a;
        const channels = Array.isArray((_a = this.notificationsConfig) === null || _a === void 0 ? void 0 : _a.output_channels)
            ? this.notificationsConfig.output_channels
            : [];
        const available = [];
        const keys = new Set();
        for (const channel of channels) {
            if (!(channel === null || channel === void 0 ? void 0 : channel.key) || !(channel === null || channel === void 0 ? void 0 : channel.is_active) || !(channel === null || channel === void 0 ? void 0 : channel.driver))
                continue;
            if (target && Array.isArray(channel.targets) && !channel.targets.includes(target))
                continue;
            if (keys.has(channel.key)) {
                throw new Error(`Duplicate notification output-channel key '${channel.key}'.`);
            }
            const driver = new channel.driver();
            if (!(driver === null || driver === void 0 ? void 0 : driver.activated))
                continue;
            keys.add(channel.key);
            available.push({ key: channel.key, label: channel.label || channel.name || channel.key });
        }
        return available;
    }
    getTargetDefinition(target) {
        return this.targetRegistry[target] || null;
    }
    normalizeTargetId(targetId) {
        const normalized = this.normalizeObjectId(targetId);
        if (!normalized) {
            throw new NotificationTargetValidationError("Invalid notification target_id.");
        }
        return normalized;
    }
    normalizeTargetContext(context) {
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
        return Object.assign(Object.assign({}, context), { target, target_id: this.normalizeTargetId(context.target_id) });
    }
    resolveTarget(context) {
        var _a, _b, _c;
        return __awaiter(this, void 0, void 0, function* () {
            const normalized = this.normalizeTargetContext(context);
            if (normalized.targetModel) {
                return ((_a = this.getModelId(normalized.targetModel)) === null || _a === void 0 ? void 0 : _a.equals(normalized.target_id)) ? normalized : null;
            }
            const definition = this.getTargetDefinition(normalized.target);
            let targetModel = null;
            if (definition.resolve) {
                targetModel = yield definition.resolve(normalized);
            }
            else if (normalized.target === "user" &&
                ((_b = normalized.request) === null || _b === void 0 ? void 0 : _b.user) &&
                ((_c = this.getModelId(normalized.request.user)) === null || _c === void 0 ? void 0 : _c.equals(normalized.target_id))) {
                targetModel = normalized.request.user;
            }
            else if (definition.collection) {
                const connection = yield DBConnection_1.DBConnection.getConnection();
                targetModel = yield connection.client
                    .db(null)
                    .collection(definition.collection)
                    .findOne({ _id: normalized.target_id });
            }
            const modelId = this.getModelId(targetModel);
            return (modelId === null || modelId === void 0 ? void 0 : modelId.equals(normalized.target_id)) ? Object.assign(Object.assign({}, normalized), { targetModel }) : null;
        });
    }
    authorizeTarget(context) {
        return __awaiter(this, void 0, void 0, function* () {
            const resolved = yield this.resolveTarget(context);
            if (!resolved)
                return null;
            const definition = this.getTargetDefinition(resolved.target);
            if (definition.authorize) {
                return (yield definition.authorize(resolved)) ? resolved : null;
            }
            if (!resolved.request)
                return resolved;
            const requestUserId = this.getModelId(resolved.request.user);
            return (requestUserId === null || requestUserId === void 0 ? void 0 : requestUserId.equals(resolved.target_id)) ? resolved : null;
        });
    }
    attachTargetModel(notification, targetModel) {
        Object.defineProperty(notification, "targetModel", {
            value: targetModel,
            writable: true,
            configurable: true,
            enumerable: false,
        });
        return notification;
    }
    getModelId(model) {
        var _a;
        return this.normalizeObjectId((_a = model === null || model === void 0 ? void 0 : model._id) !== null && _a !== void 0 ? _a : model === null || model === void 0 ? void 0 : model.id);
    }
    getPreferencesField(target) {
        var _a;
        const field = (_a = this.getTargetDefinition(target)) === null || _a === void 0 ? void 0 : _a.preferencesField;
        return typeof field === "string" && field.trim() !== "" ? field.trim() : "notification_preferences";
    }
    normalizeStoredPreferences(value) {
        if (!value || typeof value !== "object" || Array.isArray(value))
            return {};
        const preferences = {};
        for (const key of Object.keys(value)) {
            const entry = value[key];
            if (!entry || typeof entry !== "object" || Array.isArray(entry))
                continue;
            preferences[key] = {
                enabled: entry.enabled === true,
                output_channels: Array.isArray(entry.output_channels)
                    ? entry.output_channels.filter((channel) => typeof channel === "string")
                    : [],
            };
        }
        return preferences;
    }
    preferenceForType(type, preferences, availableChannels) {
        const stored = preferences[type.key];
        const availableKeys = new Set(availableChannels.map((channel) => channel.key));
        const outputChannels = stored
            ? stored.output_channels.filter((channel) => availableKeys.has(channel))
            : type.subscribable
                ? []
                : availableChannels.map((channel) => channel.key);
        return {
            enabled: type.subscribable ? (stored === null || stored === void 0 ? void 0 : stored.enabled) === true : true,
            output_channels: Array.from(new Set(outputChannels)),
        };
    }
    getEffectiveTargetPreference(typeKey, context) {
        return __awaiter(this, void 0, void 0, function* () {
            const type = this.getTypeOrFail(typeKey);
            if (!type.targets.includes(context.target)) {
                return { enabled: false, output_channels: [], owner_exists: false };
            }
            const resolved = yield this.resolveTarget(context);
            if (!(resolved === null || resolved === void 0 ? void 0 : resolved.targetModel)) {
                return { enabled: false, output_channels: [], owner_exists: false };
            }
            const preferences = this.normalizeStoredPreferences(resolved.targetModel[this.getPreferencesField(resolved.target)]);
            const preference = this.preferenceForType(type, preferences, this.getAvailableOutputChannels(resolved.target));
            return Object.assign(Object.assign({}, preference), { output_channels: preference.enabled ? preference.output_channels : [], owner_exists: true });
        });
    }
    getTargetPreferences(context) {
        return __awaiter(this, void 0, void 0, function* () {
            const resolved = yield this.resolveTarget(context);
            if (!(resolved === null || resolved === void 0 ? void 0 : resolved.targetModel))
                return null;
            const availableChannels = this.getAvailableOutputChannels(resolved.target);
            const preferences = this.normalizeStoredPreferences(resolved.targetModel[this.getPreferencesField(resolved.target)]);
            const entries = Object.values(this.registry)
                .filter((type) => type.targets.includes(resolved.target))
                .map((type) => {
                var _a;
                const preference = this.preferenceForType(type, preferences, availableChannels);
                return {
                    key: type.key,
                    title: type.settingsTitle || type.title || type.key,
                    description: type.settingsDescription || type.description || null,
                    settings_group: ((_a = type.settingsGroup) === null || _a === void 0 ? void 0 : _a.trim()) || null,
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
        });
    }
    saveTargetPreference(typeKey, preference, context) {
        var _a, _b;
        return __awaiter(this, void 0, void 0, function* () {
            const type = this.getTypeOrFail(typeKey);
            const resolved = yield this.resolveTarget(context);
            if (!(resolved === null || resolved === void 0 ? void 0 : resolved.targetModel))
                return null;
            if (!type.targets.includes(resolved.target)) {
                throw new NotificationPayloadValidationError(`Notification type '${typeKey}' is not available for target '${resolved.target}'.`);
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
                yield owner.save();
            }
            else if (((_a = this.getTargetDefinition(resolved.target)) === null || _a === void 0 ? void 0 : _a.collection) && owner._id) {
                const connection = yield DBConnection_1.DBConnection.getConnection();
                yield connection.client
                    .db(null)
                    .collection(this.getTargetDefinition(resolved.target).collection)
                    .updateOne({ _id: owner._id }, { $set: { [preferencesField]: preferences } });
            }
            else {
                throw new Error("Notification target preferences cannot be saved.");
            }
            const stored = this.preferenceForType(type, preferences, availableChannels);
            return {
                key: type.key,
                title: type.settingsTitle || type.title || type.key,
                description: type.settingsDescription || type.description || null,
                settings_group: ((_b = type.settingsGroup) === null || _b === void 0 ? void 0 : _b.trim()) || null,
                subscribable: type.subscribable === true,
                enabled: stored.enabled,
                output_channels: stored.output_channels,
            };
        });
    }
    getErrorMessage(error) {
        if ((error === null || error === void 0 ? void 0 : error.message) && error.message.toString().trim() !== "") {
            return error.message.toString();
        }
        if (error && error.toString().trim() !== "") {
            return error.toString();
        }
        return "Unknown notification queue-job error";
    }
    isMissingRequiredValue(value) {
        return value === undefined || value === null || (typeof value === "string" && value.trim() === "");
    }
    normalizeDate(value, parameterKey) {
        if (value instanceof Date) {
            if (Number.isNaN(value.getTime())) {
                throw new NotificationPayloadValidationError(`Invalid notification parameter '${parameterKey}': expected date.`);
            }
            return value.toISOString().substring(0, 10);
        }
        if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
            throw new NotificationPayloadValidationError(`Invalid notification parameter '${parameterKey}': expected date.`);
        }
        const parsed = new Date(`${value}T00:00:00.000Z`);
        if (Number.isNaN(parsed.getTime()) || parsed.toISOString().substring(0, 10) !== value) {
            throw new NotificationPayloadValidationError(`Invalid notification parameter '${parameterKey}': expected date.`);
        }
        return value;
    }
    normalizeDateTime(value, parameterKey) {
        let parsed = null;
        if (value instanceof Date) {
            parsed = value;
        }
        else if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
            parsed = new Date(value);
        }
        if (!parsed || Number.isNaN(parsed.getTime())) {
            throw new NotificationPayloadValidationError(`Invalid notification parameter '${parameterKey}': expected datetime.`);
        }
        return parsed.toISOString();
    }
    normalizeParameterValue(key, value, definition) {
        if (value === null || value === undefined)
            return value;
        if (definition.type === "string") {
            if (typeof value !== "string") {
                throw new NotificationPayloadValidationError(`Invalid notification parameter '${key}': expected string.`);
            }
            return value;
        }
        if (definition.type === "integer") {
            const normalized = typeof value === "string" && /^-?\d+$/.test(value.trim()) ? Number(value.trim()) : value;
            if (typeof normalized !== "number" || !Number.isSafeInteger(normalized)) {
                throw new NotificationPayloadValidationError(`Invalid notification parameter '${key}': expected integer.`);
            }
            return normalized;
        }
        if (definition.type === "float") {
            const normalized = typeof value === "string" && value.trim() !== "" ? Number(value.trim()) : value;
            if (typeof normalized !== "number" || !Number.isFinite(normalized)) {
                throw new NotificationPayloadValidationError(`Invalid notification parameter '${key}': expected float.`);
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
    normalizePayload(type, payload) {
        if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
            throw new NotificationPayloadValidationError(`Invalid payload for notification-type '${type.key}'.`);
        }
        if (type.parameters === undefined)
            return Object.assign({}, payload);
        const unknownKeys = Object.keys(payload).filter((key) => { var _a; return !((_a = type.parameters) === null || _a === void 0 ? void 0 : _a[key]); });
        if (unknownKeys.length > 0) {
            throw new NotificationPayloadValidationError(`Unknown notification parameter '${unknownKeys[0]}' for type '${type.key}'.`);
        }
        const normalized = {};
        for (const key of Object.keys(type.parameters)) {
            const definition = type.parameters[key];
            const value = payload[key];
            if (definition.required && this.isMissingRequiredValue(value)) {
                throw new NotificationPayloadValidationError(`Missing required notification parameter '${key}' for type '${type.key}'.`);
            }
            if (value !== undefined) {
                normalized[key] = this.normalizeParameterValue(key, value, definition);
            }
        }
        return normalized;
    }
    getLoadMatch(options) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            const context = this.normalizeTargetContext(options);
            const additionalMatch = ((_a = this.notificationsConfig) === null || _a === void 0 ? void 0 : _a.onLoadNotificationsMatch)
                ? yield this.notificationsConfig.onLoadNotificationsMatch(context)
                : {};
            return Object.assign(Object.assign({}, (additionalMatch || {})), { target: context.target, target_id: context.target_id, key: { $in: Object.keys(this.registry) }, show_at: { $lte: new Date() } });
        });
    }
    getLoadAggregation(context, operation) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            const callback = (_a = this.notificationsConfig) === null || _a === void 0 ? void 0 : _a.onLoadNotificationsAggregation;
            if (typeof callback !== "function")
                return [];
            const normalizedContext = this.normalizeTargetContext(context);
            const aggregation = yield callback(Object.assign(Object.assign({}, normalizedContext), { operation }));
            if (aggregation === undefined || aggregation === null)
                return [];
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
        });
    }
    enrichNotification(notification) {
        return __awaiter(this, void 0, void 0, function* () {
            const notType = (notification === null || notification === void 0 ? void 0 : notification.key) ? this.registry[notification.key] : null;
            if (!notType)
                return null;
            notification.title = notType.getTitle
                ? yield notType.getTitle(notification)
                : notType.title !== undefined
                    ? notType.title
                    : null;
            notification.description = notType.getDescription
                ? yield notType.getDescription(notification)
                : notType.description !== undefined
                    ? notType.description
                    : null;
            notification.link = notType.getLink
                ? yield notType.getLink(notification)
                : notType.link !== undefined
                    ? notType.link
                    : null;
            return notification;
        });
    }
    create(typeKey, payload, options) {
        var _a, _b;
        return __awaiter(this, void 0, void 0, function* () {
            const notType = this.getTypeOrFail(typeKey);
            const targetContext = yield this.resolveTarget(options);
            if (!(targetContext === null || targetContext === void 0 ? void 0 : targetContext.targetModel)) {
                throw new NotificationTargetValidationError("Notification target not found.");
            }
            if (!notType.targets.includes(targetContext.target)) {
                throw new NotificationTargetValidationError(`Notification type '${notType.key}' is not available for target '${targetContext.target}'.`);
            }
            if (notType.subscribable) {
                const preference = yield this.getEffectiveTargetPreference(typeKey, targetContext);
                if (!preference.owner_exists || !preference.enabled)
                    return null;
            }
            const normalizedPayload = this.normalizePayload(notType, payload);
            const notificationMode = notType.mode || "fixed";
            if (notType.queueJobAutomation && notificationMode !== "changing") {
                throw new Error(`Notification-type '${notType.key}' can only use queueJobAutomation in changing mode.`);
            }
            const notification = new Notification_1.Notification();
            notification.target = targetContext.target;
            notification.target_id = targetContext.target_id;
            this.attachTargetModel(notification, targetContext.targetModel);
            notification.key = notType.key;
            notification.mode = notificationMode;
            notification.group_key = notType.getGroupKey ? yield notType.getGroupKey(normalizedPayload, targetContext) : null;
            if (options === null || options === void 0 ? void 0 : options.baseData) {
                for (let key in options.baseData) {
                    if (["_user", "target", "target_id", "targetModel"].includes(key))
                        continue;
                    notification[key] = options.baseData[key];
                }
            }
            if (notification.payload) {
                notification.payload = Object.assign(Object.assign({}, notification.payload), normalizedPayload);
            }
            else {
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
            if ((_a = this.notificationsConfig) === null || _a === void 0 ? void 0 : _a.beforeNotificationSave) {
                yield this.notificationsConfig.beforeNotificationSave(notification);
            }
            if (notType.beforeSave) {
                yield notType.beforeSave(notification);
            }
            yield notification.save();
            if (notType.queueJobAutomation) {
                try {
                    const shouldCreateJob = notType.queueJobAutomation.check
                        ? yield notType.queueJobAutomation.check(notification)
                        : true;
                    if (!shouldCreateJob) {
                        yield this.setChangingStatus(notification, "success");
                    }
                    else {
                        const queueJobType = QueueJobsRegisty_1.QueueJobsRegisty.getJobOrFail(notType.queueJobAutomation.job);
                        const queueJob = yield queueJobType.create({
                            status: "initializing",
                            notification_queue_job: true,
                            _notification: notification._id,
                        });
                        notification._queue_job = queueJob._id;
                        yield notification.save();
                        queueJob.status = "pending";
                        yield queueJob.save();
                    }
                }
                catch (error) {
                    yield this.setChangingStatus(notification, "error", this.getErrorMessage(error));
                    throw error;
                }
            }
            if ((_b = this.notificationsConfig) === null || _b === void 0 ? void 0 : _b.afterNotificationSave) {
                yield this.notificationsConfig.afterNotificationSave(notification);
            }
            if (notType.afterSave) {
                yield notType.afterSave(notification);
            }
            return notification;
        });
    }
    getNotification(notificationRef) {
        return __awaiter(this, void 0, void 0, function* () {
            if (notificationRef instanceof Notification_1.Notification) {
                return notificationRef;
            }
            const notificationId = this.getNotificationReferenceId(notificationRef);
            if (notificationId && notificationId.length === 24 && mongodb_1.ObjectId.isValid(notificationId)) {
                const loadNotification = yield Notification_1.Notification.where("_id", "=", yield Notification_1.Notification.objectId(notificationId)).first();
                if (loadNotification) {
                    return loadNotification;
                }
            }
            throw new Error("Invalid notification type provided: " + (notificationRef === null || notificationRef === void 0 ? void 0 : notificationRef.toString()));
        });
    }
    setQueueJobFailureStatus(notificationRef, error) {
        return __awaiter(this, void 0, void 0, function* () {
            const notificationId = this.getNotificationReferenceId(notificationRef);
            if (!notificationId) {
                throw new Error("Invalid notification reference provided: " + (notificationRef === null || notificationRef === void 0 ? void 0 : notificationRef.toString()));
            }
            const connection = yield DBConnection_1.DBConnection.getConnection();
            const completedAt = new Date();
            const result = yield connection.client
                .db(null)
                .collection(new Notification_1.Notification().__table)
                .updateOne({ _id: yield Notification_1.Notification.objectId(notificationId) }, {
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
            });
            return result.matchedCount > 0;
        });
    }
    markAsRead(notification) {
        return __awaiter(this, void 0, void 0, function* () {
            notification = yield this.getNotification(notification);
            if (notification.read_status === "read" && notification.view_status === "viewed") {
                return notification;
            }
            const now = new Date();
            notification.read_at = notification.read_at || now;
            notification.read_status = "read";
            notification.viewed_at = notification.viewed_at || now;
            notification.view_status = "viewed";
            notification.updated_at = now;
            yield notification.update({
                read_at: notification.read_at,
                read_status: notification.read_status,
                viewed_at: notification.viewed_at,
                view_status: notification.view_status,
                updated_at: notification.updated_at,
            });
            return notification;
        });
    }
    markAsViewed(notification) {
        return __awaiter(this, void 0, void 0, function* () {
            notification = yield this.getNotification(notification);
            if (notification.view_status === "viewed") {
                return notification;
            }
            notification.viewed_at = new Date();
            notification.view_status = "viewed";
            notification.updated_at = notification.viewed_at;
            yield notification.update({
                viewed_at: notification.viewed_at,
                view_status: notification.view_status,
                updated_at: notification.updated_at,
            });
            return notification;
        });
    }
    markAllAsRead(context) {
        return __awaiter(this, void 0, void 0, function* () {
            const connection = yield DBConnection_1.DBConnection.getConnection();
            const now = new Date();
            yield connection.client
                .db(null)
                .collection(new Notification_1.Notification().__table)
                .updateMany(Object.assign(Object.assign({}, (yield this.getLoadMatch(context))), { $or: [{ read_status: "unread" }, { view_status: "unviewed" }] }), [
                {
                    $set: {
                        read_at: { $ifNull: ["$read_at", now] },
                        read_status: "read",
                        viewed_at: { $ifNull: ["$viewed_at", now] },
                        view_status: "viewed",
                    },
                },
            ]);
        });
    }
    markAllAsViewed(context) {
        return __awaiter(this, void 0, void 0, function* () {
            const connection = yield DBConnection_1.DBConnection.getConnection();
            yield connection.client
                .db(null)
                .collection(new Notification_1.Notification().__table)
                .updateMany(Object.assign(Object.assign({}, (yield this.getLoadMatch(context))), { view_status: "unviewed" }), {
                $set: {
                    viewed_at: new Date(),
                    view_status: "viewed",
                },
            });
        });
    }
    getNotificationForTarget(notificationRef, context) {
        return __awaiter(this, void 0, void 0, function* () {
            const notificationId = notificationRef instanceof Notification_1.Notification ? notificationRef._id : notificationRef;
            const objectId = this.normalizeObjectId(notificationId);
            if (!objectId)
                return null;
            const notifications = yield Notification_1.Notification.aggregate([
                {
                    $match: Object.assign(Object.assign({}, (yield this.getLoadMatch(context))), { _id: objectId }),
                },
                { $limit: 1 },
                ...(yield this.getLoadAggregation(context, "details")),
            ]);
            if (!notifications || notifications.length === 0)
                return null;
            const notification = DBConnection_1.DBConnection.mapDataToModel(Notification_1.Notification, notifications[0]);
            if (context.targetModel)
                this.attachTargetModel(notification, context.targetModel);
            return yield this.enrichNotification(notification);
        });
    }
    countByStatus(context, match) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield Notification_1.Notification.aggregate([
                {
                    $match: Object.assign(Object.assign({}, (yield this.getLoadMatch(context))), match),
                },
                { $count: "count" },
            ]);
            return result && result[0] && typeof result[0].count === "number" ? result[0].count : 0;
        });
    }
    getUnreadCount(context) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.countByStatus(context, { read_status: "unread" });
        });
    }
    getUnviewedCount(context) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.countByStatus(context, { view_status: "unviewed" });
        });
    }
    updateNotification(notification, updateData) {
        return __awaiter(this, void 0, void 0, function* () {
            notification = yield this.getNotification(notification);
            if (updateData.payload) {
                notification.payload = Object.assign(Object.assign({}, notification.payload), updateData.payload);
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
            yield notification.save();
            return notification;
        });
    }
    setChangingStatus(notification, status, error) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            notification = yield this.getNotification(notification);
            if (notification.mode !== "changing") {
                throw new Error(`Notification '${(_a = notification._id) === null || _a === void 0 ? void 0 : _a.toString()}' is not in changing mode.`);
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
            yield notification.save();
            return notification;
        });
    }
    loadNotifications(options) {
        return __awaiter(this, void 0, void 0, function* () {
            const notifications = yield Notification_1.Notification.aggregate([
                {
                    $match: yield this.getLoadMatch(options),
                },
                {
                    $sort: { show_at: -1 },
                },
                {
                    $skip: (options === null || options === void 0 ? void 0 : options.offset) || 0,
                },
                {
                    $limit: (options === null || options === void 0 ? void 0 : options.limit) || 10,
                },
                ...(yield this.getLoadAggregation(options, "list")),
            ]);
            if (!notifications || notifications.length === 0)
                return [];
            const out = [];
            for (const notificationData of notifications) {
                const el = DBConnection_1.DBConnection.mapDataToModel(Notification_1.Notification, notificationData);
                if (options.targetModel)
                    this.attachTargetModel(el, options.targetModel);
                const enrichedNotification = yield this.enrichNotification(el);
                if (enrichedNotification)
                    out.push(enrichedNotification);
            }
            return out;
        });
    }
}
exports.NotificationService = new NotificationServiceFacade();
