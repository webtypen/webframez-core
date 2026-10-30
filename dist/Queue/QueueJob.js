"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueueJob = void 0;
const QueueExecutionContext_1 = require("./QueueExecutionContext");
const Model_1 = require("../Database/Model");
class QueueJob extends Model_1.Model {
    constructor() {
        super(...arguments);
        this.__table = "queue_jobs";
    }
    save() {
        const _super = Object.create(null, {
            save: { get: () => super.save }
        });
        return __awaiter(this, void 0, void 0, function* () {
            const context = QueueExecutionContext_1.QueueExecutionContext.capture();
            if (context)
                this.execution_context = context;
            return _super.save.call(this);
        });
    }
}
exports.QueueJob = QueueJob;
