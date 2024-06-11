import { IncomingMessage } from "http";

export class Request {
    [key: string]: any;
    method: string = "GET";
    url: string = "";
    headers: any = {};
    rawHeaders: any = {};
    body: any = null;
    bodyPlain: any = null;
    query: any = {};
    queryRaw: any = "";
    params: any = {};
    files: any = {};
    socket: any = undefined;
    message: IncomingMessage | null = null;
    skipOptionsForward: boolean = false;

    /**
     * Prevent the options request from getting an automatic 200 status code
     * @param status
     * @returns Response
     */
    setSkipOptionsForward(status: boolean) {
        this.skipOptionsForward = status;
        return this;
    }
}
