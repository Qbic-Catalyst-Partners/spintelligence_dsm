import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { useDispatch, useSelector } from "react-redux";

import CustomSelect from "@/components/CustomSelect";
import styles from "@/styles/u%dataentry.module.css";
import { clearComberState, getComberUqcEntries, submitComberUqc } from "@/store/slices/comber";

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
  { types = [], selectedType = "", onTypeChange = () => {} },
  ref
) {
  const dispatch = useDispatch();
  const { data, error } = useSelector((state) => state.comber ?? {});
  const [form, setForm] = useState(initialForm());

  const handleChange = (field, value) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const clear = () => {
    setForm(initialForm());
  };

  useEffect(() => {
    dispatch(getComberUqcEntries({ page: 1, limit: 10 }));
  }, [dispatch]);

  useEffect(() => {
    if (data?.message === "UQC entry created successfully") {
      alert(data.message);
      clear();
      dispatch(getComberUqcEntries({ page: 1, limit: 10 }));
      dispatch(clearComberState());
    }
  }, [data, dispatch]);

  useEffect(() => {
    if (error) {
      alert(error);
      dispatch(clearComberState());
    }
  }, [dispatch, error]);

  const validate = () => {
    const requiredFields = [
      selectedType,
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
    );
    return true;
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
          />
        </div>

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
          <select
            value={form.shift}
            onChange={(e) => handleChange("shift", e.target.value)}
          >
            <option value="">Select</option>
            <option>Shift A</option>
            <option>Shift B</option>
            <option>Shift C</option>
            <option>General</option>
          </select>
        </div>

        <div>
          <label>Variety</label>
          <select
            value={form.variety}
            onChange={(e) => handleChange("variety", e.target.value)}
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
          />
        </div>

        <div>
          <label>CVM</label>
          <input
            value={form.cvm}
            onChange={(e) => handleChange("cvm", e.target.value)}
          />
        </div>

        <div>
          <label>1m CVM</label>
          <input
            value={form.im_cvm}
            onChange={(e) => handleChange("im_cvm", e.target.value)}
          />
        </div>

        <div>
          <label>3m CVM</label>
          <input
            value={form.m3_cvm}
            onChange={(e) => handleChange("m3_cvm", e.target.value)}
          />
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
    </div>
  );
});

export default UPercentDataEntry;
