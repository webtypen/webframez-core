import { BaseQueueJob } from "../Queue/BaseQueueJob";
export declare class NotificationsOutputChannelsJob extends BaseQueueJob {
    static title: string;
    attempts: number;
    perAttempt: number;
    private positiveNumber;
    private nonNegativeNumber;
    private getErrorMessage;
    private getActiveChannels;
    private getChannelResults;
    private hasSuccessfulDelivery;
    private deliverableModeMatch;
    private skipViewedNotifications;
    private finishSkipped;
    private isStillUnviewed;
    private claimNotification;
    private saveChannelResult;
    private deliverNotification;
    handle(): Promise<void>;
}
