import { Constructor } from "./AuthTypes";
export interface UserPermissionsMethods {
    can(permission: string): boolean;
    canAny(permissions: string[]): boolean;
    canAll(permissions: string[]): boolean;
}
export declare function UserPermissions<TBase extends Constructor>(Base: TBase): {
    new (...args: any[]): {
        can(permission: string): boolean;
        canAny(permissions: string[]): boolean;
        canAll(permissions: string[]): boolean;
    };
} & TBase;
