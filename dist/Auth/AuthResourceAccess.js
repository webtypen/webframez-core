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
exports.AuthResourceAccess = void 0;
const Model_1 = require("../Database/Model");
/** Document-query authorization for all, owned and explicitly assigned resources.
 * Callers must supply authenticated, server-loaded users and server-derived grants.
 * Use the same filter before pagination/counts/exports and for individual mutations.
 */
class AuthResourceAccess {
    constructor(options) {
        this.options = options;
        this.primaryKey = new options.model().__primaryKey;
        this.userKey = options.userKey || "_id";
        for (const field of [this.primaryKey, this.userKey, options.ownerField, options.membersField,
            ...(options.userConditions || []).map(condition => condition.field),
            ...(options.resourceConditions || []).map(condition => condition.field)]) {
            if (field !== undefined && !/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/.test(field))
                throw new Error("Invalid resource access field.");
        }
        if (options.ownerField && options.ownerField === options.membersField)
            throw new Error("Owner and membership fields must be separate.");
    }
    filter(user, grants) {
        const deny = { [this.primaryKey]: { $in: [] } };
        if (!(user instanceof Model_1.Model))
            return deny;
        const userId = user[this.userKey];
        if (userId === null || userId === undefined || userId === "")
            return deny;
        if (!(this.options.userConditions || []).every(condition => condition.operator === "="
            ? user[condition.field] === condition.value : user[condition.field] !== condition.value))
            return deny;
        const alternatives = [];
        if (grants.own === true && this.options.ownerField)
            alternatives.push({ [this.options.ownerField]: { $eq: userId } });
        if (grants.assigned === true && this.options.membersField)
            alternatives.push({ [this.options.membersField]: { $eq: userId } });
        if (grants.all !== true && !alternatives.length)
            return deny;
        const conditions = (this.options.resourceConditions || []).map(condition => ({
            [condition.field]: { [condition.operator === "=" ? "$eq" : "$ne"]: condition.value },
        }));
        if (grants.all !== true)
            conditions.push({ $or: alternatives });
        return conditions.length ? { $and: conditions } : {};
    }
    /** The returned model is freshly read; missing/invalid IDs never create an unbounded query. */
    find(user, id, grants) {
        return __awaiter(this, void 0, void 0, function* () {
            if (id === null || id === undefined || id === "" || !(user instanceof Model_1.Model))
                return null;
            const resourceId = yield this.options.model.objectId(id, { noExceptions: true });
            if (resourceId === null || resourceId === undefined)
                return null;
            return yield this.options.model.where("$and", "=", [
                { [this.primaryKey]: { $eq: resourceId } }, this.filter(user, grants),
            ]).first();
        });
    }
}
exports.AuthResourceAccess = AuthResourceAccess;
