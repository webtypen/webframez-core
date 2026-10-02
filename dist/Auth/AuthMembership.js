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
exports.AuthMembership = void 0;
const Model_1 = require("../Database/Model");
/** Resolves fresh membership records without caching authorization between requests. */
class AuthMembership {
    constructor(options) {
        var _a;
        this.options = options;
        if (!options.model || !((_a = options.bindings) === null || _a === void 0 ? void 0 : _a.length))
            throw new Error("Auth membership requires a model and bindings.");
        for (const binding of options.bindings) {
            if (!binding.user.foreignKey || !binding.resource.foreignKey
                || !binding.user.localKeys.length || !binding.resource.localKeys.length) {
                throw new Error("Auth membership requires user and resource reference fields.");
            }
        }
    }
    matches(model, conditions = []) {
        return conditions.every(condition => condition.operator === "="
            ? model[condition.field] === condition.value : model[condition.field] !== condition.value);
    }
    matchesEnvironment(resource, environment) {
        const key = this.options.sessionEnvironmentKey;
        return !environment || !key || String(resource === null || resource === void 0 ? void 0 : resource[key]) === environment;
    }
    find(user, resource) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!(user instanceof Model_1.Model) || !(resource instanceof Model_1.Model)
                || !this.matches(user, this.options.userConditions) || !this.matches(resource, this.options.resourceConditions))
                return null;
            for (const binding of this.options.bindings) {
                let userIds = binding.user.localKeys.map(key => user[key]).filter(value => value !== null && value !== undefined && value !== "");
                if (binding.user.firstAvailable)
                    userIds = userIds.slice(0, 1);
                const resourceIds = binding.resource.localKeys.map(key => resource[key]).filter(value => value !== null && value !== undefined && value !== "");
                // Missing references must never turn into an unbounded membership lookup.
                if (!userIds.length || !resourceIds.length)
                    continue;
                let query = this.options.model.where(binding.user.foreignKey, "=", { $in: userIds })
                    .where(binding.resource.foreignKey, "=", { $in: resourceIds });
                for (const condition of this.options.conditions || []) {
                    query = query.where(condition.field, condition.operator, condition.value);
                }
                const membership = yield query.first();
                if (membership)
                    return membership;
            }
            return null;
        });
    }
}
exports.AuthMembership = AuthMembership;
