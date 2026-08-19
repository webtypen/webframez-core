import assert from "node:assert/strict";
import test from "node:test";
import { ObjectId } from "mongodb";
import { Config } from "../Config";
import { ModuleProvider } from "../Modules/ModuleProvider";
import { ModulesLoader } from "../Modules/ModulesLoader";
import { BaseNotificationsController } from "./BaseNotificationsController";
import { Notification } from "./Notification";
import {
    NotificationPayloadValidationError,
    NotificationService,
    NotificationTargetValidationError,
} from "./NotificationService";
import { NotificationsOutputChannelsJob } from "./NotificationsOutputChannelsJob";

const targetId = new ObjectId();
const targetModel: any = {
    _id: targetId,
    async save() {},
};

const reset = () => {
    NotificationService.registry = {};
    NotificationService.notificationsConfig = {};
    NotificationService.targetRegistry = { user: { collection: "users" } };
};

const target = (overrides: Record<string, any> = {}) => ({
    target: "user",
    target_id: targetId,
    targetModel,
    ...overrides,
});

const withFakeSave = async (callback: () => Promise<void>) => {
    const originalSave = Notification.prototype.save;
    Notification.prototype.save = async function (this: Notification) {
        this._id = this._id || new ObjectId();
        return this;
    } as any;
    try {
        await callback();
    } finally {
        Notification.prototype.save = originalSave;
    }
};

const response = () => {
    const result: any = { statusCode: 200, body: null };
    result.status = (statusCode: number) => ((result.statusCode = statusCode), result);
    result.send = (body: any) => ((result.body = body), result);
    return result;
};

test("requires registered targets on every notification definition", () => {
    reset();
    assert.throws(() => NotificationService.registerType({ key: "missing" } as any), /at least one target/);
    assert.throws(
        () => NotificationService.registerType({ key: "unknown", targets: ["envuser"] }),
        /unknown target/,
    );
    NotificationService.registerType({ key: "known", targets: ["user"], settingsGroup: "Account" });
    const publicDefinition = NotificationService.getPublicTypeDefinition("known");
    assert.deepEqual(publicDefinition.targets, ["user"]);
    assert.equal(publicDefinition.settings_group, "Account");
});

test("validates target ids, resolves targets and authorizes request ownership", async () => {
    reset();
    assert.throws(
        () => NotificationService.normalizeTargetContext({ target: "user", target_id: "invalid" }),
        NotificationTargetValidationError,
    );
    assert.equal(
        NotificationService.normalizeTargetContext({
            target: "user",
            target_id: { toString: () => targetId.toString() } as any,
        }).target_id.toString(),
        targetId.toString(),
    );
    const request: any = { user: targetModel };
    const resolved = await NotificationService.authorizeTarget({
        target: "user",
        target_id: targetId.toString(),
        request,
    });
    assert.equal(resolved?.targetModel, targetModel);
    assert.equal(
        await NotificationService.authorizeTarget({
            target: "user",
            target_id: new ObjectId(),
            request,
            targetModel,
        }),
        null,
    );
});

test("normalizes parameters and persists only target/target_id", async () => {
    reset();
    NotificationService.registerType({
        key: "parameters",
        targets: ["user"],
        parameters: {
            text: { type: "string", required: true },
            integer: { type: "integer", required: true },
            float: { type: "float" },
            date: { type: "date" },
            datetime: { type: "datetime" },
        },
    });
    await withFakeSave(async () => {
        const notification = await NotificationService.create(
            "parameters",
            {
                text: "value",
                integer: "42",
                float: "3.5",
                date: "2026-08-10",
                datetime: "2026-08-10T12:34:56+02:00",
            },
            { ...target(), baseData: { _user: new ObjectId(), custom: true } },
        );
        assert.ok(notification);
        assert.equal(notification.target, "user");
        assert.equal(notification.target_id?.toString(), targetId.toString());
        assert.equal((notification as any)._user, undefined);
        assert.equal(notification.targetModel, targetModel);
        assert.equal(Object.prototype.propertyIsEnumerable.call(notification, "targetModel"), false);
        assert.deepEqual(notification.payload, {
            text: "value",
            integer: 42,
            float: 3.5,
            date: "2026-08-10",
            datetime: "2026-08-10T10:34:56.000Z",
        });
    });
});

test("rejects invalid parameters and target types", async () => {
    reset();
    NotificationService.targetRegistry.envuser = { collection: "environments_users" };
    NotificationService.registerType({
        key: "strict",
        targets: ["user"],
        parameters: { count: { type: "integer", required: true } },
    });
    await assert.rejects(() => NotificationService.create("strict", {}, target()), /Missing required/);
    await assert.rejects(
        () => NotificationService.create("strict", { count: 1, extra: true }, target()),
        /Unknown notification parameter/,
    );
    await assert.rejects(
        () =>
            NotificationService.create("strict", { count: 1 }, {
                target: "envuser",
                target_id: targetId,
                targetModel,
            }),
        /not available for target/,
    );
});

test("keeps registry alias and last-write-wins module aggregation", () => {
    Config.set("notifications", { types: [{ key: "duplicate", targets: ["user"], title: "Config" }] });
    NotificationService.init();
    class First extends ModuleProvider {
        static key = "first";
        notifications = [{ key: "duplicate", targets: ["user"], title: "First" }];
    }
    class Second extends ModuleProvider {
        static key = "second";
        notifications = [{ key: "duplicate", targets: ["user"], title: "Second" }];
    }
    const loader = new ModulesLoader();
    loader.load([First, Second]);
    NotificationService.registerTypes(loader.getNotifications());
    assert.equal(NotificationService.registry.duplicate.title, "Second");
    assert.equal(NotificationService.registy, NotificationService.registry);
});

test("preferences are scoped to the target and channels are filtered by target", async () => {
    class Driver {
        activated = true;
    }
    reset();
    NotificationService.targetRegistry.envuser = { collection: "environments_users" };
    NotificationService.notificationsConfig = {
        output_channels: [
            { key: "email", label: "E-Mail", is_active: true, driver: Driver, targets: ["user"] },
            { key: "env-mail", is_active: true, driver: Driver, targets: ["envuser"] },
        ],
    };
    NotificationService.registerTypes([
        {
            key: "optional",
            targets: ["user"],
            subscribable: true,
            settingsGroup: "Shop",
            settingsTitle: "Optional",
        },
        { key: "required", targets: ["user"], settingsGroup: "System", title: "Required" },
        { key: "env-only", targets: ["envuser"] },
    ]);
    const initial = await NotificationService.getTargetPreferences(target());
    assert.deepEqual(initial?.output_channels, [{ key: "email", label: "E-Mail" }]);
    assert.deepEqual(initial?.entries.map((entry) => entry.key), ["optional", "required"]);
    assert.deepEqual(initial?.entries.map((entry) => entry.settings_group), ["Shop", "System"]);
    assert.equal(initial?.entries.find((entry) => entry.key === "optional")?.enabled, false);
    const saved = await NotificationService.saveTargetPreference(
        "optional",
        { enabled: true, output_channels: ["email"] },
        target(),
    );
    assert.equal(saved?.enabled, true);
    assert.equal(saved?.settings_group, "Shop");
    assert.deepEqual(targetModel.notification_preferences.optional, {
        enabled: true,
        output_channels: ["email"],
    });
    await assert.rejects(
        () =>
            NotificationService.saveTargetPreference(
                "optional",
                { enabled: true, output_channels: ["env-mail"] },
                target(),
            ),
        /Unknown notification output-channel/,
    );
});

test("disabled subscribable types return null", async () => {
    reset();
    delete targetModel.notification_preferences;
    NotificationService.registerType({ key: "optional-create", targets: ["user"], subscribable: true });
    assert.equal(await NotificationService.create("optional-create", {}, target()), null);
});

test("controller requires target context and prevents target spoofing", async () => {
    reset();
    NotificationService.targetRegistry.user.resolve = async () => targetModel;
    NotificationService.registerType({ key: "known", targets: ["user"], title: "Known" });
    const controller = new BaseNotificationsController();
    const missing = response();
    await controller.endpoint(
        { user: targetModel, body: { __type: "definition", key: "known" } } as any,
        missing,
    );
    assert.equal(missing.statusCode, 400);

    const foreign = response();
    await controller.endpoint(
        {
            user: targetModel,
            body: { __type: "definition", key: "known", target: "user", target_id: new ObjectId().toString() },
        } as any,
        foreign,
    );
    assert.equal(foreign.statusCode, 404);

    const unauthenticated = response();
    await controller.endpoint(
        {
            body: { __type: "definition", key: "known", target: "user", target_id: targetId.toString() },
        } as any,
        unauthenticated,
    );
    assert.equal(unauthenticated.statusCode, 404);

    const success = response();
    await controller.endpoint(
        {
            user: targetModel,
            body: { __type: "definition", key: "known", target: "user", target_id: targetId.toString() },
        } as any,
        success,
    );
    assert.equal(success.statusCode, 200);
    assert.deepEqual(success.body.data.definition.targets, ["user"]);
});

test("create controller forwards authorized target context", async () => {
    reset();
    NotificationService.targetRegistry.user.resolve = async () => targetModel;
    NotificationService.registerType({
        key: "automated",
        targets: ["user"],
        mode: "changing",
        queueJobAutomation: { job: "TestJob" },
    });
    let received: any = null;
    class TestController extends BaseNotificationsController {
        protected async createNotification(_req: any, key: string, payload: Record<string, any>, context: any) {
            received = { key, payload, context };
            const notification = new Notification();
            notification._id = new ObjectId();
            notification.key = key;
            notification.target = context.target;
            notification.target_id = context.target_id;
            return notification;
        }
    }
    const res = response();
    await new TestController().endpoint(
        {
            user: targetModel,
            body: {
                __type: "create",
                key: "automated",
                payload: {},
                target: "user",
                target_id: targetId.toString(),
            },
        } as any,
        res,
    );
    assert.equal(res.statusCode, 200);
    assert.equal(received.context.targetModel, targetModel);
});

test("output worker resolves targetModel and sends only target-compatible selected channels", async () => {
    reset();
    class Driver {
        activated = true;
    }
    targetModel.notification_preferences = {
        delivered: { enabled: true, output_channels: ["email", "customer-mail"] },
    };
    NotificationService.notificationsConfig = {
        output_channels: [
            { key: "email", is_active: true, driver: Driver, targets: ["user"] },
            { key: "customer-mail", is_active: true, driver: Driver, targets: ["customer"] },
        ],
    };
    NotificationService.registerType({ key: "delivered", targets: ["user"] });
    const notification = new Notification();
    notification._id = new ObjectId();
    notification.key = "delivered";
    notification.target = "user";
    notification.target_id = targetId;
    notification.view_status = "unviewed";
    notification.output_channels_claim_token = "claim";
    notification.output_channels_result = [];
    const originalResolve = NotificationService.resolveTarget;
    const originalGetNotificationForTarget = NotificationService.getNotificationForTarget;
    NotificationService.resolveTarget = (async (context: any) => ({ ...context, targetModel })) as any;
    const reloadedNotification = Object.assign(new Notification(), notification);
    delete reloadedNotification.targetModel;
    NotificationService.getNotificationForTarget = (async () => reloadedNotification) as any;
    const handled: string[] = [];
    const updates: any[] = [];
    const collection = {
        findOne: async () => ({ view_status: "unviewed" }),
        updateOne: async (_filter: any, update: any) => (updates.push(update), { matchedCount: 1 }),
    };
    try {
        await (new NotificationsOutputChannelsJob() as any).deliverNotification(
            collection,
            notification,
            [
                {
                    key: "email",
                    targets: ["user"],
                    driver: {
                        handle: async (deliveredNotification: Notification) => {
                            assert.equal(deliveredNotification.targetModel, targetModel);
                            handled.push("email");
                            return { status: true };
                        },
                    },
                },
                { key: "customer-mail", targets: ["customer"], driver: { handle: async () => (handled.push("customer"), { status: true }) } },
            ],
            3,
            5,
        );
        assert.deepEqual(handled, ["email"]);
        assert.equal(reloadedNotification.targetModel, targetModel);
        assert.equal(updates[updates.length - 1].$set.output_channels_status, "sent");
    } finally {
        NotificationService.resolveTarget = originalResolve;
        NotificationService.getNotificationForTarget = originalGetNotificationForTarget;
    }
});

test("output worker applies delivery delay and only claims unviewed notifications", async () => {
    const job = new NotificationsOutputChannelsJob() as any;
    let filter: any = null;
    const eligibleBefore = new Date("2026-08-11T10:00:00.000Z");
    const collection = {
        findOneAndUpdate: async (query: any) => ((filter = query), null),
    };

    await job.claimNotification(collection, 30, eligibleBefore);

    assert.equal(filter.show_at.$lte, eligibleBefore);
    assert.equal(filter.view_status, "unviewed");
});

test("output worker terminally skips already viewed eligible notifications", async () => {
    const job = new NotificationsOutputChannelsJob() as any;
    let filter: any = null;
    let update: any = null;
    const eligibleBefore = new Date("2026-08-11T10:00:00.000Z");
    const collection = {
        updateMany: async (query: any, data: any) => {
            filter = query;
            update = data;
        },
    };

    await job.skipViewedNotifications(collection, eligibleBefore, 30);

    assert.equal(filter.show_at.$lte, eligibleBefore);
    assert.equal(filter.view_status, "viewed");
    assert.equal(update.$set.output_channels_status, "skipped");
    assert.ok(update.$set.output_channels_finished_at instanceof Date);
});

test("output worker logs driver payload for successful and failed attempts without reserved-field overrides", async () => {
    reset();
    class Driver {
        activated = true;
    }
    NotificationService.notificationsConfig = {
        output_channels: [
            { key: "success", is_active: true, driver: Driver, targets: ["user"] },
            { key: "failure", is_active: true, driver: Driver, targets: ["user"] },
        ],
    };
    targetModel.notification_preferences = {
        delivered: { enabled: true, output_channels: ["success", "failure"] },
    };
    NotificationService.registerType({ key: "delivered", targets: ["user"] });
    const notification = new Notification();
    notification._id = new ObjectId();
    notification.key = "delivered";
    notification.target = "user";
    notification.target_id = targetId;
    notification.view_status = "unviewed";
    notification.output_channels_claim_token = "claim";
    notification.output_channels_result = [];
    const originalResolve = NotificationService.resolveTarget;
    const originalGetNotificationForTarget = NotificationService.getNotificationForTarget;
    NotificationService.resolveTarget = (async (context: any) => ({ ...context, targetModel })) as any;
    NotificationService.getNotificationForTarget = (async () => notification) as any;
    const pushed: any[] = [];
    const collection = {
        findOne: async () => ({ view_status: "unviewed" }),
        updateOne: async (_filter: any, update: any) => {
            if (update.$push?.output_channels_result) pushed.push(update.$push.output_channels_result);
            return { matchedCount: 1 };
        },
    };
    try {
        await (new NotificationsOutputChannelsJob() as any).deliverNotification(
            collection,
            notification,
            [
                {
                    key: "success",
                    driver: {
                        handle: async () => ({
                            status: true,
                            payload: { recipient_email: "success@example.com", channel: "overridden" },
                        }),
                    },
                },
                {
                    key: "failure",
                    driver: {
                        handle: async () => ({
                            status: false,
                            error_message: "mail rejected",
                            payload: { recipient_email: "failure@example.com", status: "overridden" },
                        }),
                    },
                },
            ],
            1,
            5,
        );

        assert.equal(pushed[0].recipient_email, "success@example.com");
        assert.equal(pushed[0].channel, "success");
        assert.equal(pushed[0].status, "success");
        assert.equal(pushed[1].recipient_email, "failure@example.com");
        assert.equal(pushed[1].channel, "failure");
        assert.equal(pushed[1].status, "error");
        assert.equal(pushed[1].error_message, "mail rejected");
    } finally {
        NotificationService.resolveTarget = originalResolve;
        NotificationService.getNotificationForTarget = originalGetNotificationForTarget;
    }
});

test("output worker rechecks viewed status immediately before invoking a channel", async () => {
    reset();
    class Driver {
        activated = true;
    }
    NotificationService.notificationsConfig = {
        output_channels: [{ key: "email", is_active: true, driver: Driver, targets: ["user"] }],
    };
    targetModel.notification_preferences = {
        delivered: { enabled: true, output_channels: ["email"] },
    };
    NotificationService.registerType({ key: "delivered", targets: ["user"] });
    const notification = new Notification();
    notification._id = new ObjectId();
    notification.key = "delivered";
    notification.target = "user";
    notification.target_id = targetId;
    notification.view_status = "unviewed";
    notification.output_channels_claim_token = "claim";
    notification.output_channels_result = [];
    const originalResolve = NotificationService.resolveTarget;
    const originalGetNotificationForTarget = NotificationService.getNotificationForTarget;
    NotificationService.resolveTarget = (async (context: any) => ({ ...context, targetModel })) as any;
    NotificationService.getNotificationForTarget = (async () => notification) as any;
    let handled = false;
    const updates: any[] = [];
    const collection = {
        findOne: async () => ({ view_status: "viewed" }),
        updateOne: async (_filter: any, update: any) => (updates.push(update), { matchedCount: 1 }),
    };
    try {
        await (new NotificationsOutputChannelsJob() as any).deliverNotification(
            collection,
            notification,
            [{ key: "email", driver: { handle: async () => ((handled = true), { status: true }) } }],
            3,
            5,
        );

        assert.equal(handled, false);
        assert.equal(updates[updates.length - 1].$set.output_channels_status, "skipped");
    } finally {
        NotificationService.resolveTarget = originalResolve;
        NotificationService.getNotificationForTarget = originalGetNotificationForTarget;
    }
});

test("payload errors remain distinguishable for controllers", () => {
    assert.equal(new NotificationPayloadValidationError("invalid").name, "NotificationPayloadValidationError");
});

test("appends read-only load aggregation after list pagination and details limiting", async () => {
    reset();
    NotificationService.registerType({ key: "aggregated", targets: ["user"] });
    const originalAggregate = Notification.aggregate;
    const pipelines: any[][] = [];
    const operations: string[] = [];
    const extension = [
        { $lookup: { from: "related", localField: "_id", foreignField: "_notification", as: "related" } },
        { $project: { key: 1, target: 1, target_id: 1, related: 1 } },
    ];
    NotificationService.notificationsConfig = {
        onLoadNotificationsAggregation: (context: any) => {
            operations.push(context.operation);
            return extension;
        },
    };
    (Notification as any).aggregate = async (pipeline: any[]) => {
        pipelines.push(pipeline);
        return [];
    };

    try {
        await NotificationService.loadNotifications({ ...target(), offset: 4, limit: 7 });
        await NotificationService.getNotificationForTarget(new ObjectId(), target());

        assert.deepEqual(operations, ["list", "details"]);
        assert.deepEqual(pipelines[0].slice(1, 4), [{ $sort: { show_at: -1 } }, { $skip: 4 }, { $limit: 7 }]);
        assert.deepEqual(pipelines[0].slice(4), extension);
        assert.deepEqual(pipelines[1].slice(1), [{ $limit: 1 }, ...extension]);

        NotificationService.notificationsConfig.onLoadNotificationsAggregation = () => [{ $sort: { created_at: 1 } }];
        await assert.rejects(
            () => NotificationService.loadNotifications({ ...target(), limit: 1 }),
            /reserved stage '\$sort'/,
        );
    } finally {
        (Notification as any).aggregate = originalAggregate;
    }
});

test("read updates do not persist fields added by load aggregation", async () => {
    const notification = new Notification();
    notification._id = new ObjectId();
    notification.read_status = "unread";
    notification.view_status = "unviewed";
    (notification as any).environment = { _id: new ObjectId(), slug: "example" };
    let updatedData: any = null;
    (notification as any).update = async (data: any) => {
        updatedData = data;
    };
    (notification as any).save = async () => {
        throw new Error("markAsRead must not save the complete aggregated model");
    };

    const result = await NotificationService.markAsRead(notification);

    assert.equal(result, notification);
    assert.equal(updatedData.read_status, "read");
    assert.equal(updatedData.view_status, "viewed");
    assert.equal(updatedData.environment, undefined);
    assert.equal((result as any).environment.slug, "example");
});
