import { useEffect, useImperativeHandle, useState, forwardRef } from "react";
import CustomInput from "@/components/CustomInput";
import SearchableSelect from "@/components/SearchableSelect";
import useEmployeeOptions from "@/hooks/useEmployeeOptions";
import {
  fetchCardingMasterMachines,
  fetchWrappingCardingNotebookEntries,
  submitWrappingCardingNotebookEntry,
} from "@/apis/carding";
import styles from "./cardThickPlaceEntry.module.css";

const today = () => new Date().toISOString().split("T")[0];
const SHIFT_OPTIONS = ["General", "Day", "Half Night", "Full Night"];
const NUMERIC_FIELDS = ["stdHank", "avgHank", "sd", "cv"];

const toLookupKey = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");

const getValueFromSource = (source, aliases = []) => {
  if (!source || typeof source !== "object") return "";
  const wanted = aliases.map(toLookupKey);
  const key = Object.keys(source).find((item) => wanted.includes(toLookupKey(item)));
  return String(key ? source[key] : "").trim();
};

const normalizeDateForInput = (value) => {
  const text = String(value || "").trim();
  const match = text.match(/(\d{2})-(\d{2})-(\d{4})/);
  if (match) return `${match[3]}-${match[2]}-${match[1]}`;
  const isoMatch = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  return "";
};

const extractPrefillValues = (payload = {}) => {
  const values = payload?.values && typeof payload.values === "object" ? payload.values : {};
  const firstRow = Array.isArray(payload?.result?.json_output) ? payload.result.json_output[0] || {} : {};
  const source = { ...firstRow, ...values };
  const testId = getValueFromSource(source, ["Test ID", "Test Id", "test_id", "ID", "id", "entry_id", "entryId"]);
  const reportDate = getValueFromSource(source, [
    "Report Date",
    "report_date",
    "reportDate",
    "Date",
    "date",
    "entry_date",
    "entryDate",
  ]);
  const normalizedDate = normalizeDateForInput(reportDate);

  return {
    entryId: testId,
    date: normalizedDate || reportDate,
  };
};

const initialForm = () => ({
  serialNo: "",
  date: today(),
  machineName: "",
  shift: "General",
  stdHank: "",
  avgHank: "",
  sd: "",
  cv: "",
  user: "",
  remark: "",
});

const getRecordValue = (record, ...keys) => {
  for (const key of keys) {
    const value = record?.[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return "";
};

const toNumberOrNull = (value) => {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

const WrappingCardingNotebook = forwardRef(function WrappingCardingNotebook({ entryId = "" }, ref) {
  const [form, setForm] = useState(initialForm);
  const [resolvedEntryId, setResolvedEntryId] = useState(entryId);
  const [errors, setErrors] = useState({});
  const [machineOptions, setMachineOptions] = useState([]);
  const [entries, setEntries] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const { employeeOptions, employeeOptionsError, loadingEmployeeOptions } = useEmployeeOptions("carding");

  const loadEntries = async () => {
    try {
      const payload = await fetchWrappingCardingNotebookEntries({ page: 1, limit: 10 });
      const rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
      setEntries(rows);
    } catch {
      setEntries([]);
    }
  };

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [machines] = await Promise.all([
          fetchCardingMasterMachines({ prefix: "" }),
          loadEntries(),
        ]);
        if (active) setMachineOptions(Array.isArray(machines) ? machines : []);
      } catch {
        if (active) setMachineOptions([]);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (entryId) setResolvedEntryId(entryId);
  }, [entryId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem("ocr_prefill");
    if (!raw) return;
    try {
      const payload = JSON.parse(raw);
      const screen = String(payload?.screen || "").toLowerCase();
      const matchesCarding = screen.includes("carding");
      if (!matchesCarding) return;
      const prefill = extractPrefillValues(payload);
      if (prefill.entryId) setResolvedEntryId(prefill.entryId);
      if (prefill.date) setForm((current) => ({ ...current, date: prefill.date }));
      window.localStorage.removeItem("ocr_prefill");
    } catch {
      // Ignore malformed prefill payloads and keep the manual form usable.
    }
  }, []);

  const setField = (field, value) => {
    const nextValue = NUMERIC_FIELDS.includes(field)
      ? String(value || "").replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1")
      : value;
    setForm((current) => ({ ...current, [field]: nextValue }));
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const validate = () => {
    const nextErrors = {};
    ["serialNo", "date", "machineName", "shift", "stdHank", "avgHank", "sd", "cv", "user"].forEach((field) => {
      if (!String(form[field] ?? "").trim()) nextErrors[field] = true;
    });
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const buildPayload = () => ({
    s_no: Number.parseInt(form.serialNo, 10) || null,
    serial_no: Number.parseInt(form.serialNo, 10) || null,
    date: form.date,
    entry_date: form.date,
    id: resolvedEntryId,
    entry_id: resolvedEntryId,
    mac_name: form.machineName,
    machine_name: form.machineName,
    shift: form.shift,
    std_hank: toNumberOrNull(form.stdHank),
    avg_hank: toNumberOrNull(form.avgHank),
    sd: toNumberOrNull(form.sd),
    cv: toNumberOrNull(form.cv),
    user: form.user,
    user_name: form.user,
    remark: form.remark,
    remarks: form.remark,
  });

  const getPreviewData = () => [
    { label: "S.No", value: form.serialNo },
    { label: "Date", value: form.date },
    { label: "ID", value: resolvedEntryId || "-" },
    { label: "Mac Name", value: form.machineName },
    { label: "Shift", value: form.shift },
    { label: "Std. Hank", value: form.stdHank },
    { label: "Avg. Hank", value: form.avgHank },
    { label: "SD", value: form.sd },
    { label: "CV", value: form.cv },
    { label: "User", value: form.user },
    { label: "Remark", value: form.remark || "-" },
  ];

  const clear = () => {
    setForm(initialForm());
    setErrors({});
    setMessage("");
  };

  const submit = async () => {
    if (!validate()) return false;
    setLoading(true);
    setMessage("");
    try {
      await submitWrappingCardingNotebookEntry(buildPayload());
      clear();
      await loadEntries();
      return true;
    } catch (error) {
      setMessage(error.message || "Unable to save wrapping carding notebook entry.");
      return false;
    } finally {
      setLoading(false);
    }
  };

  useImperativeHandle(ref, () => ({
    validate,
    getPreviewData,
    submit,
    clear,
  }));

  return (
    <div className={styles["card-form"]}>
      <div className={styles["card-row"]}>
        <CustomInput label="S.No" value={form.serialNo} onChange={(value) => setField("serialNo", value.replace(/\D/g, ""))} error={errors.serialNo} />
        <CustomInput label="Date" type="date" value={form.date} onChange={(value) => setField("date", value)} error={errors.date} />
        <CustomInput label="ID" value={resolvedEntryId || ""} onChange={() => {}} disabled />
      </div>
      <div className={styles["card-row"]}>
        <div className={styles["card-form-group"]}>
          <label>Mac Name</label>
          <SearchableSelect
            className={errors.machineName ? styles["field-error"] : ""}
            value={form.machineName}
            onChange={(value) => setField("machineName", value)}
            options={machineOptions}
            placeholder="Select Machine"
            ariaLabel="Mac Name"
          />
        </div>
        <div className={styles["card-form-group"]}>
          <label>Shift</label>
          <SearchableSelect
            className={errors.shift ? styles["field-error"] : ""}
            value={form.shift}
            onChange={(value) => setField("shift", value)}
            options={SHIFT_OPTIONS}
            placeholder="Select Shift"
            ariaLabel="Shift"
          />
        </div>
        <div className={styles["card-form-group"]}>
          <label>User</label>
          <SearchableSelect
            className={errors.user ? styles["field-error"] : ""}
            value={form.user}
            onChange={(value) => setField("user", value)}
            options={employeeOptions}
            placeholder={
              loadingEmployeeOptions
                ? "Loading employees..."
                : employeeOptionsError
                  ? "Type employee name"
                  : "Select Employee"
            }
            ariaLabel="User"
          />
        </div>
      </div>
      <div className={styles["card-row"]}>
        <CustomInput label="Std. Hank" value={form.stdHank} onChange={(value) => setField("stdHank", value)} error={errors.stdHank} />
        <CustomInput label="Avg. Hank" value={form.avgHank} onChange={(value) => setField("avgHank", value)} error={errors.avgHank} />
        <CustomInput label="SD" value={form.sd} onChange={(value) => setField("sd", value)} error={errors.sd} />
        <CustomInput label="CV" value={form.cv} onChange={(value) => setField("cv", value)} error={errors.cv} />
      </div>
      <div className={styles["card-row"]}>
        <div className={styles["card-form-group"]}>
          <label>Remark</label>
          <textarea value={form.remark} onChange={(event) => setField("remark", event.target.value)} />
        </div>
      </div>

      {message ? <div className={styles["message-box"]}>{message}</div> : null}
      {loading ? <div className={styles["message-box"]}>Saving...</div> : null}

      <div className={styles["card-machine-section"]}>
        <div className={styles["card-machine-header"]}>
          <h4>Last 10 Entries</h4>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: "900px", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["S.No", "Date", "ID", "Mac Name", "Shift", "Std. Hank", "Avg. Hank", "SD", "CV", "User", "Remark"].map((head) => (
                  <th key={head} style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #dbe4f0" }}>{head}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.length ? entries.map((entry, index) => (
                <tr key={getRecordValue(entry, "id", "entry_id") || index}>
                  {[
                    getRecordValue(entry, "s_no", "serial_no", "S.No"),
                    getRecordValue(entry, "date", "entry_date", "Date"),
                    getRecordValue(entry, "entry_id", "id", "ID"),
                    getRecordValue(entry, "mac_name", "machine_name", "Mac Name"),
                    getRecordValue(entry, "shift", "Shift"),
                    getRecordValue(entry, "std_hank", "Std. Hank"),
                    getRecordValue(entry, "avg_hank", "Avg. Hank"),
                    getRecordValue(entry, "sd", "SD"),
                    getRecordValue(entry, "cv", "CV"),
                    getRecordValue(entry, "user", "user_name", "User"),
                    getRecordValue(entry, "remark", "remarks", "Remark"),
                  ].map((cell, cellIndex) => (
                    <td key={cellIndex} style={{ padding: "10px", borderBottom: "1px solid #e5edf7" }}>{String(cell || "-")}</td>
                  ))}
                </tr>
              )) : (
                <tr>
                  <td colSpan={11} style={{ padding: "12px" }}>No entries found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
});

export default WrappingCardingNotebook;
