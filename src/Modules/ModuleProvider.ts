export class ModuleProvider {
    static key: string = "example-module";

    controller: { [key: string]: any } = {};
    middleware: { [key: string]: any } = {};

    boot() {}

    routes() {}

    bootByRouter() {
        this.boot();
        this.routes();
    }
}
