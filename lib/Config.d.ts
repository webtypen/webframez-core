type ConfigType = {
    key: string;
    component: any;
};
declare class ConfigFacade {
    configs: {
        [key: string]: any;
    };
    register(key: string | ConfigType[], component: {
        [key: string]: any;
    }): this;
    get(key: string): any;
    set(path: string, value: any | null | undefined): this;
}
export declare const Config: ConfigFacade;
export {};
