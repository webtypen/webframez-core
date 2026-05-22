import { Controller } from "./Controller/Controller";
import { KernelAiRegistrations } from "./Ai/AiTypes";
import { KernelMcpRegistrations } from "./Mcp/McpTypes";
import { ApiScopeClass } from "./Api/ApiTypes";

export class BaseKernelWeb {
    static controller: { [key: string]: Controller } = {};
    static middleware: { [key: string]: any } = {};
    static apiScopes: ApiScopeClass[] = [];
    static mcp?: KernelMcpRegistrations;
    static ai?: KernelAiRegistrations;
}
