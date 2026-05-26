import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import styles from "@/styles/u%dataentry.module.css";
import Footer from "@/components/Footer";
import SuccessModal from "@/components/SuccessModal";
import { sanitizeNumericInput } from "@/utils/inputValidation";
import { clearCardingState, getCardingUqcEntries, submitCardingUqc } from "@/store/slices/carding";

function UPercentDataEntry({ types, selectedType, onTypeChange, entryId = "" }) {
  const dispatch = useDispatch();
  const { isLoading, uqc, error } = useSelector((state) => state.carding ?? {});
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
  const [formMessage, setFormMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const handleChange = (field, value) => {
    const nextValue = ["u_percent", "cvm", "im_cvm", "m3_cvm"].includes(field)
      ? sanitizeNumericInput(value, { precision: 10, scale: 2 })
      : value;
    setForm({ ...form, [field]: nextValue });
    setFormMessage("");
    setIsError(false);
    setErrors((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const handleTypeSelect = (value) => {
    onTypeChange(value);
    setFormMessage("");
    setIsError(false);
    setErrors((current) => {
      const next = { ...current };
      delete next.selectedType;
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

  useEffect(() => {
    dispatch(getCardingUqcEntries({ page: 1, limit: 10 }));
  }, [dispatch]);

  useEffect(() => {
    if (uqc?.message) {
      resetForm();
      setShowSuccess(true);
      setIsError(false);
      dispatch(getCardingUqcEntries({ page: 1, limit: 10 }));
      dispatch(clearCardingState());
    }
  }, [dispatch, uqc]);

  useEffect(() => {
    if (error) {
      setFormMessage(error);
      setIsError(true);
      dispatch(clearCardingState());
    }
  }, [dispatch, error]);

  const handleSave = () => {
    const nextErrors = {};

    if (!String(selectedType || "").trim()) nextErrors.selectedType = true;

    Object.entries(form).forEach(([field, value]) => {
      if (!String(value || "").trim()) {
        nextErrors[field] = true;
      }
    });

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length) {
      setFormMessage("Please fill all required fields before saving.");
      setIsError(true);
      return;
    }

    setFormMessage("");
    setIsError(false);

    dispatch(
      submitCardingUqc({
        entry_type: selectedType,
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
  };

  return (
    <div className={styles.container}>
      <div className={styles.body}>
        <div className={styles.formGrid}>
          <div>
            <label>Type</label>
            <select
              value={selectedType}
              onChange={(e) => handleTypeSelect(e.target.value)}
              className={errors.selectedType ? styles.errorField : ""}
            >
              <option value="">Select Type</option>
              {types.map((item) => (
                <option key={item.id ?? item.name} value={item.name}>
                  {item.displayName ?? item.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label>Entry ID</label>
            <input
              type="text"
              value={entryId || ""}
              readOnly disabled
              className={errors.date ? styles.errorField : ""}
            />
          </div>

          <div>
            <label>Shift</label>
            <select value={form.shift} onChange={(e) => handleChange("shift", e.target.value)} className={errors.shift ? styles.errorField : ""}>
              <option value="">Select</option>
              <option>General</option>
              <option>Day</option>
              <option>Half Night</option>
              <option>Full Night</option>
            </select>
          </div>

          <div>
            <label>Variety</label>
            <select value={form.variety} onChange={(e) => handleChange("variety", e.target.value)} className={errors.variety ? styles.errorField : ""}>
              <option value="">Select</option>
              <option>Cotton</option>
              <option>WPSF 0.90</option>
            </select>
          </div>

          <div>
            <label>Department</label>
            <select value={form.department} onChange={(e) => handleChange("department", e.target.value)} className={errors.department ? styles.errorField : ""}>
              <option value="">Select Department</option>
              <option>Carding</option>
              <option>FR Drawing</option>
            </select>
          </div>

          <div>
            <label>MC No.</label>
            <select value={form.mc_no} onChange={(e) => handleChange("mc_no", e.target.value)} className={errors.mc_no ? styles.errorField : ""}>
              <option value="">Select MC No.</option>
              <option>MC-01</option>
              <option>MC-02</option>
              <option>MC-03</option>
              <option>FR DSS-1</option>
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
      </div>

      {formMessage && (
        <div className={`${styles.messageBox} ${isError ? styles.messageError : styles.messageSuccess}`}>
          {formMessage}
        </div>
      )}

      <div className={styles["footer-space"]}>
        <Footer
          onBack={() => console.log("Back")}
          onClear={resetForm}
          onSave={handleSave}
          saveLabel={isLoading ? "Saving..." : "Save Record"}
          disabled={isLoading}
        />
      </div>

      <SuccessModal
        open={showSuccess}
        onClose={() => setShowSuccess(false)}
      />
    </div>
  );
}

export default UPercentDataEntry;

