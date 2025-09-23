export class ModulesLoader {
    private loadedModules: { [key: string]: any } = {};

    load(modules: any[]) {
        for (let modClass of modules) {
            if (!modClass || !modClass.key || modClass.disabled === true) continue;

            this.loadedModules[modClass.key] = new modClass();
            this.loadedModules[modClass.key].boot();
        }
    }

    initRoutes() {
        for (let key in this.loadedModules) {
            this.loadedModules[key].routes();
        }
    }

    loadKernel(kernel: any) {
        if (!kernel) return;

        for (let key in this.loadedModules) {
            if (this.loadedModules[key].controller) {
                for (let ctrlKey in this.loadedModules[key].controller) {
                    kernel.controller[ctrlKey] = this.loadedModules[key].controller[ctrlKey];
                }

                for (let mwKey in this.loadedModules[key].middleware) {
                    kernel.middleware[mwKey] = this.loadedModules[key].middleware[mwKey];
                }
            }
        }
    }
}
