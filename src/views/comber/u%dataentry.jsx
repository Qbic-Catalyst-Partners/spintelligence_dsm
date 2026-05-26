import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { useDispatch, useSelector } from "react-redux";

import CustomSelect from "@/components/CustomSelect";
import styles from "@/styles/u%dataentry.module.css";
import { sanitizeNumericInput } from "@/utils/inputValidation";
import { getComberUqcEntries, submitComberUqc } from "@/store/slices/comber";

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

const UPercentDataEntry = forwardRef(function UPercentDataEntry(
  { types = [], selectedType = "", onTypeChange = () => {}, entryId = "" },
  ref
) {
  const dispatch = useDispatch();
  const { data, error } = useSelector((state) => state.comber ?? {});
  const [form, setForm] = useState(initialForm());
  const [errors, setErrors] = useState({});
  const [formMessage, setFormMessage] = useState("");

  const handleChange = (field, value) => {
    const nextValue = ["u_percent", "cvm", "im_cvm", "m3_cvm"].includes(field)
      ? sanitizeNumericInput(value, { precision: 10, scale: 2 })
      : value;
    setForm((current) => ({
      ...current,
      [field]: nextValue,
    }));
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
    setFormMessage("");
  };

  const clear = () => {
    setForm(initialForm());
    setErrors({});
    setFormMessage("");
  };

  useEffect(() => {
    dispatch(getComberUqcEntries({ page: 1, limit: 10 }));
  }, [dispatch]);

  useEffect(() => {
    if (data?.message === "UQC entry created successfully") {
      clear();
      dispatch(getComberUqcEntries({ page: 1, limit: 10 }));
      setFormMessage("");
    }
  }, [data, dispatch]);

  useEffect(() => {
    if (error) {
      setFormMessage(error);
    }
  }, [error]);

  const validate = () => {
    const nextErrors = {};
    if (!String(selectedType || "").trim()) nextErrors.type = true;
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
    setFormMessage(Object.keys(nextErrors).length ? "Please fill all required fields before saving." : "");
    return Object.keys(nextErrors).length === 0;
  };

  const getPreviewData = () => [
    { label: "Entry ID", value: entryId || "-" },
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

  const submit = async () => {
    if (!validate()) return false;
    try {
      await dispatch(
        submitComberUqc({
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
      ).unwrap();
      return true;
    } catch (submitError) {
      setFormMessage(submitError || "Unable to submit U% entry.");
      return false;
    }
  };

  useImperativeHandle(ref, () => ({
    clear,
    validate,
    getPreviewData,
    submit,
  }));

  return (
    <div className={styles.container}>
      <div className={styles.formGrid}>
        <div>
          <label>Type</label>
          <CustomSelect
            options={types}
            value={selectedType}
            onChange={onTypeChange}
            error={errors.type}
          />
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
          <select
            value={form.shift}
            onChange={(e) => handleChange("shift", e.target.value)}
            className={errors.shift ? styles.errorField : ""}
          >
            <option value="">Select</option>
            <option>General</option>
            <option>Day</option>
            <option>Half Night</option>
            <option>Full Night</option>
          </select>
        </div>

        <div>
          <label>Variety</label>
          <select
            value={form.variety}
            onChange={(e) => handleChange("variety", e.target.value)}
            className={errors.variety ? styles.errorField : ""}
          >
            <option value="">Select</option>
            <option>Cotton</option>
            <option>WPSF 0.90</option>
            <option>WPSF 1.20</option>
            <option>PSF Blend</option>
          </select>
        </div>

        <div>
          <label>Department</label>
          <select
            value={form.department}
            onChange={(e) => handleChange("department", e.target.value)}
            className={errors.department ? styles.errorField : ""}
          >
            <option value="">Select Department</option>
            <option>Comber</option>
            <option>Drawing</option>
            <option>Preparatory</option>
          </select>
        </div>

        <div>
          <label>MC No.</label>
          <select
            value={form.mc_no}
            onChange={(e) => handleChange("mc_no", e.target.value)}
            className={errors.mc_no ? styles.errorField : ""}
          >
            <option value="">Select MC No.</option>
            <option>MC-01</option>
            <option>MC-02</option>
            <option>MC-03</option>
            <option>CB-01</option>
            <option>CB-02</option>
            <option>CB-03</option>
            <option>CB-04</option>
          </select>
        </div>

        <div>
          <label>U%</label>
          <input
            value={form.u_percent}
            onChange={(e) => handleChange("u_percent", e.target.value)}
            className={errors.u_percent ? styles.errorField : ""}
          />
        </div>

        <div>
          <label>CV in Metres</label>
          <input
            value={form.cvm}
            onChange={(e) => handleChange("cvm", e.target.value)}
            className={errors.cvm ? styles.errorField : ""}
          />
        </div>

        <div>
          <label>1m CV in Metres</label>
          <input
            value={form.im_cvm}
            onChange={(e) => handleChange("im_cvm", e.target.value)}
            className={errors.im_cvm ? styles.errorField : ""}
          />
        </div>

        <div>
          <label>3m CV in Metres</label>
          <input
            value={form.m3_cvm}
            onChange={(e) => handleChange("m3_cvm", e.target.value)}
            className={errors.m3_cvm ? styles.errorField : ""}
          />
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
        <div className={`${styles.messageBox} ${error ? styles.messageError : styles.messageSuccess}`}>
          {formMessage}
        </div>
      ) : null}
    </div>
  );
});

export default UPercentDataEntry;

