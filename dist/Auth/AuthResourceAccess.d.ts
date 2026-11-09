import { Model } from "../Database/Model";
import { AuthMembershipCondition } from "./AuthMembership";
export type AuthResourceGrants = {
    all?: boolean;
    own?: boolean;
    assigned?: boolean;
};
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
export declare class AuthResourceAccess {
    private readonly options;
    private readonly primaryKey;
    private readonly userKey;
    constructor(options: AuthResourceAccessOptions);
    filter(user: Model, grants: AuthResourceGrants): Record<string, any>;
    /** The returned model is freshly read; missing/invalid IDs never create an unbounded query. */
    find<TResource extends Model = Model>(user: Model, id: unknown, grants: AuthResourceGrants): Promise<TResource | null>;
}
