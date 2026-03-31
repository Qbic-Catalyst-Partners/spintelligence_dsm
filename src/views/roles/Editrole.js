"use client";

import styles from "../../styles/editrole.module.css";
import { IoArrowBack } from "react-icons/io5";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { useDispatch, useSelector } from "react-redux";
import { RiIdCardFill } from "react-icons/ri";

import {
    fetchRoleById,
    fetchScreens,
    fetchDepartments,
    updateRole
} from "../../store/slices/rolesSlice";

export default function EditRole() {
    const router = useRouter();
    const params = useParams();
    const dispatch = useDispatch();
    const id = params?.id;

    const { currentRole, screens, departments, loading, error } = useSelector(state => state.roles);

    const [usersCount, setUsersCount] = useState(0);
    const [roleName, setRoleName] = useState("");
    const [description, setDescription] = useState("");
    const [selectedScreens, setSelectedScreens] = useState([]);
    const [selectedDepartments, setSelectedDepartments] = useState([]);
    const [roleUpdatedAt, setRoleUpdatedAt] = useState("");

    /* ================= FETCH ROLE ================= */
    useEffect(() => {
        if (!id) return;
        dispatch(fetchRoleById(id));
        dispatch(fetchScreens());
        dispatch(fetchDepartments());
    }, [id, dispatch]);

    /* ================= PREFILL ================= */
    useEffect(() => {
        if (currentRole) {
            setRoleName(currentRole.name || "");
            setDescription(currentRole.description || "");
            setSelectedScreens(currentRole.screen_ids || []);
            setSelectedDepartments(currentRole.department_ids || []);
            setRoleUpdatedAt(currentRole.updated_at || "");
            setUsersCount(currentRole.users_count || 0);
        }
    }, [currentRole]);

    /* ================= UPDATE ================= */
    const handleUpdateRole = async () => {
        try {
            const payload = {
                name: roleName,
                description,
                status: true,
                department_ids: [...new Set(selectedDepartments)],
                screen_ids: [...new Set(selectedScreens)],
            };

            await dispatch(updateRole({ id, payload })).unwrap();

            alert("Role updated successfully");
            router.push("/rolespermission");
        } catch (error) {
            alert(error.message || "Update failed");
        }
    };

    return (
        <div className={styles["edit-page-container"]}>
            {/* CONTENT */}
            <div className={styles["edit-content-wrapper"]}>
                <div className={styles["edit-last-modified"]}>
                    Last modified:{" "}
                    {roleUpdatedAt
                        ? new Date(roleUpdatedAt).toLocaleString()
                        : "-"}
                </div>

                {/* GENERAL */}
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

                {/* SCREEN ACCESS */}
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
                                                selectedScreens.filter((id) => id !== screen.id)
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

                {/* DEPARTMENTS */}
                <div className={styles["edit-card-box"]}>
                    <div className={styles["edit-card-header"]}>
                        <img src="/Dept.png" alt="dept" />
                        Department Access
                    </div>

                    <div className={styles["edit-dept-selector"]}>
                        {departments.map((dept) => (
                            <label key={dept.id} className={styles["edit-tag"]}>
                                <input
                                    type="checkbox"
                                    className={styles["checkbox"]}
                                    checked={selectedDepartments.includes(dept.id)}
                                    onChange={() => {
                                        if (selectedDepartments.includes(dept.id)) {
                                            setSelectedDepartments(
                                                selectedDepartments.filter((id) => id !== dept.id)
                                            );
                                        } else {
                                            setSelectedDepartments([
                                                ...selectedDepartments,
                                                dept.id,
                                            ]);
                                        }
                                    }}
                                />
                                {dept.name}
                            </label>
                        ))}
                    </div>
                </div>
            </div>

            {/* SMALL FOOTER */}
            <div className={styles["edit-small-footer"]}>
                <div className={styles["edit-small-footer-sp"]}>Change to this role will affect :</div>

                <span className={styles["edit-small-footer-highlight"]}>
                    {usersCount} users
                </span>
            </div>

            {/* FOOTER */}
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
