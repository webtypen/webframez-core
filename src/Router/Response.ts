import { ServerResponse } from "http";

export class Response {
  res?: ServerResponse;

  /**
   * Sets the ServerResponse (res) Object (nodejs/http module)
   * @param res
   * @returns
   */
  setServerResponse(res: ServerResponse) {
    this.res = res;
    return this;
  }

  /**
   * Set the http-status-code
   *
   * @param status
   * @returns
   */
  status(status: number): Response {
    if (!this.res) {
      return this;
    }

    this.res.statusCode = status;
    return this;
  }

  /**
   * Set a header attribute: Content-Type: application/json
   *
   * @param type
   * @param value
   * @returns
   */
  header(type: string, value: string) {
    if (!this.res) {
      return this;
    }

    this.res.setHeader(type, value);
    return this;
  }

  /**
   * Sends data to the client
   * Any objects will be stringified to JSON
   *
   * @param content
   */
  send(content: any) {
    if (typeof content === "object") {
      this.res?.setHeader("Content-Type", "application/json");
      this.res?.write(JSON.stringify(content));
    } else {
      this.res?.write(content);
    }
  }
}
