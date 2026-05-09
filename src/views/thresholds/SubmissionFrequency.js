import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useSelector } from "react-redux";

import {
  fetchSubmissionFrequencyConfigsAPI,
  runSubmissionFrequencyCheckAPI,
  saveSubmissionFrequencyConfigAPI,
} from "@/apis/submissionFrequencyApi";
import { isFullAccessUser } from "@/utils/accessControl";
import { departmentDirectory } from "@/views/departments/data";
import { getThresholdScreensForSubDepartment } from "@/views/thresholds/screenCatalog";
import styles from "@/styles/SubmissionFrequency.module.css";

const defaultForm = {
  screen_name: "",
  department: "",
  sub_department: "",
  frequency_days: 1,
  is_active: true,
};

export default function SubmissionFrequency() {
  const router = useRouter();
  const user = useSelector((state) => state.auth?.user);
  const isHydrated = useSelector((state) => state.auth?.isHydrated);
  const canAccessPage = isFullAccessUser(user);

  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [selectedDepartmentSlug, setSelectedDepartmentSlug] = useState("quality-control");
  const [selectedSubDepartmentSlug, setSelectedSubDepartmentSlug] = useState("");

  const loadConfigs = async () => {
    if (!canAccessPage) return;
    setLoading(true);
    try {
      const data = await fetchSubmissionFrequencyConfigsAPI();
      setConfigs(data);
      setError("");
    } catch (err) {
      setError(err?.message || "Unable to load frequency configurations.");
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
    loadConfigs();
  }, [canAccessPage, isHydrated, router]);

  const onChange = (event) => {
    const { name, value } = event.target;
    if (name === "is_active") {
      setForm((current) => ({ ...current, is_active: value === "true" }));
      return;
    }
    setForm((current) => ({ ...current, [name]: value }));
  };

  const availableDepartments = departmentDirectory.filter((item) => item.enabled);
  const selectedDepartment =
    availableDepartments.find((item) => item.slug === selectedDepartmentSlug) || null;
  const availableSubDepartments = (selectedDepartment?.subDepartments || []).filter(
    (item) => item.enabled
  );
  const availableScreens =
    selectedDepartmentSlug && selectedSubDepartmentSlug
      ? getThresholdScreensForSubDepartment(selectedDepartmentSlug, selectedSubDepartmentSlug)
      : [];

  const onDepartmentSelect = (event) => {
    const nextDepartmentSlug = event.target.value;
    setSelectedDepartmentSlug(nextDepartmentSlug);
    setSelectedSubDepartmentSlug("");
    setForm((current) => ({
      ...current,
      department: departmentDirectory.find((item) => item.slug === nextDepartmentSlug)?.name || "",
      sub_department: "",
      screen_name: "",
    }));
  };

  const onSubDepartmentSelect = (event) => {
    const nextSubDepartmentSlug = event.target.value;
    setSelectedSubDepartmentSlug(nextSubDepartmentSlug);
    const departmentName =
      departmentDirectory.find((item) => item.slug === selectedDepartmentSlug)?.name || "";
    const subDepartmentName =
      departmentDirectory
        .find((item) => item.slug === selectedDepartmentSlug)
        ?.subDepartments?.find((item) => item.slug === nextSubDepartmentSlug)?.name || "";

    setForm((current) => ({
      ...current,
      department: departmentName,
      sub_department: subDepartmentName,
      screen_name: "",
    }));
  };

  const onSave = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");
    try {
      if (!form.screen_name) {
        throw new Error("Please select a screen name.");
      }

      const frequencyDays = Number(form.frequency_days);
      if (!Number.isFinite(frequencyDays) || frequencyDays < 1) {
        throw new Error("Frequency days must be a positive integer.");
      }

      const payload = {
        screen_name: form.screen_name,
        department: form.department || null,
        sub_department: form.sub_department || null,
        frequency: frequencyDays,
        is_active: form.is_active,
      };
      await saveSubmissionFrequencyConfigAPI(payload);
      setMessage("Submission frequency saved successfully.");
      setForm(defaultForm);
      await loadConfigs();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Failed to save frequency.");
    } finally {
      setSaving(false);
    }
  };

  const onRunCheck = async () => {
    setChecking(true);
    setMessage("");
    setError("");
    try {
      const result = await runSubmissionFrequencyCheckAPI();
      setMessage(
        `Check complete: ${result?.created_count || 0} ticket(s) created, ${result?.skipped_count || 0} skipped.`
      );
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Failed to run frequency check.");
    } finally {
      setChecking(false);
    }
  };

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <h1 className={styles.title}>Submission Frequency</h1>
        <p className={styles.subtitle}>
          Configure submission frequency (in days) for each input screen. Supported values: 1, 2, 3, 7, 14, 30, or any positive integer.
        </p>

        <form onSubmit={onSave}>
          <div className={styles.formGrid}>
            <div className={styles.field}>
              <label htmlFor="department_select">Department</label>
              <select
                id="department_select"
                value={selectedDepartmentSlug}
                onChange={onDepartmentSelect}
                required
              >
                <option value="">Select Department</option>
                {availableDepartments.map((item) => (
                  <option key={item.slug} value={item.slug}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.field}>
              <label htmlFor="sub_department_select">Sub Department</label>
              <select
                id="sub_department_select"
                value={selectedSubDepartmentSlug}
                onChange={onSubDepartmentSelect}
                required
              >
                <option value="">Select Sub Department</option>
                {availableSubDepartments.map((item) => (
                  <option key={item.slug} value={item.slug}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.field}>
              <label htmlFor="screen_name">Screen Name</label>
              <select
                id="screen_name"
                name="screen_name"
                value={form.screen_name}
                onChange={onChange}
                required
              >
                <option value="">Select Screen</option>
                {availableScreens.map((screenName) => (
                  <option key={screenName} value={screenName}>
                    {screenName}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.field}>
              <label htmlFor="frequency_days">Frequency (Days)</label>
              <input
                id="frequency_days"
                name="frequency_days"
                type="number"
                min="1"
                step="1"
                value={form.frequency_days}
                onChange={onChange}
                required
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="is_active">Status</label>
              <select id="is_active" name="is_active" value={String(form.is_active)} onChange={onChange}>
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </div>
          </div>

          <div className={styles.actions}>
            <button className={`${styles.button} ${styles.primary}`} type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save Frequency"}
            </button>
            <button
              className={`${styles.button} ${styles.secondary}`}
              type="button"
              onClick={onRunCheck}
              disabled={checking}
            >
              {checking ? "Checking..." : "Run Frequency Check"}
            </button>
          </div>
        </form>

        {message ? <p className={`${styles.message} ${styles.success}`}>{message}</p> : null}
        {error ? <p className={`${styles.message} ${styles.error}`}>{error}</p> : null}
      </section>

      <section className={styles.card}>
        <h2 className={styles.title}>Configured Screens</h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Screen</th>
                <th>Department</th>
                <th>Sub Department</th>
                <th>Frequency</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5}>Loading...</td>
                </tr>
              ) : configs.length === 0 ? (
                <tr>
                  <td colSpan={5}>No frequency configs found.</td>
                </tr>
              ) : (
                configs.map((item) => (
                  <tr key={item.id}>
                    <td>{item.screen_name}</td>
                    <td>{item.department || "-"}</td>
                    <td>{item.sub_department || "-"}</td>
                    <td>{item.frequency} day{item.frequency !== 1 ? "s" : ""}</td>
                    <td>
                      <span
                        className={`${styles.pill} ${item.is_active ? styles.active : styles.inactive}`}
                      >
                        {item.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
