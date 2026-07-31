import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { useDispatch, useSelector } from "react-redux";
import { FiCheckCircle, FiPlus, FiSlash, FiTrash2 } from "react-icons/fi";
import { FaIdCard } from "react-icons/fa6";

import {
  fetchWheelChangeApprovalConfigListAPI,
  saveWheelChangeApprovalConfigAPI,
} from "@/apis/wheelChangeApprovalConfigApi";
import { fetchUsers } from "@/store/slices/userSlice";
import { isFullAccessUser } from "@/utils/accessControl";
import { departmentDirectory } from "@/views/departments/data";
import styles from "@/styles/SubmissionThreshold.module.css";

const SEVERITY_OPTIONS = ["High", "Medium", "Low"];

// Wheel Change / Change Control approvals are separate queues per
// sub-department today - must match backend's WHEEL_CHANGE_DEPARTMENTS in
// routes/spinning.js exactly. Sub-department display names (from
// departmentDirectory) don't always match those backend keys 1:1 (e.g.
// "Draw Frame" -> "Drawframe"), so this maps between them.
const SUB_DEPARTMENT_NAME_TO_WHEEL_CHANGE_DEPARTMENT = {
  Spinning: "Spinning",
  "Draw Frame": "Drawframe",
  Carding: "Carding",
  Simplex: "Simplex",
};

const createRule = () => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  departmentSlug: "",
  subDepartmentSlug: "",
  severity: "High",
  l4UserIds: [],
  tatHours: "24",
});

const getUserDisplayName = (user) =>
  String(user?.name || user?.full_name || user?.fullName || user?.username || "").trim();

const buildL4Options = (users) => {
  const seen = new Set();
  return users
    .filter((user) => String(user?.level || "").trim().toUpperCase() === "L4")
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

// Existing Wheel Change Approval configs (one row per department) are
// browsed/edited from the master Threshold hub's unified "Existing
// Thresholds" tab (ThresholdsHub.jsx) - this component is create/edit-only.
export default function WheelChangeApprovalThresholdPage({ standalone = true, editItem = null, onEditItemHandled } = {}) {
  const dispatch = useDispatch();
  const router = useRouter();
  const user = useSelector((state) => state.auth?.user);
  const isHydrated = useSelector((state) => state.auth?.isHydrated);
  const users = useSelector((state) => state.users?.users || []);
  const canAccessPage = isFullAccessUser(user);

  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [rules, setRules] = useState([createRule()]);

  const l4Options = useMemo(() => buildL4Options(users), [users]);

  const availableDepartments = departmentDirectory;
  const getAvailableSubDepartments = (departmentSlug) => {
    const department = availableDepartments.find((item) => item.slug === departmentSlug) || null;
    return (department?.subDepartments || []).filter(
      (subDepartment) => SUB_DEPARTMENT_NAME_TO_WHEEL_CHANGE_DEPARTMENT[subDepartment.name]
    );
  };

  const totalThresholds = configs.filter((item) => Boolean(item.updated_at)).length;
  const activeThresholds = configs.filter((item) => Boolean(item.updated_at) && item.is_active !== false).length;
  const inactiveThresholds = configs.length - activeThresholds;

  const loadConfigs = async () => {
    if (!canAccessPage) return;
    setLoading(true);
    try {
      const nextConfigs = await fetchWheelChangeApprovalConfigListAPI();
      setConfigs(nextConfigs);
      setError("");
    } catch (err) {
      setError(err?.message || "Unable to load Wheel Change Approval configuration.");
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
    loadConfigs();
    dispatch(fetchUsers());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAccessPage, isHydrated]);

  const updateRule = (ruleId, field, value) => {
    setRules((current) =>
      current.map((rule) => {
        if (rule.id !== ruleId) return rule;
        const next = { ...rule, [field]: value };
        if (field === "departmentSlug") next.subDepartmentSlug = "";
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

  const openEditDepartment = (item) => {
    const matchedSubDepartmentName = Object.keys(SUB_DEPARTMENT_NAME_TO_WHEEL_CHANGE_DEPARTMENT).find(
      (name) => SUB_DEPARTMENT_NAME_TO_WHEEL_CHANGE_DEPARTMENT[name] === item.department
    );
    const matchedDepartment = availableDepartments.find((department) =>
      department.subDepartments?.some((subDepartment) => subDepartment.name === matchedSubDepartmentName)
    );
    const matchedSubDepartment = matchedDepartment?.subDepartments?.find(
      (subDepartment) => subDepartment.name === matchedSubDepartmentName
    );

    setRules([{
      id: `${Date.now()}-edit`,
      departmentSlug: matchedDepartment?.slug || "",
      subDepartmentSlug: matchedSubDepartment?.slug || "",
      severity: item.severity || "High",
      l4UserIds: normalizeIdList(item.l4_user_ids),
      tatHours: String(item.tat_hours ?? "24"),
    }]);
    setMessage("Edit mode loaded from Existing Thresholds.");
    setError("");
  };

  useEffect(() => {
    if (!editItem) return;
    openEditDepartment(editItem);
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
        const wheelChangeDepartment = subDepartment
          ? SUB_DEPARTMENT_NAME_TO_WHEEL_CHANGE_DEPARTMENT[subDepartment.name]
          : null;

        if (!department) throw new Error("Please select a department for every row.");
        if (!wheelChangeDepartment) throw new Error("Please select a sub-department for every row.");

        const hours = Number(rule.tatHours);
        if (!Number.isFinite(hours) || hours <= 0) {
          throw new Error("Please enter Approve Within Hours greater than 0 for every row.");
        }

        return {
          department: wheelChangeDepartment,
          severity: rule.severity,
          l4_user_ids: rule.l4UserIds.map((id) => Number(id)),
          tat_hours: hours,
        };
      });

      const responses = await Promise.all(payloads.map((payload) => saveWheelChangeApprovalConfigAPI(payload)));
      setMessage(responses[0]?.message || `${payloads.length} WC threshold${payloads.length > 1 ? "s" : ""} saved successfully.`);
      setRules([createRule()]);
      await loadConfigs();
    } catch (err) {
      setError(
        err?.response?.data?.message || err?.response?.data?.error || err?.message || "Failed to save configuration."
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
            <h2>Set the Wheel Change Approval Threshold</h2>
          </div>

          <div className={styles.rulesTable}>
            {rules.map((rule, index) => {
              const availableSubDepartments = getAvailableSubDepartments(rule.departmentSlug);
              return (
                <div className={styles.ruleCard} key={rule.id}>
                  <div className={styles.ruleGrid} style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr)) auto" }}>
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
                      <span>Severity</span>
                      <select value={rule.severity} onChange={(event) => updateRule(rule.id, "severity", event.target.value)}>
                        {SEVERITY_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className={styles.field} style={{ gridColumn: "4 / 5", gridRow: "1" }}>
                      <span>L4 Approver</span>
                      <MultiUserSelect
                        value={rule.l4UserIds}
                        options={l4Options}
                        onChange={(nextIds) => updateRule(rule.id, "l4UserIds", nextIds)}
                        placeholder="Select L4 user"
                        emptyLabel="No L4 users available"
                      />
                    </label>

                    <label className={styles.field} style={{ gridColumn: "5 / 6", gridRow: "1" }}>
                      <span>Approve Within (Hours)</span>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={rule.tatHours}
                        onChange={(event) => updateRule(rule.id, "tatHours", event.target.value)}
                      />
                    </label>

                    <div className={styles.ruleActions} style={{ gridColumn: "6 / 7", gridRow: "1" }}>
                      {index === rules.length - 1 ? (
                        <button type="button" className={styles.addIconButton} onClick={addRule} aria-label="Add WC threshold row">
                          <FiPlus />
                        </button>
                      ) : (
                        <span className={styles.actionSpacer} aria-hidden="true" />
                      )}
                      <button
                        type="button"
                        className={styles.deleteIconButton}
                        onClick={() => removeRule(rule.id)}
                        aria-label="Delete WC threshold row"
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
            Once an L1 user submits a Wheel Change, it goes to L4 and the Approve Within timer starts. If L4 doesn&apos;t
            act within that time, a ticket is raised and escalates to L5 Executive Leadership. If no specific L4 user is
            selected, the approval task is raised on every current L4 user.
          </p>

          <div className={styles.formFooter}>
            <div className={styles.actionButtons}>
              <button type="button" className={styles.clearButton} onClick={() => setRules([createRule()])} disabled={saving}>
                Clear
              </button>
              <button type="submit" className={styles.saveButton} disabled={saving}>
                {saving ? "Saving..." : "Save"}
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
          <h1>WC Threshold</h1>
          <p>Set the L4 approver(s), severity and Approve Within time for each department&apos;s Wheel Change approvals.</p>
        </div>
        {content}
      </div>
    </div>
  );
}
