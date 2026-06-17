import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import SearchableSelect from "@/components/SearchableSelect";
import InputScreenUploadButton from "@/components/InputScreenUploadButton";
import { fetchSpinningMachineNumberOptions, fetchSpinningWheelChangeDropdown, fetchSpinningWheelChangeLatestRecord } from "@/apis/spinning";
import { sanitizeIntegerInput, sanitizeNumericInput } from "@/utils/inputValidation";
import styles from "@/styles/spinningWheelChange.module.css";

const WHEEL_CHANGE_TYPES = ["Type 1", "Type 2", "Type 3"];
const WHEEL_CHANGE_API_TYPES = {
  "Type 1": "type1",
  "Type 2": "type2",
  "Type 3": "type3",
};
const WHEEL_CHANGE_DRAFT_STORAGE_KEY = "spinning_wheel_change_last_values";

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
  { key: "dca", label: "DCA", inputType: "select" },
  { key: "dcb", label: "DCB", darkInput: true },
  { key: "dpc", label: "DFF", inputType: "select" },
  { key: "dc", label: "DC", inputType: "select" },
  { key: "tdv", label: "TCW", inputType: "select" },
  { key: "tm", label: "TW" },
  { key: "tpiTm", label: "TPI/TM", darkInput: true },
  { key: "travellersNo", label: "Travellers No." },
  { key: "spacer", label: "Spacer" },
  { key: "copWeight", label: "Cop Weight" },
  { key: "speedInitial", label: "Speed Initial (RPM)" },
  { key: "speedMax", label: "Speed Max (RPM)" },
  { key: "emptiesColour", label: "Empties Colour" },
  { key: "totalDraft", label: "Total Draft", darkInput: true },
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
      bdv: "bdw",
      bd: "bd",
      dca: "dca",
      dcb: "dcb",
      dpc: "dfc",
      dc: "dc",
      tdv: "tcw",
      tm: "tw",
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
    "dcb",
    "tpi_tm",
    "cop_weight",
    "speed_initial",
    "speed_max",
    "total_draft",
  ]),
};

const WHEEL_CHANGE_PAYLOAD_ALIASES = {
  "Type 3": {
    bdw: ["edw"],
    product_qty: ["prodqty"],
    speed_initial: ["speedstart"],
    speed_max: ["speedmax"],
    empties_colour: ["emptycolour"],
    total_draft: ["totaldraft"],
    dca: ["ddldca"],
    dfc: ["ddldfc"],
  },
};

const WHEEL_CHANGE_DROPDOWN_KEYS = {
  countForm: [
    "count_from",
    "count_from_options",
    "varieties",
    "variety",
    "variety_names",
    "prep_variety_names",
    "prep_variety_name",
    "prep_varieties",
    "count_names",
  ],
  rh: ["bdw", "bdw_options", "edw", "edw_options"],
  bdv: ["bdw", "bdw_options", "edw", "edw_options"],
  dca: ["dca", "dca_options"],
  dpc: ["dfc", "dfc_options", "dff", "dff_options"],
  dc: ["dc", "dc_options"],
  tdv: ["tcw", "tcw_options"],
  tm: ["tw", "tw_options"],
  t: ["b", "b_options"],
  f: ["d", "d_options"],
};

const ALL_WHEEL_CHANGE_PARAMETER_ROWS = Object.values(WHEEL_CHANGE_PARAMETER_ROWS_BY_TYPE).flat();

const getTodayDate = () => new Date().toISOString().split("T")[0];

const normalizeLabel = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/colour/g, "color")
    .replace(/[^a-z0-9]+/g, "");

const getParameterInputType = (row) => {
  const label = normalizeLabel(row.label);
  if (label === "lycratype" || label === "emptiescolor") return "text";
  if (label === "offsetonoff") return "onOff";
  if (label === "coporconecondition") return "copCone";
  return "number";
};

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
const getOptionText = (value) => {
  if (value === undefined || value === null) return "";
  if (typeof value !== "object") return String(value).trim();
  return String(
    value.value ??
      value.label ??
      value.text ??
          value.prep_variety_name ??
      value.rf_no ??
      value.rf_number ??
      value.r_f_no ??
      value.rf_name ??
      value.fm_no ??
      value.fr_no ??
      value.mc_no ??
      value.mc_name ??
      value.machine_no ??
      value.machine_name ??
      ""
  ).trim();
};
const normalizeMachineOptions = (payload) => {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.machines)
        ? payload.machines
        : Array.isArray(payload?.machineOptions)
          ? payload.machineOptions
          : Array.isArray(payload?.options)
            ? payload.options
            : Array.isArray(payload?.values)
              ? payload.values
              : Array.isArray(payload?.machine_numbers)
                ? payload.machine_numbers
                : Array.isArray(payload?.mc_nos)
                  ? payload.mc_nos
                  : [];

  const seen = new Set();

  return rows
    .map((row) => {
      const value = getOptionText(
        row?.value ??
          row?.mc_no ??
          row?.machine_no ??
          row?.machine_number ??
          row?.code ??
          row
      );
      const machineName = getOptionText(
        row?.mc_name ??
          row?.machine_name ??
          row?.name ??
          row?.label ??
          row?.text ??
          value
      );
      const deptCode = getOptionText(
        row?.dept_code ??
          row?.department_code ??
          row?.dept ??
          row?.department ??
          ""
      );
      const labelParts = [value];
      if (machineName && machineName !== value) labelParts.push(machineName);
      if (deptCode) labelParts.push(`Dept ${deptCode}`);

      return value
        ? {
            value,
            label: labelParts.join(" - "),
            machineName,
            deptCode,
          }
        : null;
    })
    .filter((option) => {
      if (!option || seen.has(option.value)) return false;
      seen.add(option.value);
      return true;
    });
};
const normalizeLookupOptions = (payload) => {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.options)
        ? payload.options
        : Array.isArray(payload?.values)
          ? payload.values
          : Array.isArray(payload?.machine_numbers)
            ? payload.machine_numbers
            : Array.isArray(payload?.rf_nos)
              ? payload.rf_nos
              : Array.isArray(payload?.rf_numbers)
                ? payload.rf_numbers
                : Array.isArray(payload?.r_f_nos)
                  ? payload.r_f_nos
                  : Array.isArray(payload?.fm_nos)
                    ? payload.fm_nos
                    : Array.isArray(payload?.fr_nos)
                      ? payload.fr_nos
                      : Array.isArray(payload?.names)
                        ? payload.names
                        : [];

  return Array.from(
    new Set(
      rows
        .map((row) =>
          getOptionText(
            row?.value ??
              row?.rf_no ??
              row?.rf_number ??
              row?.r_f_no ??
              row?.fm_no ??
              row?.fr_no ??
              row?.mc_no ??
              row?.text ??
              row
          )
        )
        .filter(Boolean)
    )
  );
};
const getFirstArray = (source, keys) => {
  if (!source || typeof source !== "object") return [];
  for (const key of keys) {
    if (Array.isArray(source[key])) return source[key];
  }
  return [];
};
const normalizeDropdownOptions = (rows) =>
  Array.from(
    new Set(
      (Array.isArray(rows) ? rows : [])
        .map((row) =>
          getOptionText(
            row?.value ??
              row?.option_value ??
              row?.code ??
              row?.name ??
              row?.variety_name ??
                row?.prep_variety_name ??
              row?.count_name ??
              row?.text ??
              row
          )
        )
        .filter(Boolean)
    )
  );
const normalizeWheelChangeRecordValue = (value) =>
  value === undefined || value === null ? "" : String(value).trim();
const buildWheelChangeValuesFromRecord = (record = {}, wheelChangeType = "") => {
  const typeConfig = WHEEL_CHANGE_FIELD_MAP[wheelChangeType];
  const rows = typeConfig?.rows || {};
  return ALL_WHEEL_CHANGE_PARAMETER_ROWS.reduce((values, row) => {
    const fieldBase = rows[row.key];
    const existingValue = fieldBase
      ? normalizeWheelChangeRecordValue(
          record?.[`${fieldBase}_existing`] ??
            record?.[`${fieldBase}_proposed`] ??
            record?.[fieldBase]
        )
      : "";

    return {
      ...values,
      [row.key]: {
        existing: existingValue,
        proposed: "",
      },
    };
  }, {});
};
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
    entryId = "#SPN-001",
    onTypeChange,
  },
  ref
) {
  const [wheelChangeType, setWheelChangeType] = useState("");
  const [machineNumber, setMachineNumber] = useState("");
  const [date, setDate] = useState(getTodayDate);
  const [values, setValues] = useState(createWheelChangeValues);
  const [errors, setErrors] = useState({});
  const [machineOptions, setMachineOptions] = useState([]);
  const [dropdownOptions, setDropdownOptions] = useState({});
  const [draftLoaded, setDraftLoaded] = useState(false);
  const lastLoadedVarietyRef = useRef("");
  const activeRows = WHEEL_CHANGE_PARAMETER_ROWS_BY_TYPE[wheelChangeType] || TYPE_1_PARAMETER_ROWS;
  const referenceLabel = "Machine Number";
  const machineLookupParams = useMemo(
    () => ({
      department: "Spinning",
    }),
    []
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = JSON.parse(window.localStorage.getItem(WHEEL_CHANGE_DRAFT_STORAGE_KEY) || "{}");
      if (stored && typeof stored === "object") {
        setWheelChangeType(typeof stored.wheelChangeType === "string" ? stored.wheelChangeType : "");
        setMachineNumber(typeof stored.machineNumber === "string" ? stored.machineNumber : "");
        setDate(typeof stored.date === "string" && stored.date ? stored.date : getTodayDate());
        setValues({
          ...createWheelChangeValues(),
          ...(stored.values && typeof stored.values === "object" ? stored.values : {}),
        });
      }
    } catch {
      // Ignore invalid stored drafts.
    } finally {
      setDraftLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!draftLoaded || typeof window === "undefined") return;
    window.localStorage.setItem(
      WHEEL_CHANGE_DRAFT_STORAGE_KEY,
      JSON.stringify({
        wheelChangeType,
        machineNumber,
        date,
        values,
      })
    );
  }, [date, draftLoaded, machineNumber, values, wheelChangeType]);

  const selectedVariety = String(values.countForm?.existing || values.countForm?.proposed || "").trim();

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

  useEffect(() => {
    let isMounted = true;

    Promise.allSettled([
      fetchSpinningMachineNumberOptions({
        screen: "wheel-change",
        ...machineLookupParams,
      }),
      fetchSpinningWheelChangeDropdown(wheelChangeType, machineLookupParams),
    ]).then(([machineResult, dropdownResult]) => {
      if (!isMounted) return;

      if (machineResult.status === "fulfilled") {
        setMachineOptions(normalizeMachineOptions(machineResult.value));
      } else {
        setMachineOptions([]);
      }

      if (dropdownResult.status === "fulfilled") {
        setDropdownOptions(dropdownResult.value || {});
      } else {
        setDropdownOptions({});
      }
    });

    return () => {
      isMounted = false;
    };
  }, [machineLookupParams, wheelChangeType]);

  useEffect(() => {
    if (!wheelChangeType || !selectedVariety) {
      lastLoadedVarietyRef.current = "";
      return;
    }

    const selectionKey = `${wheelChangeType}::${selectedVariety}`;
    if (lastLoadedVarietyRef.current === selectionKey) return;

    let cancelled = false;

    fetchSpinningWheelChangeLatestRecord(wheelChangeType, {
      variety: selectedVariety,
      variety_name: selectedVariety,
      mixing: selectedVariety,
    })
      .then((latestRecord) => {
        if (cancelled || !latestRecord) return;

        lastLoadedVarietyRef.current = selectionKey;
        setMachineNumber((current) => current || getTextValue(
          latestRecord?.[WHEEL_CHANGE_FIELD_MAP[wheelChangeType]?.referenceField] ||
            latestRecord?.machine_no ||
            latestRecord?.machine_number ||
            latestRecord?.mc_no ||
            ""
        ));
        setValues((current) => {
          const nextValues = buildWheelChangeValuesFromRecord(latestRecord, wheelChangeType);
          return {
            ...nextValues,
            countForm: {
              existing: selectedVariety,
              proposed: current.countForm?.proposed || "",
            },
          };
        });
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [selectedVariety, wheelChangeType]);

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

  const handleRadioValueChange = (rowKey, column, nextValue) => {
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
    setMachineNumber("");
    setDate(getTodayDate());
    setValues(createWheelChangeValues());
    setErrors({});
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(WHEEL_CHANGE_DRAFT_STORAGE_KEY);
    }
  };

  const validate = () => {
    const nextErrors = {};

    if (!selectedTypeName) nextErrors.selectedTypeName = true;
    if (!wheelChangeType.trim()) nextErrors.wheelChangeType = true;
    if (!date) nextErrors.date = true;
    if (!machineNumber.trim()) nextErrors.machineNumber = true;

    const valueErrors = {};
    activeRows.forEach((row) => {
      const rowValues = values[row.key] || {};
      const rowErrors = {};
      if (!hasTextValue(rowValues.existing)) rowErrors.existing = true;
      if (!hasTextValue(rowValues.proposed)) rowErrors.proposed = true;

      if (getParameterInputType(row) === "number") {
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
    const aliases = WHEEL_CHANGE_PAYLOAD_ALIASES[wheelChangeType] || {};
    const setPayloadValue = (fieldName, suffix, value) => {
      const key = suffix ? `${fieldName}_${suffix}` : fieldName;
      payload[key] = value;

      (aliases[fieldName] || []).forEach((alias) => {
        payload[suffix ? `${alias}_${suffix}` : alias] = value;
      });
    };

    if (!typeFieldConfig || !typeCode) {
      return {
        entry_id: entryId,
        type: selectedTypeName,
        wheel_change_type: "",
        date: date || getTodayDate(),
        test_no: "",
      };
    }

    const payload = {
      entry_id: entryId,
      type: selectedTypeName,
      wheel_change_type: typeCode,
      date: date || getTodayDate(),
      test_no: "",
      [typeFieldConfig.referenceField]: getTextValue(machineNumber),
      machine_no: getTextValue(machineNumber),
      machine_number: getTextValue(machineNumber),
      mc_no: getTextValue(machineNumber),
    };

    activeRows.forEach((row) => {
      const fieldBase = typeFieldConfig.rows[row.key];
      if (!fieldBase) return;
      const existingValue = getTextValue(values[row.key]?.existing);
      const proposedValue = getTextValue(values[row.key]?.proposed);

      if (numericFields.has(fieldBase)) {
        setPayloadValue(fieldBase, "existing", parseNumericValue(existingValue));
        setPayloadValue(fieldBase, "proposed", parseNumericValue(proposedValue));
        return;
      }

      setPayloadValue(fieldBase, "existing", existingValue);
      setPayloadValue(fieldBase, "proposed", proposedValue);
    });

    return payload;
  };

  const getPreviewData = () => [
    { label: "Checking Type", value: selectedTypeName || "-" },
    { label: "Wheel Change Type", value: wheelChangeType || "-" },
    { label: "Entry ID", value: entryId || "#SPN-001" },
    { label: referenceLabel, value: machineNumber || "-" },
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
    const parameterInputType = getParameterInputType(row);
    const className = `${styles.input} ${row.darkInput ? styles.darkInput : ""} ${
      errors.values?.[row.key]?.[column] ? styles.errorInput : ""
    }`;

    if (row.inputType === "select") {
      const optionKeys = WHEEL_CHANGE_DROPDOWN_KEYS[row.key] || [];
      const options = normalizeDropdownOptions([
        ...getFirstArray(dropdownOptions, optionKeys),
        ...(Array.isArray(dropdownOptions?.fixed_options?.[row.key])
          ? dropdownOptions.fixed_options[row.key]
          : []),
      ]);

      return (
        <select className={className} value={value} onChange={handleValueChange(row.key, column)}>
          <option value="">Select</option>
          {options.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      );
    }

    return (
      <input
        type={parameterInputType === "number" ? "number" : "text"}
        inputMode={parameterInputType === "number" ? "decimal" : undefined}
        step={parameterInputType === "number" ? "any" : undefined}
        placeholder={row.placeholder || ""}
        className={className}
        value={value}
        onChange={
          parameterInputType === "number"
            ? handleNumericValueChange(row.key, column)
            : handleValueChange(row.key, column)
        }
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
            <input
              type="text"
              className={styles.topInput}
              value={entryId || "#SPN-001"}
              readOnly
              disabled
            />
          </div>

          <div className={styles.field}>
            <label>{referenceLabel}</label>
            <SearchableSelect
              className={`${styles.topInput} ${errors.machineNumber ? styles.errorInput : ""}`}
              value={machineNumber}
              onChange={(value) => {
                setMachineNumber(value);
                clearFieldError("machineNumber");
              }}
              options={machineOptions}
              placeholder={`Select ${referenceLabel}`}
              ariaLabel={referenceLabel}
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
