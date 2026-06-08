import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";
import InputScreenUploadButton from "@/components/InputScreenUploadButton";
import { sanitizeNumericInput } from "@/utils/inputValidation";
import styles from "@/styles/drawFrameWheelChange.module.css";

const LINE_TYPES = ["Breaker", "Finisher"];
const WHEEL_CHANGE_TYPES = ["Type 1 (HSR)", "Type 2 (TD7)", "Type 3 (TD9)"];
const WHEEL_CHANGE_API_TYPES = {
  "Type 1 (HSR)": "type1",
  "Type 2 (TD7)": "type2",
  "Type 3 (TD9)": "type3",
};
const DRAFT_STORAGE_KEY = "draw_frame_wheel_change_last_values";

const TYPE_1_ROWS = [
  { key: "milling", label: "Mixing" },
  { key: "blendPercent", label: "Blend %" },
  { key: "exHank", label: "Del-Hank" },
  { key: "feedHank", label: "Feed Hank" },
  { key: "noOfEnds", label: "No. of Ends" },
  { key: "speed", label: "Speed" },
  { key: "draftConstant", label: "Draft Constant", darkInput: true },
  { key: "md1", label: "NW1", inputType: "select" },
  { key: "md2", label: "NW2", inputType: "select" },
  { key: "totalDraft", label: "Total Draft", darkInput: true },
  { key: "bdcp", label: "BDCP (W4 / Break Draft)", inputType: "select" },
  { key: "creelTension", label: "Creel Tension (W1VWW2) / Creel Tension Draft", inputType: "select" },
  { key: "feedTension", label: "Feed Tension (W8/VEG) / Feed Tension Draft", inputType: "select" },
  { key: "webTension", label: "Web Tension (W3) / Web Tension Draft", inputType: "select" },
  { key: "trumpet", label: "Trumpet", inputType: "select" },
  { key: "bottomRollerFront", label: "Bottom Roller Setting Front Zone", inputType: "select" },
  { key: "bottomRollerBack", label: "Bottom Roller Setting Back Zone", inputType: "select" },
];

const TD7_ROWS = [
  { key: "mixing", label: "Mixing" },
  { key: "blendPercent", label: "Blend %" },
  { key: "delHank", label: "Del-Hank" },
  { key: "feedHank", label: "Feed Hank" },
  { key: "noOfEnds", label: "No. of Ends" },
  { key: "speed", label: "Speed" },
  { key: "totalDraftFormula", label: "Total Draft (Formula)", darkInput: true },
  { key: "totalDraftGear", label: "Total Draft from G1/G2 Combination" },
  { key: "g1G2", label: "G1/G2", inputType: "select" },
  { key: "bdcp", label: "BDCP (C4) / Break Draft", inputType: "select" },
  { key: "webTension", label: "Web Tension (C3) / Web Tension Draft", inputType: "select" },
  { key: "trumpet", label: "Trumpet", inputType: "select" },
  { key: "bottomRollerFront", label: "Bottom Roller Setting Front Zone", inputType: "select" },
  { key: "bottomRollerBack", label: "Bottom Roller Setting Back Zone", inputType: "select" },
];

const ROWS_BY_TYPE = {
  "Type 1 (HSR)": TYPE_1_ROWS,
  "Type 2 (TD7)": TD7_ROWS,
  "Type 3 (TD9)": TD7_ROWS,
};

const ALL_ROWS = [...TYPE_1_ROWS, ...TD7_ROWS];

const getTodayDate = () => new Date().toISOString().split("T")[0];

const createValues = () =>
  ALL_ROWS.reduce((values, row) => {
    values[row.key] = { existing: "", proposed: "" };
    return values;
  }, {});

const hasTextValue = (value) => String(value ?? "").trim() !== "";
const getTextValue = (value) => String(value ?? "").trim();
const parseNumericValue = (value) => {
  const parsed = Number.parseFloat(String(value ?? "").trim());
  return Number.isFinite(parsed) ? parsed : null;
};

const InspectionEntryIcon = () => (
  <svg
    aria-hidden="true"
    viewBox="0 0 20 20"
    width="18"
    height="18"
    className={styles.titleIcon}
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M3 5.5H10.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M3 9.5H8.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M3 13.5H6.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M12.3 6.2L15.8 9.7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path
      d="M11.4 13.9L10.9 16L13 15.5L17 11.5C17.6 10.9 17.6 9.95 17 9.35L16.15 8.5C15.55 7.9 14.6 7.9 14 8.5L11.4 11.1V13.9Z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
  </svg>
);

const DrawFrameWheelChange = forwardRef(function DrawFrameWheelChange(
  {
    selectedTypeName = "Wheel Change",
    typeOptions = [],
    entryId = "#DWC-001",
    onTypeChange,
  },
  ref
) {
  const [wheelChangeType, setWheelChangeType] = useState("");
  const [lineType, setLineType] = useState("");
  const [date, setDate] = useState(getTodayDate);
  const [values, setValues] = useState(createValues);
  const [errors, setErrors] = useState({});
  const [draftLoaded, setDraftLoaded] = useState(false);

  const activeRows = useMemo(
    () => ROWS_BY_TYPE[wheelChangeType] || TYPE_1_ROWS,
    [wheelChangeType]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = JSON.parse(window.localStorage.getItem(DRAFT_STORAGE_KEY) || "{}");
      if (stored && typeof stored === "object") {
        setWheelChangeType(typeof stored.wheelChangeType === "string" ? stored.wheelChangeType : "");
        setLineType(typeof stored.lineType === "string" ? stored.lineType : "");
        setDate(typeof stored.date === "string" && stored.date ? stored.date : getTodayDate());
        setValues({
          ...createValues(),
          ...(stored.values && typeof stored.values === "object" ? stored.values : {}),
        });
      }
    } catch {
      // Ignore invalid saved drafts.
    } finally {
      setDraftLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!draftLoaded || typeof window === "undefined") return;
    window.localStorage.setItem(
      DRAFT_STORAGE_KEY,
      JSON.stringify({
        wheelChangeType,
        lineType,
        date,
        values,
      })
    );
  }, [date, draftLoaded, lineType, values, wheelChangeType]);

  const clearFieldError = (field) => {
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const clearValueError = (rowKey, column) => {
    setErrors((current) => {
      const rowErrors = current.values?.[rowKey];
      if (!rowErrors?.[column]) return current;

      const next = { ...current };
      const nextValues = { ...(next.values || {}) };
      const nextRow = { ...nextValues[rowKey] };
      delete nextRow[column];

      if (Object.keys(nextRow).length) nextValues[rowKey] = nextRow;
      else delete nextValues[rowKey];

      if (Object.keys(nextValues).length) next.values = nextValues;
      else delete next.values;

      return next;
    });
  };

  const handleValueChange = (rowKey, column) => (event) => {
    const nextValue = event.target.value;
    setValues((current) => ({
      ...current,
      [rowKey]: {
        ...(current[rowKey] || { existing: "", proposed: "" }),
        [column]: nextValue,
      },
    }));
    clearValueError(rowKey, column);
  };

  const handleNumericValueChange = (rowKey, column) => (event) => {
    const nextValue = sanitizeNumericInput(event.target.value, { precision: 10, scale: 3 });
    setValues((current) => ({
      ...current,
      [rowKey]: {
        ...(current[rowKey] || { existing: "", proposed: "" }),
        [column]: nextValue,
      },
    }));
    clearValueError(rowKey, column);
  };

  const clear = () => {
    setWheelChangeType("");
    setLineType("");
    setDate(getTodayDate());
    setValues(createValues());
    setErrors({});
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(DRAFT_STORAGE_KEY);
    }
  };

  const validate = () => {
    const nextErrors = {};
    if (!selectedTypeName) nextErrors.selectedTypeName = true;
    if (!lineType.trim()) nextErrors.lineType = true;
    if (!wheelChangeType.trim()) nextErrors.wheelChangeType = true;
    if (!date) nextErrors.date = true;

    const valueErrors = {};
    activeRows.forEach((row) => {
      const rowValues = values[row.key] || {};
      const rowErrors = {};
      if (hasTextValue(rowValues.existing) && parseNumericValue(rowValues.existing) === null) {
        rowErrors.existing = true;
      }
      if (hasTextValue(rowValues.proposed) && parseNumericValue(rowValues.proposed) === null) {
        rowErrors.proposed = true;
      }
      if (Object.keys(rowErrors).length > 0) valueErrors[row.key] = rowErrors;
    });

    if (Object.keys(valueErrors).length > 0) nextErrors.values = valueErrors;
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const getPayload = () => {
    const payload = {
      entry_id: entryId,
      type: selectedTypeName,
      line_type: lineType,
      wheel_change_type: WHEEL_CHANGE_API_TYPES[wheelChangeType] || wheelChangeType,
      wheel_change_type_label: wheelChangeType,
      date: date || getTodayDate(),
      rows: {},
    };

    activeRows.forEach((row) => {
      payload.rows[row.key] = {
        label: row.label,
        existing: getTextValue(values[row.key]?.existing),
        proposed: getTextValue(values[row.key]?.proposed),
      };
    });

    return payload;
  };

  const getPreviewData = () => [
    { label: "Checking Type", value: selectedTypeName || "-" },
    { label: "Line Type", value: lineType || "-" },
    { label: "Wheel Change Type", value: wheelChangeType || "-" },
    { label: "Entry ID", value: entryId || "#DWC-001" },
    { label: "Date", value: date || "-" },
    ...activeRows.flatMap((row) => [
      { label: `${row.label} - Existing`, value: values[row.key]?.existing || "-" },
      { label: `${row.label} - Proposed`, value: values[row.key]?.proposed || "-" },
    ]),
  ];

  useImperativeHandle(ref, () => ({
    clear,
    validate,
    getPayload,
    getPreviewData,
  }));

  const renderControl = (row, column) => {
    const value = values[row.key]?.[column] || "";
    const className = `${styles.input} ${row.darkInput ? styles.darkInput : ""} ${
      errors.values?.[row.key]?.[column] ? styles.errorInput : ""
    }`;

    if (row.inputType === "select") {
      return (
        <select className={className} value={value} onChange={handleValueChange(row.key, column)}>
          <option value="">Select</option>
        </select>
      );
    }

    return (
      <input
        type="number"
        inputMode="decimal"
        step="any"
        className={className}
        value={value}
        onChange={handleNumericValueChange(row.key, column)}
      />
    );
  };

  return (
    <>
      <div className={styles.titleRow}>
        <InspectionEntryIcon />
        <h3 className={styles.sectionTitle}>Inspection Data Entry</h3>
        <InputScreenUploadButton className="ml-auto" />
      </div>

      <div className={styles.form}>
        <div className={styles.row}>
          <div className={styles.field}>
            <label>Type</label>
            <select
              className={`${styles.topInput} ${errors.selectedTypeName ? styles.errorInput : ""}`}
              value={selectedTypeName}
              onChange={(event) => onTypeChange?.(event.target.value)}
            >
              <option value="">Select checking type</option>
              {typeOptions.map((item) => (
                <option key={item.id} value={item.name}>
                  {item.displayName ?? item.name}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label>Line Type</label>
            <select
              className={`${styles.topInput} ${errors.lineType ? styles.errorInput : ""}`}
              value={lineType}
              onChange={(event) => {
                setLineType(event.target.value);
                clearFieldError("lineType");
              }}
            >
              <option value="">Select line type</option>
              {LINE_TYPES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label>Wheel Change Type</label>
            <select
              className={`${styles.topInput} ${errors.wheelChangeType ? styles.errorInput : ""}`}
              value={wheelChangeType}
              onChange={(event) => {
                setWheelChangeType(event.target.value);
                clearFieldError("wheelChangeType");
              }}
            >
              <option value="">Select wheel change type</option>
              {WHEEL_CHANGE_TYPES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.field}>
            <label>Entry ID</label>
            <input type="text" className={styles.topInput} value={entryId || "#DWC-001"} readOnly disabled />
          </div>

          <div className={styles.field}>
            <label>Date</label>
            <input
              type="date"
              className={`${styles.topInput} ${errors.date ? styles.errorInput : ""}`}
              value={date}
              onChange={(event) => {
                setDate(event.target.value);
                clearFieldError("date");
              }}
            />
          </div>

          <div className={styles.field} aria-hidden="true" />
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>PARAMETER</th>
                <th>EXISTING</th>
                <th>PROPOSED</th>
              </tr>
            </thead>
            <tbody>
              {activeRows.map((row) => (
                <tr key={row.key}>
                  <td className={styles.parameter}>{row.label}</td>
                  <td>{renderControl(row, "existing")}</td>
                  <td>{renderControl(row, "proposed")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
});

export default DrawFrameWheelChange;
