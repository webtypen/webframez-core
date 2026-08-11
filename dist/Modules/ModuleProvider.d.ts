import { KernelAiRegistrations } from "../Ai/AiTypes";
import { ApiScopeRegistrationClass } from "../Api/ApiTypes";
import { KernelMcpRegistrations } from "../Mcp/McpTypes";
import type { NotificationDefinition } from "../Notifications/NotificationService";
export declare class ModuleProvider {
    static key: string;
    controller: {
        [key: string]: any;
    };
    middleware: {
        [key: string]: any;
    };
    apiScopes: ApiScopeRegistrationClass[];
    commands: any[];
    notifications: NotificationDefinition[];
    mcp?: KernelMcpRegistrations;
    ai?: KernelAiRegistrations;
    boot(_context?: any): void;
    routes(): void;
    bootByRouter(): void;
}
