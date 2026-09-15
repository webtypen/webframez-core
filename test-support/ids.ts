import { randomBytes } from "node:crypto";
import type { DatabaseIdAdapter } from "../src/Database/DatabaseAdapter";

// A test ID with no BSON/MongoDB dependency. Database-specific behavior belongs in driver tests.
export class TestId {
    private value: string;
    constructor(value = randomBytes(12).toString("hex")) {
        if (!/^[a-f0-9]{24}$/i.test(value)) throw new Error("Invalid test ID");
        this.value = value.toLowerCase();
    }
    toString() { return this.value; }
    toHexString() { return this.value; }
    equals(other: unknown) { return String(other) === this.value; }
}
const normalize = (value: unknown) => {
    if (value === null || value === undefined || !/^[a-f0-9]{24}$/i.test(String(value))) return null;
    return value instanceof TestId ? value : new TestId(String(value));
};
export const testIds: DatabaseIdAdapter = {
    create: value => value == null ? new TestId() : normalize(value) || (() => { throw new Error("Invalid test ID"); })(),
    normalize,
    isValid: value => normalize(value) !== null,
    equals: (left, right) => normalize(left) !== null && normalize(right) !== null && String(normalize(left)) === String(normalize(right)),
};
