import { useEffect, useState } from "react";
import styles from "@/styles/u%dataentry.module.css";
import SearchableSelect from "@/components/SearchableSelect";
import Footer from "@/components/Footer";
import PreviewModal from "@/components/PreviewModal";
import SuccessModal from "@/components/SuccessModal";
import { fetchDrawFrameUqcMasterDropdown } from "@/apis/draw-frame";
import { sanitizeNumericInput } from "@/utils/inputValidation";

const SHIFT_OPTIONS = ["Select Shift" , "Shift 1", "Shift 2", "Shift 3"];
const VARIETY_OPTIONS = ["WPSF 0.90"];
const DEPARTMENT_OPTIONS = ["FR Drawing"];
const MC_NO_OPTIONS = ["FR DSS-1"];

function UPercentDataEntry() {
  const [form, setForm] = useState({
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
  const [errors, setErrors] = useState({});
  const [showPreview, setShowPreview] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [formMessage, setFormMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const selectedType = "Draw Frame U% Data Entry";
  const [shiftOptions, setShiftOptions] = useState(SHIFT_OPTIONS);
  const [varietyOptions, setVarietyOptions] = useState(VARIETY_OPTIONS);
  const [departmentOptions, setDepartmentOptions] = useState(DEPARTMENT_OPTIONS);
  const [mcNoOptions, setMcNoOptions] = useState(MC_NO_OPTIONS);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const dropdown = await fetchDrawFrameUqcMasterDropdown();
        if (!active) return;
        setShiftOptions(SHIFT_OPTIONS);
        if (dropdown.varietyNames?.length) setVarietyOptions(dropdown.varietyNames);
        if (dropdown.departmentNames?.length) setDepartmentOptions(dropdown.departmentNames);
        if (dropdown.mcNos?.length) setMcNoOptions(dropdown.mcNos);
      } catch (_error) {
        if (!active) return;
        setShiftOptions(SHIFT_OPTIONS);
        setVarietyOptions(VARIETY_OPTIONS);
        setDepartmentOptions(DEPARTMENT_OPTIONS);
        setMcNoOptions(MC_NO_OPTIONS);
      }
    })();

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
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const resetForm = () => {
    setForm({
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
    setErrors({});
    setFormMessage("");
    setIsError(false);
    setShowSuccess(false);
  };

  const validateForm = () => {
    const nextErrors = {};
    Object.entries(form).forEach(([key, value]) => {
      if (!String(value || "").trim()) nextErrors[key] = true;
    });
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length) {
      setFormMessage("Please fill all required fields before saving.");
      setIsError(true);
      return false;
    }

    setFormMessage("");
    setIsError(false);
    return true;
  };

  const handleSubmit = () => {
    setShowPreview(false);
    setFormMessage("");
    setIsError(false);
    setShowSuccess(true);
  };

  const previewItems = [
    { label: "Type", value: selectedType },
    { label: "Date", value: form.date },
    { label: "Shift", value: form.shift },
    { label: "Variety", value: form.variety },
    { label: "Department", value: form.department },
    { label: "MC No.", value: form.mc_no },
    { label: "U%", value: form.u_percent },
    { label: "CV in Metres", value: form.cvm },
    { label: "1m CV in Metres", value: form.im_cvm },
    { label: "3m CV in Metres", value: form.m3_cvm },
    { label: "Remarks", value: form.remarks },
  ];

  return (
    <>
      <div className={styles.formGrid}>
        <div>
          <label>Type</label>
          <input
            type="text"
            value={selectedType}
            readOnly
          />
        </div>

        <div>
          <label>Date</label>
          <input
            type="date"
            value={form.date}
            onChange={(e) => handleChange("date", e.target.value)}
            className={errors.date ? styles.errorField : ""}
          />
        </div>

        <div>
          <label>Shift</label>
          <SearchableSelect
            value={form.shift}
            onChange={(value) => handleChange("shift", value)}
            className={errors.shift ? styles.errorField : ""}
            options={shiftOptions}
            placeholder="Select Shift"
            includeEmptyOption
            emptyOptionLabel="Select Shift"
            ariaLabel="Shift"
          />
        </div>

        <div>
          <label>Variety</label>
          <SearchableSelect
            value={form.variety}
            onChange={(value) => handleChange("variety", value)}
            className={errors.variety ? styles.errorField : ""}
            options={varietyOptions}
            placeholder="Select"
            ariaLabel="Variety"
          />
        </div>

        <div>
          <label>Department</label>
          <SearchableSelect
            value={form.department}
            onChange={(value) => handleChange("department", value)}
            className={errors.department ? styles.errorField : ""}
            options={departmentOptions}
            placeholder="Select Department"
            ariaLabel="Department"
          />
        </div>

        <div>
          <label>MC No.</label>
          <SearchableSelect
            value={form.mc_no}
            onChange={(value) => handleChange("mc_no", value)}
            className={errors.mc_no ? styles.errorField : ""}
            options={mcNoOptions}
            placeholder="Select MC No."
            ariaLabel="MC No."
          />
        </div>

        <div>
          <label>U%</label>
          <input value={form.u_percent} onChange={(e) => handleChange("u_percent", e.target.value)} className={errors.u_percent ? styles.errorField : ""} />
        </div>

        <div>
          <label>CV in Metres</label>
          <input value={form.cvm} onChange={(e) => handleChange("cvm", e.target.value)} className={errors.cvm ? styles.errorField : ""} />
        </div>

        <div>
          <label>1m CV in Metres</label>
          <input value={form.im_cvm} onChange={(e) => handleChange("im_cvm", e.target.value)} className={errors.im_cvm ? styles.errorField : ""} />
        </div>

        <div>
          <label>3m CV in Metres</label>
          <input value={form.m3_cvm} onChange={(e) => handleChange("m3_cvm", e.target.value)} className={errors.m3_cvm ? styles.errorField : ""} />
        </div>

          <div className={styles.fullWidth}>
          <label>Remarks</label>
          <textarea
            rows={3}
            value={form.remarks}
            onChange={(e) => handleChange("remarks", e.target.value)}
            className={errors.remarks ? styles.errorField : ""}
          />
        </div>
      </div>

      {formMessage ? (
        <div className={`${styles.messageBox} ${isError ? styles.messageError : styles.messageSuccess}`}>
          {formMessage}
        </div>
      ) : null}

      <Footer
        onBack={() => console.log("Back")}
        onClear={resetForm}
        onSave={() => {
          if (validateForm()) {
            setShowPreview(true);
          }
        }}
        saveLabel="Preview"
      />
      <PreviewModal
        open={showPreview}
        title="Carding Preview"
        subtitle="Carding Notebook / U% Data Entry"
        items={previewItems}
        typeValue={selectedType}
        onCancel={() => setShowPreview(false)}
        onConfirm={handleSubmit}
        confirmLabel="Submit"
      />

      <SuccessModal
        open={showSuccess}
        onClose={() => setShowSuccess(false)}
      />
    </>
  );
}

export default UPercentDataEntry;
