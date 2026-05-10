export type KernelAiAgentRegistration = any;

export type KernelAiApiRegistrations = {
    prefix?: string;
    middleware?: string[];
    [key: string]: any;
};

export type KernelAiRegistrations = {
    agents?: KernelAiAgentRegistration[];
    api?: KernelAiApiRegistrations;
};
