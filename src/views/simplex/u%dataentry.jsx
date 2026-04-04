import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import styles from "@/styles/u%dataentry.module.css";
import { useDispatch, useSelector } from "react-redux";
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

const UPercentDataEntry = forwardRef(function UPercentDataEntry({ selectedTypeName }, ref) {
  const dispatch = useDispatch();
  const { isLoading, data } = useSelector((state) => state.simplex ?? {});
  const [form, setForm] = useState({
    ...initialForm(),
  });

  useEffect(() => {
    if (data?.message) {
      alert(data.message);
    }
  }, [data]);

  const handleChange = (field, value) => {
    setForm({ ...form, [field]: value });
  };

  const resetForm = () => {
    setForm(initialForm());
  };

  const validate = () => {
    const requiredFields = [
      form.date,
      form.shift,
      form.variety,
      form.department,
      form.mc_no,
      form.u_percent,
      form.cvm,
      form.im_cvm,
      form.m3_cvm,
      form.remarks,
    ];

    if (requiredFields.some((value) => String(value).trim() === "")) {
      alert("Please fill all fields.");
      return false;
    }

    return true;
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

    alert(resultAction.payload || "Failed to save U% entry.");
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
        <div>
          <label>Date</label>
          <input
            type="date"
            value={form.date}
            onChange={(e) => handleChange("date", e.target.value)}
          />
        </div>

        <div>
          <label>Shift</label>
          <select onChange={(e) => handleChange("shift", e.target.value)}>
            <option value="">Select</option>
            <option>General</option>
          </select>
        </div>

        <div>
          <label>Variety</label>
          <select onChange={(e) => handleChange("variety", e.target.value)}>
            <option value="">Select</option>
            <option>WPSF 0.90</option>
          </select>
        </div>

        <div>
          <label>Department</label>
          <select onChange={(e) => handleChange("department", e.target.value)}>
            <option value="">Select Department</option>
            <option>FR Drawing</option>
          </select>
        </div>

        <div>
          <label>MC No.</label>
          <select onChange={(e) => handleChange("mc_no", e.target.value)}>
            <option value="">Select MC No.</option>
            <option>FR DSS-1</option>
          </select>
        </div>

        <div>
          <label>U%</label>
          <input onChange={(e) => handleChange("u_percent", e.target.value)} />
        </div>

        <div>
          <label>CVM</label>
          <input onChange={(e) => handleChange("cvm", e.target.value)} />
        </div>

        <div>
          <label>1m CVM</label>
          <select onChange={(e) => handleChange("im_cvm", e.target.value)}>
            <option value="">Select</option>
            <option>0.32</option>
          </select>
        </div>

        <div>
          <label>3m CVM</label>
          <input onChange={(e) => handleChange("m3_cvm", e.target.value)} />
        </div>

        <div className={styles.fullWidth}>
          <label>Remarks</label>
          <textarea
            rows={3}
            value={form.remarks}
            onChange={(e) => handleChange("remarks", e.target.value)}
          />
        </div>
      </div>
      {isLoading && <p style={{ marginTop: "12px", color: "#2563eb" }}>Saving...</p>}
    </div>
  );
});

export default UPercentDataEntry;
