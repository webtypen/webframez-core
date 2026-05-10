import { Controller } from "./Controller/Controller";
import { KernelAiRegistrations } from "./Ai/AiTypes";
import { KernelMcpRegistrations } from "./Mcp/McpTypes";
export declare class BaseKernelWeb {
    static controller: {
        [key: string]: Controller;
    };
    static middleware: {
        [key: string]: any;
    };
    static mcp?: KernelMcpRegistrations;
    static ai?: KernelAiRegistrations;
}
