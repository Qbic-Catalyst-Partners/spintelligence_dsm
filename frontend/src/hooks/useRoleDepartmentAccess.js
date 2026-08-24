import { useEffect, useState } from "react";
import { getAccessibleScreensByRole } from "@/apis/login";
import { fetchRolesAPI } from "@/apis/userApi";
import { hasSubDepartmentAccess, isFullAccessUser } from "@/utils/accessControl";

const normalizeRoleName = (value) => String(value || "").trim().toLowerCase();

// Shared across every hook instance/page mount so distinct roles/role lists
// are only ever fetched once per session, not once per threshold screen.
const roleAccessCache = new Map();
let roleNameToIdCachePromise = null;

const getRoleNameToIdMap = () => {
    if (!roleNameToIdCachePromise) {
        roleNameToIdCachePromise = fetchRolesAPI()
            .then((data) => {
                const roles = Array.isArray(data?.roles) ? data.roles : [];
                const map = new Map();
                roles.forEach((role) => {
                    const key = normalizeRoleName(role?.role_name || role?.name);
                    const id = role?.id;
                    if (key && id !== undefined && id !== null) {
                        map.set(key, String(id));
                    }
                });
                return map;
            })
            .catch(() => new Map());
    }
    return roleNameToIdCachePromise;
};

// `role_id` isn't backfilled on every account (per DATABASE_SCHEMA.md, the
// column is "not DB-enforced"), so a user can have a `role` name but no
// `roleId`. Resolve those via the roles list (name -> id) so filtering still
// works instead of silently failing open for every such account.
const resolveRoleIdKey = async (user) => {
    const roleId = user?.roleId;
    if (roleId !== undefined && roleId !== null && roleId !== "") {
        return String(roleId);
    }

    const roleName = normalizeRoleName(user?.role);
    if (!roleName) return "";

    const roleNameToIdMap = await getRoleNameToIdMap();
    return roleNameToIdMap.get(roleName) || "";
};

const buildMapFromCache = (roleIdKeys) => {
    const nextMap = {};
    roleIdKeys.forEach((roleIdKey) => {
        if (roleAccessCache.has(roleIdKey)) {
            nextMap[roleIdKey] = roleAccessCache.get(roleIdKey);
        }
    });
    return nextMap;
};

// Filters L1-L4 approver dropdowns down to users whose role actually has
// access to the sub-department being configured, reusing the same
// role -> accessible-departments check (hasSubDepartmentAccess) that already
// gates page navigation elsewhere in the app. Full-access users always pass.
// While a role's access is still loading (or a user has no resolvable role
// at all), hasDepartmentAccess fails OPEN (returns true) so dropdowns never
// go empty before the access data resolves.
const useRoleDepartmentAccess = (users) => {
    const [roleAccessMap, setRoleAccessMap] = useState({});
    const [userRoleIdKeys, setUserRoleIdKeys] = useState({});

    useEffect(() => {
        let cancelled = false;
        const userList = Array.isArray(users) ? users : [];

        Promise.all(
            userList.map(async (candidate) => {
                const key = candidate?.id ?? candidate?.employeeId ?? candidate?.name;
                const roleIdKey = await resolveRoleIdKey(candidate);
                return [key, roleIdKey];
            })
        ).then((entries) => {
            if (cancelled) return;

            const nextUserRoleIdKeys = Object.fromEntries(entries);
            setUserRoleIdKeys(nextUserRoleIdKeys);

            const roleIdKeys = Array.from(new Set(entries.map(([, roleIdKey]) => roleIdKey).filter(Boolean)));
            const missingRoleIdKeys = roleIdKeys.filter((roleIdKey) => !roleAccessCache.has(roleIdKey));

            if (!missingRoleIdKeys.length) {
                setRoleAccessMap(buildMapFromCache(roleIdKeys));
                return;
            }

            Promise.all(
                missingRoleIdKeys.map((roleIdKey) =>
                    getAccessibleScreensByRole(roleIdKey)
                        .then((data) => {
                            roleAccessCache.set(roleIdKey, Array.isArray(data?.access) ? data.access : []);
                        })
                        .catch(() => {
                            roleAccessCache.set(roleIdKey, []);
                        })
                )
            ).then(() => {
                if (!cancelled) {
                    setRoleAccessMap(buildMapFromCache(roleIdKeys));
                }
            });
        });

        return () => {
            cancelled = true;
        };
    }, [users]);

    const hasDepartmentAccess = (user, departmentName) => {
        if (isFullAccessUser(user)) return true;
        if (!departmentName) return true;

        const key = user?.id ?? user?.employeeId ?? user?.name;
        const roleIdKey = userRoleIdKeys[key];
        if (!roleIdKey) return true;
        if (!(roleIdKey in roleAccessMap)) return true;

        return hasSubDepartmentAccess(roleAccessMap[roleIdKey], departmentName, user);
    };

    return { hasDepartmentAccess };
};

export default useRoleDepartmentAccess;
