import { KernelAiRegistrations } from "./Ai/AiTypes";
import { KernelMcpRegistrations } from "./Mcp/McpTypes";

export class BaseKernelConsole {
    static commands: any = [];
    static mcp?: KernelMcpRegistrations;
    static ai?: KernelAiRegistrations;
}
