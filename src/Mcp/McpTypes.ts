export type KernelMcpWebServerRegistration = {
    path: string;
    server: any;
    middleware?: string[];
    allowedOrigins?: string[];
    allowedHosts?: string[];
};

export type KernelMcpLocalServerRegistration = {
    handle: string;
    server: any;
};

export type KernelMcpRegistrations = {
    web?: KernelMcpWebServerRegistration[];
    local?: KernelMcpLocalServerRegistration[];
};
