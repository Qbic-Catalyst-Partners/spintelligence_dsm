import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { useDispatch, useSelector } from "react-redux";
import { FiPlus, FiTrash2 } from "react-icons/fi";

import CustomInput from "@/components/CustomInput";
import Footer from "@/components/Footer";
import PreviewModal from "@/components/PreviewModal";
import SuccessModal from "@/components/SuccessModal";
import NotebookCustomFields from "@/components/NotebookCustomFields";
import { fetchCardingMasterMachines } from "@/apis/carding";
import { fetchCardingDfkPressure, submitCardingDfkPressure } from "@/store/slices/carding";
import { recordSubmittedNotebook } from "@/utils/submittedNotebookRecorder";
import { saveNotebookCustomFieldValuesApi } from "@/apis/notebookCustomFieldsApi";
import { createThresholdViolationTickets } from "@/utils/thresholdTicketing";
import styles from "./cardingdfk.module.css";

const DFK_TYPE = "Card DFK Data";
const FALLBACK_MACHINE_NAMES = Array.from({ length: 27 }, (_, index) => `CDG-${String(index + 1).padStart(2, "0")}`);
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

let dfkRowIdCounter = 0;
const createEmptyRow = () =>
  TABLE_COLUMNS.reduce(
    (accumulator, column) => {
      accumulator[column.key] = "";
      return accumulator;
    },
    { id: `dfk-row-${Date.now()}-${dfkRowIdCounter++}`, machine: "" }
  );

function CardingDfk({ types = [], selectedType = "", onTypeChange, entryId = "", reserveEntryId, user }) {
  const router = useRouter();
  const dispatch = useDispatch();
  const { isLoading } = useSelector((state) => state.carding ?? {
    isLoading: false,
  });
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [machineOptions, setMachineOptions] = useState(FALLBACK_MACHINE_NAMES);
  const [machineOptionsError, setMachineOptionsError] = useState("");
  const [rows, setRows] = useState(() => [createEmptyRow()]);
  const [errors, setErrors] = useState({});
  const [showPreview, setShowPreview] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [formMessage, setFormMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [customFieldValues, setCustomFieldValues] = useState({});
  const [customFieldDefs, setCustomFieldDefs] = useState([]);
  const [showEmptyWarning, setShowEmptyWarning] = useState(false);

  const handleCustomFieldChange = (fieldId, value) => {
    setCustomFieldValues((prev) => ({ ...prev, [fieldId]: value }));
  };

  useEffect(() => {
    const checkScreen = () => setIsMobile(window.innerWidth <= 767);
    checkScreen();
    window.addEventListener("resize", checkScreen);
    return () => window.removeEventListener("resize", checkScreen);
  }, []);

  useEffect(() => {
    if (!showEmptyWarning) return undefined;
    const timer = setTimeout(() => setShowEmptyWarning(false), 2000);
    return () => clearTimeout(timer);
  }, [showEmptyWarning]);

  useEffect(() => {
    let isCancelled = false;

    const loadMachines = async () => {
      setMachineOptionsError("");
      try {
        const options = await fetchCardingMasterMachines({ prefix: "CDG" });
        if (isCancelled) return;
        if (options.length) setMachineOptions(options);
      } catch (error) {
        if (isCancelled) return;
        setMachineOptionsError(error?.message || "Unable to load machine options.");
      }
    };

    loadMachines();
    return () => {
      isCancelled = true;
    };
  }, []);

  // Only rows the user actually filled in count toward "has values" and get sent/stored - a row
  // with a machine picked but every value still blank isn't a real reading yet.
  const usedMachines = useMemo(
    () => new Set(rows.map((row) => row.machine).filter(Boolean)),
    [rows]
  );

  const hasValues = useMemo(
    () =>
      rows.some(
        (row) => row.machine && TABLE_COLUMNS.some((column) => String(row[column.key] || "").trim() !== "")
      ),
    [rows]
  );

  const canAddRow = rows.length < machineOptions.length;

  const handleMachineChange = (rowId, value) => {
    setRows((current) => current.map((row) => (row.id === rowId ? { ...row, machine: value } : row)));
    setErrors((current) => {
      const next = { ...current };
      delete next[`${rowId}-machine`];
      return next;
    });
  };

  const handleValueChange = (rowId, key, value) => {
    setRows((current) => current.map((row) => (row.id === rowId ? { ...row, [key]: value } : row)));
    setErrors((current) => {
      const next = { ...current };
      delete next[`${rowId}-${key}`];
      return next;
    });
  };

  const addRow = () => {
    if (!canAddRow) return;
    setRows((current) => [...current, createEmptyRow()]);
  };

  const removeRow = (rowId) => {
    setRows((current) => (current.length > 1 ? current.filter((row) => row.id !== rowId) : current));
  };

  const handleClear = () => {
    setDate(new Date().toISOString().split("T")[0]);
    setRows([createEmptyRow()]);
    setErrors({});
    setCustomFieldValues({});
  };

  const handleTypeSelect = (value) => {
    onTypeChange?.(value);
    setDate(new Date().toISOString().split("T")[0]);
  };

  // Only rows with a machine picked are real entries - an empty trailing row (the one always left
  // for the user to fill next) never gets sent, so nothing empty is stored in the database.
  const filledRows = rows.filter((row) => row.machine);

  const handleSave = async () => {
    const entries = filledRows.map((row) => ({
      machine_name: row.machine,
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
    }));

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
          previewItems: submittedNotebookItems,
          user,
        });
      } catch (recordError) {
        console.warn("Carding submitted notebook record failed:", recordError?.response?.data || recordError?.message || recordError);
      }

      try {
        await createThresholdViolationTickets({
          department: "Quality Control",
          subDepartment: "Carding",
          screenName: selectedType || DFK_TYPE,
          machineName: selectedType || DFK_TYPE,
          entryId: nextEntryId,
          values: previewItems,
        });
      } catch (ticketError) {
        console.error("Threshold ticket generation failed:", ticketError);
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

    if (!hasValues) {
      setErrors(nextErrors);
      setShowEmptyWarning(true);
      return false;
    }

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
    ...customFieldDefs.map((field) => ({
      label: field.field_label,
      value: customFieldValues[field.id],
    })),
  ];

  // Submitted Notebooks records only what's in previewItems (its detail view has no
  // fallback source endpoint for Card DFK), so the per-machine table rows have to be
  // flattened in here too - but only for that record, not for the on-screen preview
  // modal below, which already shows those rows via previewGroups' table.
  const submittedNotebookItems = [
    ...previewItems,
    { label: "Date", value: date },
    ...filledRows.flatMap((row) => [
      { label: `${row.machine} Machine Name`, value: row.machine },
      ...TABLE_COLUMNS.map((column) => ({
        label: `${row.machine} ${column.label}`,
        value: row[column.key] || "0.00",
      })),
    ]),
  ];

  const previewGroups = [
    {
      key: "dfk-values",
      title: "DFK Values",
      columns: [{ key: "machine_name", label: "Machine Name" }, ...TABLE_COLUMNS],
      rows: filledRows.map((row) => ({
        machine_name: row.machine,
        ...TABLE_COLUMNS.reduce((acc, column) => {
          acc[column.key] = row[column.key] || "0";
          return acc;
        }, {}),
      })),
    },
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

        {machineOptionsError ? (
          <div className={`${styles.dfkMessage} ${styles.dfkMessageError}`}>{machineOptionsError}</div>
        ) : null}

        <div className={styles.dfkTableCard}>
          <div className={styles.dfkTableWrap}>
            <table className={styles.dfkTable}>
              <thead>
                <tr>
                  <th>Machine Name</th>
                  {TABLE_COLUMNS.map((column) => (
                    <th key={column.key}>{column.label}</th>
                  ))}
                  <th aria-hidden="true" />
                </tr>
              </thead>

              <tbody>
                {rows.map((row, rowIndex) => {
                  const machineChoices = machineOptions.filter(
                    (name) => name === row.machine || !usedMachines.has(name)
                  );
                  const isLastRow = rowIndex === rows.length - 1;

                  return (
                    <tr key={row.id}>
                      <td className={styles.machineCell}>
                        <select
                          value={row.machine}
                          onChange={(event) => handleMachineChange(row.id, event.target.value)}
                          className={`${styles.dfkTableInput}${errors[`${row.id}-machine`] ? ` ${styles.fieldError}` : ""}`}
                        >
                          <option value="">Select</option>
                          {machineChoices.map((name) => (
                            <option key={name} value={name}>
                              {name}
                            </option>
                          ))}
                        </select>
                      </td>
                      {TABLE_COLUMNS.map((column) => (
                        <td key={`${row.id}-${column.key}`}>
                          <CustomInput
                            type="text"
                            placeholder="60/100"
                            value={row[column.key]}
                            onChange={(value) => handleValueChange(row.id, column.key, value)}
                            onWheel={(event) => event.currentTarget.blur()}
                            className={styles.dfkTableInput}
                            error={errors[`${row.id}-${column.key}`]}
                          />
                        </td>
                      ))}
                      <td>
                        <div className="flex shrink-0 items-center gap-2">
                          {isLastRow ? (
                            <button
                              type="button"
                              onClick={addRow}
                              disabled={!canAddRow}
                              aria-label="Add row"
                              title="Add row"
                              className="inline-flex h-7 w-7 items-center justify-center rounded-[6px] bg-[#4f63b6] text-white disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <FiPlus />
                            </button>
                          ) : (
                            <span className="inline-block h-7 w-7" aria-hidden="true" />
                          )}
                          <button
                            type="button"
                            onClick={() => removeRow(row.id)}
                            disabled={rows.length <= 1}
                            aria-label="Delete row"
                            title="Delete row"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-[6px] border border-[#ffcecf] bg-[#fff4f4] text-[#f04f56] disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <FiTrash2 />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
          disabled={isLoading}
        />
      </div>

      <PreviewModal
        open={showPreview}
        title="Carding Preview"
        subtitle="Carding Notebook / Card DFK Data"
        items={previewItems}
        groups={previewGroups}
        compactGroups
        typeValue={selectedType || DFK_TYPE}
        onCancel={() => setShowPreview(false)}
        onConfirm={handleSave}
        confirmLabel={isLoading ? "Saving..." : "Submit"}
      />

      <SuccessModal
        open={showSuccess}
        onClose={() => setShowSuccess(false)}
      />

      <SuccessModal
        open={showEmptyWarning}
        message="Kindly enter at least one input field to submit the form."
        icon="!"
        hideButton
        variant="warning"
        onClose={() => setShowEmptyWarning(false)}
      />
    </>
  );
}

export default CardingDfk;
