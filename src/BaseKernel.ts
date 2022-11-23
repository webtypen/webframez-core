import { Controller } from "./Controller/Controller";

export class BaseKernel {
  static commands = [];
  static controller: { [key: string]: Controller } = {};
  static middleware: { [key: string]: any };
}
