import { forwardRef, useImperativeHandle, useState } from "react";
import styles from "@/styles/u%dataentry.module.css";
import { useDispatch, useSelector } from "react-redux";
import { sanitizeNumericInput } from "@/utils/inputValidation";
import { getSimplexUqcEntries, submitSimplexUqc } from "@/store/slices/simplex";

const initialForm = () => ({
  date: new Date().toISOString().split("T")[0],
  shift: "",
  variety: "",
  department: "",
  mc_no: "",
  u_percent: "",
  cvm: "",
  im_cvm: "",
  m3_cvm: "",
  remarks: "",
});

const defaultFieldStyle = { backgroundColor: "#f1f5f9" };

const UPercentDataEntry = forwardRef(function UPercentDataEntry(
  { selectedTypeName, onTypeChange, typeOptions = [] },
  ref
) {
  const dispatch = useDispatch();
  const { isLoading } = useSelector((state) => state.simplex ?? {});
  const [form, setForm] = useState({
    ...initialForm(),
  });
  const [errors, setErrors] = useState({});

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
    if (!String(form.department || "").trim()) nextErrors.department = true;
    if (!String(form.mc_no || "").trim()) nextErrors.mc_no = true;
    if (!String(form.u_percent || "").trim()) nextErrors.u_percent = true;
    if (!String(form.cvm || "").trim()) nextErrors.cvm = true;
    if (!String(form.im_cvm || "").trim()) nextErrors.im_cvm = true;
    if (!String(form.m3_cvm || "").trim()) nextErrors.m3_cvm = true;
    if (!String(form.remarks || "").trim()) nextErrors.remarks = true;

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const getPreviewData = () => [
    { label: "Date", value: form.date },
    { label: "Shift", value: form.shift },
    { label: "Variety", value: form.variety },
    { label: "Department", value: form.department },
    { label: "MC No.", value: form.mc_no },
    { label: "U%", value: form.u_percent },
    { label: "CVM", value: form.cvm },
    { label: "1m CVM", value: form.im_cvm },
    { label: "3m CVM", value: form.m3_cvm },
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
        department: form.department,
        mc_no: form.mc_no,
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
          <label>Date</label>
          <input
            type="date"
            value={form.date}
            onChange={(e) => handleChange("date", e.target.value)}
            className={errors.date ? styles.errorField : ""}
            style={errors.date ? undefined : defaultFieldStyle}
          />
        </div>

        <div className={styles.field}>
          <label>Shift</label>
          <select
            value={form.shift}
            onChange={(e) => handleChange("shift", e.target.value)}
            className={errors.shift ? styles.errorField : ""}
            style={errors.shift ? undefined : defaultFieldStyle}
          >
            <option value="">Select</option>
            <option>General</option>
          </select>
        </div>

        <div className={styles.field}>
          <label>Variety</label>
          <select
            value={form.variety}
            onChange={(e) => handleChange("variety", e.target.value)}
            className={errors.variety ? styles.errorField : ""}
            style={errors.variety ? undefined : defaultFieldStyle}
          >
            <option value="">Select</option>
            <option>WPSF 0.90</option>
          </select>
        </div>

        <div className={styles.field}>
          <label>Department</label>
          <select
            value={form.department}
            onChange={(e) => handleChange("department", e.target.value)}
            className={errors.department ? styles.errorField : ""}
            style={errors.department ? undefined : defaultFieldStyle}
          >
            <option value="">Select Department</option>
            <option>FR Drawing</option>
          </select>
        </div>

        <div className={styles.field}>
          <label>MC No.</label>
          <select
            value={form.mc_no}
            onChange={(e) => handleChange("mc_no", e.target.value)}
            className={errors.mc_no ? styles.errorField : ""}
            style={errors.mc_no ? undefined : defaultFieldStyle}
          >
            <option value="">Select MC No.</option>
            <option>FR DSS-1</option>
          </select>
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
          <label>CVM</label>
          <input
            value={form.cvm}
            onChange={(e) => handleChange("cvm", e.target.value)}
            className={errors.cvm ? styles.errorField : ""}
            style={errors.cvm ? undefined : defaultFieldStyle}
          />
        </div>

        <div className={styles.field}>
          <label>1m CVM</label>
          <select
            value={form.im_cvm}
            onChange={(e) => handleChange("im_cvm", e.target.value)}
            className={errors.im_cvm ? styles.errorField : ""}
            style={errors.im_cvm ? undefined : defaultFieldStyle}
          >
            <option value="">Select</option>
            <option>0.32</option>
          </select>
        </div>

        <div className={styles.field}>
          <label>3m CVM</label>
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
