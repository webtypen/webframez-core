import { Constructor } from "./AuthTypes";

type PermissionMap = Record<string, unknown>;

type PermissionState = {
    permissions?: unknown;
    roles?: unknown;
    is_admin?: boolean;
    admin?: boolean;
    super_admin?: boolean;
};

export interface UserPermissionsMethods {
    can(permission: string): boolean;
    canAny(permissions: string[]): boolean;
    canAll(permissions: string[]): boolean;
}

function normalizePermissionList(value: unknown): string[] {
    if (!value) {
        return [];
    }

    if (typeof value === "string") {
        return [value];
    }

    if (Array.isArray(value)) {
        return value.flatMap((item) => normalizePermissionList(item));
    }

    if (value instanceof Set) {
        return normalizePermissionList(Array.from(value));
    }

    if (typeof value === "object") {
        return Object.entries(value as PermissionMap)
            .filter(([, enabled]) => Boolean(enabled))
            .map(([permission]) => permission);
    }

    return [];
}

function matchesPermission(availablePermission: string, requestedPermission: string) {
    if (availablePermission === "*" || availablePermission === requestedPermission) {
        return true;
    }

    if (!availablePermission.endsWith(".*")) {
        return false;
    }

    return requestedPermission.startsWith(availablePermission.slice(0, -1));
}

function hasFullAccess(target: PermissionState) {
    return Boolean(target.super_admin || target.is_admin || target.admin);
}

function getPermissions(target: PermissionState) {
    return [...normalizePermissionList(target.permissions), ...normalizePermissionList(target.roles)];
}

export function UserPermissions<TBase extends Constructor>(Base: TBase) {
    return class extends Base implements UserPermissionsMethods {
        can(permission: string) {
            const target = this as PermissionState;

            if (hasFullAccess(target)) {
                return true;
            }

            return getPermissions(target).some((availablePermission) =>
                matchesPermission(availablePermission, permission)
            );
        }

        canAny(permissions: string[]) {
            return permissions.some((permission) => this.can(permission));
        }

        canAll(permissions: string[]) {
            return permissions.every((permission) => this.can(permission));
        }
    };
}

