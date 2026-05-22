import { KernelAiRegistrations } from "../Ai/AiTypes";
import { ApiScopeClass } from "../Api/ApiTypes";
import { KernelMcpRegistrations } from "../Mcp/McpTypes";
export declare class ModuleProvider {
    static key: string;
    controller: {
        [key: string]: any;
    };
    middleware: {
        [key: string]: any;
    };
    apiScopes: ApiScopeClass[];
    commands: any[];
    mcp?: KernelMcpRegistrations;
    ai?: KernelAiRegistrations;
    boot(_context?: any): void;
    routes(): void;
    bootByRouter(): void;
}
