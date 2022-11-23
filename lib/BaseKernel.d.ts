import { Controller } from "./Controller/Controller";
export declare class BaseKernel {
    static commands: never[];
    static controller: {
        [key: string]: Controller;
    };
    static middleware: {
        [key: string]: any;
    };
}
