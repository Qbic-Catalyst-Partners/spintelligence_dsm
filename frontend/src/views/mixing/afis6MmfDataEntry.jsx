import { useEffect, useState, forwardRef, useImperativeHandle } from "react";
import { useDispatch, useSelector } from "react-redux";
import { FaUpload } from "react-icons/fa";
import { submitAfis6Mmf, clearMixingState } from "@/store/slices/mixing";
import { sanitizeNumericInput } from "@/utils/inputValidation";
import styles from "../../styles/cottonHVIDataEntry.module.css";

const NUMERIC_FIELDS = [
  { key: "total_nep_count_g", label: "Total Nep Count / g" },
  { key: "total_nep_mean_size_um", label: "Total Nep Mean Size µm" },
  { key: "cut_length_n_mm", label: "Cut Length (n) mm" },
  { key: "l_n_cv_percent", label: "L(n) CV %" },
  { key: "sfc_n_percent", label: "SFC(n) <12.70 mm %" },
  { key: "five_pct_l_n_mm", label: "5% L(n) mm" },
  { key: "fineness_den", label: "Fineness den" },
  { key: "fineness_cv_percent", label: "Fineness CV %" },
  { key: "long_fiber_gt_45_60_percent", label: "Long Fiber >45.60mm" },
  { key: "long_fiber_count_gt_45_60", label: "Long Fiber Count >45.60mm" },
  { key: "sc_nep_count_g", label: "SCN/gm" },
  { key: "crimp_percent", label: "Crimp %" },
];

const EMPTY_FORM = NUMERIC_FIELDS.reduce(
  (acc, field) => ({ ...acc, [field.key]: "" }),
  { machine: "", material_class: "", comment: "" }
);

const Afis6MmfDataEntry = forwardRef(function Afis6MmfDataEntry(
  { date, entryId, selectedTypeName },
  ref
) {
  const dispatch = useDispatch();
  const { actionSuccess } = useSelector((state) => state.mixing);
  const user = useSelector((state) => state.auth?.user);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (actionSuccess) {
      setFormData(EMPTY_FORM);
    }
  }, [actionSuccess]);

  const handleChange = (field, value) => {
    const nextValue = NUMERIC_FIELDS.some((item) => item.key === field)
      ? sanitizeNumericInput(value, { precision: 12, scale: 3 })
      : value;
    setFormData((prev) => ({ ...prev, [field]: nextValue }));
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const buildPayload = () => ({
    entry_id: entryId || undefined,
    inspection_date: date,
    material_class: formData.material_class,
    comment: formData.comment,
    total_nep_count_g: Number(formData.total_nep_count_g) || 0,
    total_nep_mean_size_um: Number(formData.total_nep_mean_size_um) || 0,
    cut_length_n_mm: Number(formData.cut_length_n_mm) || 0,
    l_n_cv_percent: Number(formData.l_n_cv_percent) || 0,
    sfc_n_percent: Number(formData.sfc_n_percent) || 0,
    five_pct_l_n_mm: Number(formData.five_pct_l_n_mm) || 0,
    fineness_den: Number(formData.fineness_den) || 0,
    fineness_cv_percent: Number(formData.fineness_cv_percent) || 0,
    long_fiber_gt_45_60_percent: Number(formData.long_fiber_gt_45_60_percent) || 0,
    long_fiber_count_gt_45_60: Number(formData.long_fiber_count_gt_45_60) || 0,
    sc_nep_count_g: Number(formData.sc_nep_count_g) || 0,
    crimp_percent: Number(formData.crimp_percent) || 0,
    machine_name: String(formData.machine || "").trim() || "AFIS-6",
    department: "Mixing",
    sub_department: "Quality Control",
    user_name: user?.name || user?.full_name || user?.user_name || user?.username || "",
  });

  const handleSubmit = async () => {
    await dispatch(submitAfis6Mmf(buildPayload())).unwrap();
    return true;
  };

  const handleClear = () => {
    setFormData(EMPTY_FORM);
    setErrors({});
    dispatch(clearMixingState());
  };

  const getPreviewData = () => [
    { label: "Inspection Date", value: date },
    { label: "Machine", value: formData.machine },
    { label: "Material Class", value: formData.material_class },
    { label: "Comment", value: formData.comment },
    ...NUMERIC_FIELDS.map((field) => ({ label: field.label, value: formData[field.key] })),
  ];

  const validate = () => {
    const nextErrors = {
      material_class: String(formData.material_class || "").trim() === "",
      comment: String(formData.comment || "").trim() === "",
      ...NUMERIC_FIELDS.reduce((acc, field) => {
        acc[field.key] = String(formData[field.key] || "").trim() === "";
        return acc;
      }, {}),
    };
    const filtered = Object.fromEntries(Object.entries(nextErrors).filter(([, value]) => value));
    setErrors(filtered);
    return Object.keys(filtered).length === 0;
  };

  useImperativeHandle(ref, () => ({
    submit: handleSubmit,
    clear: handleClear,
    getPreviewData,
    getPayload: buildPayload,
    validate,
  }));

  const renderField = (field) => (
    <Field key={field.key} label={field.label}>
      <input
        type="text"
        inputMode="decimal"
        placeholder="Enter"
        value={formData[field.key]}
        onChange={(e) => handleChange(field.key, e.target.value)}
        className={`${styles["mixx-input"]} ${errors[field.key] ? styles["mixx-error"] : ""}`}
      />
    </Field>
  );

  return (
    <div className={styles["mixx-form"]}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[#3d539f] text-xl leading-none">&#8801;&#9998;</span>
          <span className="text-[18px] font-bold text-slate-900">Inspection Data Entry</span>
        </div>
        <button
          type="button"
          className="flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <FaUpload className="h-4 w-4" />
          Upload
        </button>
      </div>

      <div className={styles["mixx-row"]}>
        <Field label="Type">
          <input
            readOnly
            value={selectedTypeName || "AFIS-6 MMF Data Entry"}
            className={styles["mixx-input"]}
          />
        </Field>
        <Field label="Entry ID">
          <input readOnly value={entryId} className={styles["mixx-input"]} />
        </Field>
      </div>

      <div className={styles["mixx-row"]}>
        <Field label="Machine (Optional)">
          <input
            placeholder="Enter Machine"
            value={formData.machine}
            onChange={(e) => handleChange("machine", e.target.value)}
            className={styles["mixx-input"]}
          />
        </Field>
        <Field label="Material Class">
          <input
            placeholder="Enter Material Class"
            value={formData.material_class}
            onChange={(e) => handleChange("material_class", e.target.value)}
            className={`${styles["mixx-input"]} ${errors.material_class ? styles["mixx-error"] : ""}`}
          />
        </Field>
        <Field label="Comment">
          <input
            placeholder="Enter Comment"
            value={formData.comment}
            onChange={(e) => handleChange("comment", e.target.value)}
            className={`${styles["mixx-input"]} ${errors.comment ? styles["mixx-error"] : ""}`}
          />
        </Field>
        {renderField(NUMERIC_FIELDS[0])}
        {renderField(NUMERIC_FIELDS[1])}
      </div>

      <div className={styles["mixx-row"]}>
        {renderField(NUMERIC_FIELDS[2])}
        {renderField(NUMERIC_FIELDS[3])}
        {renderField(NUMERIC_FIELDS[4])}
      </div>

      <div className={styles["mixx-row"]}>
        {renderField(NUMERIC_FIELDS[5])}
        {renderField(NUMERIC_FIELDS[6])}
        {renderField(NUMERIC_FIELDS[7])}
      </div>

      <div className={styles["mixx-row"]}>
        {renderField(NUMERIC_FIELDS[8])}
        {renderField(NUMERIC_FIELDS[9])}
        {renderField(NUMERIC_FIELDS[10])}
      </div>

      <div className={styles["mixx-row"]}>
        {renderField(NUMERIC_FIELDS[11])}
      </div>
    </div>
  );
});

function Field({ label, children }) {
  return (
    <div className={styles["mixx-group"]}>
      <label>{label}</label>
      {children}
    </div>
  );
}

export default Afis6MmfDataEntry;
