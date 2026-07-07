import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { useDispatch, useSelector } from "react-redux";
import { FiClock } from "react-icons/fi";

import {
  fetchPpNotebookBatchConfigAPI,
  savePpNotebookBatchConfigAPI,
} from "@/apis/ppNotebookBatchConfigApi";
import { fetchUsers } from "@/store/slices/userSlice";
import { isFullAccessUser } from "@/utils/accessControl";
import styles from "@/styles/SubmissionThreshold.module.css";

const PP_REQUIRED_NOTEBOOKS = [
  { subDepartment: "Mixing", screenName: "Process Parameter" },
  { subDepartment: "Blow Room", screenName: "Process Parameter" },
  { subDepartment: "Carding", screenName: "Process Parameter" },
  { subDepartment: "Draw Frame", screenName: "PP - Breaker Drawing" },
  { subDepartment: "Draw Frame", screenName: "PP - Finisher Drawing" },
  { subDepartment: "Simplex", screenName: "Process Parameter" },
  { subDepartment: "Spinning", screenName: "Process Parameter" },
  { subDepartment: "Autoconer", screenName: "Process Parameter" },
  { subDepartment: "Autoconer", screenName: "PP - Autoconer Q2" },
  { subDepartment: "Autoconer", screenName: "PP - Autoconer Q3" },
];

const createFormState = () => ({
  completionThresholdHours: "",
  l2TatHours: "",
  approvalL1Ids: [],
  approvalL2Ids: [],
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

  const l1Options = useMemo(() => buildUserOptions(users, "L1"), [users]);
  const l2Options = useMemo(() => buildUserOptions(users, "L2"), [users]);

  const populateFromConfig = (config) => {
    if (!config) return;
    setForm({
      completionThresholdHours: String(config.completion_threshold_hours ?? ""),
      l2TatHours: String(config.l2_tat_hours ?? ""),
      approvalL1Ids: normalizeIdList(config.approval_l1_user_ids),
      approvalL2Ids: normalizeIdList(config.approval_l2_user_ids),
    });
    setLastSavedAt(config.updated_at || config.created_at || "");
  };

  const loadConfig = async () => {
    if (!canAccessPage) return;
    setLoading(true);
    try {
      const config = await fetchPpNotebookBatchConfigAPI();
      populateFromConfig(config);
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

      const payload = {
        completion_threshold_hours: completionThresholdHours,
        l2_tat_hours: l2TatHours,
        approval_l1_user_ids: form.approvalL1Ids.map((id) => Number(id)),
        approval_l2_user_ids: form.approvalL2Ids.map((id) => Number(id)),
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

  if (!isHydrated || !canAccessPage) return null;

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <div className={styles.intro}>
          <h1>PP Batch Completion Threshold</h1>
          <p>
            One PP Entry ID spans up to 10 department screens. L1 is responsible for getting all of
            them completed within the threshold below. A ticket is only raised once L1 has already
            missed that deadline — it's created in L1's name for review, and escalated to L2 to
            approve. If L2 doesn't act within the L2 TAT, the ticket expires.
          </p>
        </div>

        <form className={styles.stack} onSubmit={handleSave}>
          <section className={styles.sectionPlain}>
            <div className={styles.sectionHeader}>
              <h2>Tracked Screens</h2>
            </div>
            <p style={{ color: "#7b89a0", fontSize: "13px", marginTop: 0 }}>
              A batch (single Entry ID) is considered complete only once all of the following have a
              logged submission:
            </p>
            <ul style={{ margin: "0 0 8px", paddingLeft: "20px", color: "#42516a", fontSize: "13px" }}>
              {PP_REQUIRED_NOTEBOOKS.map((item) => (
                <li key={`${item.subDepartment}-${item.screenName}`}>
                  {item.subDepartment} — {item.screenName}
                </li>
              ))}
            </ul>
          </section>

          <section className={styles.sectionPlain}>
            <div className={styles.sectionHeader}>
              <h2>Set the Completion Threshold</h2>
            </div>

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
      </div>
    </div>
  );
}
