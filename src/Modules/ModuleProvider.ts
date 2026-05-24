import { KernelAiRegistrations } from "../Ai/AiTypes";
import { ApiScopeRegistrationClass } from "../Api/ApiTypes";
import { KernelMcpRegistrations } from "../Mcp/McpTypes";

export class ModuleProvider {
    static key: string = "example-module";

    controller: { [key: string]: any } = {};
    middleware: { [key: string]: any } = {};
    apiScopes: ApiScopeRegistrationClass[] = [];
    commands: any[] = [];
    mcp?: KernelMcpRegistrations;
    ai?: KernelAiRegistrations;

    boot(_context?: any) {}

    routes() {}

    bootByRouter() {
        this.boot();
        this.routes();
    }
}
