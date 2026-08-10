"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Notification = void 0;
const Model_1 = require("../Database/Model");
class Notification extends Model_1.Model {
    constructor() {
        super(...arguments);
        this.__table = "notifications";
    }
}
exports.Notification = Notification;
