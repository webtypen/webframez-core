import { Model } from "../Database/Model";
import { AuthMembershipCondition } from "./AuthMembership";

export type AuthResourceGrants = { all?: boolean; own?: boolean; assigned?: boolean };

export type AuthResourceAccessOptions = {
    model: typeof Model;
    /** Immutable creator reference on the resource. */
    ownerField?: string;
    /** Array of explicitly assigned user references (also supports paths such as members.user). */
    membersField?: string;
    userKey?: string;
    userConditions?: readonly AuthMembershipCondition[];
    resourceConditions?: readonly AuthMembershipCondition[];
};

/** Document-query authorization for all, owned and explicitly assigned resources.
 * Callers must supply authenticated, server-loaded users and server-derived grants.
 * Use the same filter before pagination/counts/exports and for individual mutations.
 */
export class AuthResourceAccess {
    private readonly primaryKey: string;
    private readonly userKey: string;

    constructor(private readonly options: AuthResourceAccessOptions) {
        this.primaryKey = new options.model().__primaryKey;
        this.userKey = options.userKey || "_id";
        for (const field of [this.primaryKey, this.userKey, options.ownerField, options.membersField,
            ...(options.userConditions || []).map(condition => condition.field),
            ...(options.resourceConditions || []).map(condition => condition.field)]) {
            if (field !== undefined && !/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/.test(field)) throw new Error("Invalid resource access field.");
        }
        if (options.ownerField && options.ownerField === options.membersField) throw new Error("Owner and membership fields must be separate.");
    }

    filter(user: Model, grants: AuthResourceGrants): Record<string, any> {
        const deny = { [this.primaryKey]: { $in: [] } };
        if (!(user instanceof Model)) return deny;
        const userId = user[this.userKey];
        if (userId === null || userId === undefined || userId === "") return deny;
        if (!(this.options.userConditions || []).every(condition => condition.operator === "="
            ? user[condition.field] === condition.value : user[condition.field] !== condition.value)) return deny;

        const alternatives: Record<string, any>[] = [];
        if (grants.own === true && this.options.ownerField) alternatives.push({ [this.options.ownerField]: { $eq: userId } });
        if (grants.assigned === true && this.options.membersField) alternatives.push({ [this.options.membersField]: { $eq: userId } });
        if (grants.all !== true && !alternatives.length) return deny;

        const conditions: Record<string, any>[] = (this.options.resourceConditions || []).map(condition => ({
            [condition.field]: { [condition.operator === "=" ? "$eq" : "$ne"]: condition.value },
        }));
        if (grants.all !== true) conditions.push({ $or: alternatives });
        return conditions.length ? { $and: conditions } : {};
    }

    /** The returned model is freshly read; missing/invalid IDs never create an unbounded query. */
    async find<TResource extends Model = Model>(user: Model, id: unknown, grants: AuthResourceGrants): Promise<TResource | null> {
        if (id === null || id === undefined || id === "" || !(user instanceof Model)) return null;
        const resourceId = await this.options.model.objectId(id, { noExceptions: true });
        if (resourceId === null || resourceId === undefined) return null;
        return await this.options.model.where("$and", "=", [
            { [this.primaryKey]: { $eq: resourceId } }, this.filter(user, grants),
        ]).first() as TResource | null;
    }
}
