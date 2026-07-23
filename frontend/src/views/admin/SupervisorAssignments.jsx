import { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { fetchUsersAPI } from "@/apis/userApi";
import { isFullAccessUser } from "@/utils/accessControl";
import {
  assignSupervisorEmployee,
  fetchSupervisorEmployees,
  unassignSupervisorEmployee,
} from "@/apis/supervisorAssignments";
import styles from "@/styles/supervisorAssignments.module.css";

const trimValue = (value) => String(value ?? "").trim();
const getLevel = (user) => trimValue(user?.level).toUpperCase();

// Any user (L1-L5) can be set up as a supervisor over any other user - not
// just the L2-over-L1 mapping WC/PP Approvals originally scoped by. L4/L5
// are unrestricted in those approval queues regardless of this mapping, but
// the assignment itself isn't limited to L1/L2.
//
// Fetches users directly (raw full_name/employee_id/department shape from
// GET /users) rather than through userSlice's fetchUsers thunk, which
// remaps those fields to name/employeeId/dept for the User Management
// table - depending on that shape here silently broke this page (every
// row rendered with blank name/ID).
function SupervisorAssignments() {
  const authUser = useSelector((state) => state.auth?.user);
  const isHydrated = useSelector((state) => state.auth?.isHydrated);
  const canManage = isFullAccessUser(authUser);

  const [users, setUsers] = useState([]);
  const [usersError, setUsersError] = useState("");
  const [selectedSupervisorId, setSelectedSupervisorId] = useState(null);
  const [supervisorSearch, setSupervisorSearch] = useState("");
  const [assignedEmployees, setAssignedEmployees] = useState([]);
  const [loadingAssigned, setLoadingAssigned] = useState(false);
  const [error, setError] = useState("");
  const [employeeToAdd, setEmployeeToAdd] = useState("");
  const [busyEmployeeId, setBusyEmployeeId] = useState(null);

  useEffect(() => {
    if (!canManage) return;
    fetchUsersAPI()
      .then((data) => setUsers(Array.isArray(data) ? data : []))
      .catch((err) => setUsersError(err?.message || "Unable to load users."));
  }, [canManage]);

  const supervisors = useMemo(
    () =>
      users.filter((user) => {
        const keyword = supervisorSearch.trim().toLowerCase();
        if (!keyword) return true;
        return (
          trimValue(user.full_name).toLowerCase().includes(keyword) ||
          trimValue(user.employee_id).toLowerCase().includes(keyword)
        );
      }),
    [users, supervisorSearch]
  );

  const assignedIds = useMemo(
    () => new Set(assignedEmployees.map((employee) => employee.employee_user_id)),
    [assignedEmployees]
  );

  const unassignedEmployeeOptions = useMemo(
    () =>
      users.filter(
        (user) => user.id !== selectedSupervisorId && !assignedIds.has(user.id)
      ),
    [users, assignedIds, selectedSupervisorId]
  );

  const loadAssigned = async (supervisorId) => {
    setLoadingAssigned(true);
    setError("");
    try {
      const employees = await fetchSupervisorEmployees(supervisorId);
      setAssignedEmployees(employees);
    } catch (err) {
      setError(err?.message || "Unable to load assigned employees.");
      setAssignedEmployees([]);
    } finally {
      setLoadingAssigned(false);
    }
  };

  const handleSelectSupervisor = (supervisorId) => {
    setSelectedSupervisorId(supervisorId);
    setEmployeeToAdd("");
    loadAssigned(supervisorId);
  };

  const handleAssign = async () => {
    if (!selectedSupervisorId || !employeeToAdd) return;
    setBusyEmployeeId(employeeToAdd);
    setError("");
    try {
      await assignSupervisorEmployee(selectedSupervisorId, Number(employeeToAdd));
      setEmployeeToAdd("");
      await loadAssigned(selectedSupervisorId);
    } catch (err) {
      setError(err?.message || "Unable to assign employee.");
    } finally {
      setBusyEmployeeId(null);
    }
  };

  const handleUnassign = async (employeeUserId) => {
    if (!selectedSupervisorId) return;
    setBusyEmployeeId(employeeUserId);
    setError("");
    try {
      await unassignSupervisorEmployee(selectedSupervisorId, employeeUserId);
      await loadAssigned(selectedSupervisorId);
    } catch (err) {
      setError(err?.message || "Unable to remove assignment.");
    } finally {
      setBusyEmployeeId(null);
    }
  };

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Supervisor Assignments</h1>
      <p className={styles.subtitle}>
        Assign which employees report to each supervisor, across any level (L1-L5). WC Approvals and PP Approvals
        use this mapping to scope an L2 supervisor&apos;s queue to only their assigned employees&apos; submissions —
        L4/L5 and Admin always see every submission with no restriction.
      </p>

      {isHydrated && !canManage ? (
        <div className={styles.accessNotice}>Only Admin can manage supervisor assignments.</div>
      ) : null}

      {isHydrated && canManage && usersError ? (
        <div className={styles.errorState}>{usersError}</div>
      ) : null}

      {isHydrated && canManage ? (
        <div className={styles.layout}>
          <div className={styles.panel}>
            <h2 className={styles.panelTitle}>Supervisors</h2>
            <input
              type="text"
              className={styles.searchInput}
              placeholder="Search supervisor..."
              value={supervisorSearch}
              onChange={(event) => setSupervisorSearch(event.target.value)}
            />
            {supervisors.length ? (
              <div className={styles.supervisorList}>
                {supervisors.map((supervisor) => (
                  <button
                    key={supervisor.id}
                    type="button"
                    className={`${styles.supervisorRow} ${
                      selectedSupervisorId === supervisor.id ? styles.supervisorRowActive : ""
                    }`}
                    onClick={() => handleSelectSupervisor(supervisor.id)}
                  >
                    <strong>{supervisor.full_name}</strong>
                    <span>{supervisor.employee_id} ({getLevel(supervisor) || "-"})</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className={styles.emptyState}>No users found.</div>
            )}
          </div>

          <div className={styles.panel}>
            <h2 className={styles.panelTitle}>Assigned Employees</h2>

            {error ? <div className={styles.errorState}>{error}</div> : null}

            {!selectedSupervisorId ? (
              <div className={styles.emptyState}>Select a supervisor to manage their assigned employees.</div>
            ) : (
              <>
                <div className={styles.assignRow}>
                  <select
                    className={styles.assignSelect}
                    value={employeeToAdd}
                    onChange={(event) => setEmployeeToAdd(event.target.value)}
                  >
                    <option value="">Select employee to add...</option>
                    {unassignedEmployeeOptions.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.full_name} ({employee.employee_id}) - {getLevel(employee) || "-"}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className={styles.assignButton}
                    disabled={!employeeToAdd || busyEmployeeId === employeeToAdd}
                    onClick={handleAssign}
                  >
                    Assign
                  </button>
                </div>

                {loadingAssigned ? (
                  <div className={styles.emptyState}>Loading assigned employees...</div>
                ) : assignedEmployees.length ? (
                  <table className={styles.employeeTable}>
                    <thead>
                      <tr>
                        <th>Employee</th>
                        <th>Employee ID</th>
                        <th>Level</th>
                        <th>Department</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {assignedEmployees.map((employee) => (
                        <tr key={employee.employee_user_id}>
                          <td>{employee.full_name}</td>
                          <td>{employee.employee_id}</td>
                          <td>{getLevel(employee) || "-"}</td>
                          <td>{employee.department || "-"}</td>
                          <td>
                            <button
                              type="button"
                              className={styles.removeButton}
                              disabled={busyEmployeeId === employee.employee_user_id}
                              onClick={() => handleUnassign(employee.employee_user_id)}
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className={styles.emptyState}>No employees assigned to this supervisor yet.</div>
                )}
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default SupervisorAssignments;
