import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import styles from "@/styles/u%dataentry.module.css";
import Footer from "@/components/Footer";
import SearchableSelect from "@/components/SearchableSelect";
import SuccessModal from "@/components/SuccessModal";
import NotebookCustomFields from "@/components/NotebookCustomFields";
import { sanitizeNumericInput } from "@/utils/inputValidation";
import { fetchCardingUqcMasterDropdown, fetchCardingUqcMasterVarieties } from "@/apis/carding";
import { clearCardingState, getCardingUqcEntries, submitCardingUqc } from "@/store/slices/carding";
import { recordSubmittedNotebook } from "@/utils/submittedNotebookRecorder";
import { saveNotebookCustomFieldValuesApi } from "@/apis/notebookCustomFieldsApi";

export const STATIC_SHIFT_OPTIONS = [
  { value: "Shift 1", label: "Shift 1" },
  { value: "Shift 2", label: "Shift 2" },
  { value: "Shift 3", label: "Shift 3" },
];

export const STATIC_MC_NO_OPTIONS = [
  "CDG-01","CDG-02","CDG-03","CDG-04","CDG-05","CDG-06","CDG-07","CDG-08","CDG-09","CDG-10",
  "CDG-11","CDG-12","CDG-13","CDG-14","CDG-15","CDG-16","CDG-17","CDG-18","CDG-19","CDG-20",
  "CDG-21","CDG-22","CDG-23","CDG-24","CDG-25","CDG-26","CDG-27",
  "SMX-01","SMX-02","SMX-03","SMX-04","SMX-05","SMX-06","SMX-07","SMX-08","SMX-09","SMX-10","SMX-11","SMX-12","SMX-13",
  "CBR-01","CBR-02","CBR-03","CBR-04","CBR-05","CBR-06",
  "FR HSR1000-1","FR HSR1000-2","FR D40","FR D50-1","FR D50-2","FR D45-1","FR D45-2","FR D45-3","FR D45-4","FR LRSB 581-1","FR LRSB 581-2","FR LDF3","FR D55-1",
  "BR SB-20","BR TD7-1","BR TD7-2","BR TD7-3","BR TD7-4","BR TD7-5","BR TD7-6",
].map((mc_no) => ({ mc_no }));

const CDG_MC_NO_OPTIONS = STATIC_MC_NO_OPTIONS.filter((item) =>
  String(item?.mc_no || "").toUpperCase().startsWith("CDG")
);

const normalizeCardingUqcMachineOptions = (rows = []) =>
  rows
    .map((row) => String(row?.mc_no ?? row?.mcName ?? row?.value ?? row ?? "").trim())
    .filter((mcNo) => mcNo.toUpperCase().startsWith("CDG"))
    .map((mc_no) => ({ mc_no }));

function UPercentDataEntry({ types, selectedType, onTypeChange, entryId = "", reserveEntryId, user }) {
  const dispatch = useDispatch();
  const { isLoading, uqc, error } = useSelector((state) => state.carding ?? {});
  const [form, setForm] = useState({
    date: new Date().toISOString().split("T")[0],
    shift: "",
    variety: "",
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
  const [varietyOptions, setVarietyOptions] = useState([]);
  const [mcNoOptions, setMcNoOptions] = useState(CDG_MC_NO_OPTIONS);
  const [shiftOptions] = useState(STATIC_SHIFT_OPTIONS);
  const [customFieldValues, setCustomFieldValues] = useState({});

  const handleCustomFieldChange = (fieldId, value) => {
    setCustomFieldValues((prev) => ({ ...prev, [fieldId]: value }));
  };

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
    setCustomFieldValues({});
  };

  useEffect(() => {
    dispatch(getCardingUqcEntries({ page: 1, limit: 10 }));
  }, [dispatch]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const dropdownOptions = await fetchCardingUqcMasterDropdown({
          prefix: "CDG",
          mc_no_prefix: "CDG",
          department_code: "CDG",
        });
        if (!active) return;
        const masterVarieties = dropdownOptions.varieties?.map((row) => row.variety_name).filter(Boolean) || [];
        const masterMcNos = normalizeCardingUqcMachineOptions(dropdownOptions.mcNos || []);
        setVarietyOptions(masterVarieties.length ? masterVarieties : await fetchCardingUqcMasterVarieties());
        setMcNoOptions(masterMcNos.length ? masterMcNos : CDG_MC_NO_OPTIONS);
      } catch (_err) {
        if (active) {
          try {
            const options = await fetchCardingUqcMasterVarieties();
            if (active) {
              setVarietyOptions(Array.isArray(options) ? options : []);
              setMcNoOptions(CDG_MC_NO_OPTIONS);
            }
          } catch {
            if (active) {
              setVarietyOptions([]);
              setMcNoOptions(CDG_MC_NO_OPTIONS);
            }
          }
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (uqc?.message) {
      const nextEntryId = uqc?.data?.entry_id || entryId;
      const previewItems = [
        { label: "Type", value: selectedType },
        { label: "Entry ID", value: entryId || "-" },
        { label: "Shift", value: form.shift },
        { label: "Variety", value: form.variety },
        { label: "MC No.", value: form.mc_no },
        { label: "U%", value: form.u_percent },
        { label: "CVM", value: form.cvm },
        { label: "1mCV", value: form.im_cvm },
        { label: "3 mCV", value: form.m3_cvm },
        { label: "Remarks", value: form.remarks },
      ];
      recordSubmittedNotebook({
        department: "Quality Control",
        subDepartment: "Carding",
        notebookName: selectedType,
        entryId: nextEntryId,
        previewItems,
        user,
      }).catch((recordError) => {
        console.warn("Carding submitted notebook record failed:", recordError?.response?.data || recordError?.message || recordError);
      });

      const customFieldEntries = Object.entries(customFieldValues).filter(([, v]) => String(v ?? '').trim() !== '');
      if (nextEntryId && customFieldEntries.length) {
        saveNotebookCustomFieldValuesApi(
          nextEntryId,
          customFieldEntries.map(([customFieldId, value]) => ({ custom_field_id: customFieldId, value }))
        ).catch((customFieldError) => {
          console.error("Failed to save custom field values:", customFieldError);
        });
      }

      reserveEntryId?.();
      resetForm();
      setIsError(false);
      setShowSuccess(true);
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
      if (field === "remarks") return;
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
        entry_id: entryId || "",
        entry_type: selectedType,
        entry_date: form.date,
        shift: form.shift,
        variety: form.variety,
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
            <SearchableSelect
              value={form.shift}
              onChange={(value) => handleChange("shift", value)}
              className={errors.shift ? styles.errorField : ""}
              options={shiftOptions.map((item) => item.value)}
              placeholder="-- Select Shift --"
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
              placeholder="-- Select Variety --"
            />
          </div>

          <div>
            <label>MC No.</label>
            <SearchableSelect
              value={form.mc_no}
              onChange={(value) => handleChange("mc_no", value)}
              className={errors.mc_no ? styles.errorField : ""}
              options={mcNoOptions.map((item) => item.mc_no)}
              placeholder="-- Select MC No. --"
              ariaLabel="MC No."
            />
          </div>

          <div>
            <label>U%</label>
            <input value={form.u_percent} onChange={(e) => handleChange("u_percent", e.target.value)} className={errors.u_percent ? styles.errorField : ""} />
          </div>

          <div>
            <label>CVM</label>
            <input value={form.cvm} onChange={(e) => handleChange("cvm", e.target.value)} className={errors.cvm ? styles.errorField : ""} />
          </div>

        <div>
          <label>1mCV</label>
          <input value={form.im_cvm} onChange={(e) => handleChange("im_cvm", e.target.value)} className={errors.im_cvm ? styles.errorField : ""} />
        </div>

          <div>
            <label>3 mCV</label>
            <input value={form.m3_cvm} onChange={(e) => handleChange("m3_cvm", e.target.value)} className={errors.m3_cvm ? styles.errorField : ""} />
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
      </div>

      <NotebookCustomFields
        department="Quality Control"
        subDepartment="Carding"
        notebook="U% Data Entry"
        entryId={entryId}
        values={customFieldValues}
        onChange={handleCustomFieldChange}
      />

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


