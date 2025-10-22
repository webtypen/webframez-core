"use strict";
// import { NodeSDK } from "@opentelemetry/sdk-node";
// import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
// import { Resource } from "@opentelemetry/resources";
// import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";
// import { ParentBasedSampler, TraceIdRatioBasedSampler } from "@opentelemetry/sdk-trace-base";
// import { Config } from "../Config";
// export interface SigNozOptions {
//     enabled?: boolean;
//     serviceName?: string;
//     endpoint?: string;
//     apiKey?: string;
//     headers?: Record<string, string>;
//     environment?: string;
//     resourceAttributes?: Record<string, unknown>;
//     samplingRatio?: number;
//     instrumentations?: any[];
//     autoInstrumentations?: boolean;
//     autoInstrumentationConfig?: Record<string, unknown>;
//     logInitialization?: boolean;
// }
// export class SigNozTelemetry {
//     private static sdk: NodeSDK | null = null;
//     private static initPromise: Promise<void> | null = null;
//     private static shutdownRegistered = false;
//     private static readonly missingDependencies = new Set<string>();
//     private static readonly shutdownListener = () => {
//         void SigNozTelemetry.shutdown();
//     };
//     static async init(options?: SigNozOptions): Promise<void> {
//         if (!options || options.enabled === false) {
//             return;
//         }
//         if (this.sdk) {
//             return;
//         }
//         if (this.initPromise) {
//             await this.initPromise;
//             return;
//         }
//         console.log("signoz init 1");
//         const initialization = (async () => {
//             try {
//                 await this.initialize(options);
//             } catch (error) {
//                 this.logWarn("[SigNoz] Initialization failed:", error);
//             }
//         })();
//         console.log("signoz init 2");
//         this.initPromise = initialization;
//         try {
//             await initialization;
//         } finally {
//             this.initPromise = null;
//         }
//         console.log("signoz init finish");
//     }
//     private static async initialize(options: SigNozOptions): Promise<void> {
//         console.log("signoz initialize 1");
//         const serviceName =
//             options.serviceName ||
//             (Config.get("application.serviceName") as string) ||
//             (Config.get("application.name") as string) ||
//             this.getEnv("SIGNOZ_SERVICE_NAME") ||
//             this.getEnv("OTEL_SERVICE_NAME") ||
//             "webframez-service";
//         const environment =
//             options.environment ||
//             (Config.get("application.environment") as string) ||
//             this.getEnv("SIGNOZ_ENVIRONMENT") ||
//             this.getEnv("NODE_ENV") ||
//             "development";
//         const traceEndpoint = this.ensureEndpoint(
//             options.endpoint ||
//                 this.getEnv("SIGNOZ_ENDPOINT") ||
//                 this.getEnv("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT") ||
//                 this.getEnv("OTEL_EXPORTER_OTLP_ENDPOINT"),
//             "http://localhost:4318",
//             "/v1/traces"
//         );
//         console.log("signoz initialize 2");
//         const headers = { ...(options.headers || {}) };
//         const apiKey = options.apiKey || this.getEnv("SIGNOZ_API_KEY");
//         if (apiKey && !headers["signoz-access-token"]) {
//             headers["signoz-access-token"] = apiKey;
//         }
//         const resourceAttributes: Record<string, unknown> = {
//             [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
//             [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: environment,
//         };
//         if (options.resourceAttributes) {
//             Object.assign(resourceAttributes, options.resourceAttributes);
//         }
//         console.log("signoz initialize 3");
//         const resource = new Resource(resourceAttributes);
//         let instrumentations = options.instrumentations ? [...options.instrumentations] : [];
//         if (instrumentations.length === 0 && options.autoInstrumentations !== false) {
//             const autoInstrumentation = this.loadAutoInstrumentations(options.autoInstrumentationConfig || {});
//             if (autoInstrumentation) {
//                 instrumentations = [autoInstrumentation];
//             }
//         }
//         console.log("signoz initialize 4");
//         let traceSampler: ParentBasedSampler | undefined;
//         if (typeof options.samplingRatio === "number") {
//             const ratio = Math.min(Math.max(options.samplingRatio, 0), 1);
//             traceSampler = new ParentBasedSampler({
//                 root: new TraceIdRatioBasedSampler(ratio),
//             });
//         }
//         console.log("signoz initialize 5");
//         const traceExporter = new OTLPTraceExporter({
//             url: traceEndpoint,
//             headers,
//         });
//         const sdkOptions: {
//             resource: Resource;
//             traceExporter: OTLPTraceExporter;
//             instrumentations?: any[];
//             traceSampler?: ParentBasedSampler;
//         } = {
//             resource,
//             traceExporter,
//         };
//         if (instrumentations.length > 0) {
//             sdkOptions.instrumentations = instrumentations;
//         }
//         if (traceSampler) {
//             sdkOptions.traceSampler = traceSampler;
//         }
//         console.log("signoz initialize 6");
//         this.sdk = new NodeSDK(sdkOptions as any);
//         await this.sdk.start();
//         if (options.logInitialization !== false) {
//             this.logInfo(`[SigNoz] Telemetry enabled (service="${serviceName}", endpoint="${traceEndpoint}")`);
//         }
//         console.log("signoz initialize 7");
//         this.registerShutdownHooks();
//         console.log("signoz initialize 8");
//     }
//     static async shutdown(): Promise<void> {
//         if (!this.sdk) {
//             return;
//         }
//         const sdkToShutdown = this.sdk;
//         this.sdk = null;
//         try {
//             await sdkToShutdown.shutdown();
//         } catch (error) {
//             this.logWarn("[SigNoz] Shutdown failed:", error);
//         }
//     }
//     private static ensureEndpoint(value: string | undefined, fallbackHost: string, defaultPath: string): string {
//         const base = value && value.trim() !== "" ? value.trim() : fallbackHost;
//         if (base.includes("/v1/") || base.endsWith(defaultPath)) {
//             return base;
//         }
//         return `${base.replace(/\/$/, "")}${defaultPath}`;
//     }
//     private static warnMissingDependency(name: string) {
//         if (this.missingDependencies.has(name)) {
//             return;
//         }
//         this.missingDependencies.add(name);
//         this.logWarn(`[SigNoz] Optional package "${name}" not found. Install it to enable the related feature.`);
//     }
//     private static loadAutoInstrumentations(config: Record<string, unknown>): any | null {
//         if (typeof require !== "function") {
//             return null;
//         }
//         try {
//             // eslint-disable-next-line @typescript-eslint/no-var-requires,@typescript-eslint/no-unsafe-assignment
//             const module = require("@opentelemetry/auto-instrumentations-node");
//             if (module && typeof module.getNodeAutoInstrumentations === "function") {
//                 return module.getNodeAutoInstrumentations(config);
//             }
//             this.warnMissingDependency("@opentelemetry/auto-instrumentations-node");
//             return null;
//         } catch (error: any) {
//             if (error && (error.code === "MODULE_NOT_FOUND" || error.code === "ERR_MODULE_NOT_FOUND")) {
//                 this.warnMissingDependency("@opentelemetry/auto-instrumentations-node");
//                 return null;
//             }
//             throw error;
//         }
//     }
//     private static registerShutdownHooks() {
//         if (this.shutdownRegistered) {
//             return;
//         }
//         const nodeProcess = this.getProcess();
//         if (!nodeProcess) {
//             return;
//         }
//         nodeProcess.once("beforeExit", this.shutdownListener);
//         nodeProcess.once("exit", this.shutdownListener);
//         this.shutdownRegistered = true;
//     }
//     private static getProcess(): any {
//         if (typeof globalThis === "undefined") {
//             return undefined;
//         }
//         const candidate = (globalThis as any).process;
//         if (candidate && typeof candidate.once === "function") {
//             return candidate;
//         }
//         return undefined;
//     }
//     private static getEnv(key: string): string | undefined {
//         const nodeProcess = this.getProcess();
//         if (!nodeProcess || !nodeProcess.env) {
//             return undefined;
//         }
//         const value = nodeProcess.env[key];
//         return typeof value === "string" ? value : undefined;
//     }
//     private static getConsole(): any {
//         if (typeof globalThis === "undefined") {
//             return undefined;
//         }
//         return (globalThis as any).console;
//     }
//     private static logInfo(...args: unknown[]) {
//         const target = this.getConsole();
//         if (target && typeof target.info === "function") {
//             target.info(...args);
//         }
//     }
//     private static logWarn(...args: unknown[]) {
//         const target = this.getConsole();
//         if (target && typeof target.warn === "function") {
//             target.warn(...args);
//         }
//     }
// }
