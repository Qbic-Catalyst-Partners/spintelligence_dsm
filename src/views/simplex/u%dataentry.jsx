import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import styles from "@/styles/u%dataentry.module.css";
import { useDispatch, useSelector } from "react-redux";
import SearchableSelect from "@/components/SearchableSelect";
import { sanitizeNumericInput } from "@/utils/inputValidation";
import { fetchSimplexUqcMasterDropdown } from "@/apis/simplex";
import { createSmxMachineOptions } from "@/views/simplex/smxMachineNames";
import { getSimplexUqcEntries, submitSimplexUqc } from "@/store/slices/simplex";

const initialForm = () => ({
  date: new Date().toISOString().split("T")[0],
  shift: "",
  variety: "",
  mc_no: "",
  u_percent: "",
  cvm: "",
  im_cvm: "",
  m3_cvm: "",
  remarks: "",
});

const defaultFieldStyle = { backgroundColor: "#f1f5f9" };
const dropdownButtonStyle = {
  width: "100%",
  minWidth: 0,
  height: "38px",
  padding: "0 12px",
  border: "1px solid #E2E8F0",
  borderRadius: "8px",
  background: "#F1F5F9",
  color: "#334155",
  textAlign: "left",
  outline: "none",
};
const SHIFT_OPTIONS = ["Select Shift", "Shift 1", "Shift 2", "Shift 3"];
const MC_NO_OPTIONS = createSmxMachineOptions();
const VARIETY_OPTIONS = ["WPSF 0.90"];

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
  const [openField, setOpenField] = useState("");
  const dropdownRefs = useRef({});

  useEffect(() => {
    let active = true;

    fetchSimplexUqcMasterDropdown()
      .then((dropdown) => {
        if (!active) return;
        setShiftOptions(SHIFT_OPTIONS);
        if (dropdown.varietyNames?.length) setVarietyOptions(dropdown.varietyNames);
      })
      .catch(() => {
        if (!active) return;
        setShiftOptions(SHIFT_OPTIONS);
        setVarietyOptions(VARIETY_OPTIONS);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const handlePointerDown = (event) => {
      const currentRef = dropdownRefs.current[openField];
      if (!currentRef?.contains(event.target)) {
        setOpenField("");
      }
    };

    if (!openField) return undefined;

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [openField]);

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
    setOpenField("");
  };

  const validate = () => {
    const nextErrors = {};
    if (!String(selectedTypeName || "").trim()) nextErrors.type = true;
    if (!String(form.date || "").trim()) nextErrors.date = true;
    if (!String(form.shift || "").trim()) nextErrors.shift = true;
    if (!String(form.variety || "").trim()) nextErrors.variety = true;
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
    { label: "Entry ID", value: entryId || "#SIM-001" },
    { label: "Shift", value: form.shift },
    { label: "Variety", value: form.variety },
    { label: "MC No.", value: form.mc_no },
    { label: "U%", value: form.u_percent },
    { label: "CVM", value: form.cvm },
    { label: "1mCV", value: form.im_cvm },
    { label: "3mCV", value: form.m3_cvm },
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
            placeholder="-- Select Shift --"
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
          <div
            ref={(node) => {
              dropdownRefs.current.mc_no = node;
            }}
            style={{ position: "relative" }}
          >
            <button
              type="button"
              className={errors.mc_no ? styles.errorField : ""}
              style={errors.mc_no ? undefined : { ...dropdownButtonStyle, ...defaultFieldStyle }}
              onClick={() => setOpenField((current) => (current === "mc_no" ? "" : "mc_no"))}
            >
              <span className={form.mc_no ? "text-slate-900" : "text-slate-500"}>
                {form.mc_no || "-- Select MC No. --"}
              </span>
            </button>
            {openField === "mc_no" ? (
              <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[320px] overflow-y-auto border border-slate-300 bg-white shadow-lg">
                <button
                  type="button"
                  className="block w-full px-3 py-1.5 text-left text-[14px] hover:bg-[#3D539F] hover:text-white"
                  onClick={() => {
                    handleChange("mc_no", "");
                    setOpenField("");
                  }}
                >
                  -- Select MC No. --
                </button>
                {mcNoOptions.map((machine) => {
                  const machineName = String(machine?.label || machine?.value || "").trim();
                  return machineName ? (
                    <button
                      key={machineName}
                      type="button"
                      className="block w-full px-3 py-1.5 text-left text-[14px] hover:bg-[#3D539F] hover:text-white"
                      onClick={() => {
                        handleChange("mc_no", machineName);
                        setOpenField("");
                      }}
                    >
                      {machineName}
                    </button>
                  ) : null;
                })}
              </div>
            ) : null}
          </div>
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
          <label>1mCV</label>
          <input
            value={form.im_cvm}
            onChange={(e) => handleChange("im_cvm", e.target.value)}
            className={errors.im_cvm ? styles.errorField : ""}
            style={errors.im_cvm ? undefined : defaultFieldStyle}
          />
        </div>

        <div className={styles.field}>
          <label>3mCV</label>
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
