import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { useDispatch, useSelector } from "react-redux";
import { FiClock } from "react-icons/fi";

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

// Employee-Hierarchy-and-Workflow-System_V2.pdf, "PP Approval & Wheel Change
// Approval Configuration": both share the same config shape - a specific L4
// Department Head plus a TAT. This component drives both screens; only the
// title/copy and the fetch/save functions differ between them.
export default function ApprovalThresholdPage({ title, subtitle, redirectHref, fetchConfigAPI, saveConfigAPI }) {
  const dispatch = useDispatch();
  const router = useRouter();
  const user = useSelector((state) => state.auth?.user);
  const isHydrated = useSelector((state) => state.auth?.isHydrated);
  const users = useSelector((state) => state.users?.users || []);
  const canAccessPage = isFullAccessUser(user);

  const [l4UserId, setL4UserId] = useState("");
  const [tatHours, setTatHours] = useState("24");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [lastSavedAt, setLastSavedAt] = useState("");

  const l4Options = useMemo(() => buildL4Options(users), [users]);

  const loadConfig = async () => {
    if (!canAccessPage) return;
    setLoading(true);
    try {
      const config = await fetchConfigAPI();
      setL4UserId(config?.l4_user_id ? String(config.l4_user_id) : "");
      setTatHours(String(config?.tat_hours ?? "24"));
      setLastSavedAt(config?.updated_at || "");
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
        l4_user_id: l4UserId ? Number(l4UserId) : null,
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

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <div className={styles.intro}>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>

        <form className={styles.stack} onSubmit={handleSave}>
          <section className={styles.sectionPlain}>
            <div className={styles.ruleCard}>
              <div className={styles.ruleGrid}>
                <label className={styles.field}>
                  <span>L4 User (Department Head)</span>
                  <select
                    value={l4UserId}
                    onChange={(event) => {
                      setL4UserId(event.target.value);
                      setMessage("");
                      setError("");
                    }}
                    disabled={loading}
                  >
                    <option value="">Any current L4 user (no specific approver)</option>
                    {l4Options.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                      </option>
                    ))}
                  </select>
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
      </div>
    </div>
  );
}
