import { Controller } from "./Controller/Controller";

export class BaseKernelWeb {
  static controller: { [key: string]: Controller } = {};
  static middleware: { [key: string]: any };
}
