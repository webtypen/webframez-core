class DatatableRegistryWrapper {
    tables: any = {};

    register(key: string, tableClass: any) {
        this.tables[key] = tableClass;
        return this;
    }

    registerMany(data: any) {
        if (typeof data === "object") {
            for (let key in data) {
                this.register(key, data[key]);
            }
        }
        return this;
    }

    getTable(key: string) {
        return this.tables[key] ? this.tables[key] : null;
    }
}
export const DatatableRegistry = new DatatableRegistryWrapper();
