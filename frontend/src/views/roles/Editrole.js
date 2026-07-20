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
    fetchScreens,
    updateRole
} from "../../store/slices/rolesSlice";

export default function EditRole() {
    const router = useRouter();
    const dispatch = useDispatch();
    const { id } = router.query;

    const { currentRole, screens } = useSelector((state) => state.roles);

    const [usersCount, setUsersCount] = useState(0);
    const [roleName, setRoleName] = useState("");
    const [description, setDescription] = useState("");
    const [selectedScreens, setSelectedScreens] = useState([]);
    const [roleUpdatedAt, setRoleUpdatedAt] = useState("");
    const [roleAccess, setRoleAccess] = useState(null);

    const normalizeLookup = (value) =>
        String(value || "")
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "");

    // The ONLY source for which screens are checked: the role's actual saved
    // access, as returned by the backend's accessible-screens endpoint
    // (shape: { access: [{ department_id, department_name, screens: [{id,name}] }] }).
    // Previously this also merged in the roles LIST row and a sessionStorage
    // "editRoleDraft" — neither carries real per-role screen data, so on any
    // role missing/late data from either source, whatever they DID contain
    // (e.g. leftover from a differently-edited role) could end up ticked
    // instead. Resolving from roleAccess alone means the panel only ever
    // shows exactly what was actually submitted for THIS role.
    const resolveScreenIds = (access, availableScreens = []) => {
        const available = Array.isArray(availableScreens) ? availableScreens : [];
        const departments = Array.isArray(access) ? access : [];

        const refs = departments.flatMap((department) =>
            Array.isArray(department?.screens) ? department.screens : []
        );

        return refs
            .map((screen) => {
                const explicitId = screen?.id;
                if (explicitId !== null && explicitId !== undefined && available.some((item) => String(item.id) === String(explicitId))) {
                    return explicitId;
                }

                const screenKey = normalizeLookup(screen?.name ?? explicitId);
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

    const toApiScreenId = (screenId) => {
        const numericId = Number(screenId);
        return Number.isNaN(numericId) ? screenId : numericId;
    };

    useEffect(() => {
        if (!id) return;
        // Reset immediately (not just on the eventual response) so this role's
        // panel never briefly — or, on a slow/out-of-order response, permanently
        // — shows a previously-edited role's screen selections.
        let cancelled = false;
        setRoleAccess(null);
        setSelectedScreens([]);

        dispatch(fetchRoleById(id));
        dispatch(fetchScreens());

        getAccessibleScreensByRole(id)
            .then((payload) => {
                if (!cancelled) setRoleAccess(payload);
            })
            .catch(() => {
                if (!cancelled) setRoleAccess(null);
            });

        return () => {
            cancelled = true;
        };
    }, [id, dispatch]);

    // Split from the role-detail effect below on purpose: this is the ONLY
    // thing that drives the checkbox panel, and it must never be gated on
    // fetchRoleById (a separate, auth-token-gated request) succeeding. If
    // that request is merely slow — or fails outright — the accessible-
    // screens data (which loaded fine) must still populate the panel instead
    // of silently leaving it stuck on the empty reset from the effect above.
    useEffect(() => {
        const access = roleAccess?.access || roleAccess?.data?.access || null;
        if (!access) return;
        setSelectedScreens(resolveScreenIds(access, screens));
    }, [roleAccess, screens]);

    useEffect(() => {
        const detailRole = getRoleRecord(currentRole);
        if (!detailRole) return;

        setRoleName(detailRole?.role_name || detailRole?.name || "");
        setDescription(detailRole?.description ?? "");
        setRoleUpdatedAt(detailRole?.updated_at || detailRole?.updatedAt || "");
        setUsersCount(detailRole?.users_count ?? detailRole?.usersCount ?? detailRole?.users ?? 0);
    }, [currentRole, id]);

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
