import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import styles from "@/styles/u%dataentry.module.css";
import CustomSelect from "@/components/CustomSelect";
import Footer from "@/components/Footer";
import { clearCardingState, getCardingUqcEntries, submitCardingUqc } from "@/store/slices/carding";

function UPercentDataEntry({ types, selectedType, onTypeChange }) {
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

  const handleChange = (field, value) => {
    setForm({ ...form, [field]: value });
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
  };

  useEffect(() => {
    dispatch(getCardingUqcEntries({ page: 1, limit: 10 }));
  }, [dispatch]);

  useEffect(() => {
    if (uqc?.message) {
      alert(uqc.message);
      resetForm();
      dispatch(getCardingUqcEntries({ page: 1, limit: 10 }));
      dispatch(clearCardingState());
    }
  }, [dispatch, uqc]);

  useEffect(() => {
    if (error) {
      alert(error);
      dispatch(clearCardingState());
    }
  }, [dispatch, error]);

  const handleSave = () => {
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
      return;
    }

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
          <select value={form.shift} onChange={(e) => handleChange("shift", e.target.value)}>
            <option value="">Select</option>
            <option>Shift A</option>
            <option>Shift B</option>
            <option>Shift C</option>
            <option>General</option>
          </select>
        </div>

        <div>
          <label>Variety</label>
          <select value={form.variety} onChange={(e) => handleChange("variety", e.target.value)}>
            <option value="">Select</option>
            <option>Cotton</option>
            <option>WPSF 0.90</option>
          </select>
        </div>

        <div>
          <label>Department</label>
          <select value={form.department} onChange={(e) => handleChange("department", e.target.value)}>
            <option value="">Select Department</option>
            <option>Carding</option>
            <option>FR Drawing</option>
          </select>
        </div>

        <div>
          <label>MC No.</label>
          <select value={form.mc_no} onChange={(e) => handleChange("mc_no", e.target.value)}>
            <option value="">Select MC No.</option>
            <option>MC-01</option>
            <option>MC-02</option>
            <option>MC-03</option>
            <option>FR DSS-1</option>
          </select>
        </div>

        <div>
          <label>U%</label>
          <input value={form.u_percent} onChange={(e) => handleChange("u_percent", e.target.value)} />
        </div>

        <div>
          <label>CVM</label>
          <input value={form.cvm} onChange={(e) => handleChange("cvm", e.target.value)} />
        </div>

        <div>
          <label>1m CVM</label>
          <select value={form.im_cvm} onChange={(e) => handleChange("im_cvm", e.target.value)}>
            <option value="">Select</option>
            <option>0.32</option>
          </select>
        </div>

        <div>
          <label>3m CVM</label>
          <input value={form.m3_cvm} onChange={(e) => handleChange("m3_cvm", e.target.value)} />
        </div>

        <div className={styles.fullWidth}>
          <label>Remarks</label>
          <textarea
            rows={3}
            onChange={(e) => handleChange("remarks", e.target.value)}
          />
        </div>
      </div>

      <Footer
        onBack={() => console.log("Back")}
        onClear={resetForm}
        onSave={handleSave}
        saveLabel={isLoading ? "Saving..." : "Save Record"}
        disabled={isLoading}
      />
    </div>
  );
}

export default UPercentDataEntry;
