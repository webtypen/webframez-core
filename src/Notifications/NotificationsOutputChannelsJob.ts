import { ObjectId } from "mongodb";
import { Config } from "../Config";
import { DBConnection } from "../Database/DBConnection";
import { BaseQueueJob } from "../Queue/BaseQueueJob";
import { Notification } from "./Notification";
import { NotificationService } from "./NotificationService";

type ActiveOutputChannel = {
    key: string;
    driver: any;
    targets?: string[];
};

type OutputChannelResult = {
    channel: string;
    date: Date;
    attempt: number;
    status: "success" | "error";
    error_message?: string;
    [key: string]: any;
};

export class NotificationsOutputChannelsJob extends BaseQueueJob {
    static title = "NotificationsOutputChannelsJob";

    attempts = 10;
    perAttempt = 50;

    private positiveNumber(value: any, fallback: number) {
        const parsed = Number(value);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
    }

    private nonNegativeNumber(value: any, fallback: number) {
        const parsed = Number(value);
        return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
    }

    private getErrorMessage(error: any) {
        if (error?.message && error.message.toString().trim() !== "") {
            return error.message.toString();
        }
        if (error && error.toString().trim() !== "") {
            return error.toString();
        }
        return "Failed without exception";
    }

    private getActiveChannels(notificationsConfig: any): ActiveOutputChannel[] {
        const channels: ActiveOutputChannel[] = [];
        const registeredKeys = new Set<string>();

        for (const channel of notificationsConfig.output_channels) {
            if (!channel || !channel.key || !channel.is_active || !channel.driver) continue;
            if (registeredKeys.has(channel.key)) {
                throw new Error(`Duplicate notification output-channel key '${channel.key}'.`);
            }

            const driver = new channel.driver();
            if (!driver || !driver.activated) continue;

            registeredKeys.add(channel.key);
            channels.push({
                key: channel.key,
                driver,
                ...(Array.isArray(channel.targets) ? { targets: channel.targets } : {}),
            });
        }

        return channels;
    }

    private getChannelResults(notification: Notification, channelKey: string): OutputChannelResult[] {
        if (!Array.isArray(notification.output_channels_result)) return [];
        return notification.output_channels_result.filter((result: any) => result?.channel === channelKey);
    }

    private hasSuccessfulDelivery(notification: Notification, channelKey: string) {
        return this.getChannelResults(notification, channelKey).some((result) => result.status === "success");
    }

    private deliverableModeMatch() {
        return [
            { mode: null },
            { mode: "fixed" },
            { mode: "changing", changing_status: { $in: ["success", "error"] } },
        ];
    }

    private async skipViewedNotifications(collection: any, eligibleBefore: Date, claimTimeoutMinutes: number) {
        const now = new Date();
        const staleClaimBefore = new Date(now.getTime() - claimTimeoutMinutes * 60 * 1000);
        await collection.updateMany(
            {
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
            },
            {
                $set: {
                    output_channels_status: "skipped",
                    output_channels_error: null,
                    output_channels_finished_at: now,
                    output_channels_next_attempt_at: null,
                    output_channels_claimed_at: null,
                    output_channels_claim_token: null,
                },
            },
        );
    }

    private async finishSkipped(collection: any, notification: Notification) {
        await collection.updateOne(
            {
                _id: notification._id,
                output_channels_claim_token: notification.output_channels_claim_token,
            },
            {
                $set: {
                    output_channels_status: "skipped",
                    output_channels_error: null,
                    output_channels_finished_at: new Date(),
                    output_channels_next_attempt_at: null,
                    output_channels_claimed_at: null,
                    output_channels_claim_token: null,
                },
            },
        );
    }

    private async isStillUnviewed(collection: any, notification: Notification) {
        const current = await collection.findOne(
            {
                _id: notification._id,
                output_channels_claim_token: notification.output_channels_claim_token,
            },
            { projection: { view_status: 1 } },
        );
        return current?.view_status === "unviewed";
    }

    private async claimNotification(collection: any, claimTimeoutMinutes: number, eligibleBefore: Date) {
        const now = new Date();
        const staleClaimBefore = new Date(now.getTime() - claimTimeoutMinutes * 60 * 1000);
        const claimToken = new ObjectId().toHexString();
        const claimResult = await collection.findOneAndUpdate(
            {
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
            },
            {
                $set: {
                    output_channels_status: "processing",
                    output_channels_claimed_at: now,
                    output_channels_claim_token: claimToken,
                    output_channels_handled_at: now,
                },
                $inc: { output_channels_attempts: 1 },
            },
            {
                sort: { show_at: 1, created_at: 1 },
                returnDocument: "after",
            },
        );

        const notificationData =
            claimResult && claimResult._id
                ? claimResult
                : claimResult?.value && claimResult.value._id
                  ? claimResult.value
                  : null;

        if (!notificationData) return null;
        return DBConnection.mapDataToModel(Notification, notificationData) as Notification;
    }

    private async saveChannelResult(collection: any, notification: Notification, result: OutputChannelResult) {
        const updateResult = await collection.updateOne(
            {
                _id: notification._id,
                output_channels_claim_token: notification.output_channels_claim_token,
            },
            {
                $push: { output_channels_result: result },
            },
        );

        if (updateResult?.matchedCount === 0) {
            throw new Error(`Lost delivery claim for notification '${notification._id?.toString()}'.`);
        }

        if (!Array.isArray(notification.output_channels_result)) {
            notification.output_channels_result = [];
        }
        notification.output_channels_result.push(result);
    }

    private async deliverNotification(
        collection: any,
        notification: Notification,
        channels: ActiveOutputChannel[],
        maxChannelAttempts: number,
        retryDelayMinutes: number,
    ) {
        const notType = notification.key ? NotificationService.registry[notification.key] : null;
        if (!notType) {
            await collection.updateOne(
                {
                    _id: notification._id,
                    output_channels_claim_token: notification.output_channels_claim_token,
                },
                {
                    $set: {
                        output_channels_status: "failed",
                        output_channels_error: "Invalid notification-type: " + notification.key,
                        output_channels_finished_at: new Date(),
                        output_channels_claimed_at: null,
                        output_channels_claim_token: null,
                        output_channels_next_attempt_at: null,
                    },
                },
            );
            return;
        }

        let effectivePreference;
        let targetContext;
        try {
            targetContext = await NotificationService.resolveTarget({
                target: notification.target as string,
                target_id: notification.target_id as ObjectId,
            });
            if (targetContext?.targetModel) {
                NotificationService.attachTargetModel(notification, targetContext.targetModel);
            }
            if (targetContext) {
                const loadedNotification = await NotificationService.getNotificationForTarget(
                    notification._id,
                    targetContext,
                );
                if (!loadedNotification) {
                    throw new Error("Notification could not be reloaded for output delivery.");
                }
                notification = loadedNotification;
            }
            effectivePreference = targetContext
                ? await NotificationService.getEffectiveTargetPreference(notType.key, targetContext)
                : { enabled: false, output_channels: [], owner_exists: false };
        } catch (error: any) {
            const now = new Date();
            await collection.updateOne(
                {
                    _id: notification._id,
                    output_channels_claim_token: notification.output_channels_claim_token,
                },
                {
                    $set: {
                        output_channels_status: "retry_pending",
                        output_channels_error: `Could not prepare notification delivery: ${this.getErrorMessage(error)}`,
                        output_channels_finished_at: null,
                        output_channels_next_attempt_at: new Date(now.getTime() + retryDelayMinutes * 60 * 1000),
                        output_channels_claimed_at: null,
                        output_channels_claim_token: null,
                    },
                },
            );
            return;
        }

        if (!effectivePreference.owner_exists) {
            await collection.updateOne(
                {
                    _id: notification._id,
                    output_channels_claim_token: notification.output_channels_claim_token,
                },
                {
                    $set: {
                        output_channels_status: "skipped",
                        output_channels_error: "Notification target not found.",
                        output_channels_finished_at: new Date(),
                        output_channels_next_attempt_at: null,
                        output_channels_claimed_at: null,
                        output_channels_claim_token: null,
                    },
                },
            );
            return;
        }

        if (notification.view_status !== "unviewed") {
            await this.finishSkipped(collection, notification);
            return;
        }

        const selectedChannelKeys = new Set(effectivePreference.output_channels);
        channels = channels.filter(
            (channel) =>
                (!channel.targets || channel.targets.includes(notification.target as string)) &&
                selectedChannelKeys.has(channel.key),
        );
        if (!effectivePreference.enabled || channels.length === 0) {
            await collection.updateOne(
                {
                    _id: notification._id,
                    output_channels_claim_token: notification.output_channels_claim_token,
                },
                {
                    $set: {
                        output_channels_status: "skipped",
                        output_channels_error: null,
                        output_channels_finished_at: new Date(),
                        output_channels_next_attempt_at: null,
                        output_channels_claimed_at: null,
                        output_channels_claim_token: null,
                    },
                },
            );
            return;
        }

        if (!Array.isArray(notification.output_channels_result)) {
            notification.output_channels_result = [];
        }

        for (const channel of channels) {
            if (this.hasSuccessfulDelivery(notification, channel.key)) continue;

            const previousAttempts = this.getChannelResults(notification, channel.key).length;
            if (previousAttempts >= maxChannelAttempts) continue;

            if (!(await this.isStillUnviewed(collection, notification))) {
                await this.finishSkipped(collection, notification);
                return;
            }

            let result: OutputChannelResult;
            try {
                const status = await channel.driver.handle(notification);
                const payload =
                    status?.payload && typeof status.payload === "object" && !Array.isArray(status.payload)
                        ? status.payload
                        : status?.payload !== undefined
                          ? { payload: status.payload }
                          : {};
                if (!status?.status) {
                    result = {
                        ...payload,
                        channel: channel.key,
                        date: new Date(),
                        attempt: previousAttempts + 1,
                        status: "error",
                        error_message: status?.error_message || "Output-channel returned status false.",
                    };
                } else {
                    result = {
                        ...payload,
                        channel: channel.key,
                        date: new Date(),
                        attempt: previousAttempts + 1,
                        status: "success",
                    };
                }
            } catch (error: any) {
                result = {
                    channel: channel.key,
                    date: new Date(),
                    attempt: previousAttempts + 1,
                    status: "error",
                    error_message: this.getErrorMessage(error),
                };
            }

            await this.saveChannelResult(collection, notification, result);
        }

        const failedChannels = channels.filter((channel) => !this.hasSuccessfulDelivery(notification, channel.key));
        const retryableChannels = failedChannels.filter(
            (channel) => this.getChannelResults(notification, channel.key).length < maxChannelAttempts,
        );
        const now = new Date();
        const isSuccessful = failedChannels.length === 0;
        const isTerminalFailure = !isSuccessful && retryableChannels.length === 0;
        const outputStatus = isSuccessful ? "sent" : isTerminalFailure ? "failed" : "retry_pending";
        const errorMessage = failedChannels.length > 0 ? `Failed output-channels: ${failedChannels.map((c) => c.key).join(", ")}` : null;
        const updateResult = await collection.updateOne(
            {
                _id: notification._id,
                output_channels_claim_token: notification.output_channels_claim_token,
            },
            {
                $set: {
                    output_channels_status: outputStatus,
                    output_channels_error: errorMessage,
                    output_channels_finished_at: isSuccessful || isTerminalFailure ? now : null,
                    output_channels_next_attempt_at:
                        isSuccessful || isTerminalFailure ? null : new Date(now.getTime() + retryDelayMinutes * 60 * 1000),
                    output_channels_claimed_at: null,
                    output_channels_claim_token: null,
                },
            },
        );

        if (updateResult?.matchedCount === 0) {
            throw new Error(`Lost delivery claim for notification '${notification._id?.toString()}'.`);
        }
    }

    async handle() {
        const notificationsConfig = Config.get("notifications");
        if (!notificationsConfig?.output_channels || !Array.isArray(notificationsConfig.output_channels)) {
            return;
        }

        const channels = this.getActiveChannels(notificationsConfig);
        if (channels.length === 0) return;

        const deliveryConfig = notificationsConfig.output_channels_delivery || {};
        const maxChannelAttempts = this.positiveNumber(deliveryConfig.max_attempts, 3);
        const retryDelayMinutes = this.positiveNumber(deliveryConfig.retry_delay_minutes, 5);
        const claimTimeoutMinutes = this.positiveNumber(deliveryConfig.claim_timeout_minutes, 30);
        const delaySeconds = this.nonNegativeNumber(deliveryConfig.delay_seconds, 0);
        const connection = await DBConnection.getConnection();
        const collection = connection.client.db(null).collection(new Notification().__table);
        const maxNotifications = this.attempts * this.perAttempt;
        const eligibleBefore = new Date(Date.now() - delaySeconds * 1000);

        await this.skipViewedNotifications(collection, eligibleBefore, claimTimeoutMinutes);

        for (let handledNotifications = 0; handledNotifications < maxNotifications; handledNotifications++) {
            const notification = await this.claimNotification(collection, claimTimeoutMinutes, eligibleBefore);
            if (!notification) break;

            await this.deliverNotification(
                collection,
                notification,
                channels,
                maxChannelAttempts,
                retryDelayMinutes,
            );
        }
    }
}
