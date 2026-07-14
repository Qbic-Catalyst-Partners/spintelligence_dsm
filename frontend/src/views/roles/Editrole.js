"use client";

import styles from "../../styles/editrole.module.css";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useDispatch, useSelector } from "react-redux";
import { RiIdCardFill } from "react-icons/ri";
import { getAccessibleScreensByRole } from "@/apis/login";
import ScreenAccessPanel, { isUnregisteredScreenId } from "@/components/ScreenAccessPanel";

import {
    fetchRoleById,
    fetchRoles,
    fetchScreens,
    updateRole
} from "../../store/slices/rolesSlice";

export default function EditRole() {
    const router = useRouter();
    const dispatch = useDispatch();
    const { id } = router.query;

    const { currentRole, screens, roles } = useSelector((state) => state.roles);

    const [usersCount, setUsersCount] = useState(0);
    const [roleName, setRoleName] = useState("");
    const [description, setDescription] = useState("");
    const [selectedScreens, setSelectedScreens] = useState([]);
    const [roleUpdatedAt, setRoleUpdatedAt] = useState("");
    const [draftRole, setDraftRole] = useState(null);
    const [roleAccess, setRoleAccess] = useState(null);

    const normalizeLookup = (value) =>
        String(value || "")
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "");

    const collectScreenRefs = (value) => {
        if (!value) return [];
        if (Array.isArray(value)) return value.flatMap(collectScreenRefs);

        if (typeof value === "string" || typeof value === "number") {
            return [{ id: value, name: value }];
        }

        if (typeof value !== "object") return [];

        const mapRefs = Object.entries(value)
            .filter(([, entryValue]) => entryValue === true || entryValue === "true" || entryValue === 1 || Array.isArray(entryValue))
            .flatMap(([entryKey, entryValue]) =>
                Array.isArray(entryValue) ? collectScreenRefs(entryValue) : [{ name: entryKey }]
            );

        const directRef = {
            id: value.id ?? value.screen_id ?? value.screenId ?? value.screen?.id ?? value.screen?.screen_id,
            name:
                value.name ??
                value.screen_name ??
                value.screenName ??
                value.screen?.name ??
                value.screen?.screen_name,
        };

        return [
            directRef,
            ...mapRefs,
            ...collectScreenRefs(value.screens),
            ...collectScreenRefs(value.accessibleScreens),
            ...collectScreenRefs(value.accessible_screens),
            ...collectScreenRefs(value.screen_names),
            ...collectScreenRefs(value.screenNames),
            ...collectScreenRefs(value.permissions),
            ...collectScreenRefs(value.screen_access),
            ...collectScreenRefs(value.access),
        ];
    };

    const resolveScreenIds = (role, availableScreens = []) => {
        const source =
            role?.screen_ids ||
            role?.screenIds ||
            role?.screens ||
            role?.screen_names ||
            role?.screenNames ||
            role?.permissions ||
            role?.screen_access ||
            role?.access ||
            [];

        const refs = collectScreenRefs(source);
        const available = Array.isArray(availableScreens) ? availableScreens : [];

        return refs
            .map((screen) => {
                const explicitId = screen.id;
                if (explicitId !== null && explicitId !== undefined && available.some((item) => String(item.id) === String(explicitId))) {
                    return explicitId;
                }

                const screenKey = normalizeLookup(screen.name || explicitId);
                const matched = available.find(
                    (item) => normalizeLookup(item.name) === screenKey || normalizeLookup(item.screen_name) === screenKey
                );
                return matched?.id ?? explicitId;
            })
            .filter((screenId) => screenId !== null && screenId !== undefined)
            .map(String)
            .filter((screenId, index, list) => list.indexOf(screenId) === index);
    };

    const getRoleRecord = (payload) => {
        if (Array.isArray(payload)) return payload[0] || null;
        return payload?.role || payload?.data?.role || payload?.data || payload;
    };

    const getRoleId = (role) => role?.id ?? role?.role_id ?? role?.roleId;

    const findLoadedRole = () =>
        (Array.isArray(roles) ? roles : []).find((role) => String(getRoleId(role)) === String(id)) || null;

    const hasScreenAccess = (role) =>
        Boolean(
            role?.screen_ids?.length ||
            role?.screenIds?.length ||
            role?.screens?.length ||
            role?.accessibleScreens?.length ||
            role?.accessible_screens?.length ||
            role?.screen_names?.length ||
            role?.screenNames?.length ||
            role?.permissions?.length ||
            role?.screen_access?.length ||
            role?.access?.length ||
            (role?.permissions && typeof role.permissions === "object" && Object.keys(role.permissions).length) ||
            (role?.screen_access && typeof role.screen_access === "object" && Object.keys(role.screen_access).length) ||
            (role?.access && typeof role.access === "object" && Object.keys(role.access).length)
        );

    useEffect(() => {
        if (!id || typeof window === "undefined") return;
        try {
            const stored = JSON.parse(window.sessionStorage.getItem("editRoleDraft") || "null");
            if (stored && String(getRoleId(stored)) === String(id)) {
                setDraftRole(stored);
            }
        } catch {
            setDraftRole(null);
        }
    }, [id]);

    const toApiScreenId = (screenId) => {
        const numericId = Number(screenId);
        return Number.isNaN(numericId) ? screenId : numericId;
    };

    useEffect(() => {
        if (!id) return;
        dispatch(fetchRoleById(id));
        dispatch(fetchRoles({ page: 1, limit: 100 }));
        dispatch(fetchScreens());

        getAccessibleScreensByRole(id)
            .then((payload) => setRoleAccess(payload))
            .catch(() => setRoleAccess(null));
    }, [id, dispatch]);

    useEffect(() => {
        const detailRole = getRoleRecord(currentRole);
        const listRole = findLoadedRole();
        const role = detailRole || listRole || draftRole;
        const accessRole = roleAccess
            ? {
                access: roleAccess?.access || roleAccess?.data?.access || roleAccess,
                accessibleScreens: roleAccess?.accessibleScreens || roleAccess?.accessible_screens || roleAccess?.data?.accessibleScreens || roleAccess?.data?.accessible_screens,
            }
            : null;
        const screenRole = [accessRole, detailRole, listRole, draftRole].find(hasScreenAccess) || role;
        if (role) {
            setRoleName(detailRole?.role_name || detailRole?.name || listRole?.role_name || listRole?.name || draftRole?.role_name || draftRole?.name || "");
            setDescription(detailRole?.description ?? listRole?.description ?? draftRole?.description ?? "");
            setSelectedScreens(resolveScreenIds(screenRole, screens));
            setRoleUpdatedAt(detailRole?.updated_at || detailRole?.updatedAt || listRole?.updated_at || listRole?.updatedAt || draftRole?.updated_at || draftRole?.updatedAt || "");
            setUsersCount(detailRole?.users_count ?? detailRole?.usersCount ?? detailRole?.users ?? listRole?.users_count ?? listRole?.usersCount ?? listRole?.users ?? draftRole?.users_count ?? draftRole?.usersCount ?? draftRole?.users ?? 0);
        }
    }, [currentRole, screens, roles, id, draftRole, roleAccess]);

    const handleUpdateRole = async () => {
        try {
            const screenIds = [...new Set(selectedScreens)]
                .filter((screenId) => !isUnregisteredScreenId(screenId))
                .map(toApiScreenId);

            // Derive departments from the selected screens' backend department_id.
            const selectedSet = new Set(screenIds.map(String));
            const departmentIds = [
                ...new Set(
                    screens
                        .filter((screen) => selectedSet.has(String(screen.id)))
                        .map((screen) => screen.department_id)
                        .filter((deptId) => deptId != null)
                ),
            ];

            const payload = {
                name: roleName,
                description,
                status: true,
                screen_ids: screenIds,
                department_ids: departmentIds,
            };

            await dispatch(updateRole({ id, payload })).unwrap();
            router.push("/rolespermission");
        } catch (error) {
            alert(error.message || "Update failed");
        }
    };

    return (
        <div className={styles["edit-page-container"]}>
            <button
                type="button"
                className={styles["pageBackBtn"]}
                onClick={() => {
                    if (window.history.length > 1) router.back();
                    else router.push("/rolespermission");
                }}
            >
                ← Back
            </button>
            <div className={styles["edit-content-wrapper"]}>
                <div className={styles["edit-last-modified"]}>
                    Last modified:{" "}
                    {roleUpdatedAt
                        ? new Date(roleUpdatedAt).toLocaleString()
                        : "-"}
                </div>

                <div className={styles["edit-card-box"]}>
                    <div className={styles["edit-card-header"]}>
                        <RiIdCardFill className={styles["edit-header-icon"]} />
                        General Information
                    </div>

                    <div className={styles["edit-form-layout"]}>
                        <div className={styles["edit-input-group"]}>
                            <label>Role Name</label>
                            <input
                                value={roleName}
                                onChange={(e) => setRoleName(e.target.value)}
                                className={styles["edit-text-input"]}
                            />
                        </div>

                        <div className={`${styles["edit-input-group"]} ${styles["full-width"]}`}>
                            <label>Description</label>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                className={styles["edit-textarea"]}
                            />
                        </div>
                    </div>
                </div>

                <div className={styles["edit-card-box"]}>
                    <div className={styles["edit-card-header"]}>
                        <img src="/Screen.png" alt="screen" />
                        Screen Access
                    </div>

                    <ScreenAccessPanel
                        screens={screens}
                        selectedScreenIds={selectedScreens}
                        onChange={setSelectedScreens}
                    />
                </div>
            </div>

            <div className={styles["edit-footer-bar"]}>
                <div className={styles["edit-small-footer"]}>
                    <div className={styles["edit-small-footer-sp"]}>Change to this role will affect :</div>
                    <span className={styles["edit-small-footer-highlight"]}>
                        {usersCount} users
                    </span>
                </div>
                <div className={styles["edit-footer-buttons"]}>
                    <button
                        className={styles["edit-btn-cancel"]}
                        onClick={() => router.push("/rolespermission")}
                    >
                        Cancel
                    </button>

                    <button
                        className={styles["edit-btn-update"]}
                        onClick={handleUpdateRole}
                    >
                        Update Role
                    </button>
                </div>
            </div>
        </div>
    );
}
