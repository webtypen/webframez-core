import { Model } from "../Database/Model";

export type AuthMembershipCondition = { field: string; operator: "=" | "!="; value: unknown };

export type AuthMembershipBinding = {
    user: { foreignKey: string; localKeys: readonly string[]; firstAvailable?: boolean };
    resource: { foreignKey: string; localKeys: readonly string[] };
};

/** Only server-loaded models and server-configured fields participate in authorization. */
export type AuthMembershipOptions = {
    model: typeof Model;
    bindings: readonly AuthMembershipBinding[];
    /** Optionally bind this membership to the environment selected by a federated session. */
    sessionEnvironmentKey?: string;
    conditions?: readonly AuthMembershipCondition[];
    userConditions?: readonly AuthMembershipCondition[];
    resourceConditions?: readonly AuthMembershipCondition[];
};

export type AuthMembershipContext<TMembership extends Model = Model, TResource extends Model = Model> = {
    membership: TMembership;
    resource: TResource;
};

/** Resolves fresh membership records without caching authorization between requests. */
export class AuthMembership {
    constructor(private readonly options: AuthMembershipOptions) {
        if (!options.model || !options.bindings?.length) throw new Error("Auth membership requires a model and bindings.");
        for (const binding of options.bindings) {
            if (!binding.user.foreignKey || !binding.resource.foreignKey
                || !binding.user.localKeys.length || !binding.resource.localKeys.length) {
                throw new Error("Auth membership requires user and resource reference fields.");
            }
        }
    }

    private matches(model: Model, conditions: readonly AuthMembershipCondition[] = []): boolean {
        return conditions.every(condition => condition.operator === "="
            ? model[condition.field] === condition.value : model[condition.field] !== condition.value);
    }

    matchesEnvironment(resource: Model, environment: string | null): boolean {
        const key = this.options.sessionEnvironmentKey;
        return !environment || !key || String(resource?.[key]) === environment;
    }

    async find<TMembership extends Model = Model>(user: Model, resource: Model): Promise<TMembership | null> {
        if (!(user instanceof Model) || !(resource instanceof Model)
            || !this.matches(user, this.options.userConditions) || !this.matches(resource, this.options.resourceConditions)) return null;
        for (const binding of this.options.bindings) {
            let userIds = binding.user.localKeys.map(key => user[key]).filter(value => value !== null && value !== undefined && value !== "");
            if (binding.user.firstAvailable) userIds = userIds.slice(0, 1);
            const resourceIds = binding.resource.localKeys.map(key => resource[key]).filter(value => value !== null && value !== undefined && value !== "");
            // Missing references must never turn into an unbounded membership lookup.
            if (!userIds.length || !resourceIds.length) continue;
            let query = this.options.model.where(binding.user.foreignKey, "=", { $in: userIds })
                .where(binding.resource.foreignKey, "=", { $in: resourceIds });
            for (const condition of this.options.conditions || []) {
                query = query.where(condition.field, condition.operator, condition.value);
            }
            const membership = await query.first();
            if (membership) return membership as TMembership;
        }
        return null;
    }
}
