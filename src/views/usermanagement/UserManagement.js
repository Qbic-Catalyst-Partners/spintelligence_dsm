import { useState, useEffect, useRef } from "react";
import styles from "../../styles/UserManagement.module.css";
import { exportUsers } from "../../store/slices/userSlice";
import {
  MdOutlineFileDownload,
  MdOutlineFileUpload,
  MdOutlinePersonAddAlt,
} from "react-icons/md";
import { IoMdSearch } from "react-icons/io";
import { FaTrash } from "react-icons/fa";
import { FiCheckCircle, FiX } from "react-icons/fi";
import { HiMiniChevronDown } from "react-icons/hi2";

import { useRouter } from "next/router";

// REDUX
import { useDispatch, useSelector } from "react-redux";
import {
  fetchUsers,
  fetchRoles,
  fetchDepartments,
} from "../../store/slices/userSlice";

import {
  deleteUserAPI,
  updateStatusAPI,
  bulkUploadUsersAPI,
} from "../../apis/userApi";

export default function UserManagement() {
  const dispatch = useDispatch();
  const router = useRouter();
  const menuRef = useRef(null);

  const {
    users = [],
    roles = [],
    departments = [],
  } = useSelector((state) => state.users || {});
  const handleExport = () => {
    dispatch(exportUsers());
  };

  const [activeRow, setActiveRow] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const [uploadError, setUploadError] = useState(false);

  const [selectedRole, setSelectedRole] = useState("");
  const [selectedDept, setSelectedDept] = useState("");
  const [selectedLevel, setSelectedLevel] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState(null);
  const [page, setPage] = useState(1);
  const [sortConfig, setSortConfig] = useState({
    key: "employeeId",
    direction: "asc",
  });
  const rowsPerPage = 10;

  // FETCH DATA
  useEffect(() => {
    dispatch(fetchUsers());
    dispatch(fetchRoles());
    dispatch(fetchDepartments());
  }, [dispatch]);

  // CLOSE MENU OUTSIDE CLICK
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setActiveRow(null);
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () =>
      document.removeEventListener("click", handleClickOutside);
  }, []);

  // DELETE USER
  const confirmDelete = async () => {
    await deleteUserAPI(selectedUserId);
    dispatch(fetchUsers());
    setShowDeleteModal(false);
    setSelectedUserId(null);
  };

  // STATUS TOGGLE
  const updateUserStatus = async (id, status) => {
    const newStatus = status === "Active" ? "Inactive" : "Active";
    await updateStatusAPI(id, newStatus);
    dispatch(fetchUsers());
  };

  const handleBulkUpload = async (event) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setUploading(true);
    setUploadMessage("");
    setUploadError(false);

    try {
      const response = await bulkUploadUsersAPI(file);
      setUploadMessage(response?.message || "Bulk upload completed successfully.");
      setUploadError(false);
      dispatch(fetchUsers());
    } catch (error) {
      setUploadMessage(error.message || "Bulk upload failed.");
      setUploadError(true);
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  useEffect(() => {
    setPage(1);
  }, [search, selectedRole, selectedDept, selectedLevel, selectedStatus, sortConfig]);

  const handleSort = (key) => {
    setSortConfig((current) => {
      if (current.key === key) {
        return {
          key,
          direction: current.direction === "asc" ? "desc" : "asc",
        };
      }

      return {
        key,
        direction: "asc",
      };
    });
  };

  const getSortArrowClass = (key, direction) => {
    if (sortConfig.key !== key || sortConfig.direction !== direction) {
      return styles.sortArrowMuted;
    }

    if (key === "employeeId" && direction === "desc") {
      return styles.sortArrowRed;
    }

    if (key === "fullName" && direction === "asc") {
      return styles.sortArrowGreen;
    }

    return styles.sortArrowActive;
  };

  // SEARCH + FILTER
  const filteredUsers = users
    .filter((u) => {
      const searchValue = search.toLowerCase();

      return (
        (!selectedRole || u.role === selectedRole) &&
        (!selectedDept || u.dept === selectedDept) &&
        (!selectedLevel || u.level === selectedLevel) &&
        (!selectedStatus || u.status === selectedStatus) &&
        (!search ||
          u.name?.toLowerCase().includes(searchValue) ||
          u.email?.toLowerCase().includes(searchValue) ||
          u.employeeId?.toLowerCase().includes(searchValue))
      );
    })
    .sort((left, right) => {
      const leftValue =
        sortConfig.key === "employeeId"
          ? left.employeeId || ""
          : left.name || "";
      const rightValue =
        sortConfig.key === "employeeId"
          ? right.employeeId || ""
          : right.name || "";

      const result = leftValue.localeCompare(rightValue, undefined, {
        numeric: true,
        sensitivity: "base",
      });

      return sortConfig.direction === "asc" ? result : -result;
    });

  // PAGINATION
  const totalPages = Math.ceil(filteredUsers.length / rowsPerPage);
  const start = (page - 1) * rowsPerPage;
  const pageData = filteredUsers.slice(start, start + rowsPerPage);

  return (
    <div className={styles.container}>
      <div className={styles.wrapper}>
        {/* HEADER */}
        <div className={styles.header}>
          <div>
            <h1>User Management</h1>
            <p>Manage system access, roles and department permissions</p>
          </div>

          <div className={styles.actions}>
            <button
              className={styles.btnOutline}
              onClick={handleExport}
            >
              <MdOutlineFileDownload /> Export
            </button>

            <label className={styles.btnOutline}>
              <MdOutlineFileUpload />
              {uploading ? "Uploading..." : "Bulk Upload"}
              <input
                type="file"
                hidden
                accept=".xlsx,.xls,.csv"
                onChange={handleBulkUpload}
              />
            </label>

            <button
              className={styles.btnPrimary}
              onClick={() => router.push("/umadduser")}
            >
              <MdOutlinePersonAddAlt /> Add User
            </button>
          </div>
        </div>

        {/* FILTER */}
        <div className={styles.filters}>
          <div className={styles.searchBox}>
            <IoMdSearch />
            <input
              placeholder="Search by Name / Emp ID "
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className={styles.inputWrapper}>
            <FiCheckCircle className={styles.filterSvgIcon} />
            <select
              className={styles.inputWithIcon}
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
            >
              <option value="">Status: All</option>
              <option value="Active">Status: Active</option>
              <option value="Inactive">Status: Inactive</option>
              <option value="Locked">Status: Locked</option>
            </select>
            <HiMiniChevronDown className={styles.selectChevron} />
          </div>

          {/* ROLE SELECT */}
          <div className={styles.inputWrapper}>
            <img src="/role.png" className={styles.selectIcon} alt="role icon" />
            <select
              className={styles.inputWithIcon}
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
            >
              <option value="">Role: All</option>
              {roles.map((r) => (
                <option key={r.id}>{r.role_name}</option>
              ))}
            </select>
            <HiMiniChevronDown className={styles.selectChevron} />
          </div>

          {/* DEPARTMENT SELECT */}
          <div className={styles.inputWrapper}>
            <img src="/dept.png" className={styles.selectIcon} alt="department icon" />
            <select
              className={styles.inputWithIcon}
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
            >
              <option value="">Department: All</option>
              {departments.map((d) => (
                <option key={d.id}>{d.name}</option>
              ))}
            </select>
            <HiMiniChevronDown className={styles.selectChevron} />
          </div>

          <div className={styles.inputWrapper}>
            <FiCheckCircle className={styles.filterSvgIcon} />
            <select
              className={styles.inputWithIcon}
              value={selectedLevel}
              onChange={(e) => setSelectedLevel(e.target.value)}
            >
              <option value="">Level: All</option>
              <option value="L1">Level: L1</option>
              <option value="L2">Level: L2</option>
            </select>
            <HiMiniChevronDown className={styles.selectChevron} />
          </div>

          {/* CLEAR BUTTON */}
          <button
            className={styles.clearBtn}
            onClick={() => {
              setSelectedRole("");
              setSelectedDept("");
              setSelectedLevel("");
              setSelectedStatus("");
              setSearch("");
            }}
          >
            <FiX className={styles.clearSvgIcon} />
            Clear
          </button>
        </div>

        {uploadMessage ? (
          <div
            style={{
              marginBottom: "16px",
              padding: "12px 14px",
              borderRadius: "10px",
              fontSize: "14px",
              fontWeight: 500,
              background: uploadError ? "#fef2f2" : "#ecfdf5",
              color: uploadError ? "#b91c1c" : "#166534",
              border: uploadError ? "1px solid #fecaca" : "1px solid #bbf7d0",
            }}
          >
            {uploadMessage}
          </div>
        ) : null}

        {/* TABLE */}
        <table className={styles.table}>
          <thead>
            <tr>
              <th>SR NO</th>
              <th>
                <button
                  type="button"
                  className={styles.sortButton}
                  onClick={() => handleSort("employeeId")}
                >
                  <span>EMP ID</span>
                  <span className={styles.sortArrows}>
                    <span className={`${styles.sortArrow} ${getSortArrowClass("employeeId", "asc")}`}>
                      ▲
                    </span>
                    <span className={`${styles.sortArrow} ${getSortArrowClass("employeeId", "desc")}`}>
                      ▼
                    </span>
                  </span>
                </button>
              </th>
              <th>
                <button
                  type="button"
                  className={styles.sortButton}
                  onClick={() => handleSort("fullName")}
                >
                  <span>FULL NAME</span>
                  <span className={styles.sortArrows}>
                    <span className={`${styles.sortArrow} ${getSortArrowClass("fullName", "asc")}`}>
                      ▲
                    </span>
                    <span className={`${styles.sortArrow} ${getSortArrowClass("fullName", "desc")}`}>
                      ▼
                    </span>
                  </span>
                </button>
              </th>
              <th>CONTACT DETAILS</th>
              <th>ROLE</th>
              <th>LEVEL</th>
              <th>DEPARTMENT</th>
              <th>STATUS</th>
              <th>ACTIONS</th>
            </tr>
          </thead>

          <tbody>
            {pageData.map((u, i) => (
              <tr key={u.id}>
                <td>{start + i + 1}</td>

                <td className={styles.employeeIdCell}>{u.employeeId}</td>

                <td className={styles.bold}>{u.name}</td>

                <td>
                  <div className={styles.contact}>
                    <span>{u.email}</span>
                    <span className={styles.phone}>
                      {u.phone || "+91 98765 43210"}
                    </span>
                  </div>
                </td>

                <td>
                  <span className={`${styles.badge} ${styles.roleBadge}`}>
                    {u.role}
                  </span>
                </td>

                <td>
                  <span className={`${styles.badge} ${styles.roleBadge}`}>
                    {u.level || "-"}
                  </span>
                </td>

                <td>{u.dept}</td>

                <td>
                  <span
                    className={`${styles.status} ${u.status === "Active"
                        ? styles.active
                        : u.status === "Inactive"
                          ? styles.inactive
                          : styles.locked
                      }`}
                  >
                    {u.status}
                  </span>
                </td>

                <td className={styles.actionCell}>
                  <span
                    className={styles.dots}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveRow(activeRow === u.id ? null : u.id);
                    }}
                  >
                    ⋮
                  </span>

                  {activeRow === u.id && (
                    <div
                      ref={menuRef}
                      className={`${styles.userMenu} ${i >= pageData.length - 2 ? styles.menuUp : ""
                        }`}
                    >
                      <p onClick={() => router.push(`/umedit/${u.id}`)}>
                        Edit
                      </p>

                      <p
                        onClick={() => {
                          setActiveRow(null);
                          setSelectedUserId(u.id);
                          setSelectedUser(u);
                          setShowDeleteModal(true);
                        }}
                      >
                        Delete
                      </p>

                      <p
                        onClick={() => updateUserStatus(u.id, u.status)}
                      >
                        {u.status === "Active" ? "Inactive" : "Active"}
                      </p>

                      <p
                        onClick={() => {
                          setActiveRow(null);
                          router.push(`/umchangepassword/${u.id}`);
                        }}
                      >
                        Change Password
                      </p>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className={styles.umPagination}>
          {/* LEFT TEXT */}
          <div className={styles.pageInfo}>
            Showing {start + 1}–
            {Math.min(start + rowsPerPage, filteredUsers.length)} of{" "}
            {filteredUsers.length}
          </div>

          {/* RIGHT CONTROLS */}
          <div className={styles.pageControls}>
            {/* PREV */}
            <button
              className={styles.navBtn}
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              ‹
            </button>

            {/* PAGE NUMBERS */}
            {Array.from({ length: totalPages }, (_, i) => (
              <button
                key={i}
                className={`${styles.pageBtn} ${page === i + 1 ? styles.activePage : ""
                  }`}
                onClick={() => setPage(i + 1)}
              >
                {i + 1}
              </button>
            ))}

            {/* NEXT */}
            <button
              className={styles.navBtn}
              disabled={page === totalPages}
              onClick={() => setPage(page + 1)}
            >
              ›
            </button>
          </div>
        </div>

        {/* DELETE MODAL */}
        {showDeleteModal && (
          <div className={styles.modalOverlay}>
            <div className={styles.modal}>
              <div className={styles.modalHeader}>
                <FaTrash className={styles.trashIcon} />
                <h2>Delete Account?</h2>
              </div>
              <p className={styles.modalText}>
                Are you sure you want to delete this account? <br />
                <strong>{selectedUser?.employeeId}</strong>
              </p>

              <div className={styles.modalActions}>
                <button
                  className={styles.cancelBtn}
                  onClick={() => setShowDeleteModal(false)}
                >
                  Cancel
                </button>
                <button
                  className={styles.deleteBtn}
                  onClick={confirmDelete}
                >
                  Delete Account
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
