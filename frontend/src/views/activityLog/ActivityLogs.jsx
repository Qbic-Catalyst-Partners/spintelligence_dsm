import { useEffect, useMemo, useState } from "react";
import { FiCalendar, FiChevronLeft, FiChevronRight, FiRefreshCw, FiSearch } from "react-icons/fi";
import { fetchActivityLogFiltersApi, fetchActivityLogsApi } from "@/apis/activityLogApi";
import styles from "@/styles/activityLog.module.css";

const PAGE_SIZE = 20;

const initialFilters = {
  search: "",
  action: "",
  user: "",
  sub_department: "",
  notebook: "",
  start_date: "",
  end_date: "",
};

const getOptionValue = (option) => String(option?.value ?? option?.user_id ?? option?.user_name ?? "");

// The backend's filter options can carry duplicate values (e.g. the same
// user_id listed twice under two employee_id aliases), which would otherwise
// render two <option>s with the same key/value — dedupe by value so React
// keys stay unique and the dropdown doesn't show a confusing repeated entry.
const dedupeOptions = (options) => {
  const seen = new Set();
  return (Array.isArray(options) ? options : []).filter((option) => {
    const value = getOptionValue(option);
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
};
const getOptionLabel = (option) => {
  const name = String(
    option?.label ??
      option?.user_name ??
      option?.userName ??
      option?.full_name ??
      option?.fullName ??
      option?.name ??
      option?.value ??
      ""
  ).trim();
  const employeeId = String(option?.employee_id ?? option?.employeeId ?? option?.emp_id ?? option?.empId ?? "").trim();
  return employeeId && name && !name.includes(employeeId) ? `${name} (${employeeId})` : name;
};

const getMetadata = (row) => {
  if (!row?.metadata) return {};
  if (typeof row.metadata === "object") return row.metadata;

  try {
    return JSON.parse(row.metadata);
  } catch {
    return {};
  }
};

const formatUser = (row) => {
  const metadata = getMetadata(row);
  const name = String(
    row?.user_name ??
      row?.userName ??
      row?.username ??
      row?.full_name ??
      row?.fullName ??
      row?.display_name ??
      row?.displayName ??
      row?.name ??
      row?.created_by_name ??
      row?.createdByName ??
      row?.performed_by_name ??
      row?.performedByName ??
      row?.actor_name ??
      row?.actorName ??
      row?.user?.full_name ??
      row?.user?.fullName ??
      row?.user?.name ??
      row?.created_by?.full_name ??
      row?.created_by?.fullName ??
      row?.created_by?.name ??
      row?.actor?.full_name ??
      row?.actor?.fullName ??
      row?.actor?.name ??
      metadata.user_name ??
      metadata.userName ??
      metadata.username ??
      metadata.full_name ??
      metadata.fullName ??
      metadata.display_name ??
      metadata.displayName ??
      metadata.created_by_name ??
      metadata.createdByName ??
      metadata.performed_by_name ??
      metadata.performedByName ??
      metadata.actor_name ??
      metadata.actorName ??
      metadata.name ??
      ""
  ).trim();
  const employeeId = String(
    row?.employee_id ??
      row?.employeeId ??
      row?.emp_id ??
      row?.empId ??
      row?.created_by ??
      row?.createdBy ??
      row?.performed_by ??
      row?.performedBy ??
      row?.actor_id ??
      row?.actorId ??
      row?.user?.employee_id ??
      row?.user?.employeeId ??
      row?.user?.emp_id ??
      row?.user?.empId ??
      row?.created_by?.employee_id ??
      row?.created_by?.employeeId ??
      row?.created_by?.emp_id ??
      row?.created_by?.empId ??
      row?.actor?.employee_id ??
      row?.actor?.employeeId ??
      row?.actor?.emp_id ??
      row?.actor?.empId ??
      metadata.employee_id ??
      metadata.employeeId ??
      metadata.emp_id ??
      metadata.empId ??
      metadata.created_by ??
      metadata.createdBy ??
      metadata.performed_by ??
      metadata.performedBy ??
      metadata.actor_id ??
      metadata.actorId ??
      ""
  ).trim();
  if (name && employeeId && !name.includes(employeeId)) return `${name} (${employeeId})`;
  return name || employeeId || (row?.user_id ? `User #${row.user_id}` : "-");
};

const formatSubDepartment = (row) => {
  const metadata = getMetadata(row);
  return String(
    row?.sub_department ??
      row?.subDepartment ??
      row?.sub_department_name ??
      row?.subDepartmentName ??
      row?.subdept ??
      row?.subDept ??
      row?.sub_dept ??
      row?.subDeptName ??
      row?.department_name ??
      row?.departmentName ??
      row?.department ??
      row?.module_name ??
      row?.moduleName ??
      metadata.sub_department ??
      metadata.subDepartment ??
      metadata.sub_department_name ??
      metadata.subDepartmentName ??
      metadata.subdept ??
      metadata.subDept ??
      metadata.sub_dept ??
      metadata.subDeptName ??
      metadata.department_name ??
      metadata.departmentName ??
      metadata.department ??
      metadata.module_name ??
      metadata.moduleName ??
      ""
  ).trim() || "-";
};

const formatDateTime = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

function ActivityLogs() {
  const [filters, setFilters] = useState(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState(initialFilters);
  const [filterOptions, setFilterOptions] = useState({
    actions: [],
    users: [],
    notebook_types: [],
    sub_departments: [],
  });
  const [logs, setLogs] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0 });
  const [loading, setLoading] = useState(true);
  const [filtersLoading, setFiltersLoading] = useState(true);
  const [error, setError] = useState("");

  const totalPages = Math.max(1, Math.ceil((pagination.total || 0) / pagination.limit));

  const queryParams = useMemo(
    () =>
      Object.fromEntries(
        Object.entries({
          page: pagination.page,
          limit: PAGE_SIZE,
          search: appliedFilters.search,
          action: appliedFilters.action,
          user: appliedFilters.user,
          sub_department: appliedFilters.sub_department,
          notebook_type: appliedFilters.notebook,
          start_date: appliedFilters.start_date,
          end_date: appliedFilters.end_date,
        }).filter(([, value]) => value !== "")
      ),
    [appliedFilters, pagination.page]
  );

  useEffect(() => {
    let ignore = false;

    const loadFilters = async () => {
      setFiltersLoading(true);
      try {
        const data = await fetchActivityLogFiltersApi();
        if (!ignore) {
          setFilterOptions(data);
        }
      } catch (apiError) {
        if (!ignore) {
          setFilterOptions({ actions: [], users: [], notebook_types: [], sub_departments: [] });
        }
      } finally {
        if (!ignore) {
          setFiltersLoading(false);
        }
      }
    };

    loadFilters();
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    let ignore = false;

    const loadLogs = async () => {
      setLoading(true);
      setError("");

      try {
        const data = await fetchActivityLogsApi(queryParams);
        if (!ignore) {
          setLogs(data.logs);
          setPagination(data.pagination);
        }
      } catch (apiError) {
        if (!ignore) {
          setLogs([]);
          setError(apiError?.response?.data?.message || apiError?.message || "Unable to load activity logs");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    };

    loadLogs();
    return () => {
      ignore = true;
    };
  }, [queryParams]);

  const updateFilter = (key, value) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const applyFilters = (event) => {
    event.preventDefault();
    setPagination((current) => ({ ...current, page: 1 }));
    setAppliedFilters(filters);
  };

  const clearFilters = () => {
    setFilters(initialFilters);
    setAppliedFilters(initialFilters);
    setPagination((current) => ({ ...current, page: 1 }));
  };

  const goToPage = (page) => {
    setPagination((current) => ({
      ...current,
      page: Math.min(Math.max(1, page), totalPages),
    }));
  };

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Activity Logs</h1>

      <form className={styles.filters} aria-labelledby="activity-log-filters" onSubmit={applyFilters}>
        <div className={styles.filterHeader}>
          <h2 id="activity-log-filters" className={styles.filterTitle}>
            Filters
          </h2>
          <button type="button" className={styles.secondaryButton} onClick={clearFilters}>
            Clear
          </button>
        </div>

        <div className={styles.filterGrid}>
          <label className={styles.field}>
            <span>Search</span>
            <span className={`${styles.control} ${styles.searchControl}`}>
              <FiSearch aria-hidden="true" />
              <input
                type="search"
                value={filters.search}
                placeholder="Search"
                aria-label="Search activity logs"
                onChange={(event) => updateFilter("search", event.target.value)}
              />
            </span>
          </label>

          <label className={styles.field}>
            <span>Action</span>
            <select
              value={filters.action}
              disabled={filtersLoading}
              onChange={(event) => updateFilter("action", event.target.value)}
            >
              <option value="">All Actions</option>
              {dedupeOptions(filterOptions.actions).map((option) => (
                <option key={getOptionValue(option)} value={getOptionValue(option)}>
                  {getOptionLabel(option)}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.field}>
            <span>User</span>
            <select
              value={filters.user}
              disabled={filtersLoading}
              onChange={(event) => updateFilter("user", event.target.value)}
            >
              <option value="">All Users</option>
              {dedupeOptions(filterOptions.users).map((option) => (
                <option key={getOptionValue(option)} value={getOptionValue(option)}>
                  {getOptionLabel(option)}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.field}>
            <span>Notebook Type</span>
            <select
              value={filters.notebook}
              disabled={filtersLoading}
              onChange={(event) => updateFilter("notebook", event.target.value)}
            >
              <option value="">All Notebooks</option>
              {dedupeOptions(filterOptions.notebook_types).map((option) => (
                <option key={getOptionValue(option)} value={getOptionValue(option)}>
                  {getOptionLabel(option)}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.field}>
            <span>Sub Department</span>
            <select
              value={filters.sub_department}
              disabled={filtersLoading}
              onChange={(event) => updateFilter("sub_department", event.target.value)}
            >
              <option value="">All Sub Departments</option>
              {dedupeOptions(filterOptions.sub_departments).map((option) => (
                <option key={getOptionValue(option)} value={getOptionValue(option)}>
                  {getOptionLabel(option)}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.field}>
            <span>From Date</span>
            <span className={`${styles.control} ${styles.dateControl}`}>
              <input
                type="date"
                value={filters.start_date}
                aria-label="From date"
                onChange={(event) => updateFilter("start_date", event.target.value)}
              />
              <FiCalendar aria-hidden="true" />
            </span>
          </label>

          <label className={styles.field}>
            <span>To Date</span>
            <span className={`${styles.control} ${styles.dateControl}`}>
              <input
                type="date"
                value={filters.end_date}
                aria-label="To date"
                onChange={(event) => updateFilter("end_date", event.target.value)}
              />
              <FiCalendar aria-hidden="true" />
            </span>
          </label>

          <button type="submit" className={styles.primaryButton}>
            <FiRefreshCw aria-hidden="true" />
            Apply
          </button>
        </div>
      </form>

      <section className={styles.timeline} aria-labelledby="activity-log-timeline">
        <div className={styles.timelineHeader}>
          <h2 id="activity-log-timeline" className={styles.timelineTitle}>
            Activity Timeline
          </h2>
          <span className={styles.resultCount}>{pagination.total} records</span>
        </div>

        {error && <div className={styles.errorState}>{error}</div>}

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Sub Department</th>
                <th>Notebook Type</th>
                <th>User</th>
                <th>Activity</th>
                <th>Date &amp; Time</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className={styles.stateCell}>
                    Loading activity logs...
                  </td>
                </tr>
              ) : logs.length ? (
                logs.map((row) => (
                  <tr key={row.id}>
                    <td>{formatSubDepartment(row)}</td>
                    <td>{row.notebook_type || "-"}</td>
                    <td>{formatUser(row)}</td>
                    <td>{row.activity || row.description || row.action || "-"}</td>
                    <td>{formatDateTime(row.date_time || row.created_at)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className={styles.stateCell}>
                    No activity logs found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className={styles.pagination}>
          <button type="button" onClick={() => goToPage(pagination.page - 1)} disabled={loading || pagination.page <= 1}>
            <FiChevronLeft aria-hidden="true" />
            Previous
          </button>
          <span>
            Page {pagination.page} of {totalPages}
          </span>
          <button type="button" onClick={() => goToPage(pagination.page + 1)} disabled={loading || pagination.page >= totalPages}>
            Next
            <FiChevronRight aria-hidden="true" />
          </button>
        </div>
      </section>
    </div>
  );
}

export default ActivityLogs;
