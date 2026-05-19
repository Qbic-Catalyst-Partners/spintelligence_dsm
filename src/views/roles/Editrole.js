"use client";

import styles from "../../styles/editrole.module.css";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useDispatch, useSelector } from "react-redux";
import { RiIdCardFill } from "react-icons/ri";

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

    useEffect(() => {
        if (!id) return;
        dispatch(fetchRoleById(id));
        dispatch(fetchScreens());
    }, [id, dispatch]);

    useEffect(() => {
        if (currentRole) {
            setRoleName(currentRole.name || "");
            setDescription(currentRole.description || "");
            setSelectedScreens(currentRole.screen_ids || []);
            setRoleUpdatedAt(currentRole.updated_at || "");
            setUsersCount(currentRole.users_count || 0);
        }
    }, [currentRole]);

    const handleUpdateRole = async () => {
        try {
            const payload = {
                name: roleName,
                description,
                status: true,
                screen_ids: [...new Set(selectedScreens)],
            };

            await dispatch(updateRole({ id, payload })).unwrap();
            router.push("/rolespermission");
        } catch (error) {
            alert(error.message || "Update failed");
        }
    };

    return (
        <div className={styles["edit-page-container"]}>
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

                    <div className={styles["edit-module-grid"]}>
                        {screens.map((screen) => (
                            <label
                                key={screen.id}
                                className={`${styles["edit-module-item"]} ${selectedScreens.includes(screen.id)
                                    ? styles["active-module"]
                                    : ""
                                    }`}
                            >
                                <input
                                    type="checkbox"
                                    checked={selectedScreens.includes(screen.id)}
                                    onChange={() => {
                                        if (selectedScreens.includes(screen.id)) {
                                            setSelectedScreens(
                                                selectedScreens.filter((screenId) => screenId !== screen.id)
                                            );
                                        } else {
                                            setSelectedScreens([...selectedScreens, screen.id]);
                                        }
                                    }}
                                />
                                {screen.name}
                            </label>
                        ))}
                    </div>
                </div>
            </div>

            <div className={styles["edit-small-footer"]}>
                <div className={styles["edit-small-footer-sp"]}>Change to this role will affect :</div>

                <span className={styles["edit-small-footer-highlight"]}>
                    {usersCount} users
                </span>
            </div>

            <div className={styles["edit-footer-bar"]}>
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
