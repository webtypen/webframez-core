"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserPermissions = void 0;
function normalizePermissionList(value) {
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
        return Object.entries(value)
            .filter(([, enabled]) => Boolean(enabled))
            .map(([permission]) => permission);
    }
    return [];
}
function matchesPermission(availablePermission, requestedPermission) {
    if (availablePermission === "*" || availablePermission === requestedPermission) {
        return true;
    }
    if (!availablePermission.endsWith(".*")) {
        return false;
    }
    return requestedPermission.startsWith(availablePermission.slice(0, -1));
}
function hasFullAccess(target) {
    return Boolean(target.super_admin || target.is_admin || target.admin);
}
function getPermissions(target) {
    return [...normalizePermissionList(target.permissions), ...normalizePermissionList(target.roles)];
}
function UserPermissions(Base) {
    return class extends Base {
        can(permission) {
            const target = this;
            if (hasFullAccess(target)) {
                return true;
            }
            return getPermissions(target).some((availablePermission) => matchesPermission(availablePermission, permission));
        }
        canAny(permissions) {
            return permissions.some((permission) => this.can(permission));
        }
        canAll(permissions) {
            return permissions.every((permission) => this.can(permission));
        }
    };
}
exports.UserPermissions = UserPermissions;
