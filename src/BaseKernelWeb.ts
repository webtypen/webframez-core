import { Controller } from "./Controller/Controller";
import { KernelAiRegistrations } from "./Ai/AiTypes";
import { KernelMcpRegistrations } from "./Mcp/McpTypes";
import { ApiScopeRegistrationClass } from "./Api/ApiTypes";

export class BaseKernelWeb {
    static controller: { [key: string]: Controller } = {};
    static middleware: { [key: string]: any } = {};
    static apiScopes: ApiScopeRegistrationClass[] = [];
    static mcp?: KernelMcpRegistrations;
    static ai?: KernelAiRegistrations;
}
