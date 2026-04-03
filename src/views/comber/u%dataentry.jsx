import { useState } from "react";
import styles from "@/styles/u%dataentry.module.css";
import CustomSelect from "@/components/CustomSelect";
import Footer from "@/components/Footer";

function UPercentDataEntry({ types, selectedType, onTypeChange }) {
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
            onChange={(e) => handleChange("remarks", e.target.value)}
          />
        </div>
      </div>

      <Footer
        onBack={() => console.log("Back")}
        onClear={resetForm}
        onSave={() => console.log(form)}
      />
    </div>
  );
}

export default UPercentDataEntry;