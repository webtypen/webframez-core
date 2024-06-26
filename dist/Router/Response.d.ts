/// <reference types="node" />
import { ServerResponse } from "http";
export declare class Response {
    res?: ServerResponse;
    statusCode: number;
    content?: any | null | undefined;
    headers: {
        [key: string]: any;
    };
    events: any;
    /**
     * Mode
     */
    mode: any | null;
    constructor(options?: any | null | undefined);
    /**
     * Sets the ServerResponse (res) Object (nodejs/http module)
     * @param res
     * @returns Response
     */
    setServerResponse(res: ServerResponse): this;
    /**
     * Set the http-status-code
     *
     * @param status
     * @returns Response
     */
    status(status: number): Response;
    /**
     * Set a header attribute: Content-Type: application/json
     *
     * @param type
     * @param value
     * @returns Response
     */
    header(type: string, value: string): this;
    /**
     * Sends data to the client
     * Any objects will be stringified to JSON
     *
     * @param content
     * @returns Response
     */
    send(content: any): this;
    download(filepath: string, options?: any): Promise<unknown>;
    end(): this;
    registerEvent(eventKey: string, func: any): Promise<void>;
    /**
     * Runs the registered events for an event-type
     *
     * @param eventKey
     * @param req
     * @param payload
     */
    handleEvents(eventKey: string, req: any, payload: any): Promise<void>;
}
