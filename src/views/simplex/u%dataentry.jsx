import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import styles from "@/styles/u%dataentry.module.css";
import { useDispatch, useSelector } from "react-redux";
import SearchableSelect from "@/components/SearchableSelect";
import { sanitizeNumericInput } from "@/utils/inputValidation";
import { fetchSimplexMachineMaster, fetchSimplexUqcMasterDropdown } from "@/apis/simplex";
import { createSmxMachineOptions } from "@/views/simplex/smxMachineNames";
import { getSimplexUqcEntries, submitSimplexUqc } from "@/store/slices/simplex";

const initialForm = () => ({
  date: new Date().toISOString().split("T")[0],
  shift: "",
  variety: "",
  mc_no: "",
  smx_no: "",
  smx_no_proposed: "",
  u_percent: "",
  cvm: "",
  im_cvm: "",
  m3_cvm: "",
  remarks: "",
});

const defaultFieldStyle = { backgroundColor: "#f1f5f9" };
const SHIFT_OPTIONS = ["General", "Day", "Half Night", "Full Night"];
const MC_NO_OPTIONS = [{ mc_no: "FR DSS-1", mc_name: "FR DSS-1", value: "FR DSS-1", label: "FR DSS-1", dept_code: "", dept_name: "" }];
const VARIETY_OPTIONS = ["WPSF 0.90"];

const normalizeMachineOption = (item) => {
  const value = String(item?.value || item?.mc_no || item?.machine_no || item?.mcName || item || "").trim();
  const label = String(item?.label || item?.mc_name || item?.machine_name || value || "").trim();
  return value ? { value, label: label || value } : null;
};

const mergeMachineOptions = (apiOptions = []) => {
  const merged = [...createSmxMachineOptions(), ...(Array.isArray(apiOptions) ? apiOptions : []).map(normalizeMachineOption).filter(Boolean)];
  const seen = new Set();
  return merged.filter((item) => {
    if (!item?.value || seen.has(item.value)) return false;
    seen.add(item.value);
    return true;
  });
};

const UPercentDataEntry = forwardRef(function UPercentDataEntry(
  { selectedTypeName, onTypeChange, typeOptions = [], entryId = "" },
  ref
) {
  const dispatch = useDispatch();
  const { isLoading } = useSelector((state) => state.simplex ?? {});
  const [form, setForm] = useState({
    ...initialForm(),
  });
  const [errors, setErrors] = useState({});
  const [shiftOptions, setShiftOptions] = useState(SHIFT_OPTIONS);
  const [varietyOptions, setVarietyOptions] = useState(VARIETY_OPTIONS);
  const [mcNoOptions, setMcNoOptions] = useState(MC_NO_OPTIONS);

  useEffect(() => {
    let active = true;

    fetchSimplexUqcMasterDropdown()
      .then((dropdown) => {
        if (!active) return;
        if (dropdown.shifts?.length) setShiftOptions(dropdown.shifts);
        if (dropdown.varietyNames?.length) setVarietyOptions(dropdown.varietyNames);
        if (dropdown.mcNos?.length) setMcNoOptions(dropdown.mcNos);
      })
      .catch(() => {
        if (!active) return;
        setShiftOptions(SHIFT_OPTIONS);
        setVarietyOptions(VARIETY_OPTIONS);
        setMcNoOptions(MC_NO_OPTIONS);
      });

    return () => {
      active = false;
    };
  }, []);

  const handleChange = (field, value) => {
    const nextValue = ["u_percent", "cvm", "im_cvm", "m3_cvm"].includes(field)
      ? sanitizeNumericInput(value, { precision: 10, scale: 2 })
      : value;
    setForm({ ...form, [field]: nextValue });
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const resetForm = () => {
    setForm(initialForm());
    setErrors({});
  };

  const validate = () => {
    const nextErrors = {};
    if (!String(selectedTypeName || "").trim()) nextErrors.type = true;
    if (!String(form.date || "").trim()) nextErrors.date = true;
    if (!String(form.shift || "").trim()) nextErrors.shift = true;
    if (!String(form.variety || "").trim()) nextErrors.variety = true;
    if (!String(form.mc_no || "").trim()) nextErrors.mc_no = true;
    if (!String(form.smx_no || "").trim()) nextErrors.smx_no = true;
    if (!String(form.smx_no_proposed || "").trim()) nextErrors.smx_no_proposed = true;
    if (!String(form.u_percent || "").trim()) nextErrors.u_percent = true;
    if (!String(form.cvm || "").trim()) nextErrors.cvm = true;
    if (!String(form.im_cvm || "").trim()) nextErrors.im_cvm = true;
    if (!String(form.m3_cvm || "").trim()) nextErrors.m3_cvm = true;
    if (!String(form.remarks || "").trim()) nextErrors.remarks = true;

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const getPreviewData = () => [
    { label: "Entry ID", value: entryId || "#SIM-001" },
    { label: "Shift", value: form.shift },
    { label: "Variety", value: form.variety },
    { label: "MC No.", value: form.mc_no },
    { label: "SMX No.", value: form.smx_no },
    { label: "SMX No. (Proposed)", value: form.smx_no_proposed },
    { label: "U%", value: form.u_percent },
    { label: "CV in Metres", value: form.cvm },
    { label: "1m CV in Metres", value: form.im_cvm },
    { label: "3m CV in Metres", value: form.m3_cvm },
    { label: "Remarks", value: form.remarks },
  ];

  const submit = async () => {
    if (!validate()) return false;
    const resultAction = await dispatch(
      submitSimplexUqc({
        entry_type: selectedTypeName || "U% Data Entry",
        entry_date: form.date,
        shift: form.shift,
        variety: form.variety,
        mc_no: form.mc_no,
        smx_no: form.smx_no,
        smx_no_proposed: form.smx_no_proposed,
        u_percent: form.u_percent,
        cvm: form.cvm,
        cvm_1m: form.im_cvm,
        cvm_3m: form.m3_cvm,
        remarks: form.remarks,
      })
    );

    if (submitSimplexUqc.fulfilled.match(resultAction)) {
      dispatch(getSimplexUqcEntries({ page: 1, limit: 10 }));
      return true;
    }

    return false;
  };

  useImperativeHandle(ref, () => ({
    clear: resetForm,
    submit,
    validate,
    getPreviewData,
  }));

  return (
    <div className={styles.container}>
      <div className={styles.formGrid}>
        <div className={styles.field}>
          <label>Type</label>
          <select
            value={selectedTypeName}
            onChange={(e) => onTypeChange?.(e.target.value)}
            className={errors.type ? styles.errorField : ""}
            style={errors.type ? undefined : defaultFieldStyle}
          >
            {typeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <label>Entry ID</label>
          <input
            type="text"
            value={entryId || "#SIM-001"}
            readOnly
            disabled
            style={defaultFieldStyle}
          />
        </div>

        <div className={styles.field}>
          <label>Shift</label>
          <SearchableSelect
            value={form.shift}
            onChange={(value) => handleChange("shift", value)}
            className={errors.shift ? styles.errorField : ""}
            options={shiftOptions}
            placeholder="Select"
            ariaLabel="Shift"
          />
        </div>

        <div className={styles.field}>
          <label>Variety</label>
          <SearchableSelect
            value={form.variety}
            onChange={(value) => handleChange("variety", value)}
            className={errors.variety ? styles.errorField : ""}
            options={varietyOptions}
            placeholder="Select"
          />
        </div>

        <div className={styles.field}>
          <label>MC No.</label>
          <SearchableSelect
            value={form.mc_no}
            onChange={(value) => handleChange("mc_no", value)}
            className={errors.mc_no ? styles.errorField : ""}
            options={mcNoOptions.map((item) => ({
              value: item.value || item.mc_no,
              label: item.label || item.mc_name || item.mc_no,
            }))}
            placeholder="Select MC No."
            ariaLabel="MC No."
          />
        </div>

        <div className={styles.field}>
          <label>SMX No.</label>
          <SearchableSelect
            value={form.smx_no}
            onChange={(value) => handleChange("smx_no", value)}
            className={errors.smx_no ? styles.errorField : ""}
            options={mcNoOptions.map((item) => ({
              value: item.value || item.mc_no,
              label: item.label || item.mc_name || item.mc_no,
            }))}
            placeholder="Select SMX No."
            ariaLabel="SMX No."
          />
        </div>

        <div className={styles.field}>
          <label>SMX No. (Proposed)</label>
          <SearchableSelect
            value={form.smx_no_proposed}
            onChange={(value) => handleChange("smx_no_proposed", value)}
            className={errors.smx_no_proposed ? styles.errorField : ""}
            options={mcNoOptions.map((item) => ({
              value: item.value || item.mc_no,
              label: item.label || item.mc_name || item.mc_no,
            }))}
            placeholder="Select SMX No."
            ariaLabel="SMX No. Proposed"
          />
        </div>

        <div className={styles.field}>
          <label>U%</label>
          <input
            value={form.u_percent}
            onChange={(e) => handleChange("u_percent", e.target.value)}
            className={errors.u_percent ? styles.errorField : ""}
            style={errors.u_percent ? undefined : defaultFieldStyle}
          />
        </div>

        <div className={styles.field}>
          <label>CV in Metres</label>
          <input
            value={form.cvm}
            onChange={(e) => handleChange("cvm", e.target.value)}
            className={errors.cvm ? styles.errorField : ""}
            style={errors.cvm ? undefined : defaultFieldStyle}
          />
        </div>

        <div className={styles.field}>
          <label>1m CV in Metres</label>
          <input
            value={form.im_cvm}
            onChange={(e) => handleChange("im_cvm", e.target.value)}
            className={errors.im_cvm ? styles.errorField : ""}
            style={errors.im_cvm ? undefined : defaultFieldStyle}
          />
        </div>

        <div className={styles.field}>
          <label>3m CV in Metres</label>
          <input
            value={form.m3_cvm}
            onChange={(e) => handleChange("m3_cvm", e.target.value)}
            className={errors.m3_cvm ? styles.errorField : ""}
            style={errors.m3_cvm ? undefined : defaultFieldStyle}
          />
        </div>

        <div className={`${styles.fullWidth} ${styles.remarksWide} ${styles.field}`}>
          <label>Remarks</label>
          <textarea
            rows={3}
            value={form.remarks}
            onChange={(e) => handleChange("remarks", e.target.value)}
            className={errors.remarks ? styles.errorField : ""}
            style={errors.remarks ? undefined : defaultFieldStyle}
          />
        </div>
      </div>
      {isLoading && <p style={{ marginTop: "12px", color: "#2563eb" }}>Saving...</p>}
    </div>
  );
});

export default UPercentDataEntry;
