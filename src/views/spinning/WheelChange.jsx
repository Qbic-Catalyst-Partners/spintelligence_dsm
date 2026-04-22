import { forwardRef, useImperativeHandle, useState } from "react";
import { sanitizeIntegerInput } from "@/utils/inputValidation";
import styles from "@/styles/spinningWheelChange.module.css";

const WHEEL_CHANGE_TYPES = ["Type 1", "Type 2", "Type 3"];
const WHEEL_CHANGE_API_TYPES = {
  "Type 1": "type1",
  "Type 2": "type2",
  "Type 3": "type3",
};

const TYPE_1_PARAMETER_ROWS = [
  { key: "countForm", label: "Count From", inputType: "select" },
  { key: "lycraType", label: "Lycra Type" },
  { key: "lycraDraft", label: "Lycra Draft" },
  { key: "tmDisc", label: "Slub Code" },
  { key: "range", label: "Ramp" },
  { key: "offsetDia", label: "Offset On/Off" },
  { key: "gapsCourseCondition", label: "Cop or Cone Condition" },
  { key: "diameterDoffSpeed", label: "Product Qty (Kgs)" },
  { key: "rovingHank", label: "Raving Hank" },
  { key: "rh", label: "BDW", inputType: "select" },
  { key: "bd", label: "BD", darkInput: true },
  { key: "dca", label: "DCA", inputType: "select" },
  { key: "dcb", label: "DCB", darkInput: true },
  { key: "dpc", label: "DFF", inputType: "select" },
  { key: "dc", label: "DC", inputType: "select" },
  { key: "tdv", label: "TCW", inputType: "select" },
  { key: "tm", label: "TW", placeholder: "Select Value" },
  { key: "tciTm", label: "TPI/TM", darkInput: true },
  { key: "travellerDia", label: "Travellers No." },
  { key: "spacer", label: "Spacer" },
  { key: "capWeight", label: "Cop Weight (Grms)" },
  { key: "spindleMotorRpm", label: "Speed Initial (RPM)" },
  { key: "empaleeColour", label: "Speed Max (RPM)" },
  { key: "traveller", label: "Empties Colour" },
  { key: "totalDraft", label: "Total Draft", darkInput: true },
];

const TYPE_2_PARAMETER_ROWS = [
  { key: "countForm", label: "Count From", inputType: "select" },
  { key: "lycraType", label: "Lycra Type" },
  { key: "lycraDraft", label: "Lycra Draft" },
  { key: "slubCode", label: "Slub Code" },
  { key: "ramp", label: "Ramp" },
  { key: "offsetOnOff", label: "Offset On/Off" },
  { key: "copOrConeCondition", label: "Cop or Cone Condition" },
  { key: "productQty", label: "Product Qty (Kgs)" },
  { key: "backplate", label: "Raving Hank" },
  { key: "battAirflow", label: "Back Roll Wheel" },
  { key: "obliquePin", label: "Change Pinion" },
  { key: "bdv", label: "BDW", inputType: "select" },
  { key: "bd", label: "BD", darkInput: true },
  { key: "t", label: "B", inputType: "select" },
  { key: "b", label: "A", darkInput: true },
  { key: "f", label: "D", inputType: "select" },
  { key: "c", label: "C", darkInput: true },
  { key: "tpiTm", label: "TPI/TM", darkInput: true },
  { key: "windingHp", label: "Winding - E/F" },
  { key: "rollerMoved", label: "Ratchet Wheel" },
  { key: "traveller", label: "Travellers No." },
  { key: "taper", label: "Spacer" },
  { key: "spindleInitialRpm", label: "Speed Initial (RPM)" },
  { key: "spindleMtrRpm", label: "Speed Max (RPM)" },
  { key: "emptiesColour", label: "Empties Colour" },
  { key: "totalDraft", label: "Total Draft", darkInput: true },
];

const TYPE_3_PARAMETER_ROWS = [
  { key: "countForm", label: "Count From", inputType: "select" },
  { key: "lycraType", label: "Lycra Type" },
  { key: "lycraDraft", label: "Lycra Draft" },
  { key: "slubCode", label: "Slub Code" },
  { key: "ramp", label: "Ramp" },
  { key: "offsetOnOff", label: "Offset On/Off" },
  { key: "copOrConeCondition", label: "Cop or Cone Condition" },
  { key: "productQty", label: "Product Qty (Kgs)" },
  { key: "rovingHank", label: "Raving Hank" },
  { key: "bdv", label: "BDW" },
  { key: "bd", label: "BD", darkInput: true },
  { key: "tpiTm", label: "TPI/TM", darkInput: true },
  { key: "travellersNo", label: "Travellers No." },
  { key: "spacer", label: "Spacer" },
  { key: "copWeight", label: "Cop Weight" },
  { key: "speedInitial", label: "Speed Initial (RPM)" },
  { key: "speedMax", label: "Speed Max (RPM)" },
  { key: "emptiesColour", label: "Empties Colour" },
];

const WHEEL_CHANGE_PARAMETER_ROWS_BY_TYPE = {
  "Type 1": TYPE_1_PARAMETER_ROWS,
  "Type 2": TYPE_2_PARAMETER_ROWS,
  "Type 3": TYPE_3_PARAMETER_ROWS,
};

const WHEEL_CHANGE_FIELD_MAP = {
  "Type 1": {
    referenceField: "fm_no",
    rows: {
      countForm: "count_from",
      lycraType: "lycra_type",
      lycraDraft: "lycra_draft",
      tmDisc: "slub_code",
      range: "range",
      offsetDia: "offset",
      gapsCourseCondition: "core_condition",
      diameterDoffSpeed: "production",
      rovingHank: "roving_hank",
      rh: "eow",
      bd: "epi",
      dca: "dca",
      dcb: "dcb",
      dpc: "dfc",
      dc: "dc",
      tdv: "tcw",
      tm: "tw",
      tciTm: "tpm",
      travellerDia: "travelers_no",
      spacer: "spacer",
      capWeight: "cop_weight",
      spindleMotorRpm: "speed_front",
      empaleeColour: "speed_rpm",
      traveller: "empires_colour",
      totalDraft: "total_draft",
    },
  },
  "Type 2": {
    referenceField: "fm_no",
    rows: {
      countForm: "count_from",
      lycraType: "lycra_type",
      lycraDraft: "lycra_draft",
      slubCode: "slub_code",
      ramp: "ramp",
      offsetOnOff: "offset",
      copOrConeCondition: "core_condition",
      productQty: "production",
      backplate: "roving_hank",
      battAirflow: "back_roll_wheel",
      obliquePin: "change_pinion",
      bdv: "edw",
      bd: "ed",
      t: "b",
      b: "a",
      f: "d",
      c: "c",
      tpiTm: "tpi_tpm",
      windingHp: "winding_kf",
      rollerMoved: "ratchet_wheel",
      traveller: "travelers_no",
      taper: "spacer",
      spindleInitialRpm: "speed_spindle",
      spindleMtrRpm: "speed_main",
      emptiesColour: "empires_colour",
      totalDraft: "total_draft",
    },
  },
  "Type 3": {
    referenceField: "fr_no",
    rows: {
      countForm: "count_from",
      lycraType: "lycra_type",
      lycraDraft: "lycra_draft",
      slubCode: "slub_code",
      ramp: "ramp",
      offsetOnOff: "offset_on_off",
      copOrConeCondition: "cop_core_condition",
      productQty: "product_qty",
      rovingHank: "roving_hank",
      bdv: "edw",
      bd: "bd",
      tpiTm: "tpi_tm",
      travellersNo: "travelers_no",
      spacer: "spacer",
      copWeight: "cop_weight",
      speedInitial: "speed_initial",
      speedMax: "speed_max",
      emptiesColour: "empties_colour",
    },
  },
};

const WHEEL_CHANGE_NUMERIC_FIELDS = {
  "Type 1": new Set([
    "lycra_draft",
    "production",
    "roving_hank",
    "epi",
    "dcb",
    "tpm",
    "cop_weight",
    "speed_front",
    "speed_rpm",
    "total_draft",
  ]),
  "Type 2": new Set([
    "lycra_draft",
    "production",
    "roving_hank",
    "ed",
    "a",
    "c",
    "tpi_tpm",
    "winding_kf",
    "speed_spindle",
    "speed_main",
    "total_draft",
  ]),
  "Type 3": new Set([
    "lycra_draft",
    "product_qty",
    "roving_hank",
    "bd",
    "tpi_tm",
    "cop_weight",
    "speed_initial",
    "speed_max",
  ]),
};

const ALL_WHEEL_CHANGE_PARAMETER_ROWS = Object.values(WHEEL_CHANGE_PARAMETER_ROWS_BY_TYPE).flat();

const getTodayDate = () => new Date().toISOString().split("T")[0];

const createWheelChangeValues = () =>
  ALL_WHEEL_CHANGE_PARAMETER_ROWS.reduce(
    (values, row) => ({
      ...values,
      [row.key]: {
        existing: "",
        proposed: "",
      },
    }),
    {}
  );

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

const WheelChange = forwardRef(function WheelChange(
  {
    selectedTypeName = "Wheel Change",
    typeOptions = [],
    onTypeChange,
  },
  ref
) {
  const [wheelChangeType, setWheelChangeType] = useState("");
  const [testNo, setTestNo] = useState("");
  const [rfNo, setRfNo] = useState("");
  const [date, setDate] = useState(getTodayDate);
  const [values, setValues] = useState(createWheelChangeValues);
  const [errors, setErrors] = useState({});
  const activeRows = WHEEL_CHANGE_PARAMETER_ROWS_BY_TYPE[wheelChangeType] || TYPE_1_PARAMETER_ROWS;

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

  const handleIntegerChange = (setter, field) => (event) => {
    setter(sanitizeIntegerInput(event.target.value));
    clearFieldError(field);
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

  const clear = () => {
    setWheelChangeType("");
    setTestNo("");
    setRfNo("");
    setDate(getTodayDate());
    setValues(createWheelChangeValues());
    setErrors({});
  };

  const validate = () => {
    const nextErrors = {};

    if (!selectedTypeName) nextErrors.selectedTypeName = true;
    if (!wheelChangeType.trim()) nextErrors.wheelChangeType = true;
    if (!testNo.trim()) nextErrors.testNo = true;
    if (!date) nextErrors.date = true;
    if (!rfNo.trim()) nextErrors.rfNo = true;

    const valueErrors = {};
    const typeFieldConfig = WHEEL_CHANGE_FIELD_MAP[wheelChangeType];
    const numericFields = WHEEL_CHANGE_NUMERIC_FIELDS[wheelChangeType] || new Set();

    activeRows.forEach((row) => {
      const rowValues = values[row.key] || {};
      const rowErrors = {};
      if (!hasTextValue(rowValues.existing)) rowErrors.existing = true;
      if (!hasTextValue(rowValues.proposed)) rowErrors.proposed = true;

      const fieldBase = typeFieldConfig?.rows?.[row.key];
      if (fieldBase && numericFields.has(fieldBase)) {
        if (hasTextValue(rowValues.existing) && parseNumericValue(rowValues.existing) === null) {
          rowErrors.existing = true;
        }
        if (hasTextValue(rowValues.proposed) && parseNumericValue(rowValues.proposed) === null) {
          rowErrors.proposed = true;
        }
      }

      if (Object.keys(rowErrors).length > 0) valueErrors[row.key] = rowErrors;
    });

    if (Object.keys(valueErrors).length > 0) nextErrors.values = valueErrors;

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const getPayload = () => {
    const typeFieldConfig = WHEEL_CHANGE_FIELD_MAP[wheelChangeType];
    const typeCode = WHEEL_CHANGE_API_TYPES[wheelChangeType];
    const numericFields = WHEEL_CHANGE_NUMERIC_FIELDS[wheelChangeType] || new Set();

    if (!typeFieldConfig || !typeCode) {
      return {
        type: selectedTypeName,
        wheel_change_type: "",
        date: date || getTodayDate(),
        test_no: getTextValue(testNo),
      };
    }

    const payload = {
      type: selectedTypeName,
      wheel_change_type: typeCode,
      date: date || getTodayDate(),
      test_no: getTextValue(testNo),
      [typeFieldConfig.referenceField]: getTextValue(rfNo),
    };

    activeRows.forEach((row) => {
      const fieldBase = typeFieldConfig.rows[row.key];
      if (!fieldBase) return;
      const existingValue = getTextValue(values[row.key]?.existing);
      const proposedValue = getTextValue(values[row.key]?.proposed);

      if (numericFields.has(fieldBase)) {
        payload[`${fieldBase}_existing`] = parseNumericValue(existingValue);
        payload[`${fieldBase}_proposed`] = parseNumericValue(proposedValue);
        return;
      }

      payload[`${fieldBase}_existing`] = existingValue;
      payload[`${fieldBase}_proposed`] = proposedValue;
    });

    return payload;
  };

  const getPreviewData = () => [
    { label: "Checking Type", value: selectedTypeName || "-" },
    { label: "Wheel Change Type", value: wheelChangeType || "-" },
    { label: "Test No.", value: testNo || "-" },
    { label: "Date", value: date || getTodayDate() },
    { label: "RF No.", value: rfNo || "-" },
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
          <option value="Option 1">Option 1</option>
          <option value="Option 2">Option 2</option>
          <option value="Option 3">Option 3</option>
        </select>
      );
    }

    return (
      <input
        type="text"
        placeholder={row.placeholder || ""}
        className={className}
        value={value}
        onChange={handleValueChange(row.key, column)}
      />
    );
  };

  return (
    <>
      <div className={styles.titleRow}>
        <InspectionEntryIcon />
        <h3 className={styles.sectionTitle}>Inspection Data Entry</h3>
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

          <div className={styles.field}>
            <label>Test No.</label>
            <input
              type="text"
              inputMode="numeric"
              placeholder="Enter test number"
              className={`${styles.topInput} ${errors.testNo ? styles.errorInput : ""}`}
              value={testNo}
              onChange={handleIntegerChange(setTestNo, "testNo")}
            />
          </div>
        </div>

        <div className={styles.row}>
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
              disabled={Boolean(selectedTypeName)}
            />
          </div>

          <div className={styles.field}>
            <label>RF No.</label>
            <input
              type="text"
              inputMode="numeric"
              placeholder="Enter RF number"
              className={`${styles.topInput} ${errors.rfNo ? styles.errorInput : ""}`}
              value={rfNo}
              onChange={handleIntegerChange(setRfNo, "rfNo")}
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

export default WheelChange;
