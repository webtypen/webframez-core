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
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationsOutputChannelsJob = void 0;
const mongodb_1 = require("mongodb");
const Config_1 = require("../Config");
const DBConnection_1 = require("../Database/DBConnection");
const BaseQueueJob_1 = require("../Queue/BaseQueueJob");
const Notification_1 = require("./Notification");
const NotificationService_1 = require("./NotificationService");
class NotificationsOutputChannelsJob extends BaseQueueJob_1.BaseQueueJob {
    constructor() {
        super(...arguments);
        this.attempts = 10;
        this.perAttempt = 50;
    }
    positiveNumber(value, fallback) {
        const parsed = Number(value);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
    }
    nonNegativeNumber(value, fallback) {
        const parsed = Number(value);
        return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
    }
    getErrorMessage(error) {
        if ((error === null || error === void 0 ? void 0 : error.message) && error.message.toString().trim() !== "") {
            return error.message.toString();
        }
        if (error && error.toString().trim() !== "") {
            return error.toString();
        }
        return "Failed without exception";
    }
    getActiveChannels(notificationsConfig) {
        const channels = [];
        const registeredKeys = new Set();
        for (const channel of notificationsConfig.output_channels) {
            if (!channel || !channel.key || !channel.is_active || !channel.driver)
                continue;
            if (registeredKeys.has(channel.key)) {
                throw new Error(`Duplicate notification output-channel key '${channel.key}'.`);
            }
            const driver = new channel.driver();
            if (!driver || !driver.activated)
                continue;
            registeredKeys.add(channel.key);
            channels.push(Object.assign({ key: channel.key, driver }, (Array.isArray(channel.targets) ? { targets: channel.targets } : {})));
        }
        return channels;
    }
    getChannelResults(notification, channelKey) {
        if (!Array.isArray(notification.output_channels_result))
            return [];
        return notification.output_channels_result.filter((result) => (result === null || result === void 0 ? void 0 : result.channel) === channelKey);
    }
    hasSuccessfulDelivery(notification, channelKey) {
        return this.getChannelResults(notification, channelKey).some((result) => result.status === "success");
    }
    deliverableModeMatch() {
        return [
            { mode: null },
            { mode: "fixed" },
            { mode: "changing", changing_status: { $in: ["success", "error"] } },
        ];
    }
    skipViewedNotifications(collection, eligibleBefore, claimTimeoutMinutes) {
        return __awaiter(this, void 0, void 0, function* () {
            const now = new Date();
            const staleClaimBefore = new Date(now.getTime() - claimTimeoutMinutes * 60 * 1000);
            yield collection.updateMany({
                key: { $ne: null },
                show_at: { $lte: eligibleBefore },
                view_status: "viewed",
                output_channels_finished_at: null,
                $and: [
                    {
                        $or: [
                            { output_channels_claimed_at: null },
                            { output_channels_claimed_at: { $lte: staleClaimBefore } },
                        ],
                    },
                    { $or: this.deliverableModeMatch() },
                ],
            }, {
                $set: {
                    output_channels_status: "skipped",
                    output_channels_error: null,
                    output_channels_finished_at: now,
                    output_channels_next_attempt_at: null,
                    output_channels_claimed_at: null,
                    output_channels_claim_token: null,
                },
            });
        });
    }
    finishSkipped(collection, notification) {
        return __awaiter(this, void 0, void 0, function* () {
            yield collection.updateOne({
                _id: notification._id,
                output_channels_claim_token: notification.output_channels_claim_token,
            }, {
                $set: {
                    output_channels_status: "skipped",
                    output_channels_error: null,
                    output_channels_finished_at: new Date(),
                    output_channels_next_attempt_at: null,
                    output_channels_claimed_at: null,
                    output_channels_claim_token: null,
                },
            });
        });
    }
    isStillUnviewed(collection, notification) {
        return __awaiter(this, void 0, void 0, function* () {
            const current = yield collection.findOne({
                _id: notification._id,
                output_channels_claim_token: notification.output_channels_claim_token,
            }, { projection: { view_status: 1 } });
            return (current === null || current === void 0 ? void 0 : current.view_status) === "unviewed";
        });
    }
    claimNotification(collection, claimTimeoutMinutes, eligibleBefore) {
        return __awaiter(this, void 0, void 0, function* () {
            const now = new Date();
            const staleClaimBefore = new Date(now.getTime() - claimTimeoutMinutes * 60 * 1000);
            const claimToken = new mongodb_1.ObjectId().toHexString();
            const claimResult = yield collection.findOneAndUpdate({
                key: { $ne: null },
                show_at: { $lte: eligibleBefore },
                view_status: "unviewed",
                output_channels_finished_at: null,
                $and: [
                    {
                        $or: [
                            { output_channels_next_attempt_at: null },
                            { output_channels_next_attempt_at: { $lte: now } },
                        ],
                    },
                    {
                        $or: [
                            { output_channels_claimed_at: null },
                            { output_channels_claimed_at: { $lte: staleClaimBefore } },
                        ],
                    },
                    { $or: this.deliverableModeMatch() },
                ],
            }, {
                $set: {
                    output_channels_status: "processing",
                    output_channels_claimed_at: now,
                    output_channels_claim_token: claimToken,
                    output_channels_handled_at: now,
                },
                $inc: { output_channels_attempts: 1 },
            }, {
                sort: { show_at: 1, created_at: 1 },
                returnDocument: "after",
            });
            const notificationData = claimResult && claimResult._id
                ? claimResult
                : (claimResult === null || claimResult === void 0 ? void 0 : claimResult.value) && claimResult.value._id
                    ? claimResult.value
                    : null;
            if (!notificationData)
                return null;
            return DBConnection_1.DBConnection.mapDataToModel(Notification_1.Notification, notificationData);
        });
    }
    saveChannelResult(collection, notification, result) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            const updateResult = yield collection.updateOne({
                _id: notification._id,
                output_channels_claim_token: notification.output_channels_claim_token,
            }, {
                $push: { output_channels_result: result },
            });
            if ((updateResult === null || updateResult === void 0 ? void 0 : updateResult.matchedCount) === 0) {
                throw new Error(`Lost delivery claim for notification '${(_a = notification._id) === null || _a === void 0 ? void 0 : _a.toString()}'.`);
            }
            if (!Array.isArray(notification.output_channels_result)) {
                notification.output_channels_result = [];
            }
            notification.output_channels_result.push(result);
        });
    }
    deliverNotification(collection, notification, channels, maxChannelAttempts, retryDelayMinutes) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            const notType = notification.key ? NotificationService_1.NotificationService.registry[notification.key] : null;
            if (!notType) {
                yield collection.updateOne({
                    _id: notification._id,
                    output_channels_claim_token: notification.output_channels_claim_token,
                }, {
                    $set: {
                        output_channels_status: "failed",
                        output_channels_error: "Invalid notification-type: " + notification.key,
                        output_channels_finished_at: new Date(),
                        output_channels_claimed_at: null,
                        output_channels_claim_token: null,
                        output_channels_next_attempt_at: null,
                    },
                });
                return;
            }
            let effectivePreference;
            let targetContext;
            try {
                targetContext = yield NotificationService_1.NotificationService.resolveTarget({
                    target: notification.target,
                    target_id: notification.target_id,
                });
                if (targetContext === null || targetContext === void 0 ? void 0 : targetContext.targetModel) {
                    NotificationService_1.NotificationService.attachTargetModel(notification, targetContext.targetModel);
                }
                if (targetContext) {
                    const loadedNotification = yield NotificationService_1.NotificationService.getNotificationForTarget(notification._id, targetContext);
                    if (!loadedNotification) {
                        throw new Error("Notification could not be reloaded for output delivery.");
                    }
                    notification = loadedNotification;
                }
                effectivePreference = targetContext
                    ? yield NotificationService_1.NotificationService.getEffectiveTargetPreference(notType.key, targetContext)
                    : { enabled: false, output_channels: [], owner_exists: false };
            }
            catch (error) {
                const now = new Date();
                yield collection.updateOne({
                    _id: notification._id,
                    output_channels_claim_token: notification.output_channels_claim_token,
                }, {
                    $set: {
                        output_channels_status: "retry_pending",
                        output_channels_error: `Could not prepare notification delivery: ${this.getErrorMessage(error)}`,
                        output_channels_finished_at: null,
                        output_channels_next_attempt_at: new Date(now.getTime() + retryDelayMinutes * 60 * 1000),
                        output_channels_claimed_at: null,
                        output_channels_claim_token: null,
                    },
                });
                return;
            }
            if (!effectivePreference.owner_exists) {
                yield collection.updateOne({
                    _id: notification._id,
                    output_channels_claim_token: notification.output_channels_claim_token,
                }, {
                    $set: {
                        output_channels_status: "skipped",
                        output_channels_error: "Notification target not found.",
                        output_channels_finished_at: new Date(),
                        output_channels_next_attempt_at: null,
                        output_channels_claimed_at: null,
                        output_channels_claim_token: null,
                    },
                });
                return;
            }
            if (notification.view_status !== "unviewed") {
                yield this.finishSkipped(collection, notification);
                return;
            }
            const selectedChannelKeys = new Set(effectivePreference.output_channels);
            channels = channels.filter((channel) => (!channel.targets || channel.targets.includes(notification.target)) &&
                selectedChannelKeys.has(channel.key));
            if (!effectivePreference.enabled || channels.length === 0) {
                yield collection.updateOne({
                    _id: notification._id,
                    output_channels_claim_token: notification.output_channels_claim_token,
                }, {
                    $set: {
                        output_channels_status: "skipped",
                        output_channels_error: null,
                        output_channels_finished_at: new Date(),
                        output_channels_next_attempt_at: null,
                        output_channels_claimed_at: null,
                        output_channels_claim_token: null,
                    },
                });
                return;
            }
            if (!Array.isArray(notification.output_channels_result)) {
                notification.output_channels_result = [];
            }
            for (const channel of channels) {
                if (this.hasSuccessfulDelivery(notification, channel.key))
                    continue;
                const previousAttempts = this.getChannelResults(notification, channel.key).length;
                if (previousAttempts >= maxChannelAttempts)
                    continue;
                if (!(yield this.isStillUnviewed(collection, notification))) {
                    yield this.finishSkipped(collection, notification);
                    return;
                }
                let result;
                try {
                    const status = yield channel.driver.handle(notification);
                    const payload = (status === null || status === void 0 ? void 0 : status.payload) && typeof status.payload === "object" && !Array.isArray(status.payload)
                        ? status.payload
                        : (status === null || status === void 0 ? void 0 : status.payload) !== undefined
                            ? { payload: status.payload }
                            : {};
                    if (!(status === null || status === void 0 ? void 0 : status.status)) {
                        result = Object.assign(Object.assign({}, payload), { channel: channel.key, date: new Date(), attempt: previousAttempts + 1, status: "error", error_message: (status === null || status === void 0 ? void 0 : status.error_message) || "Output-channel returned status false." });
                    }
                    else {
                        result = Object.assign(Object.assign({}, payload), { channel: channel.key, date: new Date(), attempt: previousAttempts + 1, status: "success" });
                    }
                }
                catch (error) {
                    result = {
                        channel: channel.key,
                        date: new Date(),
                        attempt: previousAttempts + 1,
                        status: "error",
                        error_message: this.getErrorMessage(error),
                    };
                }
                yield this.saveChannelResult(collection, notification, result);
            }
            const failedChannels = channels.filter((channel) => !this.hasSuccessfulDelivery(notification, channel.key));
            const retryableChannels = failedChannels.filter((channel) => this.getChannelResults(notification, channel.key).length < maxChannelAttempts);
            const now = new Date();
            const isSuccessful = failedChannels.length === 0;
            const isTerminalFailure = !isSuccessful && retryableChannels.length === 0;
            const outputStatus = isSuccessful ? "sent" : isTerminalFailure ? "failed" : "retry_pending";
            const errorMessage = failedChannels.length > 0 ? `Failed output-channels: ${failedChannels.map((c) => c.key).join(", ")}` : null;
            const updateResult = yield collection.updateOne({
                _id: notification._id,
                output_channels_claim_token: notification.output_channels_claim_token,
            }, {
                $set: {
                    output_channels_status: outputStatus,
                    output_channels_error: errorMessage,
                    output_channels_finished_at: isSuccessful || isTerminalFailure ? now : null,
                    output_channels_next_attempt_at: isSuccessful || isTerminalFailure ? null : new Date(now.getTime() + retryDelayMinutes * 60 * 1000),
                    output_channels_claimed_at: null,
                    output_channels_claim_token: null,
                },
            });
            if ((updateResult === null || updateResult === void 0 ? void 0 : updateResult.matchedCount) === 0) {
                throw new Error(`Lost delivery claim for notification '${(_a = notification._id) === null || _a === void 0 ? void 0 : _a.toString()}'.`);
            }
        });
    }
    handle() {
        return __awaiter(this, void 0, void 0, function* () {
            const notificationsConfig = Config_1.Config.get("notifications");
            if (!(notificationsConfig === null || notificationsConfig === void 0 ? void 0 : notificationsConfig.output_channels) || !Array.isArray(notificationsConfig.output_channels)) {
                return;
            }
            const channels = this.getActiveChannels(notificationsConfig);
            if (channels.length === 0)
                return;
            const deliveryConfig = notificationsConfig.output_channels_delivery || {};
            const maxChannelAttempts = this.positiveNumber(deliveryConfig.max_attempts, 3);
            const retryDelayMinutes = this.positiveNumber(deliveryConfig.retry_delay_minutes, 5);
            const claimTimeoutMinutes = this.positiveNumber(deliveryConfig.claim_timeout_minutes, 30);
            const delaySeconds = this.nonNegativeNumber(deliveryConfig.delay_seconds, 0);
            const connection = yield DBConnection_1.DBConnection.getConnection();
            const collection = connection.client.db(null).collection(new Notification_1.Notification().__table);
            const maxNotifications = this.attempts * this.perAttempt;
            const eligibleBefore = new Date(Date.now() - delaySeconds * 1000);
            yield this.skipViewedNotifications(collection, eligibleBefore, claimTimeoutMinutes);
            for (let handledNotifications = 0; handledNotifications < maxNotifications; handledNotifications++) {
                const notification = yield this.claimNotification(collection, claimTimeoutMinutes, eligibleBefore);
                if (!notification)
                    break;
                yield this.deliverNotification(collection, notification, channels, maxChannelAttempts, retryDelayMinutes);
            }
        });
    }
}
exports.NotificationsOutputChannelsJob = NotificationsOutputChannelsJob;
NotificationsOutputChannelsJob.title = "NotificationsOutputChannelsJob";
