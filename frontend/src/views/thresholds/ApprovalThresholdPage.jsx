import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { useDispatch, useSelector } from "react-redux";
import { FiCheckCircle, FiClock, FiSlash } from "react-icons/fi";
import { FaIdCard } from "react-icons/fa6";

import { fetchUsers } from "@/store/slices/userSlice";
import { isFullAccessUser } from "@/utils/accessControl";
import styles from "@/styles/SubmissionThreshold.module.css";

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
  const [searchText, setSearchText] = useState("");

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

  useEffect(() => {
    if (!isOpen) setSearchText("");
  }, [isOpen]);

  const selectedIds = new Set(normalizeIdList(value));
  const selectedNames = options
    .filter((option) => selectedIds.has(String(option.id)))
    .map((option) => option.name);
  const selectedLabel =
    selectedNames.length > 0
      ? `${selectedNames.length} user${selectedNames.length > 1 ? "s" : ""} selected`
      : placeholder;
  const filteredOptions = searchText.trim()
    ? options.filter((option) => option.name?.toLowerCase().includes(searchText.trim().toLowerCase()))
    : options;

  return (
    <div
      ref={containerRef}
      className={`${styles.multiSelectWrap} ${disabled ? styles.multiSelectDisabled : ""}`}
    >
      <div className={styles.multiSelectButton}>
        <input
          type="text"
          className={styles.multiSelectValue}
          value={isOpen ? searchText : ""}
          placeholder={selectedLabel}
          onFocus={() => !disabled && setIsOpen(true)}
          onChange={(event) => {
            setSearchText(event.target.value);
            if (!disabled) setIsOpen(true);
          }}
          disabled={disabled}
        />
        <span
          className={styles.multiSelectChevron}
          onClick={() => {
            if (!disabled) setIsOpen((current) => !current);
          }}
        >
          {isOpen ? "^" : "v"}
        </span>
      </div>

      {isOpen ? (
        <div className={styles.multiSelectMenu}>
          {filteredOptions.length ? (
            filteredOptions.map((option) => {
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

// Employee-Hierarchy-and-Workflow-System_V2.pdf, "PP Approval & Wheel Change
// Approval Configuration": both share the same config shape - a specific L4
// Department Head plus a TAT. As many L4 approvers as needed can be assigned
// (not just one), matching the multi-select pattern used everywhere else in
// this app's threshold screens. This component drives both screens; only the
// title/copy and the fetch/save functions differ between them.
export default function ApprovalThresholdPage({
  title,
  subtitle,
  redirectHref,
  fetchConfigAPI,
  saveConfigAPI,
  standalone = true,
}) {
  const dispatch = useDispatch();
  const router = useRouter();
  const user = useSelector((state) => state.auth?.user);
  const isHydrated = useSelector((state) => state.auth?.isHydrated);
  const users = useSelector((state) => state.users?.users || []);
  const canAccessPage = isFullAccessUser(user);

  const [l4UserIds, setL4UserIds] = useState([]);
  const [tatHours, setTatHours] = useState("24");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [lastSavedAt, setLastSavedAt] = useState("");
  const [hasSavedConfig, setHasSavedConfig] = useState(false);

  const l4Options = useMemo(() => buildL4Options(users), [users]);

  const loadConfig = async () => {
    if (!canAccessPage) return;
    setLoading(true);
    try {
      const config = await fetchConfigAPI();
      setL4UserIds(normalizeIdList(config?.l4_user_ids));
      setTatHours(String(config?.tat_hours ?? "24"));
      setLastSavedAt(config?.updated_at || "");
      setHasSavedConfig(Boolean(config?.updated_at));
      setError("");
    } catch (err) {
      setError(err?.message || "Unable to load the approval configuration.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isHydrated) return;
    if (!canAccessPage) {
      router.replace(redirectHref);
      return;
    }
    loadConfig();
    dispatch(fetchUsers());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAccessPage, isHydrated]);

  const handleSave = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");

    try {
      const hours = Number(tatHours);
      if (!Number.isFinite(hours) || hours <= 0) {
        throw new Error("Please enter a TAT greater than 0 hours.");
      }

      const payload = {
        l4_user_ids: l4UserIds.map((id) => Number(id)),
        tat_hours: hours,
      };

      const response = await saveConfigAPI(payload);
      setMessage(response?.message || "Configuration saved successfully.");
      await loadConfig();
    } catch (err) {
      setError(
        err?.response?.data?.message || err?.response?.data?.error || err?.message || "Failed to save configuration."
      );
    } finally {
      setSaving(false);
    }
  };

  if (!isHydrated || !canAccessPage) return null;

  const totalThresholds = hasSavedConfig ? 1 : 0;
  const activeThresholds = hasSavedConfig ? 1 : 0;
  const inactiveThresholds = hasSavedConfig ? 0 : 1;

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
            <h2>{title}</h2>
          </div>
          <div className={styles.ruleCard}>
            <div className={styles.ruleGrid}>
              <label className={styles.field}>
                <span>L4 User(s) (Department Head)</span>
                <MultiUserSelect
                  value={l4UserIds}
                  options={l4Options}
                  onChange={(nextIds) => {
                    setL4UserIds(nextIds);
                    setMessage("");
                    setError("");
                  }}
                  disabled={loading}
                  placeholder={l4Options.length ? "Any current L4 user (no specific approver)" : "No L4 users available"}
                  emptyLabel="No L4 users available"
                />
              </label>

              <label className={styles.field}>
                <span>TAT (Hours)</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={tatHours}
                  onChange={(event) => {
                    setTatHours(event.target.value);
                    setMessage("");
                    setError("");
                  }}
                  disabled={loading}
                />
              </label>

              <div className={styles.ruleActions}>
                <FiClock aria-hidden="true" />
              </div>
            </div>
          </div>

          <p style={{ color: "#7b89a0", fontSize: "12px" }}>
            If no specific L4 user is selected, the approval task is raised on every current L4 user. If L4
            doesn&apos;t act within the TAT, the ticket automatically escalates to L5 Executive Leadership.
          </p>

          {lastSavedAt ? (
            <p style={{ color: "#7b89a0", fontSize: "12px" }}>Last updated: {formatTimestamp(lastSavedAt)}</p>
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
    </>
  );

  if (!standalone) {
    return content;
  }

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <div className={styles.intro}>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        {content}
      </div>
    </div>
  );
}
