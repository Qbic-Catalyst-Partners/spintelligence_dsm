import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { useDispatch, useSelector } from "react-redux";

import CustomSelect from "@/components/CustomSelect";
import SearchableSelect from "@/components/SearchableSelect";
import styles from "@/styles/u%dataentry.module.css";
import { sanitizeNumericInput } from "@/utils/inputValidation";
import {
  STATIC_DEPARTMENT_OPTIONS,
  STATIC_MC_NO_OPTIONS,
  STATIC_SHIFT_OPTIONS,
  STATIC_VARIETY_OPTIONS,
} from "@/views/carding/u%dataentry";
import { getComberUqcEntries, submitComberUqc } from "@/store/slices/comber";
import { fetchComberMasterVarieties, fetchComberUqcMasterDropdown } from "@/apis/comber";

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

<<<<<<< HEAD
const SHIFT_OPTIONS = STATIC_SHIFT_OPTIONS.map((item) => item.value);
=======
const SHIFT_OPTIONS = ["Shift-1", "Shift-2", "Shift-3"];
>>>>>>> b1d24e10695c71395ee88867c7bef650d3242cfa
const DEPARTMENT_OPTIONS = ["Comber", "Drawing", "Preparatory"];
const MC_NO_OPTIONS = ["MC-01", "MC-02", "MC-03", "CB-01", "CB-02", "CB-03", "CB-04"];
const VARIETY_FALLBACK_OPTIONS = ["Cotton", "WPSF 0.90", "WPSF 1.20", "PSF Blend"];

const UPercentDataEntry = forwardRef(function UPercentDataEntry(
  { types = [], selectedType = "", onTypeChange = () => {}, entryId = "" },
  ref
) {
  const dispatch = useDispatch();
  const { data, error } = useSelector((state) => state.comber ?? {});
  const [form, setForm] = useState(initialForm());
  const [errors, setErrors] = useState({});
  const [formMessage, setFormMessage] = useState("");
  const [shiftOptions, setShiftOptions] = useState(SHIFT_OPTIONS);
  const [varietyOptions, setVarietyOptions] = useState(VARIETY_FALLBACK_OPTIONS);
  const [departmentOptions, setDepartmentOptions] = useState(DEPARTMENT_OPTIONS);
  const [mcNoOptions, setMcNoOptions] = useState(MC_NO_OPTIONS);

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
    let active = true;

    (async () => {
      try {
        const dropdown = await fetchComberUqcMasterDropdown();
        if (!active) return;

        const nextVarieties = dropdown.varietyNames?.length
          ? dropdown.varietyNames
          : dropdown.varieties.map((item) => item.variety_name).filter(Boolean);
        const nextDepartments = dropdown.departmentNames?.length
          ? dropdown.departmentNames
          : dropdown.departments.map((item) => item.dept_name).filter(Boolean);
        const nextMcNos = Array.isArray(dropdown.mcNos)
          ? dropdown.mcNos
              .map((item) => ({
                value: String(item?.mc_no ?? "").trim(),
                label: String(item?.mc_name ?? item?.mc_no ?? "").trim(),
              }))
              .filter((item) => item.value)
          : [];

        if (nextVarieties.length) setVarietyOptions(nextVarieties);
        if (nextDepartments.length) setDepartmentOptions(nextDepartments);
        if (nextMcNos.length) setMcNoOptions(nextMcNos);
      } catch (_error) {
        try {
          const options = await fetchComberMasterVarieties();
          if (active && options.length) setVarietyOptions(options);
        } catch (_fallbackError) {
          if (active) setVarietyOptions(VARIETY_FALLBACK_OPTIONS);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

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
    { label: "CVM", value: form.cvm },
    { label: "1mCV", value: form.im_cvm },
<<<<<<< HEAD
    { label: "3 mCV", value: form.m3_cvm },
=======
    { label: "3mCV", value: form.m3_cvm },
>>>>>>> b1d24e10695c71395ee88867c7bef650d3242cfa
    { label: "Remarks", value: form.remarks },
  ];

  const submit = async () => {
    if (!validate()) return false;
    try {
      await dispatch(
        submitComberUqc({
          entry_id: entryId || "",
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
          <SearchableSelect
            value={form.shift}
            onChange={(value) => handleChange("shift", value)}
            className={errors.shift ? styles.errorField : ""}
            options={shiftOptions}
            placeholder="Select"
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
          <input
            value={form.u_percent}
            onChange={(e) => handleChange("u_percent", e.target.value)}
            className={errors.u_percent ? styles.errorField : ""}
          />
        </div>

        <div>
          <label>CVM</label>
          <input
            value={form.cvm}
            onChange={(e) => handleChange("cvm", e.target.value)}
            className={errors.cvm ? styles.errorField : ""}
          />
        </div>

        <div>
          <label>1mCV</label>
          <input
            value={form.im_cvm}
            onChange={(e) => handleChange("im_cvm", e.target.value)}
            className={errors.im_cvm ? styles.errorField : ""}
          />
        </div>

        <div>
<<<<<<< HEAD
          <label>3 mCV</label>
=======
          <label>3mCV</label>
>>>>>>> b1d24e10695c71395ee88867c7bef650d3242cfa
          <input
            value={form.m3_cvm}
            onChange={(e) => handleChange("m3_cvm", e.target.value)}
            className={errors.m3_cvm ? styles.errorField : ""}
          />
        </div>

        <div className={styles.fullWidth}>
          <label>Remarks (optional)</label>
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

