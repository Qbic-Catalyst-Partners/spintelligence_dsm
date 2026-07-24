import { useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { FiCalendar } from "react-icons/fi";
import styles from "../../styles/DelegationSystem.module.css";
import { fetchUsers } from "../../store/slices/userSlice";
import { assignDelegationAPI, fetchDelegationsAPI } from "../../apis/delegationsApi";

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

export default function DelegationSystem() {
  const dispatch = useDispatch();
  const { users = [] } = useSelector((state) => state.users || {});
  const fromDateRef = useRef(null);
  const toDateRef = useRef(null);

  const [ownerId, setOwnerId] = useState("");
  const [delegateId, setDelegateId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const [delegations, setDelegations] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    dispatch(fetchUsers());
  }, [dispatch]);

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
    loadDelegations(1);
  }, []);

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
      await assignDelegationAPI({
        ownerUserId: ownerId,
        delegateUserId: delegateId,
        fromDate,
        toDate,
      });
      resetForm();
      await loadDelegations(1);
    } catch (error) {
      setFormError(error.message || "Unable to assign delegation.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.wrapper}>
        <h1 className={styles.title}>Delegation System</h1>

        <form className={styles.formCard} onSubmit={handleSubmit}>
          <h2 className={styles.formTitle}>Assign Delegation</h2>

          <div className={styles.formGrid}>
            <div className={styles.field}>
              <label>Owner</label>
              <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
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
              <select value={delegateId} onChange={(e) => setDelegateId(e.target.value)}>
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
                {submitting ? "Submitting..." : "Submit"}
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
            </tr>
          </thead>
          <tbody>
            {!loading && delegations.length === 0 ? (
              <tr>
                <td colSpan={6} className={styles.emptyRow}>
                  No delegations found.
                </td>
              </tr>
            ) : (
              delegations.map((d) => (
                <tr key={d.id}>
                  <td className={styles.bold}>{d.owner_name}</td>
                  <td className={styles.bold}>{d.delegate_name}</td>
                  <td>{formatDisplayDate(d.from_date)}</td>
                  <td>{formatDisplayDate(d.to_date)}</td>
                  <td>{d.no_of_days}</td>
                  <td>{formatCreatedAt(d.created_at)}</td>
                </tr>
              ))
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
