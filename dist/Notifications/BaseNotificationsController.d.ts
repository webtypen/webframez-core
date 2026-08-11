import { Controller } from "../Controller/Controller";
import { Request } from "../Router/Request";
import { Response } from "../Router/Response";
import { Notification } from "./Notification";
import { NotificationTargetContext } from "./NotificationService";
export declare class BaseNotificationsController extends Controller {
    endpoint(req: Request, res: Response): Promise<any>;
    private getActionName;
    protected getNotificationReference(req: Request): any;
    protected serializeNotification(notification: Notification): object;
    protected createNotification(req: Request, key: string, payload: Record<string, any>, targetContext: NotificationTargetContext): Promise<Notification | null>;
    private parsePaginationValue;
    private notificationNotFound;
    private getAuthorizedTarget;
    private getTypeForTarget;
    definition(req: Request, res: Response): Promise<Response | undefined>;
    create(req: Request, res: Response): Promise<Response | undefined>;
    preferences(req: Request, res: Response): Promise<Response | undefined>;
    savePreferences(req: Request, res: Response): Promise<Response | undefined>;
    list(req: Request, res: Response): Promise<Response | undefined>;
    counts(req: Request, res: Response): Promise<Response | undefined>;
    details(req: Request, res: Response): Promise<Response | undefined>;
    markOneAsRead(req: Request, res: Response): Promise<Response | undefined>;
    markAllAsRead(req: Request, res: Response): Promise<Response | undefined>;
    markAllAsViewed(req: Request, res: Response): Promise<Response | undefined>;
}
