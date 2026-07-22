import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { useDispatch, useSelector } from "react-redux";

import CustomInput from "@/components/CustomInput";
import Footer from "@/components/Footer";
import PreviewModal from "@/components/PreviewModal";
import SuccessModal from "@/components/SuccessModal";
import NotebookCustomFields from "@/components/NotebookCustomFields";
import { fetchCardingDfkPressure, submitCardingDfkPressure } from "@/store/slices/carding";
import { recordSubmittedNotebook } from "@/utils/submittedNotebookRecorder";
import { saveNotebookCustomFieldValuesApi } from "@/apis/notebookCustomFieldsApi";
import styles from "./cardingdfk.module.css";

const DFK_TYPE = "Card DFK Data";
const MACHINE_NAMES = Array.from({ length: 27 }, (_, index) => `CDG-${String(index + 1).padStart(2, "0")}`);
const TABLE_COLUMNS = [
  { key: "cw", label: "DFK" },
  { key: "ccd", label: "CCD" },
  { key: "hfd1", label: "ICFD (1)" },
  { key: "hfd2", label: "LT" },
  { key: "cgs", label: "CDS" },
  { key: "sliverDraft", label: "SILVER DRAFT" },
  { key: "kfdDd", label: "ICFD (2)" },
  { key: "dfIn", label: "IDF IN" },
  { key: "dfOut", label: "IDF OUT" },
  { key: "alRh", label: "AL ON" },
];

const createEmptyRow = () =>
  TABLE_COLUMNS.reduce((accumulator, column) => {
    accumulator[column.key] = "";
    return accumulator;
  }, {});

const createInitialRows = () =>
  MACHINE_NAMES.reduce((accumulator, machineName) => {
    accumulator[machineName] = createEmptyRow();
    return accumulator;
  }, {});

const MACHINE_GROUP_SIZE = 5;
const MACHINE_GROUPS = MACHINE_NAMES.reduce((groups, machineName, index) => {
  const groupIndex = Math.floor(index / MACHINE_GROUP_SIZE);
  if (!groups[groupIndex]) groups[groupIndex] = [];
  groups[groupIndex].push(machineName);
  return groups;
}, []);

function CardingDfk({ types = [], selectedType = "", onTypeChange, entryId = "", reserveEntryId, user }) {
  const router = useRouter();
  const dispatch = useDispatch();
  const { isLoading } = useSelector((state) => state.carding ?? {
    isLoading: false,
  });
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [rows, setRows] = useState(createInitialRows);
  const [errors, setErrors] = useState({});
  const [showPreview, setShowPreview] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [formMessage, setFormMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [openGroup, setOpenGroup] = useState(0);
  const [customFieldValues, setCustomFieldValues] = useState({});
  const [customFieldDefs, setCustomFieldDefs] = useState([]);

  const handleCustomFieldChange = (fieldId, value) => {
    setCustomFieldValues((prev) => ({ ...prev, [fieldId]: value }));
  };

  useEffect(() => {
    const checkScreen = () => setIsMobile(window.innerWidth <= 767);
    checkScreen();
    window.addEventListener("resize", checkScreen);
    return () => window.removeEventListener("resize", checkScreen);
  }, []);

  const hasValues = useMemo(
    () =>
      Object.values(rows).some((machineRow) =>
        Object.values(machineRow).some((value) => value !== "")
      ),
    [rows]
  );

  const handleValueChange = (machineName, key, value) => {
    const nextValue = value;
    setRows((currentRows) => ({
      ...currentRows,
      [machineName]: {
        ...currentRows[machineName],
        [key]: nextValue,
      },
    }));
    setErrors((current) => {
      const next = { ...current };
      delete next[`${machineName}-${key}`];
      return next;
    });
  };

  const handleClear = () => {
    setDate(new Date().toISOString().split("T")[0]);
    setRows(createInitialRows());
    setCustomFieldValues({});
  };

  const handleTypeSelect = (value) => {
    onTypeChange?.(value);
    setDate(new Date().toISOString().split("T")[0]);
  };

  const handleSave = async () => {
    const entries = MACHINE_NAMES.filter((machineName) =>
      Object.values(rows[machineName]).some((value) => value !== "")
    ).map((machineName) => {
      const row = rows[machineName];
      return {
        machine_name: machineName,
        dfk: row.cw || "0.00",
        ccd: row.ccd || "0.00",
        icfd_1: row.hfd1 || "0.00",
        lt: row.hfd2 || "0.00",
        cds: row.cgs || "0.00",
        silver_draft: row.sliverDraft || "0.00",
        icfd_2: row.kfdDd || "0.00",
        idf_in: row.dfIn || "0.00",
        idf_out: row.dfOut || "0.00",
        al_on: row.alRh || "0.00",
      };
    });

    try {
      const saved = await dispatch(
        submitCardingDfkPressure({
          entry_id: entryId || "",
          inspection_type: DFK_TYPE,
          entry_date: date,
          data: entries,
        })
      ).unwrap();

      const nextEntryId = saved?.entry_id || entryId;
      try {
        await recordSubmittedNotebook({
          department: "Quality Control",
          subDepartment: "Carding",
          notebookName: selectedType || DFK_TYPE,
          entryId: nextEntryId,
          previewItems,
          user,
        });
      } catch (recordError) {
        console.warn("Carding submitted notebook record failed:", recordError?.response?.data || recordError?.message || recordError);
      }

      const customFieldEntries = Object.entries(customFieldValues).filter(([, v]) => String(v ?? '').trim() !== '');
      if (nextEntryId && customFieldEntries.length) {
        try {
          await saveNotebookCustomFieldValuesApi(
            nextEntryId,
            customFieldEntries.map(([customFieldId, value]) => ({ custom_field_id: customFieldId, value }))
          );
        } catch (customFieldError) {
          console.error("Failed to save custom field values:", customFieldError);
        }
      }

      await reserveEntryId?.();

      handleClear();
      setShowPreview(false);
      setFormMessage("");
      setIsError(false);
      setShowSuccess(true);
      dispatch(fetchCardingDfkPressure({ page: 1, limit: 10 }));
    } catch (submitError) {
      setFormMessage(submitError?.message || "Unable to save DFK pressure data.");
      setIsError(true);
      await reserveEntryId?.();
    }
  };

  const validateForm = () => {
    const nextErrors = {};

    if (!selectedType) nextErrors.selectedType = true;
    if (!date) nextErrors.date = true;

    MACHINE_NAMES.forEach((machineName) => {
      TABLE_COLUMNS.forEach((column) => {
        if (String(rows[machineName][column.key] || "").trim() === "") {
          nextErrors[`${machineName}-${column.key}`] = true;
        }
      });
    });

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length) {
      setFormMessage("Please fill all required fields before preview.");
      setIsError(true);
      return false;
    }

    setFormMessage("");
    setIsError(false);
    return true;
  };

  const previewItems = [
    { label: "Type", value: selectedType || DFK_TYPE },
    { label: "Entry ID", value: entryId || "-" },
    ...MACHINE_NAMES.flatMap((machineName) =>
      TABLE_COLUMNS.map((column) => ({
        label: `${machineName} ${column.label}`,
        value: rows[machineName][column.key],
      }))
    ),
    ...customFieldDefs.map((field) => ({
      label: field.field_label,
      value: customFieldValues[field.id],
    })),
  ];
  const typeSelectStyle = {
    background: "#f1f5f9",
    backgroundColor: "#f1f5f9",
    backgroundImage: "var(--dfk-type-select-arrow)",
    backgroundClip: "padding-box",
    backgroundPosition: "right 12px center",
    backgroundRepeat: "no-repeat",
    backgroundSize: "18px 18px",
    borderColor: "#e2e8f0",
    color: "#334155",
    WebkitTextFillColor: "#334155",
    boxShadow: "none",
    paddingRight: "38px",
  };

  return (
    <>
      <div className={styles.dfkForm}>
        <div className={styles.dfkRow}>
          <div className={styles.dfkFormGroup}>
            <label>Type</label>
            <select
              value={selectedType || DFK_TYPE}
              onChange={(event) => handleTypeSelect(event.target.value)}
              className={`dfk-type-select ${styles.dfkTypeSelect}${errors.selectedType ? ` ${styles.fieldError}` : ""}`}
              style={typeSelectStyle}
            >
              <option value="" style={typeSelectStyle}>Select Type</option>
              {types.map((item) => (
                <option key={item.id} value={item.name} style={typeSelectStyle}>
                  {item.displayName ?? item.name}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.dfkFormGroup}>
            <CustomInput
              label="Entry ID"
              type="text"
              value={entryId || ""}
              onChange={() => {}}
              disabled
              error={errors.date}
            />
          </div>
        </div>

        <div className={styles.dfkAccordionList}>
          {MACHINE_GROUPS.map((group, groupIndex) => {
            const firstMachine = group[0];
            const lastMachine = group[group.length - 1];
            const isOpen = openGroup === groupIndex;

            return (
              <div key={`${firstMachine}-${lastMachine}`} className={styles.dfkSection}>
                <button
                  type="button"
                  className={styles.dfkSectionToggle}
                  onClick={() => setOpenGroup((current) => (current === groupIndex ? -1 : groupIndex))}
                  aria-expanded={isOpen}
                >
                  <span>{`${firstMachine} to ${lastMachine}`}</span>
                  <span className={`${styles.dfkChevron} ${isOpen ? styles.dfkChevronOpen : ""}`}>
                    ˅
                  </span>
                </button>

                {isOpen ? (
                  <div className={styles.dfkTableCard}>
                    <div className={styles.dfkTableWrap}>
                      <table className={styles.dfkTable}>
                        <thead>
                          <tr>
                            <th>Machine Name</th>
                            {TABLE_COLUMNS.map((column) => (
                              <th key={column.key}>{column.label}</th>
                            ))}
                          </tr>
                        </thead>

                        <tbody>
                          {group.map((machineName) => (
                            <tr key={machineName}>
                              <td className={styles.machineCell}>{machineName}</td>
                              {TABLE_COLUMNS.map((column) => (
                                <td key={`${machineName}-${column.key}`}>
                                  <CustomInput
                                    type="text"
                                    placeholder="60/100"
                                    value={rows[machineName][column.key]}
                                    onChange={(value) => handleValueChange(machineName, column.key, value)}
                                    onWheel={(event) => event.currentTarget.blur()}
                                    className={styles.dfkTableInput}
                                    error={errors[`${machineName}-${column.key}`]}
                                  />
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <NotebookCustomFields
        department="Quality Control"
        subDepartment="Carding"
        notebook="Card DFK Data"
        entryId={entryId}
        values={customFieldValues}
        onChange={handleCustomFieldChange}
        onFieldsLoaded={setCustomFieldDefs}
      />

      {formMessage ? (
        <div className={`${styles.dfkMessage} ${isError ? styles.dfkMessageError : styles.dfkMessageSuccess}`}>
          {formMessage}
        </div>
      ) : null}

      <div className={styles.dfkFooterWrap}>
        <Footer
          isMobile={isMobile}
          onBack={() => router.push("/departments/quality-control")}
          onClear={handleClear}
          onSave={() => {
            if (validateForm()) {
              setShowPreview(true);
            }
          }}
          saveLabel={isLoading ? "Saving..." : "Save Record"}
          disabled={!hasValues || isLoading}
        />
      </div>

      <PreviewModal
        open={showPreview}
        title="Carding Preview"
        subtitle="Carding Notebook / Card DFK Data"
        items={previewItems}
        typeValue={selectedType || DFK_TYPE}
        onCancel={() => setShowPreview(false)}
        onConfirm={handleSave}
        confirmLabel={isLoading ? "Saving..." : "Submit"}
      />

      <SuccessModal
        open={showSuccess}
        onClose={() => setShowSuccess(false)}
      />
    </>
  );
}

export default CardingDfk;

