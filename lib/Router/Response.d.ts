/// <reference types="node" />
import { ServerResponse } from "http";
export declare class Response {
    res?: ServerResponse;
    content?: any | null | undefined;
    /**
     * Mode
     */
    mode: any | null;
    constructor(options?: any | null | undefined);
    /**
     * Sets the ServerResponse (res) Object (nodejs/http module)
     * @param res
     * @returns
     */
    setServerResponse(res: ServerResponse): this;
    /**
     * Set the http-status-code
     *
     * @param status
     * @returns
     */
    status(status: number): Response;
    /**
     * Set a header attribute: Content-Type: application/json
     *
     * @param type
     * @param value
     * @returns
     */
    header(type: string, value: string): this;
    /**
     * Sends data to the client
     * Any objects will be stringified to JSON
     *
     * @param content
     */
    send(content: any): this;
}
