import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { useDispatch, useSelector } from "react-redux";
import { FiClock } from "react-icons/fi";

import {
  fetchPpNotebookBatchConfigAPI,
  savePpNotebookBatchConfigAPI,
  savePpBatchSubDepartmentTatAPI,
} from "@/apis/ppNotebookBatchConfigApi";
import { fetchUsers } from "@/store/slices/userSlice";
import { isFullAccessUser } from "@/utils/accessControl";
import styles from "@/styles/SubmissionThreshold.module.css";

const createFormState = () => ({
  completionThresholdHours: "",
  l2TatHours: "",
  l3TatHours: "",
  l4TatHours: "",
  l5TatHours: "",
  approvalL1Ids: [],
  approvalL2Ids: [],
  approvalL3Ids: [],
  approvalL4Ids: [],
  approvalL5Ids: [],
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

const formatTimestamp = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear()).slice(-2);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${day}/${month}/${year}, ${hours}:${minutes}`;
};

const getSubDepartmentName = (group) =>
  String(group?.sub_department || group?.subDepartment || group?.name || "").trim();

const getGroupNotebooks = (group) =>
  Array.isArray(group?.notebooks) ? group.notebooks : Array.isArray(group?.screens) ? group.screens : [];

const getNotebookIdentifier = (notebook) =>
  String(notebook?.notebook || notebook?.notebook_name || notebook?.screen_name || notebook?.name || "").trim();

const getNotebookLabel = (notebook) =>
  String(notebook?.label || notebook?.display_label || "").trim() || getNotebookIdentifier(notebook);

const getLastSavedEntry = (notebook) => {
  const entry = notebook?.last_saved_entry || notebook?.lastSavedEntry;
  return entry && typeof entry === "object" ? entry : null;
};

const getEntrySubmittedAt = (entry) => entry?.submitted_at || entry?.submittedAt || "";
const getEntrySubmittedBy = (entry) => entry?.submitted_by_name || entry?.submittedByName || "-";
const getEntryId = (entry) => entry?.entry_id || entry?.entryId || "-";

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
    <div
      ref={containerRef}
      className={`${styles.multiSelectWrap} ${disabled ? styles.multiSelectDisabled : ""}`}
    >
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

export default function PPNotebookBatchThresholdPage() {
  const dispatch = useDispatch();
  const router = useRouter();
  const user = useSelector((state) => state.auth?.user);
  const isHydrated = useSelector((state) => state.auth?.isHydrated);
  const users = useSelector((state) => state.users?.users || []);
  const canAccessPage = isFullAccessUser(user);

  const [form, setForm] = useState(createFormState);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [lastSavedAt, setLastSavedAt] = useState("");
  const [subDepartments, setSubDepartments] = useState([]);
  const [subDepartmentTatRows, setSubDepartmentTatRows] = useState([]);
  const [savingSubDepartmentTat, setSavingSubDepartmentTat] = useState(false);
  const [subDepartmentTatMessage, setSubDepartmentTatMessage] = useState("");
  const [subDepartmentTatError, setSubDepartmentTatError] = useState("");

  const l1Options = useMemo(() => buildUserOptions(users, "L1"), [users]);
  const l2Options = useMemo(() => buildUserOptions(users, "L2"), [users]);
  const l3Options = useMemo(() => buildUserOptions(users, "L3"), [users]);
  const l4Options = useMemo(() => buildUserOptions(users, "L4"), [users]);
  const l5Options = useMemo(() => buildUserOptions(users, "L5"), [users]);

  const populateFromConfig = (config) => {
    if (!config) return;
    setForm({
      completionThresholdHours: String(config.completion_threshold_hours ?? ""),
      l2TatHours: String(config.l2_tat_hours ?? ""),
      l3TatHours: String(config.l3_tat_hours ?? ""),
      l4TatHours: String(config.l4_tat_hours ?? ""),
      l5TatHours: String(config.l5_tat_hours ?? ""),
      approvalL1Ids: normalizeIdList(config.approval_l1_user_ids),
      approvalL2Ids: normalizeIdList(config.approval_l2_user_ids),
      approvalL3Ids: normalizeIdList(config.approval_l3_user_ids),
      approvalL4Ids: normalizeIdList(config.approval_l4_user_ids),
      approvalL5Ids: normalizeIdList(config.approval_l5_user_ids),
    });
    setLastSavedAt(config.updated_at || config.created_at || "");
  };

  const loadConfig = async () => {
    if (!canAccessPage) return;
    setLoading(true);
    try {
      const { config, subDepartments: nextSubDepartments, subDepartmentTat } = await fetchPpNotebookBatchConfigAPI();
      populateFromConfig(config);
      setSubDepartments(nextSubDepartments);
      setSubDepartmentTatRows(
        subDepartmentTat.map((row) => ({
          subDepartment: row.sub_department,
          completionThresholdHours: String(row.completion_threshold_hours ?? ""),
        }))
      );
      setError("");
    } catch (err) {
      setError(err?.message || "Unable to load the PP batch completion threshold.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isHydrated) return;
    if (!canAccessPage) {
      router.replace("/departments");
      return;
    }
    loadConfig();
    dispatch(fetchUsers());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAccessPage, isHydrated]);

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setMessage("");
    setError("");
  };

  const handleSave = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");

    try {
      const completionThresholdHours = Number(form.completionThresholdHours);
      if (!Number.isFinite(completionThresholdHours) || completionThresholdHours <= 0) {
        throw new Error("Please enter a completion threshold greater than 0 hours.");
      }

      const l2TatHours = Number(form.l2TatHours);
      if (!Number.isFinite(l2TatHours) || l2TatHours <= 0) {
        throw new Error("Please enter an L2 TAT greater than 0 hours.");
      }

      if (!form.approvalL1Ids.length) {
        throw new Error("Please select at least one L1 user.");
      }

      if (!form.approvalL2Ids.length) {
        throw new Error("Please select at least one L2 user.");
      }

      // L3/L4/L5 are optional - a ticket simply stops auto-escalating past
      // whichever tier has no TAT hours set, rather than requiring the full
      // L1-L5 chain to be configured up front.
      const parseOptionalTatHours = (value) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
      };
      const l3TatHours = parseOptionalTatHours(form.l3TatHours);
      const l4TatHours = parseOptionalTatHours(form.l4TatHours);
      const l5TatHours = parseOptionalTatHours(form.l5TatHours);

      const payload = {
        completion_threshold_hours: completionThresholdHours,
        l2_tat_hours: l2TatHours,
        l3_tat_hours: l3TatHours,
        l4_tat_hours: l4TatHours,
        l5_tat_hours: l5TatHours,
        approval_l1_user_ids: form.approvalL1Ids.map((id) => Number(id)),
        approval_l2_user_ids: form.approvalL2Ids.map((id) => Number(id)),
        approval_l3_user_ids: form.approvalL3Ids.map((id) => Number(id)),
        approval_l4_user_ids: form.approvalL4Ids.map((id) => Number(id)),
        approval_l5_user_ids: form.approvalL5Ids.map((id) => Number(id)),
        is_active: true,
      };

      const response = await savePpNotebookBatchConfigAPI(payload);
      setMessage(response?.message || "PP batch completion threshold saved successfully.");
      await loadConfig();
    } catch (err) {
      setError(
        err?.response?.data?.message ||
          err?.response?.data?.error ||
          err?.message ||
          "Failed to save the PP batch completion threshold."
      );
    } finally {
      setSaving(false);
    }
  };

  const updateSubDepartmentTatRow = (subDepartment, value) => {
    setSubDepartmentTatRows((current) =>
      current.map((row) => (row.subDepartment === subDepartment ? { ...row, completionThresholdHours: value } : row))
    );
    setSubDepartmentTatMessage("");
    setSubDepartmentTatError("");
  };

  const handleSaveSubDepartmentTat = async (event) => {
    event.preventDefault();
    setSavingSubDepartmentTat(true);
    setSubDepartmentTatMessage("");
    setSubDepartmentTatError("");

    try {
      const rows = subDepartmentTatRows.map((row) => {
        const hours = Number(row.completionThresholdHours);
        if (!Number.isFinite(hours) || hours <= 0) {
          throw new Error(`Please enter a TAT greater than 0 hours for ${row.subDepartment}.`);
        }
        return { sub_department: row.subDepartment, completion_threshold_hours: hours };
      });

      const response = await savePpBatchSubDepartmentTatAPI(rows);
      setSubDepartmentTatMessage(response?.message || "Sub-department TAT saved successfully.");
    } catch (err) {
      setSubDepartmentTatError(
        err?.response?.data?.message || err?.response?.data?.error || err?.message || "Failed to save sub-department TAT."
      );
    } finally {
      setSavingSubDepartmentTat(false);
    }
  };

  if (!isHydrated || !canAccessPage) return null;

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <div className={styles.intro}>
          <h1>PP Batch Completion Threshold</h1>
          <p>Set how long L1 has to complete a PP batch, and who reviews it.</p>
        </div>

        <form className={styles.stack} onSubmit={handleSave}>
          <section className={styles.sectionPlain}>
            <div className={styles.ruleCard}>
              <div className={styles.ruleGrid}>
                <label className={styles.field}>
                  <span>Completion Threshold (Hours)</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={form.completionThresholdHours}
                    onChange={(event) => updateField("completionThresholdHours", event.target.value)}
                    disabled={loading}
                  />
                </label>

                <label className={styles.field}>
                  <span>L1 (Responsible to Complete)</span>
                  <MultiUserSelect
                    value={form.approvalL1Ids}
                    options={l1Options}
                    onChange={(nextIds) => updateField("approvalL1Ids", nextIds)}
                    disabled={loading}
                    placeholder={l1Options.length ? "Select" : "No L1 users available"}
                    emptyLabel="No L1 users available"
                  />
                </label>

                <label className={styles.field}>
                  <span>L2 (Escalation Approver)</span>
                  <MultiUserSelect
                    value={form.approvalL2Ids}
                    options={l2Options}
                    onChange={(nextIds) => updateField("approvalL2Ids", nextIds)}
                    disabled={loading}
                    placeholder={l2Options.length ? "Select" : "No L2 users available"}
                    emptyLabel="No L2 users available"
                  />
                </label>

                <label className={styles.field}>
                  <span>L2 TAT (Hours)</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={form.l2TatHours}
                    onChange={(event) => updateField("l2TatHours", event.target.value)}
                    disabled={loading}
                  />
                </label>

                <label className={styles.field}>
                  <span>L3 (Sub Manager) — optional</span>
                  <MultiUserSelect
                    value={form.approvalL3Ids}
                    options={l3Options}
                    onChange={(nextIds) => updateField("approvalL3Ids", nextIds)}
                    disabled={loading}
                    placeholder={l3Options.length ? "Select" : "No L3 users available"}
                    emptyLabel="No L3 users available"
                  />
                </label>

                <label className={styles.field}>
                  <span>L3 TAT (Hours)</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={form.l3TatHours}
                    onChange={(event) => updateField("l3TatHours", event.target.value)}
                    disabled={loading}
                    placeholder="Leave blank to not escalate to L3"
                  />
                </label>

                <label className={styles.field}>
                  <span>L4 (Quality/Dept Head) — optional</span>
                  <MultiUserSelect
                    value={form.approvalL4Ids}
                    options={l4Options}
                    onChange={(nextIds) => updateField("approvalL4Ids", nextIds)}
                    disabled={loading}
                    placeholder={l4Options.length ? "Select" : "No L4 users available"}
                    emptyLabel="No L4 users available"
                  />
                </label>

                <label className={styles.field}>
                  <span>L4 TAT (Hours)</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={form.l4TatHours}
                    onChange={(event) => updateField("l4TatHours", event.target.value)}
                    disabled={loading}
                    placeholder="Leave blank to not escalate to L4"
                  />
                </label>

                <label className={styles.field}>
                  <span>L5 (Admin/MD) — optional</span>
                  <MultiUserSelect
                    value={form.approvalL5Ids}
                    options={l5Options}
                    onChange={(nextIds) => updateField("approvalL5Ids", nextIds)}
                    disabled={loading}
                    placeholder={l5Options.length ? "Select" : "No L5 users available"}
                    emptyLabel="No L5 users available"
                  />
                </label>

                <label className={styles.field}>
                  <span>L5 TAT (Hours)</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={form.l5TatHours}
                    onChange={(event) => updateField("l5TatHours", event.target.value)}
                    disabled={loading}
                    placeholder="Leave blank to not escalate to L5"
                  />
                </label>

                <div className={styles.ruleActions}>
                  <FiClock aria-hidden="true" />
                </div>
              </div>
            </div>

            {lastSavedAt ? (
              <p style={{ color: "#7b89a0", fontSize: "12px" }}>
                Last updated: {formatTimestamp(lastSavedAt)}
              </p>
            ) : null}

            <div className={styles.formFooter}>
              <div className={styles.actionButtons}>
                <button type="submit" className={styles.saveButton} disabled={saving || loading}>
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>

            {message ? <p className={styles.successMessage}>{message}</p> : null}
            {error ? <p className={styles.errorMessage}>{error}</p> : null}
          </section>
        </form>

        <form onSubmit={handleSaveSubDepartmentTat}>
          <section className={`${styles.card} ${styles.existingThresholdCard}`}>
            <div className={styles.sectionHeader}>
              <h2>Sub-Department TAT</h2>
            </div>
            <p style={{ color: "#7b89a0", fontSize: "12px", marginTop: "-8px" }}>
              Each participating sub-department gets its own completion TAT, timed from the first
              department&apos;s PP submission. Falls back to the global Completion Threshold above if unset.
            </p>
            <div className={styles.tableWrap}>
              <table className={`${styles.table} ${styles.existingThresholdTable}`}>
                <thead>
                  <tr>
                    <th>Sub-Department</th>
                    <th>Completion TAT (Hours)</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={2}>Loading...</td>
                    </tr>
                  ) : !subDepartmentTatRows.length ? (
                    <tr>
                      <td colSpan={2}>No sub-departments found.</td>
                    </tr>
                  ) : (
                    subDepartmentTatRows.map((row) => (
                      <tr key={row.subDepartment}>
                        <td>{row.subDepartment}</td>
                        <td>
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={row.completionThresholdHours}
                            onChange={(event) => updateSubDepartmentTatRow(row.subDepartment, event.target.value)}
                            style={{ width: "100px" }}
                          />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className={styles.formFooter}>
              <div className={styles.actionButtons}>
                <button type="submit" className={styles.saveButton} disabled={savingSubDepartmentTat || loading}>
                  {savingSubDepartmentTat ? "Saving..." : "Save Sub-Department TAT"}
                </button>
              </div>
            </div>

            {subDepartmentTatMessage ? <p className={styles.successMessage}>{subDepartmentTatMessage}</p> : null}
            {subDepartmentTatError ? <p className={styles.errorMessage}>{subDepartmentTatError}</p> : null}
          </section>
        </form>

        <section className={`${styles.card} ${styles.existingThresholdCard}`}>
          <div className={styles.sectionHeader}>
            <h2>Tracked Notebooks</h2>
          </div>
          <div className={styles.tableWrap}>
            <table className={`${styles.table} ${styles.existingThresholdTable}`}>
              <thead>
                <tr>
                  <th>Sub-Department</th>
                  <th>Notebook</th>
                  <th>Last Entry ID</th>
                  <th>Submitted By</th>
                  <th>Submitted At</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6}>Loading...</td>
                  </tr>
                ) : !subDepartments.length ? (
                  <tr>
                    <td colSpan={6}>No tracked notebooks found.</td>
                  </tr>
                ) : (
                  subDepartments.flatMap((group) =>
                    getGroupNotebooks(group).map((notebook, index) => {
                      const entry = getLastSavedEntry(notebook);
                      const rowKey = `${getSubDepartmentName(group)}-${getNotebookIdentifier(notebook)}-${index}`;
                      return (
                        <tr key={rowKey}>
                          <td>{getSubDepartmentName(group) || "-"}</td>
                          <td>{getNotebookLabel(notebook) || "-"}</td>
                          <td>{entry ? getEntryId(entry) : "-"}</td>
                          <td>{entry ? getEntrySubmittedBy(entry) : "-"}</td>
                          <td>{entry ? formatTimestamp(getEntrySubmittedAt(entry)) : "-"}</td>
                          <td>
                            <span
                              className={`${styles.statusBadge} ${
                                entry ? styles.statusActive : styles.statusInactive
                              }`}
                            >
                              {entry ? "Reporting" : "Never Submitted"}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
