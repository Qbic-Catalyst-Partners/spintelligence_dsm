import { useEffect, useState, forwardRef, useImperativeHandle } from "react";
import { useDispatch, useSelector } from "react-redux";
import { FaUpload } from "react-icons/fa";
import { submitAfis6Cotton, clearMixingState } from "@/store/slices/mixing";
import { sanitizeNumericInput } from "@/utils/inputValidation";
import styles from "../../styles/cottonHVIDataEntry.module.css";

const TEXT_FIELDS = [
  { key: "lot_no", label: "Lot No." },
  { key: "variety", label: "Variety" },
  { key: "invoice_date", label: "Invoice Date", type: "date" },
  { key: "mc_name", label: "Mc. Name" },
  { key: "blow_room", label: "Blow Room" },
  { key: "carding", label: "Carding" },
  { key: "breaker_drawing", label: "Breaker Drawing" },
  { key: "finisher_drawing", label: "Finisher Drawing" },
  { key: "comber", label: "Comber" },
];

const NUMERIC_FIELDS = [
  { key: "scp_nep_count", label: "SCP NEP Count" },
  { key: "l_w_mm", label: "L(W)" },
  { key: "l_w_cv", label: "L(W) CV" },
  { key: "sfc_w_percent", label: "SCF(W)<12.70mm" },
  { key: "uql_w_mm", label: "UQL(w)" },
  { key: "l_n_mm", label: "L(n)" },
  { key: "l_n_cv_percent", label: "L(n)CV" },
  { key: "sfc_n_percent", label: "SCF(n)<12.70mm" },
  { key: "five_pct_l_n_mm", label: "5%L(n)" },
  { key: "sc_nep_count_g", label: "SCN/gm" },
  { key: "crimp_percent", label: "Crimp %" },
];

const EMPTY_FORM = [...TEXT_FIELDS, ...NUMERIC_FIELDS].reduce(
  (acc, field) => ({ ...acc, [field.key]: "" }),
  {}
);

const Afis6CottonDataEntry = forwardRef(function Afis6CottonDataEntry(
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
    lot_no: formData.lot_no,
    variety: formData.variety,
    invoice_date: formData.invoice_date,
    mc_name: formData.mc_name,
    blow_room: formData.blow_room,
    carding: formData.carding,
    breaker_drawing: formData.breaker_drawing,
    finisher_drawing: formData.finisher_drawing,
    comber: formData.comber,
    scp_nep_count: Number(formData.scp_nep_count) || 0,
    l_w_mm: Number(formData.l_w_mm) || 0,
    l_w_cv: Number(formData.l_w_cv) || 0,
    sfc_w_percent: Number(formData.sfc_w_percent) || 0,
    uql_w_mm: Number(formData.uql_w_mm) || 0,
    l_n_mm: Number(formData.l_n_mm) || 0,
    l_n_cv_percent: Number(formData.l_n_cv_percent) || 0,
    sfc_n_percent: Number(formData.sfc_n_percent) || 0,
    five_pct_l_n_mm: Number(formData.five_pct_l_n_mm) || 0,
    sc_nep_count_g: Number(formData.sc_nep_count_g) || 0,
    crimp_percent: Number(formData.crimp_percent) || 0,
    machine_name: "AFIS-6",
    department: "Mixing",
    sub_department: "Quality Control",
    user_name: user?.name || user?.full_name || user?.user_name || user?.username || "",
  });

  const handleSubmit = async () => {
    await dispatch(submitAfis6Cotton(buildPayload())).unwrap();
    return true;
  };

  const handleClear = () => {
    setFormData(EMPTY_FORM);
    setErrors({});
    dispatch(clearMixingState());
  };

  const getPreviewData = () => [
    { label: "Inspection Date", value: date },
    ...TEXT_FIELDS.map((field) => ({ label: field.label, value: formData[field.key] })),
    ...NUMERIC_FIELDS.map((field) => ({ label: field.label, value: formData[field.key] })),
  ];

  const validate = () => {
    const nextErrors = [...TEXT_FIELDS, ...NUMERIC_FIELDS].reduce((acc, field) => {
      acc[field.key] = String(formData[field.key] || "").trim() === "";
      return acc;
    }, {});
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
        type={field.type === "date" ? "date" : "text"}
        inputMode={NUMERIC_FIELDS.some((item) => item.key === field.key) ? "decimal" : undefined}
        placeholder={field.type === "date" ? undefined : "Enter"}
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
            value={selectedTypeName || "AFIS-6 Cotton Data Entry"}
            className={styles["mixx-input"]}
          />
        </Field>
        <Field label="Entry ID">
          <input readOnly value={entryId} className={styles["mixx-input"]} />
        </Field>
        {renderField(TEXT_FIELDS[0])}
      </div>

      <div className={styles["mixx-row"]}>
        {renderField(TEXT_FIELDS[1])}
        {renderField(TEXT_FIELDS[2])}
        {renderField(TEXT_FIELDS[3])}
      </div>

      <div className={styles["mixx-row"]}>
        {renderField(TEXT_FIELDS[4])}
        {renderField(TEXT_FIELDS[5])}
        {renderField(TEXT_FIELDS[6])}
      </div>

      <div className={styles["mixx-row"]}>
        {renderField(TEXT_FIELDS[7])}
        {renderField(TEXT_FIELDS[8])}
      </div>

      <div className={styles["mixx-row"]}>
        {renderField(NUMERIC_FIELDS[0])}
        {renderField(NUMERIC_FIELDS[1])}
        {renderField(NUMERIC_FIELDS[2])}
      </div>

      <div className={styles["mixx-row"]}>
        {renderField(NUMERIC_FIELDS[3])}
        {renderField(NUMERIC_FIELDS[4])}
        {renderField(NUMERIC_FIELDS[5])}
      </div>

      <div className={styles["mixx-row"]}>
        {renderField(NUMERIC_FIELDS[6])}
        {renderField(NUMERIC_FIELDS[7])}
        {renderField(NUMERIC_FIELDS[8])}
      </div>

      <div className={styles["mixx-row"]}>
        {renderField(NUMERIC_FIELDS[9])}
        {renderField(NUMERIC_FIELDS[10])}
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

export default Afis6CottonDataEntry;
