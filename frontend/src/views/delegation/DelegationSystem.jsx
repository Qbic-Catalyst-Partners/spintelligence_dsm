import { useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useRouter } from "next/router";
import { FiCalendar } from "react-icons/fi";
import styles from "../../styles/DelegationSystem.module.css";
import { fetchUsers } from "../../store/slices/userSlice";
import {
  assignDelegationAPI,
  fetchDelegationsAPI,
  revokeDelegationAPI,
  updateDelegationAPI,
} from "../../apis/delegationsApi";
import { isDelegationManagerUser } from "../../utils/accessControl";

const ROWS_PER_PAGE = 9;

const formatDisplayDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}-${month}-${date.getFullYear()}`;
};

const formatCreatedAt = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

const computeNoOfDays = (fromDate, toDate) => {
  if (!fromDate || !toDate) return "";
  const from = new Date(fromDate);
  const to = new Date(toDate);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) return "";
  return Math.round((to - from) / (1000 * 60 * 60 * 24)) + 1;
};

// Revoked wins over date range (a revoked delegation stops applying
// immediately, even mid-range) - Expired/Active are otherwise derived purely
// from to_date vs today since the backend has no separate "active" flag.
const getDelegationStatus = (delegation) => {
  if (delegation?.revoked_at) return "Revoked";
  const toDate = delegation?.to_date ? new Date(delegation.to_date) : null;
  if (toDate) {
    const endOfDay = new Date(toDate);
    endOfDay.setHours(23, 59, 59, 999);
    if (endOfDay < new Date()) return "Expired";
  }
  return "Active";
};

const statusBadgeClass = (status, styles) => {
  if (status === "Revoked") return styles.statusRevoked;
  if (status === "Expired") return styles.statusExpired;
  return styles.statusActive;
};

export default function DelegationSystem() {
  const dispatch = useDispatch();
  const router = useRouter();
  const authUser = useSelector((state) => state.auth?.user);
  const isHydrated = useSelector((state) => state.auth?.isHydrated);
  const canAccessPage = isDelegationManagerUser(authUser);
  const { users = [] } = useSelector((state) => state.users || {});
  const fromDateRef = useRef(null);
  const toDateRef = useRef(null);

  const [ownerId, setOwnerId] = useState("");
  const [delegateId, setDelegateId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [editingDelegation, setEditingDelegation] = useState(null);
  const [revokingId, setRevokingId] = useState(null);

  const [delegations, setDelegations] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }
    if (!canAccessPage) {
      router.replace("/departments");
      return;
    }
    dispatch(fetchUsers());
  }, [canAccessPage, dispatch, isHydrated, router]);

  const loadDelegations = async (targetPage) => {
    setLoading(true);
    try {
      const result = await fetchDelegationsAPI(targetPage, ROWS_PER_PAGE);
      setDelegations(result.delegations);
      setTotal(result.total);
      setPage(result.page);
    } catch (error) {
      setDelegations([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isHydrated || !canAccessPage) {
      return;
    }
    loadDelegations(1);
  }, [canAccessPage, isHydrated]);

  const noOfDays = useMemo(() => computeNoOfDays(fromDate, toDate), [fromDate, toDate]);
  const totalPages = Math.max(1, Math.ceil(total / ROWS_PER_PAGE));

  const openDatePicker = (ref) => {
    if (ref.current?.showPicker) {
      ref.current.showPicker();
    } else {
      ref.current?.focus();
    }
  };

  const resetForm = () => {
    setOwnerId("");
    setDelegateId("");
    setFromDate("");
    setToDate("");
    setEditingDelegation(null);
  };

  const handleEditClick = (delegation) => {
    setFormError("");
    setEditingDelegation(delegation);
    setOwnerId(String(delegation.owner_user_id));
    setDelegateId(String(delegation.delegate_user_id));
    setFromDate(String(delegation.from_date || "").slice(0, 10));
    setToDate(String(delegation.to_date || "").slice(0, 10));
  };

  const handleRevoke = async (delegation) => {
    if (!window.confirm(`Revoke ${delegation.owner_name}'s delegation to ${delegation.delegate_name}?`)) {
      return;
    }
    setRevokingId(delegation.id);
    try {
      await revokeDelegationAPI(delegation.id);
      if (editingDelegation?.id === delegation.id) {
        resetForm();
      }
      await loadDelegations(page);
    } catch (error) {
      setFormError(error.message || "Unable to revoke delegation.");
    } finally {
      setRevokingId(null);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFormError("");

    if (!ownerId || !delegateId) {
      setFormError("Please select both owner and delegated-to user.");
      return;
    }
    if (ownerId === delegateId) {
      setFormError("Owner and delegated-to user cannot be the same.");
      return;
    }
    if (!fromDate || !toDate) {
      setFormError("Please select both from and to dates.");
      return;
    }
    if (new Date(toDate) < new Date(fromDate)) {
      setFormError("To date cannot be before from date.");
      return;
    }

    setSubmitting(true);
    try {
      if (editingDelegation) {
        await updateDelegationAPI(editingDelegation.id, { fromDate, toDate });
        resetForm();
        await loadDelegations(page);
      } else {
        await assignDelegationAPI({
          ownerUserId: ownerId,
          delegateUserId: delegateId,
          fromDate,
          toDate,
        });
        resetForm();
        await loadDelegations(1);
      }
    } catch (error) {
      setFormError(error.message || "Unable to save delegation.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isHydrated || !canAccessPage) {
    return null;
  }

  return (
    <div className={styles.container}>
      <div className={styles.wrapper}>
        <h1 className={styles.title}>Delegation System</h1>

        <form className={styles.formCard} onSubmit={handleSubmit}>
          <h2 className={styles.formTitle}>
            {editingDelegation ? "Edit Delegation Dates" : "Assign Delegation"}
          </h2>

          {editingDelegation ? (
            <div className={styles.editingBanner}>
              <span>
                Editing {editingDelegation.owner_name} → {editingDelegation.delegate_name}. Owner
                and delegated-to user can't be changed here - revoke and create a new delegation
                to reassign them.
              </span>
              <button type="button" className={styles.btnSecondary} onClick={resetForm}>
                Cancel
              </button>
            </div>
          ) : null}

          <div className={styles.formGrid}>
            <div className={styles.field}>
              <label>Owner</label>
              <select
                value={ownerId}
                onChange={(e) => setOwnerId(e.target.value)}
                disabled={Boolean(editingDelegation)}
              >
                <option value="">Select owner</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name || u.employeeId}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.field}>
              <label>Delegated to</label>
              <select
                value={delegateId}
                onChange={(e) => setDelegateId(e.target.value)}
                disabled={Boolean(editingDelegation)}
              >
                <option value="">Select delegate</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name || u.employeeId}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.field}>
              <label>Date - From</label>
              <div className={styles.dateInputWrapper}>
                <input
                  ref={fromDateRef}
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                />
                <FiCalendar
                  className={styles.calendarIcon}
                  onClick={() => openDatePicker(fromDateRef)}
                />
              </div>
            </div>

            <div className={styles.field}>
              <label>Date - To</label>
              <div className={styles.dateInputWrapper}>
                <input
                  ref={toDateRef}
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                />
                <FiCalendar
                  className={styles.calendarIcon}
                  onClick={() => openDatePicker(toDateRef)}
                />
              </div>
            </div>

            <div className={styles.field}>
              <label>No. of Days</label>
              <input type="text" value={noOfDays} readOnly placeholder="-" />
            </div>

            <div className={styles.submitField}>
              <button type="submit" className={styles.btnPrimary} disabled={submitting}>
                {submitting ? "Saving..." : editingDelegation ? "Save Changes" : "Submit"}
              </button>
            </div>
          </div>

          {formError ? <div className={styles.formError}>{formError}</div> : null}
        </form>

        <table className={styles.table}>
          <thead>
            <tr>
              <th>OWNER</th>
              <th>DELEGATED TO</th>
              <th>FROM DATE</th>
              <th>TO DATE</th>
              <th>NO. OF DAYS</th>
              <th>CREATED AT</th>
              <th>STATUS</th>
              <th>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {!loading && delegations.length === 0 ? (
              <tr>
                <td colSpan={8} className={styles.emptyRow}>
                  No delegations found.
                </td>
              </tr>
            ) : (
              delegations.map((d) => {
                const status = getDelegationStatus(d);
                const canModify = status !== "Revoked";
                return (
                  <tr key={d.id}>
                    <td className={styles.bold}>{d.owner_name}</td>
                    <td className={styles.bold}>{d.delegate_name}</td>
                    <td>{formatDisplayDate(d.from_date)}</td>
                    <td>{formatDisplayDate(d.to_date)}</td>
                    <td>{d.no_of_days}</td>
                    <td>{formatCreatedAt(d.created_at)}</td>
                    <td>
                      <span className={`${styles.statusBadge} ${statusBadgeClass(status, styles)}`}>
                        {status}
                      </span>
                    </td>
                    <td>
                      {canModify ? (
                        <div className={styles.actionsCell}>
                          <button
                            type="button"
                            className={styles.actionBtn}
                            onClick={() => handleEditClick(d)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                            onClick={() => handleRevoke(d)}
                            disabled={revokingId === d.id}
                          >
                            {revokingId === d.id ? "Revoking..." : "Revoke"}
                          </button>
                        </div>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        <div className={styles.pagination}>
          <div className={styles.pageInfo}>
            Showing {total === 0 ? 0 : (page - 1) * ROWS_PER_PAGE + 1}
            {"–"}
            {Math.min(page * ROWS_PER_PAGE, total)} of {total}
          </div>

          <div className={styles.pageControls}>
            <button
              className={styles.navBtn}
              disabled={page === 1}
              onClick={() => loadDelegations(page - 1)}
            >
              {"‹"}
            </button>

            {Array.from({ length: totalPages }, (_, i) => (
              <button
                key={i}
                className={`${styles.pageBtn} ${page === i + 1 ? styles.activePage : ""}`}
                onClick={() => loadDelegations(i + 1)}
              >
                {i + 1}
              </button>
            ))}

            <button
              className={styles.navBtn}
              disabled={page === totalPages}
              onClick={() => loadDelegations(page + 1)}
            >
              {"›"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
