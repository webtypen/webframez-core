import { ObjectId } from "mongodb";
import { Config } from "../Config";
import { DBConnection } from "../Database/DBConnection";
import { BaseQueueJob } from "../Queue/BaseQueueJob";
import { Notification } from "./Notification";
import { NotificationService } from "./NotificationService";

type ActiveOutputChannel = {
    key: string;
    driver: any;
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
            channels.push({ key: channel.key, driver });
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

    private async claimNotification(collection: any, claimTimeoutMinutes: number) {
        const now = new Date();
        const staleClaimBefore = new Date(now.getTime() - claimTimeoutMinutes * 60 * 1000);
        const claimToken = new ObjectId().toHexString();
        const claimResult = await collection.findOneAndUpdate(
            {
                key: { $ne: null },
                show_at: { $lte: now },
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
                    {
                        $or: [
                            { mode: null },
                            { mode: "fixed" },
                            { mode: "changing", changing_status: { $in: ["success", "error"] } },
                        ],
                    },
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
        const notType = notification.key ? NotificationService.registy[notification.key] : null;
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

        if (!Array.isArray(notification.output_channels_result)) {
            notification.output_channels_result = [];
        }

        for (const channel of channels) {
            if (this.hasSuccessfulDelivery(notification, channel.key)) continue;

            const previousAttempts = this.getChannelResults(notification, channel.key).length;
            if (previousAttempts >= maxChannelAttempts) continue;

            let result: OutputChannelResult;
            try {
                const status = await channel.driver.handle(notification);
                if (!status?.status) {
                    result = {
                        channel: channel.key,
                        date: new Date(),
                        attempt: previousAttempts + 1,
                        status: "error",
                        error_message: "Output-channel returned status false.",
                    };
                } else {
                    const payload = status.payload;
                    result = {
                        ...(payload && typeof payload === "object" && !Array.isArray(payload)
                            ? payload
                            : payload !== undefined
                              ? { payload }
                              : {}),
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
        const connection = await DBConnection.getConnection();
        const collection = connection.client.db(null).collection(new Notification().__table);
        const maxNotifications = this.attempts * this.perAttempt;

        for (let handledNotifications = 0; handledNotifications < maxNotifications; handledNotifications++) {
            const notification = await this.claimNotification(collection, claimTimeoutMinutes);
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
