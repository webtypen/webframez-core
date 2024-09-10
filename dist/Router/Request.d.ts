/// <reference types="node" />
import { IncomingMessage } from "http";
export declare class Request {
    [key: string]: any;
    method: string;
    url: string;
    headers: any;
    rawHeaders: any;
    body: any;
    bodyPlain: any;
    query: any;
    queryRaw: any;
    params: any;
    files: any;
    socket: any;
    message: IncomingMessage | null;
    skipOptionsForward: boolean;
    /**
     * Prevent the options request from getting an automatic 200 status code
     * @param status
     * @returns Response
     */
    setSkipOptionsForward(status: boolean): this;
}
