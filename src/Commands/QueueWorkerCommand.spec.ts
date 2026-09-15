import assert from "node:assert/strict";
import test from "node:test";
import { QueueWorkerCommand } from "./QueueWorkerCommand";
import { DBConnection } from "../Database/DBConnection";

{
    test("empty queue waits with document adapter result", async () => {
        const original = DBConnection.getConnection;
        let polls = 0, waits = 0;
        DBConnection.getConnection = (async () => ({ client: {}, driver: { documentStore: () => ({ collection: () => ({
            findOneAndUpdate: async () => { polls++; return null; },
        }) }) } })) as any;
        const worker = new QueueWorkerCommand();
        worker.workerKey = "test";
        worker.workerConfig = {};
        worker.runAutomation = async () => {};
        worker.checkStop = () => polls > 0;
        worker.getWorkerJobclasses = () => [];
        worker.waitRun = async () => { waits++; };
        worker.log = () => {};
        try {
            await worker.run();
            assert.equal(polls, 1);
            assert.equal(waits, 1);
            assert.equal(worker.currentJob, null);
        } finally { DBConnection.getConnection = original; }
    });
}

{
    test("claimed job is accepted with document adapter result", async () => {
        const original = DBConnection.getConnection;
        const job = { _id: "fixture", jobclass: "FixtureJob", number: 1 };
        DBConnection.getConnection = (async () => ({ client: {}, driver: { documentStore: () => ({ collection: () => ({
            findOneAndUpdate: async () => job,
        }) }) } })) as any;
        const worker = new QueueWorkerCommand();
        worker.workerKey = "test";
        worker.workerConfig = {};
        worker.runAutomation = async () => {};
        worker.checkStop = () => false;
        worker.getWorkerJobclasses = () => [];
        const reachedJob = new Error("job selected");
        worker.log = (message: string) => { assert.match(message, /Start Job #1 - FixtureJob/); throw reachedJob; };
        try { await assert.rejects(worker.run(), error => error === reachedJob); }
        finally { DBConnection.getConnection = original; }
    });
}
