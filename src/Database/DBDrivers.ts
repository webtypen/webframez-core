export class DBDriversFacade {
    drivers: { [key: string]: any } = {};

    register(name: string, component: any) {
        this.drivers[name] = component;
    }

    get(name: string) {
        return this.drivers[name];
    }
}

export const DBDrivers = new DBDriversFacade();
