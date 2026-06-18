import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import InputScreenUploadButton from "@/components/InputScreenUploadButton";
import SearchableSelect from "@/components/SearchableSelect";
import { fetchSimplexUqcMasterDropdown } from "@/apis/simplex";
import { fetchDrawFrameWheelChangeEntries } from "@/apis/drawFrameWheelChange";
import { sanitizeNumericInput } from "@/utils/inputValidation";
import styles from "@/styles/drawFrameWheelChange.module.css";

const LINE_TYPES = ["Breaker", "Finisher"];
const WHEEL_CHANGE_TYPES = [
  "Type 1 (SB20)",
  "Type 2 (TD7)",
  "Type 3 (TD9)",
  "Type 1 (LRSB)",
  "Type 2 (D40)",
  "Type 3 (D50/D55)",
  "Type 4 (LDF3S)",
];
const WHEEL_CHANGE_TYPES_BY_LINE = {
  Breaker: ["Type 1 (SB20)", "Type 2 (TD7)", "Type 3 (TD9)"],
  Finisher: ["Type 1 (LRSB)", "Type 2 (D40)", "Type 3 (D50/D55)", "Type 4 (LDF3S)"],
};
const WHEEL_CHANGE_API_TYPES = {
  "Type 1 (SB20)": "type1",
  "Type 2 (TD7)": "type2",
  "Type 3 (TD9)": "type3",
  "Type 1 (LRSB)": "finisher_type1_lrsb",
  "Type 2 (D40)": "type2_d40",
  "Type 3 (D50/D55)": "type3_d50_d55",
  "Type 4 (LDF3S)": "type4_ldf3s",
};
const DRAFT_STORAGE_KEY = "draw_frame_wheel_change_last_values";

const TYPE_1_ROWS = [
  { key: "milling", label: "Mixing", inputType: "select" },
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
  { key: "mixing", label: "Mixing", inputType: "select" },
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

const FINISHER_TYPE_1_LRSB_ROWS = [
  { key: "lrsbMixing", label: "Mixing", inputType: "select" },
  { key: "lrsbBlendPercent", label: "Blend %" },
  { key: "lrsbDelHank", label: "Del-Hank" },
  { key: "lrsbFeedHank", label: "Feed Hank" },
  { key: "lrsbNoOfEnds", label: "No. of Ends" },
  { key: "lrsbSpeed", label: "Speed" },
  { key: "lrsbTotalDraft", label: "Total Draft", darkInput: true },
  { key: "lrsbTotalDraftConstant", label: "Total Draft Constant", darkInput: true },
  { key: "lrsbNw1", label: "NW1", inputType: "select" },
  { key: "lrsbNw2", label: "NW2", inputType: "select" },
  { key: "lrsbBreakDraft", label: "Break Draft", darkInput: true },
  { key: "lrsbBackRollerPulley", label: "Back Roller Pulley Dia (W4)", inputType: "select" },
  { key: "lrsbMiddleRollerPulley", label: "Middle Roller Pulley (VV)", inputType: "select" },
  { key: "lrsbCreelTensionDraft", label: "Creel Tension (W1) /Creel Draft", inputType: "select" },
  { key: "lrsbWebTensionDraft", label: "Web Tension Wheel (W3) / Web Tension Draft", inputType: "select" },
  { key: "lrsbBottomRollerFront", label: "Bottom Roller Setting Front Zone / Gauge in MM", inputType: "select" },
  { key: "lrsbBottomRollerBack", label: "Bottom Roller Setting Back Zone / Gauge in MM", inputType: "select" },
  { key: "lrsbScanningRoller", label: "Scanning Roller in mm", inputType: "select" },
  { key: "lrsbScanningRollerLower", label: "Scanning Roller Load (kg)", inputType: "select" },
  { key: "lrsbSilverFunnel", label: "Silver Funnel", inputType: "select" },
  { key: "lrsbWebGuideTube", label: "Web Guide Tube Dia", inputType: "select" },
  { key: "lrsbSliverWireSize", label: "Insert Bore Dia", inputType: "select" },
  { key: "lrsbTrumpet", label: "Trumpet", inputType: "select" },
];

const TYPE_2_D40_ROWS = [
  { key: "d40Mixing", label: "Mixing", inputType: "select" },
  { key: "d40BlendPercent", label: "Blend %" },
  { key: "d40DelHank", label: "Del-Hank" },
  { key: "d40FeedHank", label: "Feed Hank" },
  { key: "d40NoOfEnds", label: "No. of Ends" },
  { key: "d40Speed", label: "Speed" },
  { key: "d40TotalDraft", label: "Total Draft", darkInput: true },
  { key: "d40TotalDraftConstant", label: "Total Draft Constant", darkInput: true },
  { key: "d40Nw1", label: "NW1", inputType: "select" },
  { key: "d40Nw2", label: "NW2", inputType: "select" },
  { key: "d40BreakDraft", label: "Break Draft Wheel (W4) / Break Draft (VV)", inputType: "select" },
  { key: "d40CreelTensionDraft", label: "Creel Tension (W1) / Creel Draft", inputType: "select" },
  { key: "d40WebTensionDraft", label: "Web Tension Wheel (W3) / Web Tension Draft", inputType: "select" },
  { key: "d40WebTensionPulley", label: "Feed Tension wheel (W8) / Feed Tension Draft", inputType: "select" },
  { key: "d40BottomRollerFront", label: "Bottom Roller Setting Front Zone", inputType: "select" },
  { key: "d40BottomRollerBack", label: "Bottom Roller Setting Back Zone", inputType: "select" },
  { key: "d40ScanningRoller", label: "Scanning Roller in mm", inputType: "select" },
  { key: "d40Trumpet", label: "Trumpet", inputType: "select" },
];

const TYPE_3_D50_D55_ROWS = [
  { key: "d50Mixing", label: "Mixing", inputType: "select" },
  { key: "d50BlendPercent", label: "Blend %" },
  { key: "d50DelHank", label: "Del-Hank" },
  { key: "d50FeedHank", label: "Feed Hank" },
  { key: "d50NoOfEnds", label: "No. of Ends" },
  { key: "d50Speed", label: "Speed" },
  { key: "d50TotalDraft", label: "Total Draft", darkInput: true },
  { key: "d50BreakDraft", label: "Break Draft Wheel (W4) / Break Draft", inputType: "select" },
  { key: "d50CreelTensionDraft", label: "Creel Tension (W1) / Creel Draft", inputType: "select" },
  { key: "d50WebTensionDraft", label: "Web Tension Wheel (W3) / Web Tension Draft", inputType: "select" },
  { key: "d50FeedTensionDraft", label: "Feed Tension Wheel (W8) / Feed Tension Draft", inputType: "select" },
  { key: "d50BottomRollerFront", label: "Bottom Roller Setting Front Zone", inputType: "select" },
  { key: "d50BottomRollerBack", label: "Bottom Roller Setting Back Zone", inputType: "select" },
  { key: "d50ScanningRoller", label: "Scanning Roller in mm", inputType: "select" },
  { key: "d50Trumpet", label: "Trumpet", inputType: "select" },
];

const TYPE_4_LDF3S_ROWS = [
  { key: "ldf3sMixing", label: "Mixing", inputType: "select" },
  { key: "ldf3sBlendPercent", label: "Blend %" },
  { key: "ldf3sDelHank", label: "Del-Hank" },
  { key: "ldf3sFeedHank", label: "Feed Hank" },
  { key: "ldf3sNoOfEnds", label: "No. of Ends" },
  { key: "ldf3sSpeed", label: "Speed" },
  { key: "ldf3sTotalDraft", label: "Total Draft", darkInput: true },
  { key: "ldf3sBreakDraft", label: "Break Draft Wheel / Break Draft", inputType: "select" },
  { key: "ldf3sCreelTensionDraft", label: "Creel Tension (W1) / Creel Draft", inputType: "select" },
  { key: "ldf3sWebTensionDraft", label: "Web Tension Wheel (W3) / Web Tension Draft", inputType: "select" },
  { key: "ldf3sFeedTensionDraft", label: "Feed Tension Wheel (W8) / Feed Tension Draft", inputType: "select" },
  { key: "ldf3sBottomRollerFront", label: "Bottom Roller Setting Front Zone / Gauge in MM", inputType: "select" },
  { key: "ldf3sBottomRollerBack", label: "Bottom Roller Setting Back Zone / Gauge in MM", inputType: "select" },
  { key: "ldf3sScanningRoller", label: "Scanning Roller in mm", inputType: "select" },
  { key: "ldf3sTrumpet", label: "Trumpet", inputType: "select" },
];

const ROWS_BY_TYPE = {
  "Type 1 (SB20)": TYPE_1_ROWS,
  "Type 2 (TD7)": TD7_ROWS,
  "Type 3 (TD9)": TD7_ROWS,
  "Type 1 (LRSB)": FINISHER_TYPE_1_LRSB_ROWS,
  "Type 2 (D40)": TYPE_2_D40_ROWS,
  "Type 3 (D50/D55)": TYPE_3_D50_D55_ROWS,
  "Type 4 (LDF3S)": TYPE_4_LDF3S_ROWS,
};

const ALL_ROWS = [
  ...TYPE_1_ROWS,
  ...TD7_ROWS,
  ...FINISHER_TYPE_1_LRSB_ROWS,
  ...TYPE_2_D40_ROWS,
  ...TYPE_3_D50_D55_ROWS,
  ...TYPE_4_LDF3S_ROWS,
];

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

const normalizeApiWheelChangeType = (value) => {
  const text = String(value || "").trim().toLowerCase().replace(/\s+/g, "");
  if (text === "type1") return "Type 1 (SB20)";
  if (text === "type2") return "Type 2 (TD7)";
  if (text === "type3") return "Type 3 (TD9)";
  if (text === "finisher_type1_lrsb" || text === "finishertype1(lrsb)" || text === "finishertype1lrsb") {
    return "Type 1 (LRSB)";
  }
  if (text === "type2_d40" || text === "type2(d40)" || text === "type2d40") return "Type 2 (D40)";
  if (text === "type3_d50_d55" || text === "type3(d50/d55)" || text === "type3d50d55") return "Type 3 (D50/D55)";
  if (text === "type4_ldf3s" || text === "type4(ldf3s)" || text === "type4ldf3s") return "Type 4 (LDF3S)";
  return "";
};

const normalizeParameters = (parameters) => {
  if (!parameters) return {};
  if (Array.isArray(parameters)) {
    return parameters.reduce((acc, item) => {
      if (!item || typeof item !== "object") return acc;
      if (item.key) {
        acc[item.key] = item;
        return acc;
      }
      Object.assign(acc, normalizeParameters(item));
      return acc;
    }, {});
  }
  const source = parameters;
  if (!source || typeof source !== "object") return {};
  if (source.rows && typeof source.rows === "object" && !Array.isArray(source.rows)) {
    return source.rows;
  }
  return source;
};

const buildValuesFromParameters = (parameters) => {
  const nextValues = createValues();
  const rows = normalizeParameters(parameters);

  Object.entries(rows).forEach(([key, rowValue]) => {
    if (!nextValues[key]) return;
    if (rowValue && typeof rowValue === "object" && !Array.isArray(rowValue)) {
      nextValues[key] = {
        existing: String(rowValue.proposed ?? rowValue.existing ?? ""),
        proposed: "",
      };
      return;
    }
    nextValues[key] = {
      existing: String(rowValue ?? ""),
      proposed: "",
    };
  });

  return nextValues;
};

const getApiWheelChangeType = (wheelChangeType = "") =>
  WHEEL_CHANGE_API_TYPES[wheelChangeType] || wheelChangeType;

const getLineTypeForWheelChangeType = (wheelChangeType = "") =>
  Object.entries(WHEEL_CHANGE_TYPES_BY_LINE).find(([, types]) => types.includes(wheelChangeType))?.[0] || "";

const pickSavedRows = (entry) => {
  if (Array.isArray(entry?.parameters) && entry.parameters.length) return entry.parameters;
  if (entry?.parameters && !Array.isArray(entry.parameters)) return entry.parameters;
  if (entry?.rows) return entry.rows;
  return [];
};

const extractLatestEntry = (payload) => {
  const rows = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.rows)
      ? payload.rows
      : Array.isArray(payload)
        ? payload
        : [];
  return rows[0] || null;
};

const toInputDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value).slice(0, 10) : date.toISOString().split("T")[0];
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
  const [mixingOptions, setMixingOptions] = useState([]);
  const lastLoadedMixingRef = useRef("");

  const activeRows = useMemo(
    () => (wheelChangeType ? ROWS_BY_TYPE[wheelChangeType] || [] : []),
    [wheelChangeType]
  );
  const selectedMixingRow = activeRows.find(
    (row) => row.key.toLowerCase().includes("mixing") || row.label.toLowerCase().includes("mixing")
  );
  const selectedMixing = String(values[selectedMixingRow?.key]?.existing || values[selectedMixingRow?.key]?.proposed || "").trim();
  const availableWheelChangeTypes = useMemo(
    () => WHEEL_CHANGE_TYPES_BY_LINE[lineType] || [],
    [lineType]
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
    let active = true;

    const loadDropdowns = async () => {
      try {
        const dropdown = await fetchSimplexUqcMasterDropdown({ department: "SIMPLEX" });
        if (!active) return;
        setMixingOptions(Array.isArray(dropdown?.varietyNames) ? dropdown.varietyNames : []);
      } catch {
        if (!active) return;
        setMixingOptions([]);
      }
    };

    loadDropdowns();

    return () => {
      active = false;
    };
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

  const loadLatestSaved = async (requestedWheelChangeType = wheelChangeType, mixingValue = "") => {
    const apiWheelChangeType = getApiWheelChangeType(requestedWheelChangeType);
    const params = {
      page: 1,
      limit: 1,
      wheelChangeType: apiWheelChangeType,
    };
    const trimmedMixing = String(mixingValue || "").trim();
    if (trimmedMixing) {
      params.variety = trimmedMixing;
      params.variety_name = trimmedMixing;
      params.mixing = trimmedMixing;
    }
    const payload = await fetchDrawFrameWheelChangeEntries(params);
    const latest = extractLatestEntry(payload);
    if (!latest) return null;

    const savedWheelChangeType =
      WHEEL_CHANGE_TYPES.includes(latest.wheel_change_type_label)
        ? latest.wheel_change_type_label
        : normalizeApiWheelChangeType(latest.wheel_change_type);
    const savedLineType =
      String(latest.line_type || "") ||
      getLineTypeForWheelChangeType(savedWheelChangeType || requestedWheelChangeType);

    setWheelChangeType(savedWheelChangeType || requestedWheelChangeType);
    setLineType(savedLineType);
    setDate(toInputDate(latest.entry_date || latest.date || latest.created_at) || getTodayDate());
    setValues(buildValuesFromParameters(pickSavedRows(latest)));
    setErrors({});
    return latest;
  };

  useEffect(() => {
    if (!draftLoaded || !wheelChangeType || !selectedMixing) {
      lastLoadedMixingRef.current = "";
      return;
    }

    const selectionKey = `${wheelChangeType}::${selectedMixing}`;
    if (lastLoadedMixingRef.current === selectionKey) return;

    let cancelled = false;
    loadLatestSaved(wheelChangeType, selectedMixing)
      .then((latest) => {
        if (cancelled || !latest) return;
        lastLoadedMixingRef.current = selectionKey;
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [draftLoaded, selectedMixing, wheelChangeType]);

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
    lastLoadedMixingRef.current = "";
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
      wheel_change_type: getApiWheelChangeType(wheelChangeType),
      wheel_change_type_label: wheelChangeType,
      entry_date: date || getTodayDate(),
      date: date || getTodayDate(),
      parameters: [],
      rows: {},
    };

    activeRows.forEach((row) => {
      const parameter = {
        key: row.key,
        label: row.label,
        existing: getTextValue(values[row.key]?.existing),
        proposed: getTextValue(values[row.key]?.proposed),
      };
      payload.rows[row.key] = parameter;
      payload.parameters.push(parameter);
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
    loadLatestSaved,
  }));

  const renderControl = (row, column) => {
    const value = values[row.key]?.[column] || "";
    const className = `${styles.input} ${row.darkInput ? styles.darkInput : ""} ${
      errors.values?.[row.key]?.[column] ? styles.errorInput : ""
    }`;

    if (row.inputType === "select" && (row.key.toLowerCase().includes("mixing") || row.label.toLowerCase().includes("mixing"))) {
      return (
        <SearchableSelect
          className={className}
          value={value}
          onChange={handleValueChange(row.key, column)}
          options={mixingOptions}
          placeholder="Select"
          ariaLabel={row.label}
        />
      );
    }

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
                const nextLineType = event.target.value;
                setLineType(nextLineType);
                if (!WHEEL_CHANGE_TYPES_BY_LINE[nextLineType]?.includes(wheelChangeType)) {
                  setWheelChangeType("");
                }
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
              disabled={!lineType}
              onChange={(event) => {
                const nextWheelChangeType = event.target.value;
                setWheelChangeType(nextWheelChangeType);
                clearFieldError("wheelChangeType");
              }}
            >
              <option value="">{lineType ? "Select wheel change type" : "Select line type first"}</option>
              {availableWheelChangeTypes.map((item) => (
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
