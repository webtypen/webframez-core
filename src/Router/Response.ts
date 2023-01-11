import { ServerResponse } from "http";

export class Response {
  res?: ServerResponse;
  statusCode: number = 200;
  content?: any | null | undefined;
  headers: { [key: string]: string } = {};

  /**
   * Mode
   */
  mode: any | null = null;

  constructor(options?: any | null | undefined) {
    this.mode = options && options.mode ? options.mode : null;
  }

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
    this.statusCode = status;

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
    this.headers[type] = value;

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
    this.content = content;

    if (this.mode === "aws-lambda") {
      // Do nothing ... Store content in variable and use it later ...
    } else {
      if (typeof content === "object") {
        this.res?.setHeader("Content-Type", "application/json");
        this.res?.write(JSON.stringify(content));
      } else {
        this.res?.write(content);
      }
    }
    return this;
  }
}
