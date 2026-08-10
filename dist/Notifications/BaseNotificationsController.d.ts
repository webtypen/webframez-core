import { Controller } from "../Controller/Controller";
import { Request } from "../Router/Request";
import { Response } from "../Router/Response";
import { Notification } from "./Notification";
export declare class BaseNotificationsController extends Controller {
    endpoint(req: Request, res: Response): Promise<Response>;
    protected getUserId(req: Request): Promise<any>;
    protected getNotificationReference(req: Request): any;
    protected serializeNotification(notification: Notification): object;
    private parsePaginationValue;
    private unauthorized;
    private notificationNotFound;
    list(req: Request, res: Response): Promise<Response>;
    details(req: Request, res: Response): Promise<Response>;
    markOneAsRead(req: Request, res: Response): Promise<Response>;
    markAllAsRead(req: Request, res: Response): Promise<Response>;
    markAllAsViewed(req: Request, res: Response): Promise<Response>;
}
