export type KernelAiAgentRegistration = any;
export type KernelAiApiRegistrations = {
    prefix?: string;
    middleware?: string[];
    [key: string]: any;
};
/** Optional packages augment this map without introducing a Core -> AI dependency. */
export interface KernelAiExtensions {
}
export type KernelAiRegistrations = KernelAiExtensions & {
    agents?: KernelAiAgentRegistration[];
    api?: KernelAiApiRegistrations;
};
