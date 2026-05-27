import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import styles from "@/styles/u%dataentry.module.css";
import Footer from "@/components/Footer";
import SuccessModal from "@/components/SuccessModal";
import { sanitizeNumericInput } from "@/utils/inputValidation";
import { clearCardingState, getCardingUqcEntries, submitCardingUqc } from "@/store/slices/carding";

const STATIC_SHIFT_OPTIONS = [
  { value: "General", label: "General" },
  { value: "Day", label: "Day" },
  { value: "Halfnight", label: "Halfnight" },
  { value: "Fullnight", label: "Fullnight" },
];

const STATIC_VARIETY_OPTIONS = [
  "B. PV",
  "B.AIR (0.09)",
  "B.AIRTHERMO 0.70",
  "B.AIRTHERMO VIS",
  "B.AIRTHERMO(0.09)",
  "B.AIRTHERMO/VIS",
  "B.ALLK 50/50 (0.70)",
  "B.ALLKIMA 50/50",
  "B.KOOLTEX",
  "B.KOOLTEX 0.100",
  "B.KOOLTEX(0.09)",
  "B.KOOLTEX(0.70)",
  "B.KOOLTEX0.100",
  "B.MODAL",
  "B.MODAL(0.09)",
  "B.MODAL(0.70)",
  "B.P/V (0.10)",
  "B.P/V 90/10",
  "B.P/V(0.10)",
  "B.P/V(0.100)",
  "B.P/V65/35(0.70)",
  "B.PSF",
  "B.PV (0.10)",
  "B.PV 0.090",
  "B.PV 0.100",
  "B.PV 1.00",
  "B.PV 1.90",
  "B.PV 65/35(0.70)",
  "B.PV 90/10",
  "B.PV(0.09)",
  "B.PV65/35",
  "BLACK MODAL",
  "BOMBAY DYEING (0.09)",
  "BOMBAY DYEING(0.07)",
  "Bombay dyeing(0.70)",
  "C/P[60/40]",
  "COMBED (0.12)",
  "COMBED(0.13)",
  "COT (0.80)",
  "COT (1.80)",
  "COT/BANANA",
  "COT/BANANA 80/20",
  "cot/cordura",
  "COTTON  0.13",
  "COTTON 0.100",
  "COTTON(0.10)",
  "COTTON(0.11)",
  "COTTON(0.80)",
  "COTTON(1.80)",
  "GRC B PSF",
  "GRC B PSF (0.13)",
  "GRC B PSF 0.100",
  "GRC W PSF",
  "GRC W PSF(0.09)",
  "GRC W.PSF (0.10)",
  "GRC. B. Pv (65/35)",
  "GRC.B.PSF (0.09)",
  "GRC.B.PSF (0.70)",
  "GRC.B.PSF 0.100",
  "GRC.B.PSF(0.09)",
  "GRC.B.PSF(0.10)",
  "GRC.B.PSF(0.100)",
  "GRC.B.PSF(0.13)",
  "GRC.B.PV",
  "GRC.W.P(0.09)",
  "GRC.W.PSF",
  "GRC.W.PSF _(0.70)",
  "GRC.W.PSF 0.100",
  "GRC.W.PSF(0.70)",
  "GRC.WPSF(0.10)",
  "GREY PV MEL 65/35",
  "GREY PV MEL 65/35 (0.70)",
  "KINKY (0.13) SIRO",
  "KINKY FIN",
  "KINKY YARN cot/lin",
  "lGREY PV MEL",
  "MODAL / PSF 65/35",
  "NYLON 6(0.14)",
  "P/c [62/38]",
  "P/C52/48(0.09)",
  "PC 0.100",
  "PC 52/48 (0.10)",
  "PC 52/48 (0.70)",
  "PC 52/48 (0.80)",
  "PC 52/48 0.09",
  "PC 52/48 0.10",
  "PC 52/48 0.100",
  "PC 52/48 0.11",
  "PC 52/48 0.12",
  "PC 52/48 0.13",
  "PC 52/48 0.14",
  "PC 52/48 0.15",
  "PC 52/48(0.09)",
  "PC 52/48(0.10)",
  "PC 52/48(0.70)",
  "PC 55/45",
  "PC 55/45 (0.10)",
  "PC LINEN 20/40/40 0.110",
  "PC LINEN 40/40/20",
  "PC LINEN 40/40/20(0.70)",
  "PC LINEN(0.100)",
  "RRC B PSF",
  "RRC B PSF (0.13)",
  "RRC B PSF 0.10",
  "RRC B PSF(0.10)",
  "RRC B.PSF",
  "RRC B.PSF 0.10",
  "RRC. B. PSF 0.100",
  "RRC.B PSF",
  "RRC.B PSF(0.09)",
  "RRC.B. PSF(0.100)",
  "RRC.B.PSF (0.70)",
  "RRC.B.PSF(0.09)",
  "RRC.B.PSF(0.100)",
  "RRC.B.PSF(0.70)",
  "RRC.B.PSF(1.80)",
  "RRC.BPSF(0.09)",
  "RRE B.PSF(0.70)",
  "TEN/BANANA(0.70)",
  "TEN/COT",
  "TEN/COT 90/10",
  "TEN/COT(0.09)",
  "TEN/COT(0.100)",
  "Tencel Hemp(1.40)",
  "TENCEL/COT 90/10",
  "TENCEL/HEMP (0.13)",
  "TENCIL/COT",
  "TENCIL/COT 90/10",
  "TESTING",
  "THERMOLITE/COTTON [75/25]",
  "W PV 65/35 (0.09)",
  "W PV 65/35(0.70)",
  "W. ALL (0.70)",
  "W. PV",
  "W.ALLK 0.090",
  "W.ALLK 50/50 0.09",
  "W.ALLK(0.90)50/50",
  "W.ALLK0.90",
  "W.ALLKLIMA 0.10",
  "W.ALLKLIMA 50/50",
  "W.KOOLTEX",
  "W.KOOLTEX (0.70)",
  "W.KOOLTEX 0.090",
  "W.MODAL PSF 65/35",
  "W.MODAL PSF0.10",
  "W.P/V 65/35",
  "W.P/V(0.10)",
  "W.PSF (0.100)",
  "W.PSF (0.13)",
  "W.PSF (0.70)",
  "W.PSF (1.80)",
  "W.PSF 0.90",
  "W.PSF 1.100",
  "W.PSF(0.090)",
  "W.PSF(0.100)",
  "W.PSF(0.76)",
  "W.PSF(1.80)",
  "W.PV 65/35(0.70)",
];

const STATIC_DEPARTMENT_OPTIONS = [
  { dept_code: "BR", dept_name: "Br drawing" },
  { dept_code: "FR", dept_name: "Fr drawing" },
  { dept_code: "CD", dept_name: "Carding" },
  { dept_code: "SX", dept_name: "Simplx" },
  { dept_code: "CB", dept_name: "Comber" },
];

const STATIC_MC_NO_OPTIONS = [
  "CDG-01","CDG-02","CDG-03","CDG-04","CDG-05","CDG-06","CDG-07","CDG-08","CDG-09","CDG-10",
  "CDG-11","CDG-12","CDG-13","CDG-14","CDG-15","CDG-16","CDG-17","CDG-18","CDG-19","CDG-20",
  "CDG-21","CDG-22","CDG-23","CDG-24","CDG-25","CDG-26",
  "SMX-01","SMX-02","SMX-03","SMX-04","SMX-05","SMX-06","SMX-07","SMX-08","SMX-09","SMX-10","SMX-11","SMX-12","SMX-13",
  "CBR-01","CBR-02","CBR-03","CBR-04","CBR-05","CBR-06",
  "FR HSR1000-1","FR HSR1000-2","FR D40","FR D50-1","FR D50-2","FR D45-1","FR D45-2","FR D45-3","FR D45-4","FR LRSB 581-1","FR LRSB 581-2","FR LDF3","FR D55-1",
  "BR SB-20","BR TD7-1","BR TD7-2","BR TD7-3","BR TD7-4","BR TD7-5","BR TD7-6",
].map((mc_no) => ({ mc_no }));

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
  const [varietyOptions] = useState(STATIC_VARIETY_OPTIONS);
  const [departmentOptions] = useState(STATIC_DEPARTMENT_OPTIONS);
  const [mcNoOptions] = useState(STATIC_MC_NO_OPTIONS);
  const [shiftOptions] = useState(STATIC_SHIFT_OPTIONS);

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
              <option value="">-- Select Shift --</option>
              {shiftOptions.map((item, index) => (
                <option key={`${item.value}-${index}`} value={item.value}>{item.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label>Variety</label>
            <select value={form.variety} onChange={(e) => handleChange("variety", e.target.value)} className={errors.variety ? styles.errorField : ""}>
              <option value="">-- Select Variety --</option>
              {varietyOptions.map((name, index) => <option key={`${name}-${index}`} value={name}>{name}</option>)}
            </select>
          </div>

          <div>
            <label>Department</label>
            <select value={form.department} onChange={(e) => handleChange("department", e.target.value)} className={errors.department ? styles.errorField : ""}>
              <option value="">Select Department</option>
              {departmentOptions.map((item, index) => <option key={`${item.dept_code}-${index}`} value={item.dept_name}>{item.dept_name}</option>)}
            </select>
          </div>

          <div>
            <label>MC No.</label>
            <select value={form.mc_no} onChange={(e) => handleChange("mc_no", e.target.value)} className={errors.mc_no ? styles.errorField : ""}>
              <option value="">-- Select MC No. --</option>
              {mcNoOptions.map((item, index) => <option key={`${item.mc_no}-${index}`} value={item.mc_no}>{item.mc_no}</option>)}
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

