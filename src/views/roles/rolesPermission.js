"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { useDispatch, useSelector } from "react-redux";
import styles from "../../styles/rolesPermission.module.css";

import { IoMdSearch, IoMdLock } from "react-icons/io";
import { MdAdd } from "react-icons/md";
import { FaIdCard, FaExclamationTriangle } from "react-icons/fa";
import { FaIdCardClip } from "react-icons/fa6";
import { BsExclamationCircle } from "react-icons/bs";
import { FiX } from "react-icons/fi";
import { updateRoleAPI } from "../../apis/rolesPermission";
import { fetchRoles, deleteRole } from "../../store/slices/rolesSlice";

export default function RolesPermissions() {
    const router = useRouter();
    const dispatch = useDispatch();

    const { roles: rolesData, loading, error } = useSelector(state => state.roles);

    const [searchTerm, setSearchTerm] = useState("");
    const [selectedRoleFilter, setSelectedRoleFilter] = useState("");
    const [selectedStatus, setSelectedStatus] = useState("");
    const [activeRow, setActiveRow] = useState(null);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [selectedRole, setSelectedRole] = useState(null);

    const ITEMS_PER_PAGE = 5;
    const [currentPage, setCurrentPage] = useState(1);

    // FETCH ROLES
    useEffect(() => {
        dispatch(fetchRoles({ page: 1, limit: 100 }));
    }, [dispatch]);

    // Transform roles data
    const transformedRolesData = rolesData.map((role) => ({
        ...role,
        status: typeof role.status === "boolean" ? (role.status ? "Active" : "Inactive") : role.status,
        screen_count: role.screen_count ?? "0/0",
    }));
    const roleFilterOptions = Array.from(
        new Set(
            transformedRolesData
                .map((role) => role.role_name || role.name || "")
                .filter(Boolean)
        )
    );
    const activeRolesCount = transformedRolesData.filter(
        (role) => String(role.status || "").toLowerCase() === "active"
    ).length;
    const inactiveRolesCount = transformedRolesData.filter(
        (role) => String(role.status || "").toLowerCase() === "inactive"
    ).length;

    // FILTER
    const filteredRoles = transformedRolesData.filter((role) => {
        const name = role.role_name || role.name || "";
        const matchesSearch =
            name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            role.description?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus =
            selectedStatus === "" || role.status.toLowerCase() === selectedStatus.toLowerCase();
        const matchesRole =
            selectedRoleFilter === "" || name.toLowerCase() === selectedRoleFilter.toLowerCase();
        return matchesSearch && matchesStatus && matchesRole;
    });

    // PAGINATION
    const totalPages = Math.ceil(filteredRoles.length / ITEMS_PER_PAGE);
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const currentRoles = filteredRoles.slice(startIndex, startIndex + ITEMS_PER_PAGE);

    // CLEAR FILTERS
    const handleClearFilters = () => {
        setSearchTerm("");
        setSelectedRoleFilter("");
        setSelectedStatus("");
    };

    const toggleRoleStatus = async (role) => {
        try {
            if (!role || !role.id) {
                console.error("Missing role ID", role);
                return;
            }

            // ✅ handle both string + boolean safely
            const currentStatus =
                typeof role.status === "string"
                    ? role.status.toLowerCase() === "active"
                    : Boolean(role.status);

            const newStatus = !currentStatus;

            setActiveRow(null);
            await updateRoleAPI(role.id, { status: newStatus });
            dispatch(fetchRoles({ page: 1, limit: 100 }));

        } catch (err) {
            console.error("Error updating status", err);
            alert(err?.message || "Unable to update role status");
        }
    };

    // DELETE HANDLERS
    const handleDeleteClick = (role) => {
        setSelectedRole(role);
        setShowDeleteModal(true);
        setActiveRow(null);
    };

    const handleConfirmDelete = async () => {
        try {
            await dispatch(deleteRole(selectedRole.id)).unwrap();
            setShowDeleteModal(false);
            setSelectedRole(null);
        } catch (error) {
            alert("Unable to delete role");
        }
    };


    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, selectedStatus, selectedRoleFilter]);

    useEffect(() => {
        const closeMenu = () => setActiveRow(null);
        window.addEventListener("click", closeMenu);
        return () => window.removeEventListener("click", closeMenu);
    }, []);

    if (loading) return <p>Loading roles...</p>;
    if (error) return <p>{error}</p>;

    return (
        <>
            {/* PAGE */}
            <div className={styles["roles-page"]}>
                {/* HEADER */}
                <div className={styles["page-header"]}>
                    <div>
                        <h1>Roles & Permissions</h1>
                        <p>Define and manage access levels</p>
                    </div>
                    <button className={styles["Btn-primary"]} onClick={() => router.push("/Createrole")}>
                        <MdAdd /> Create Role
                    </button>
                </div>

                {/* STATS */}
                <div className={styles.stats}>
                    <div className={styles["stat-card"]}>
                        <div className={`${styles["stat-icon"]} ${styles.blue}`}>
                            <FaIdCard />
                        </div>
                        <div>
                            <p>TOTAL ROLES</p>
                            <h3>{rolesData.length}</h3>
                        </div>
                    </div>

                    <div className={styles["stat-card"]}>
                        <div className={`${styles["stat-icon"]} ${styles.green}`}>
                            <FaIdCardClip />
                        </div>
                        <div>
                            <p>ASSIGNED USERS</p>
                            <h3>{rolesData.reduce((sum, r) => sum + Number(r.users ?? 0), 0)}</h3>
                        </div>
                    </div>

                    <div className={styles["stat-card"]}>
                        <div className={`${styles["stat-icon"]} ${styles.activeTone}`}>
                            <FaIdCard />
                        </div>
                        <div>
                            <p>ACTIVE ROLES</p>
                            <h3>{activeRolesCount}</h3>
                        </div>
                    </div>

                    <div className={styles["stat-card"]}>
                        <div className={`${styles["stat-icon"]} ${styles.inactiveTone}`}>
                            <IoMdLock />
                        </div>
                        <div>
                            <p>INACTIVE ROLES</p>
                            <h3>{inactiveRolesCount}</h3>
                        </div>
                    </div>
                </div>

                {/* FILTER BAR */}
                <div className={styles["Filter-bar"]}>
                    <div className={styles["Search-box"]}>
                        <IoMdSearch className={styles["search-icon"]} />
                        <input
                            placeholder="Search roles..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    <div className={styles["filter-right"]}>
                        <select value={selectedRoleFilter} onChange={(e) => setSelectedRoleFilter(e.target.value)}>
                            <option value="">Role</option>
                            {roleFilterOptions.map((roleName) => (
                                <option key={roleName} value={roleName}>{roleName}</option>
                            ))}
                        </select>
                        <select value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)}>
                            <option value="">Status</option>
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                        </select>
                        <button
                            className={styles["clear-Btn"]} onClick={handleClearFilters}>
                            <FiX className={styles["clearSvgIcon"]} />
                            Clear
                        </button>
                    </div>
                </div>

                {/* TABLE */}
                <div className={styles["table-card"]}>
                    <table className={styles["roles-table"]}>
                        <thead>
                            <tr>
                                <th>ROLE NAME</th>
                                <th>DESCRIPTION</th>
                                <th>SCREEN COUNT</th>
                                <th>STATUS</th>
                                <th>USERS</th>
                                <th>ACTIONS</th>
                            </tr>
                        </thead>

                        <tbody>
                            {currentRoles.map((role, i) => (
                                <tr key={i}>
                                    <td className={styles["role-name"]}>{role.role_name}</td>

                                    <td className={styles.desc}>{role.description || "-"}</td>

                                    <td>
                                        <span className={styles["screen-pill"]}>{role.screen_count}</span>
                                    </td>

                                    {/* ✅ STATUS BADGE */}
                                    <td>
                                        <span
                                            className={`${styles.status} ${role.status.toLowerCase() === "active"
                                                ? styles.active
                                                : styles.inactive
                                                }`}
                                        >
                                            {role.status}
                                        </span>
                                    </td>

                                    {/* ✅ USERS */}
                                    <td className={styles.users}>{role.users ?? 0}</td>

                                    {/* ✅ ACTION */}
                                    <td className={styles.action}>
                                        <div className={styles["action-wrapper"]}>
                                            <span
                                                className={styles["action-dot"]}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setActiveRow(activeRow === i ? null : i);
                                                }}
                                            >
                                                ⋮
                                            </span>

                                            {activeRow === i && (
                                                <div className={styles["action-menu"]}>
                                                    <div
                                                        className={styles["menu-item"]}
                                                        onClick={() => router.push(`/editrole/${role.id}`)}
                                                    >
                                                        Edit
                                                    </div>

                                                    <div
                                                        className={styles["menu-item"]}
                                                        onClick={() => toggleRoleStatus (role)}
                                                    >
                                                        {role.status.toLowerCase() === "active"
                                                            ? "Inactive"
                                                            : "Active"}
                                                    </div>

                                                    <div
                                                        className={`${styles["menu-item"]} ${styles.danger}`}
                                                        onClick={() => handleDeleteClick(role)}
                                                    >
                                                        Delete
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <div className={styles["table-footer"]}>
                        {/* LEFT TEXT */}
                        <div className={styles["footer-left"]}>
                            Showing {startIndex + 1} to{" "}
                            {Math.min(startIndex + ITEMS_PER_PAGE, filteredRoles.length)} of{" "}
                            {filteredRoles.length} roles
                        </div>

                        {/* RIGHT PAGINATION */}
                        <div className={styles.pagination}>
                            <button
                                disabled={currentPage === 1}
                                onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                            >
                                ‹
                            </button>

                            {[...Array(totalPages)].map((_, i) => (
                                <button
                                    key={i}
                                    className={currentPage === i + 1 ? styles.activePage : ""}
                                    onClick={() => setCurrentPage(i + 1)}
                                >
                                    {i + 1}
                                </button>
                            ))}

                            <button
                                disabled={currentPage === totalPages}
                                onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                            >
                                ›
                            </button>
                        </div>
                    </div>
                </div>

            </div>

            {/* DELETE MODAL */}
            {showDeleteModal && selectedRole && (
                <div
                    className={styles["delete-overlay"]}
                    onClick={() => setShowDeleteModal(false)}
                >
                    <div
                        className={styles["delete-modal"]}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* ICON */}
                        <div className={styles["delete-icon-wrapper"]}>
                            <FaExclamationTriangle className={styles["delete-icon"]} />
                        </div>

                        {/* TEXT */}
                        <p className={styles["delete-title"]}>
                            Are you sure you want to delete the{" "}
                            <strong>{selectedRole.role_name}</strong> role?
                        </p>

                        <p className={styles["delete-subtext"]}>
                            This action is permanent and cannot be undone.
                        </p>

                        {/* WARNING BOX */}
                        <div className={styles["delete-warning-box"]}>
                            <BsExclamationCircle className={styles["exc"]} />
                            <strong>Action Blocked: There are {selectedRole.users} users
                                currently assigned to this role.</strong>
                            <br />
                            <span>
                                You must reassign these users to a different role
                                before this role can be deleted.
                            </span>
                        </div>

                        {/* ACTIONS */}
                        <div className={styles["delete-actions"]}>
                            <button
                                className={styles["delete-cancel-btn"]}
                                onClick={() => setShowDeleteModal(false)}
                            >
                                Cancel
                            </button>

                            <button
                                className={styles["delete-confirm-btn"]}
                                onClick={handleConfirmDelete}
                            >
                                <IoMdLock /> Delete Role
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
