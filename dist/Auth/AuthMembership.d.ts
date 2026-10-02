import { Model } from "../Database/Model";
export type AuthMembershipCondition = {
    field: string;
    operator: "=" | "!=";
    value: unknown;
};
export type AuthMembershipBinding = {
    user: {
        foreignKey: string;
        localKeys: readonly string[];
        firstAvailable?: boolean;
    };
    resource: {
        foreignKey: string;
        localKeys: readonly string[];
    };
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
export declare class AuthMembership {
    private readonly options;
    constructor(options: AuthMembershipOptions);
    private matches;
    matchesEnvironment(resource: Model, environment: string | null): boolean;
    find<TMembership extends Model = Model>(user: Model, resource: Model): Promise<TMembership | null>;
}
