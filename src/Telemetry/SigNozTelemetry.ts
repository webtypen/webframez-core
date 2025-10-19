import { Config } from "../Config";

export interface SigNozOptions {
    enabled?: boolean;
    serviceName?: string;
    endpoint?: string;
    apiKey?: string;
    headers?: Record<string, string>;
    environment?: string;
    resourceAttributes?: Record<string, unknown>;
    samplingRatio?: number;
    instrumentations?: any[];
    autoInstrumentations?: boolean;
    autoInstrumentationConfig?: Record<string, unknown>;
    logInitialization?: boolean;
}

export class SigNozTelemetry {
    private static sdk: any = null;
    private static initPromise: Promise<void> | null = null;
    private static shutdownRegistered = false;
    private static readonly missingDependencies = new Set<string>();
    private static readonly shutdownListener = () => {
        void SigNozTelemetry.shutdown();
    };

    static async init(options?: SigNozOptions): Promise<void> {
        if (!options || options.enabled === false) {
            return;
        }
        if (this.sdk) {
            return;
        }
        if (this.initPromise) {
            await this.initPromise;
            return;
        }

        const initialization = (async () => {
            try {
                await this.initialize(options);
            } catch (error) {
                this.logWarn("[SigNoz] Initialization failed:", error);
            }
        })();

        this.initPromise = initialization;

        try {
            await initialization;
        } finally {
            this.initPromise = null;
        }
    }

    private static async initialize(options: SigNozOptions): Promise<void> {
        const sdkModule = await this.safeImport<any>("@opentelemetry/sdk-node");
        const traceExporterModule = await this.safeImport<any>("@opentelemetry/exporter-trace-otlp-http");
        const resourcesModule = await this.safeImport<any>("@opentelemetry/resources");
        const semanticModule = await this.safeImport<any>("@opentelemetry/semantic-conventions");

        if (!sdkModule?.NodeSDK || !traceExporterModule?.OTLPTraceExporter || !resourcesModule?.Resource || !semanticModule?.SemanticResourceAttributes) {
            throw new Error(
                "OpenTelemetry packages are missing. Install '@opentelemetry/sdk-node', '@opentelemetry/exporter-trace-otlp-http', '@opentelemetry/resources' and '@opentelemetry/semantic-conventions'."
            );
        }

        const serviceName =
            options.serviceName ||
            (Config.get("application.serviceName") as string) ||
            (Config.get("application.name") as string) ||
            this.getEnv("SIGNOZ_SERVICE_NAME") ||
            this.getEnv("OTEL_SERVICE_NAME") ||
            "webframez-service";

        const environment =
            options.environment ||
            (Config.get("application.environment") as string) ||
            this.getEnv("SIGNOZ_ENVIRONMENT") ||
            this.getEnv("NODE_ENV") ||
            "development";

        const traceEndpoint = this.ensureEndpoint(
            options.endpoint ||
                this.getEnv("SIGNOZ_ENDPOINT") ||
                this.getEnv("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT") ||
                this.getEnv("OTEL_EXPORTER_OTLP_ENDPOINT"),
            "http://localhost:4318",
            "/v1/traces"
        );

        const headers = { ...(options.headers || {}) };
        const apiKey = options.apiKey || this.getEnv("SIGNOZ_API_KEY");
        if (apiKey && !headers["signoz-access-token"]) {
            headers["signoz-access-token"] = apiKey;
        }

        const { NodeSDK } = sdkModule;
        const { OTLPTraceExporter } = traceExporterModule;
        const { Resource } = resourcesModule;
        const { SemanticResourceAttributes } = semanticModule;

        const resourceAttributes: Record<string, unknown> = {
            [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
            [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: environment,
        };

        if (options.resourceAttributes) {
            Object.assign(resourceAttributes, options.resourceAttributes);
        }

        const resource = new Resource(resourceAttributes);

        let instrumentations = options.instrumentations ? [...options.instrumentations] : [];
        if (instrumentations.length === 0 && options.autoInstrumentations !== false) {
            const autoModule = await this.safeImport<any>("@opentelemetry/auto-instrumentations-node");
            if (autoModule?.getNodeAutoInstrumentations) {
                instrumentations = [autoModule.getNodeAutoInstrumentations(options.autoInstrumentationConfig || {})];
            } else {
                this.warnMissingDependency("@opentelemetry/auto-instrumentations-node");
            }
        }

        let traceSampler: any;
        if (typeof options.samplingRatio === "number") {
            const samplerModule = await this.safeImport<any>("@opentelemetry/sdk-trace-base");
            if (samplerModule?.ParentBasedSampler && samplerModule?.TraceIdRatioBasedSampler) {
                const ratio = Math.min(Math.max(options.samplingRatio, 0), 1);
                traceSampler = new samplerModule.ParentBasedSampler({
                    root: new samplerModule.TraceIdRatioBasedSampler(ratio),
                });
            } else {
                this.warnMissingDependency("@opentelemetry/sdk-trace-base");
            }
        }

        const traceExporter = new OTLPTraceExporter({
            url: traceEndpoint,
            headers,
        });

        const sdkOptions: any = {
            resource,
            traceExporter,
        };

        if (instrumentations && instrumentations.length > 0) {
            sdkOptions.instrumentations = instrumentations;
        }
        if (traceSampler) {
            sdkOptions.traceSampler = traceSampler;
        }

        this.sdk = new NodeSDK(sdkOptions);
        await this.sdk.start();

        if (options.logInitialization !== false) {
            this.logInfo(`[SigNoz] Telemetry enabled (service="${serviceName}", endpoint="${traceEndpoint}")`);
        }

        this.registerShutdownHooks();
    }

    static async shutdown(): Promise<void> {
        if (!this.sdk) {
            return;
        }

        const sdkToShutdown = this.sdk;
        this.sdk = null;

        try {
            await sdkToShutdown.shutdown();
        } catch (error) {
            this.logWarn("[SigNoz] Shutdown failed:", error);
        }
    }

    private static async safeImport<T = any>(moduleName: string): Promise<T | null> {
        try {
            const module = await import(moduleName);
            return module as T;
        } catch (error: any) {
            if (error && (error.code === "MODULE_NOT_FOUND" || error.code === "ERR_MODULE_NOT_FOUND")) {
                return null;
            }
            throw error;
        }
    }

    private static ensureEndpoint(value: string | undefined, fallbackHost: string, defaultPath: string): string {
        const base = value && value.trim() !== "" ? value.trim() : fallbackHost;
        if (base.includes("/v1/") || base.endsWith(defaultPath)) {
            return base;
        }
        return `${base.replace(/\/$/, "")}${defaultPath}`;
    }

    private static warnMissingDependency(name: string) {
        if (this.missingDependencies.has(name)) {
            return;
        }
        this.missingDependencies.add(name);
        this.logWarn(`[SigNoz] Optional package "${name}" not found. Install it to enable the related feature.`);
    }

    private static registerShutdownHooks() {
        if (this.shutdownRegistered) {
            return;
        }
        const nodeProcess = this.getProcess();
        if (!nodeProcess) {
            return;
        }
        nodeProcess.once("beforeExit", this.shutdownListener);
        nodeProcess.once("exit", this.shutdownListener);
        this.shutdownRegistered = true;
    }

    private static getProcess(): any {
        if (typeof globalThis === "undefined") {
            return undefined;
        }
        const candidate = (globalThis as any).process;
        if (candidate && typeof candidate.once === "function") {
            return candidate;
        }
        return undefined;
    }

    private static getEnv(key: string): string | undefined {
        const nodeProcess = this.getProcess();
        if (!nodeProcess || !nodeProcess.env) {
            return undefined;
        }
        const value = nodeProcess.env[key];
        return typeof value === "string" ? value : undefined;
    }

    private static getConsole(): any {
        if (typeof globalThis === "undefined") {
            return undefined;
        }
        return (globalThis as any).console;
    }

    private static logInfo(...args: unknown[]) {
        const target = this.getConsole();
        if (target && typeof target.info === "function") {
            target.info(...args);
        }
    }

    private static logWarn(...args: unknown[]) {
        const target = this.getConsole();
        if (target && typeof target.warn === "function") {
            target.warn(...args);
        }
    }
}
