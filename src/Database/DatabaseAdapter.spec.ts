import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { BaseDBDriver } from "./BaseDBDriver";
import { DBConnection } from "./DBConnection";
import { DBDrivers } from "./DBDrivers";
import { Config } from "../Config";
import { NotificationService } from "../Notifications/NotificationService";
import { Notification } from "../Notifications/Notification";

const corePath = path.resolve(__dirname, "../../dist/index.js");
test("compiled core serves HTTP with MongoDB, BSON and database drivers blocked", () => {
    execFileSync(process.execPath, ["-e", `
        const assert = require('node:assert/strict');
        const Module = require('node:module'), originalLoad = Module._load;
        Module._load = function(name, ...args) {
            if (/^(mongodb|bson)(\\/|$)|webframez-dbdriver/.test(name)) throw new Error('Unexpected driver import: ' + name);
            return originalLoad.call(this, name, ...args);
        };
        const http = require('node:http'), originalCreate = http.createServer;
        http.createServer = (...args) => {
            const server = originalCreate(...args), listen = server.listen;
            server.listen = (...values) => listen.call(server, 0, '127.0.0.1', values.find(v => typeof v === 'function'));
            return server;
        };
        const core = require(${JSON.stringify(corePath)});
        const app = new core.WebApplication();
        app.boot({ port: 1, routesFunction: () => core.Route.get('/driver-free', (req, res) => res.send({ ok: true })) });
        app.server.once('listening', async () => {
            try {
                const response = await new Promise((resolve, reject) => http.get('http://127.0.0.1:' + app.server.address().port + '/driver-free', res => {
                    let body = ''; res.on('data', data => body += data); res.on('end', () => resolve({status:res.statusCode, body}));
                }).on('error', reject));
                assert.equal(response.status, 200); assert.deepEqual(JSON.parse(response.body), {ok:true});
                await assert.rejects(core.DBConnection.getConnection(), /database-config/);
                core.Config.register('database', {defaultConnection:'main', connections:{main:{driver:'missing'}}});
                await assert.rejects(core.DBConnection.getConnection(), /not registered/);
            } catch(error) { console.error(error); process.exitCode = 1; }
            finally { app.server.close(); }
        });
    `], { timeout: 15000, stdio: "pipe" });
});

test("ID conversion does not connect and notification targets can use numeric IDs including zero", async () => {
    const previous = Config.configs, connections = DBConnection.connections;
    const targets = NotificationService.targetRegistry;
    let connectionsOpened = 0;
    class NumericDriver extends BaseDBDriver {
        get idAdapter() {
            const normalize = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
            return { create: (value: unknown) => { const id = normalize(value); if (id === null) throw new Error("Invalid numeric ID"); return id; },
                normalize, isValid: (value: unknown) => normalize(value) !== null,
                equals: (a: unknown, b: unknown) => normalize(a) !== null && normalize(b) !== null && a === b };
        }
        async connect() { connectionsOpened++; }
    }
    try {
        DBDrivers.register("numeric-test", NumericDriver);
        Config.register("database", { defaultConnection: "test", connections: { test: { driver: "numeric-test" } } });
        DBConnection.connections = {};
        assert.equal(await DBConnection.objectId(0), 0);
        assert.equal(await DBConnection.objectId("invalid", undefined, { noExceptions: true }), null);
        NotificationService.targetRegistry = { user: {} };
        const targetModel = { id: 0 };
        const context: any = { target: "user", target_id: 0, targetModel, request: { user: targetModel } };
        assert.equal((await NotificationService.authorizeTarget(context))?.targetModel, targetModel);
        assert.equal(await NotificationService.authorizeTarget({ ...context, request: { user: { id: 1 } } }), null);
        const originalWhere = Notification.where;
        try {
            Notification.where = ((_key: string, _operator: string, id: unknown) => {
                assert.equal(id, 0);
                return { first: async () => ({ _id: id }) };
            }) as any;
            assert.equal((await NotificationService.getNotification(0))._id, 0);
        } finally { Notification.where = originalWhere; }
        assert.equal(connectionsOpened, 0);
        assert.throws(() => DBConnection.documentStore({ driver: new NumericDriver(), client: {} }), /does not support document queries/);
    } finally {
        Config.configs = previous; DBConnection.connections = connections;
        NotificationService.targetRegistry = targets; delete DBDrivers.drivers["numeric-test"];
    }
});
