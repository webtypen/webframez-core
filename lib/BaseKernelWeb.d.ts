import { Controller } from "./Controller/Controller";
export declare class BaseKernelWeb {
    static controller: {
        [key: string]: Controller;
    };
    static middleware: {
        [key: string]: any;
    };
}
