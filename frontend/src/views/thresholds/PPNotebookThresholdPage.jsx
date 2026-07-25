import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { useDispatch, useSelector } from "react-redux";
import { FiCheckCircle, FiPlus, FiSlash, FiTrash2 } from "react-icons/fi";
import { FaIdCard } from "react-icons/fa6";

import {
  fetchPpNotebookThresholdsAPI,
  savePpNotebookThresholdAPI,
} from "@/apis/ppNotebookThresholdApi";
import { fetchUsers } from "@/store/slices/userSlice";
import { isFullAccessUser } from "@/utils/accessControl";
import { departmentDirectory } from "@/views/departments/data";
import styles from "@/styles/SubmissionThreshold.module.css";

// Must match backend's PP_BATCH_NOTEBOOKS labels exactly (routes/submittedNotebooks.routes.js)
// - the save route rejects any label not in that list. Each maps to the
// Quality Control sub-department it belongs to, so selecting a Sub
// Department narrows the Notebook dropdown to just its own PP notebooks.
const PP_NOTEBOOK_OPTIONS = [
  { label: "Mixing Process Parameter", subDepartment: "Mixing" },
  { label: "Carding Process Parameter", subDepartment: "Carding" },
  { label: "Blowroom Process Parameter", subDepartment: "Blow Room" },
  { label: "Drawframe Process Parameter (Breaker)", subDepartment: "Draw Frame" },
  { label: "Drawframe Process Parameter (Finisher)", subDepartment: "Draw Frame" },
  { label: "Simplex Process Parameter", subDepartment: "Simplex" },
  { label: "Spinning Process Parameter", subDepartment: "Spinning" },
  { label: "Autoconer Process Parameter", subDepartment: "Autoconer" },
  { label: "Autoconer Process Parameter (Q2)", subDepartment: "Autoconer" },
  { label: "Autoconer Process Parameter (Q3)", subDepartment: "Autoconer" },
  { label: "Autoconer Process Parameter (Q4)", subDepartment: "Autoconer" },
];

const SEVERITY_OPTIONS = ["High", "Medium", "Low"];

const createRule = () => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  departmentSlug: "",
  subDepartmentSlug: "",
  notebookLabel: "",
  severity: "High",
  approvalL1Ids: [],
  entryWithinHours: "24",
  approvalL4Ids: [],
  approveWithinHours: "24",
});

const getUserDisplayName = (user) =>
  String(user?.name || user?.full_name || user?.fullName || user?.username || "").trim();

const buildUserOptions = (users, level) => {
  const seen = new Set();
  return users
    .filter((user) => String(user?.level || "").trim().toUpperCase() === level)
    .map((user) => ({ id: user?.id, name: getUserDisplayName(user) }))
    .filter((user) => {
      const key = String(user.id ?? "").trim();
      if (!key || !user.name || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => left.name.localeCompare(right.name));
};

const normalizeIdList = (value) =>
  (Array.isArray(value) ? value : [])
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);

function MultiUserSelect({
  value = [],
  options = [],
  onChange,
  disabled = false,
  placeholder = "Select",
  emptyLabel = "No users available",
}) {
  const containerRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (!containerRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, []);

  const selectedIds = new Set(normalizeIdList(value));
  const selectedNames = options
    .filter((option) => selectedIds.has(String(option.id)))
    .map((option) => option.name);
  const selectedLabel =
    selectedNames.length > 1 ? `${selectedNames.length} selected` : selectedNames[0] || placeholder;

  return (
    <div ref={containerRef} className={`${styles.multiSelectWrap} ${disabled ? styles.multiSelectDisabled : ""}`}>
      <button
        type="button"
        className={styles.multiSelectButton}
        onClick={() => {
          if (!disabled) setIsOpen((current) => !current);
        }}
        disabled={disabled}
      >
        <span className={styles.multiSelectValue}>{selectedLabel}</span>
        <span className={styles.multiSelectChevron}>{isOpen ? "^" : "v"}</span>
      </button>

      {isOpen ? (
        <div className={styles.multiSelectMenu}>
          {options.length ? (
            options.map((option) => {
              const optionId = String(option.id);
              const isChecked = selectedIds.has(optionId);
              return (
                <button
                  key={optionId}
                  type="button"
                  className={`${styles.singleSelectOption} ${isChecked ? styles.singleSelectOptionActive : ""}`}
                  onClick={() => {
                    const nextIds = isChecked
                      ? normalizeIdList(value).filter((id) => id !== optionId)
                      : [...normalizeIdList(value), optionId];
                    onChange?.(nextIds);
                  }}
                >
                  <span className={styles.multiSelectOptionRow}>
                    <input type="checkbox" checked={isChecked} readOnly tabIndex={-1} />
                    <span>{option.name}</span>
                  </span>
                </button>
              );
            })
          ) : (
            <div className={styles.multiSelectEmpty}>{emptyLabel}</div>
          )}
        </div>
      ) : null}
    </div>
  );
}

// Combined PP Threshold + PP Approval config, per notebook: Department/
// Sub-Department/Notebook/Severity/L1 Proposer/Entry-Within-Hours drive the
// PP_BATCH_INCOMPLETE ticket (per-notebook, as before); L4 Approver/Approve-
// Within-Hours drive the PP Approval ticket - applied whenever THIS
// notebook's department is the one that completes a shared PP entry_id
// last (see createPpApprovalTicket in processParameters.js).
//
// Existing rows are browsed/edited/deleted from the master Threshold hub's
// unified "Existing Thresholds" tab (ThresholdsHub.jsx) - this component is
// create/edit-only, matching that page's shared table instead of
// duplicating its own list here.
export default function PPNotebookThresholdPage({ standalone = true, editItem = null, onEditItemHandled } = {}) {
  const dispatch = useDispatch();
  const router = useRouter();
  const user = useSelector((state) => state.auth?.user);
  const isHydrated = useSelector((state) => state.auth?.isHydrated);
  const users = useSelector((state) => state.users?.users || []);
  const canAccessPage = isFullAccessUser(user);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [rules, setRules] = useState([createRule()]);
  const [editingId, setEditingId] = useState("");

  const l1Options = useMemo(() => buildUserOptions(users, "L1"), [users]);
  const l4Options = useMemo(() => buildUserOptions(users, "L4"), [users]);

  const availableDepartments = departmentDirectory;
  // Only sub-departments that actually have a PP notebook belong in this
  // dropdown - Wrapping and Individual Card Performance don't raise PP
  // entries at all, so they're excluded here (rather than just filtering
  // the Notebook dropdown down to empty after picking them).
  const getAvailableSubDepartments = (departmentSlug) => {
    const department = availableDepartments.find((item) => item.slug === departmentSlug) || null;
    return (department?.subDepartments || []).filter((subDepartment) =>
      PP_NOTEBOOK_OPTIONS.some((option) => option.subDepartment === subDepartment.name)
    );
  };
  const getAvailableNotebooks = (departmentSlug, subDepartmentSlug) => {
    const subDepartments = getAvailableSubDepartments(departmentSlug);
    const subDepartment = subDepartments.find((item) => item.slug === subDepartmentSlug) || null;
    return subDepartment ? PP_NOTEBOOK_OPTIONS.filter((option) => option.subDepartment === subDepartment.name) : [];
  };

  const totalThresholds = rows.length;
  const activeThresholds = rows.filter((item) => item.is_active).length;
  const inactiveThresholds = rows.filter((item) => !item.is_active).length;

  const loadRows = async () => {
    if (!canAccessPage) return;
    setLoading(true);
    try {
      const nextRows = await fetchPpNotebookThresholdsAPI();
      setRows(nextRows);
      setError("");
    } catch (err) {
      setError(err?.message || "Unable to load PP notebook thresholds.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isHydrated) return;
    if (!canAccessPage) {
      router.replace(standalone ? "/departments" : "/threshold-values");
      return;
    }
    loadRows();
    dispatch(fetchUsers());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAccessPage, isHydrated]);

  const updateRule = (ruleId, field, value) => {
    setRules((current) =>
      current.map((rule) => {
        if (rule.id !== ruleId) return rule;
        const next = { ...rule, [field]: value };
        if (field === "departmentSlug") {
          next.subDepartmentSlug = "";
          next.notebookLabel = "";
        }
        if (field === "subDepartmentSlug") {
          next.notebookLabel = "";
        }
        return next;
      })
    );
    setMessage("");
    setError("");
  };

  const addRule = () => {
    setRules((current) => [...current, createRule()]);
    setMessage("");
    setError("");
  };

  const removeRule = (ruleId) => {
    setRules((current) => {
      const next = current.filter((rule) => rule.id !== ruleId);
      return next.length ? next : [createRule()];
    });
    setMessage("");
    setError("");
  };

  const resetForm = ({ preserveFeedback = false } = {}) => {
    setRules([createRule()]);
    setEditingId("");
    if (!preserveFeedback) {
      setMessage("");
      setError("");
    }
  };

  const openEditRow = (item) => {
    const notebookOption = PP_NOTEBOOK_OPTIONS.find((option) => option.label === item.notebook_label);
    const matchedDepartment = availableDepartments.find((department) =>
      department.subDepartments?.some((subDepartment) => subDepartment.name === notebookOption?.subDepartment)
    );
    const matchedSubDepartment = matchedDepartment?.subDepartments?.find(
      (subDepartment) => subDepartment.name === notebookOption?.subDepartment
    );

    setRules([{
      id: `${Date.now()}-edit`,
      departmentSlug: matchedDepartment?.slug || "",
      subDepartmentSlug: matchedSubDepartment?.slug || "",
      notebookLabel: item.notebook_label || "",
      severity: item.severity || "High",
      approvalL1Ids: normalizeIdList(item.approval_l1_user_ids),
      entryWithinHours: String(item.completion_threshold_hours ?? "24"),
      approvalL4Ids: normalizeIdList(item.approval_l4_user_ids),
      approveWithinHours: String(item.approve_within_hours ?? "24"),
    }]);
    setEditingId(String(item.id));
    setMessage("Edit mode loaded from Existing Thresholds.");
    setError("");
  };

  useEffect(() => {
    if (!editItem) return;
    openEditRow(editItem);
    onEditItemHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editItem]);

  const handleSave = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");

    try {
      const payloads = rules.map((rule) => {
        const department = availableDepartments.find((item) => item.slug === rule.departmentSlug) || null;
        const subDepartments = getAvailableSubDepartments(rule.departmentSlug);
        const subDepartment = subDepartments.find((item) => item.slug === rule.subDepartmentSlug) || null;

        if (!department) throw new Error("Please select a department for every row.");
        if (!subDepartment) throw new Error("Please select a sub-department for every row.");
        if (!rule.notebookLabel) throw new Error("Please select a notebook for every row.");

        const entryWithinHours = Number(rule.entryWithinHours);
        if (!Number.isFinite(entryWithinHours) || entryWithinHours <= 0) {
          throw new Error("Please enter Entry Within Hours greater than 0 for every row.");
        }

        const approveWithinHours = Number(rule.approveWithinHours);
        if (!Number.isFinite(approveWithinHours) || approveWithinHours <= 0) {
          throw new Error("Please enter Approve Within Hours greater than 0 for every row.");
        }

        return {
          notebook_label: rule.notebookLabel,
          department: department.name,
          sub_department: subDepartment.name,
          severity: rule.severity,
          completion_threshold_hours: entryWithinHours,
          approval_l1_user_ids: rule.approvalL1Ids.map((id) => Number(id)),
          approval_l4_user_ids: rule.approvalL4Ids.map((id) => Number(id)),
          approve_within_hours: approveWithinHours,
          is_active: true,
        };
      });

      const responses = await Promise.all(payloads.map((payload) => savePpNotebookThresholdAPI(payload)));
      setMessage(responses[0]?.message || `${payloads.length} PP notebook threshold${payloads.length > 1 ? "s" : ""} saved successfully.`);
      resetForm({ preserveFeedback: true });
      await loadRows();
    } catch (err) {
      setError(
        err?.response?.data?.message || err?.response?.data?.error || err?.message || "Failed to save PP notebook threshold."
      );
    } finally {
      setSaving(false);
    }
  };

  if (!isHydrated || !canAccessPage) return null;

  const content = (
    <>
      <div className={styles.statsGrid}>
        <article className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.blue}`}>
            <FaIdCard />
          </div>
          <div>
            <span>Total Thresholds</span>
            <strong>{loading ? "-" : totalThresholds}</strong>
          </div>
        </article>
        <article className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.activeTone}`}>
            <FiCheckCircle />
          </div>
          <div>
            <span>Active Thresholds</span>
            <strong>{loading ? "-" : activeThresholds}</strong>
          </div>
        </article>
        <article className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.inactiveTone}`}>
            <FiSlash />
          </div>
          <div>
            <span>Inactive Thresholds</span>
            <strong>{loading ? "-" : inactiveThresholds}</strong>
          </div>
        </article>
      </div>

      <form className={styles.stack} onSubmit={handleSave}>
        <section className={styles.sectionPlain}>
          <div className={styles.sectionHeader}>
            <h2>Set the Process Parameter Threshold + Approval</h2>
          </div>

          <div className={styles.rulesTable}>
            {rules.map((rule, index) => {
              const availableSubDepartments = getAvailableSubDepartments(rule.departmentSlug);
              const availableNotebooks = getAvailableNotebooks(rule.departmentSlug, rule.subDepartmentSlug);
              return (
                <div className={styles.ruleCard} key={rule.id}>
                  <div className={styles.ruleGrid}>
                    <label className={styles.field} style={{ gridColumn: "1 / 2", gridRow: "1" }}>
                      <span>Department</span>
                      <select value={rule.departmentSlug} onChange={(event) => updateRule(rule.id, "departmentSlug", event.target.value)}>
                        <option value="">Select Department</option>
                        {availableDepartments.map((department) => (
                          <option key={department.slug} value={department.slug}>
                            {department.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className={styles.field} style={{ gridColumn: "2 / 3", gridRow: "1" }}>
                      <span>Sub Department</span>
                      <select
                        value={rule.subDepartmentSlug}
                        onChange={(event) => updateRule(rule.id, "subDepartmentSlug", event.target.value)}
                        disabled={!rule.departmentSlug}
                      >
                        <option value="">Select Sub Department</option>
                        {availableSubDepartments.map((subDepartment) => (
                          <option key={subDepartment.slug} value={subDepartment.slug}>
                            {subDepartment.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className={styles.field} style={{ gridColumn: "3 / 4", gridRow: "1" }}>
                      <span>Notebook (Selected Few)</span>
                      <select
                        value={rule.notebookLabel}
                        onChange={(event) => updateRule(rule.id, "notebookLabel", event.target.value)}
                        disabled={!rule.subDepartmentSlug}
                      >
                        <option value="">Select Notebook</option>
                        {availableNotebooks.map((option) => (
                          <option key={option.label} value={option.label}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className={styles.field} style={{ gridColumn: "4 / 5", gridRow: "1" }}>
                      <span>Severity</span>
                      <select value={rule.severity} onChange={(event) => updateRule(rule.id, "severity", event.target.value)}>
                        {SEVERITY_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className={styles.field} style={{ gridColumn: "1 / 2", gridRow: "2" }}>
                      <span>L1 Proposer</span>
                      <MultiUserSelect
                        value={rule.approvalL1Ids}
                        options={l1Options}
                        onChange={(nextIds) => updateRule(rule.id, "approvalL1Ids", nextIds)}
                        placeholder="Select L1 user"
                        emptyLabel="No L1 users available"
                      />
                    </label>

                    <label className={styles.field} style={{ gridColumn: "2 / 3", gridRow: "2" }}>
                      <span>Entry Within (Hours)</span>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={rule.entryWithinHours}
                        onChange={(event) => updateRule(rule.id, "entryWithinHours", event.target.value)}
                      />
                    </label>

                    <label className={styles.field} style={{ gridColumn: "3 / 4", gridRow: "2" }}>
                      <span>L4 Approver</span>
                      <MultiUserSelect
                        value={rule.approvalL4Ids}
                        options={l4Options}
                        onChange={(nextIds) => updateRule(rule.id, "approvalL4Ids", nextIds)}
                        placeholder="Select L4 user"
                        emptyLabel="No L4 users available"
                      />
                    </label>

                    <label className={styles.field} style={{ gridColumn: "4 / 5", gridRow: "2" }}>
                      <span>Approve Within (Hours)</span>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={rule.approveWithinHours}
                        onChange={(event) => updateRule(rule.id, "approveWithinHours", event.target.value)}
                      />
                    </label>

                    <div className={styles.ruleActions}>
                      {index === rules.length - 1 ? (
                        <button type="button" className={styles.addIconButton} onClick={addRule} aria-label="Add PP threshold row">
                          <FiPlus />
                        </button>
                      ) : (
                        <span className={styles.actionSpacer} aria-hidden="true" />
                      )}
                      <button
                        type="button"
                        className={styles.deleteIconButton}
                        onClick={() => removeRule(rule.id)}
                        aria-label="Delete PP threshold row"
                      >
                        <FiTrash2 />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <p style={{ color: "#7b89a0", fontSize: "12px" }}>
            L2 escalation is auto-resolved from each L1 Proposer&apos;s real reporting manager, not configured here.
            L4 Approver applies to the overall PP Approval only when this notebook&apos;s department is the one that
            completes the shared PP entry last; if no specific L4 user is selected, the approval task is raised on
            every current L4 user.
          </p>

          <div className={styles.formFooter}>
            <div className={styles.actionButtons}>
              <button type="button" className={styles.clearButton} onClick={() => resetForm()} disabled={saving}>
                Clear
              </button>
              <button type="submit" className={styles.saveButton} disabled={saving}>
                {saving ? "Saving..." : editingId ? "Update" : "Save"}
              </button>
            </div>
          </div>

          {message ? <p className={styles.successMessage}>{message}</p> : null}
          {error ? <p className={styles.errorMessage}>{error}</p> : null}
        </section>
      </form>
    </>
  );

  if (!standalone) {
    return content;
  }

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <div className={styles.intro}>
          <h1>PP Threshold</h1>
          <p>Set the completion (L1) and approval (L4) conditions for each PP notebook.</p>
        </div>
        {content}
      </div>
    </div>
  );
}
