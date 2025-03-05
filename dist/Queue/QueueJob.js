"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueueJob = void 0;
const Model_1 = require("../Database/Model");
class QueueJob extends Model_1.Model {
    constructor() {
        super(...arguments);
        this.__table = "queue_jobs";
    }
}
exports.QueueJob = QueueJob;
