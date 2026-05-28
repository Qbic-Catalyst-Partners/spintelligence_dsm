import { useState } from "react";
import styles from "@/styles/u%dataentry.module.css";
import CustomSelect from "@/components/CustomSelect";
import Footer from "@/components/Footer";
import PreviewModal from "@/components/PreviewModal";
import SuccessModal from "@/components/SuccessModal";
import { sanitizeNumericInput } from "@/utils/inputValidation";
import {
  STATIC_DEPARTMENT_OPTIONS,
  STATIC_MC_NO_OPTIONS,
  STATIC_SHIFT_OPTIONS,
  STATIC_VARIETY_OPTIONS,
} from "@/views/carding/u%dataentry";

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
  const [selectedType, setSelectedType] = useState("");

  const types = [{ name: "Carding U% Data Entry" }];

  const onTypeChange = (value) => {
    setSelectedType(value);
    setErrors((current) => {
      const next = { ...current };
      delete next.selectedType;
      return next;
    });
  };

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
    if (!selectedType) nextErrors.selectedType = true;
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
          <CustomSelect
            options={types}
            value={selectedType}
            onChange={onTypeChange}
            error={errors.selectedType}
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
          <select value={form.shift} onChange={(e) => handleChange("shift", e.target.value)} className={errors.shift ? styles.errorField : ""}>
            <option value="">-- Select Shift --</option>
            {STATIC_SHIFT_OPTIONS.map((item, index) => (
              <option key={`${item.value}-${index}`} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label>Variety</label>
          <select value={form.variety} onChange={(e) => handleChange("variety", e.target.value)} className={errors.variety ? styles.errorField : ""}>
            <option value="">-- Select Variety --</option>
            {STATIC_VARIETY_OPTIONS.map((name, index) => (
              <option key={`${name}-${index}`} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label>Department</label>
          <select value={form.department} onChange={(e) => handleChange("department", e.target.value)} className={errors.department ? styles.errorField : ""}>
            <option value="">Select Department</option>
            {STATIC_DEPARTMENT_OPTIONS.map((item, index) => (
              <option key={`${item.dept_code}-${index}`} value={item.dept_name}>
                {item.dept_name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label>MC No.</label>
          <select value={form.mc_no} onChange={(e) => handleChange("mc_no", e.target.value)} className={errors.mc_no ? styles.errorField : ""}>
            <option value="">-- Select MC No. --</option>
            {STATIC_MC_NO_OPTIONS.map((item, index) => (
              <option key={`${item.mc_no}-${index}`} value={item.mc_no}>
                {item.mc_no}
              </option>
            ))}
          </select>
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
