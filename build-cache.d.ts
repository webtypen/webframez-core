export function configureMetroCache<T extends {cacheVersion?: string; cacheStores?: any; maxWorkers?: number}>(config:T, env?:Record<string,string | undefined>):T;
