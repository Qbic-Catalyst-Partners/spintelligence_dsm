import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useDispatch, useSelector } from "react-redux";

import styles from "@/styles/uPercentParameterEntries.module.css";
import { toNullableNumber } from "@/apis/autoconer";
import useAutoconerCountOptions from "@/hooks/useAutoconerCountOptions";
import {
  getAutoconerPendingQualityParameterEntries,
  saveAutoconerParameterEntriesOther,
} from "@/store/slices/autoconer";
import { sanitizeNumericInput } from "@/utils/inputValidation";


const COUNT_NAME_OPTIONS = [
  "12 RECYCLE (GRG) POLY COTTON CW 49.5",
  "20 WHITE POLY 40D SPX YARN CONES",
  "30 BLACK POLY VISCOSE 65/35 40D SPX YARN CONES",
];

const TOP_FIELDS = [
  { key: "actCount", label: "Act Count", numeric: true },
  { key: "strength", label: "Strength", numeric: true },
  { key: "cv1", label: "CV1", numeric: true },
  { key: "cv2", label: "CV2", numeric: true },
  { key: "csp", label: "CSP", numeric: true },
];

const QUALITY_FIELDS = [  
  { key: "coneColor", label: "Cone Color", numeric: false },
  { key: "uPercent", label: "U%", numeric: true },
  { key: "cvm", label: "CVM", numeric: true },
  { key: "oneMtrCv", label: "1Mtr CV", numeric: true },
  { key: "threeMtrCv", label: "3Mtr CV", numeric: true },
  { key: "tenMtrCv", label: "10Mtr CV", numeric: true },
  { key: "brOnePointFive", label: "BR 1.5mm", numeric: true },
  { key: "cvb", label: "CVB", numeric: true },
];

const REGULAR_IPI_FIELDS = [
  { key: "thinMinus50", label: "Thin -50%", numeric: true },
  { key: "thickPlus50", label: "Thick +50%", numeric: true },
  { key: "nepsPlus200", label: "Neps +200%", numeric: true },
];

const HS_IPI_FIELDS = [
  { key: "thinMinus40", label: "Thin -40%", numeric: true },
  { key: "thickPlus35", label: "Thick +35%", numeric: true },
  { key: "thickPlus70", label: "Thick +70%", numeric: true },
  { key: "nepsPlus140", label: "Neps +140%", numeric: true },
];

const FINAL_FIELDS = [
  { key: "thinMinus30", label: "Thin -30%", numeric: true },
  { key: "nepsPlus400", label: "Neps +400%", numeric: true },
];

const ALL_FIELDS = [
  ...TOP_FIELDS,
  ...QUALITY_FIELDS,
  ...REGULAR_IPI_FIELDS,
  { key: "totalOne", label: "TOTAL", numeric: true },
  ...HS_IPI_FIELDS,
  { key: "totalTwo", label: "TOTAL", numeric: true },
  ...FINAL_FIELDS,
];

const createInitialValues = () =>
  ALL_FIELDS.reduce((accumulator, field) => {
    accumulator[field.key] = "";
    return accumulator;
  }, {});

const getTodayDate = () => new Date().toISOString().split("T")[0];

const sumValues = (values, keys) => {
  const total = keys.reduce(
    (sum, key) => sum + (Number.parseFloat(values[key]) || 0),
    0
  );
  return total ? total.toFixed(2) : "";
};

const calculateCsp = (strength, count) => {
  const parsedStrength = Number.parseFloat(strength) || 0;
  const parsedCount = Number.parseFloat(count) || 0;
  const csp = parsedStrength * parsedCount;
  return csp ? csp.toFixed(2) : "";
};

const getEntryId = (entry) => entry?.id ?? entry?._id ?? entry?.entry_id ?? null;

const getEntryValue = (entry, keys) => {
  const sourceValues = entry?.payload?.values ?? entry?.values ?? {};
  const candidates = Array.isArray(keys) ? keys : [keys];

  for (const key of candidates) {
    const directValue = entry?.[key];
    if (directValue !== undefined && directValue !== null && directValue !== "") {
      return String(directValue);
    }

    const nestedValue = sourceValues?.[key];
    if (nestedValue !== undefined && nestedValue !== null && nestedValue !== "") {
      return String(nestedValue);
    }
  }

  return "";
};

const hasFilledValue = (value) =>
  value !== undefined && value !== null && String(value).trim() !== "";

const getEntrySortTimestamp = (entry) => {
  const rawDate = getEntryValue(entry, ["entry_date", "date", "inspection_date"]);
  if (!rawDate) return 0;

  const timestamp = new Date(rawDate).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
};

const formatDisplayDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

const formatPreviewDateTime = (value) => {
  if (!value) return "-";
  const rawValue = String(value);
  const hasExplicitTime = rawValue.includes("T") || rawValue.includes(":");
  const date = hasExplicitTime ? new Date(rawValue) : new Date();
  if (Number.isNaN(date.getTime())) return rawValue;
  const now = new Date();

  if (!hasExplicitTime) {
    const [yearPart, monthPart, dayPart] = rawValue.split("-");
    if (yearPart && monthPart && dayPart) {
      date.setFullYear(Number(yearPart), Number(monthPart) - 1, Number(dayPart));
    }
  } else if (
    date.getHours() === 0 &&
    date.getMinutes() === 0 &&
    date.getSeconds() === 0 &&
    date.getMilliseconds() === 0
  ) {
    date.setHours(
      now.getHours(),
      now.getMinutes(),
      now.getSeconds(),
      now.getMilliseconds()
    );
  }

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${day}/${month}/${year} ${hours}:${minutes}`;
};

const mapPendingEntry = (entry = {}, index = 0) => ({
  id: getEntryId(entry) || `${entry.entry_date || "entry"}-${index}`,
  date: formatDisplayDate(getEntryValue(entry, ["entry_date", "date", "inspection_date"])),
  countName: getEntryValue(entry, ["count_name", "countName"]),
  calculatedCsp: calculateCsp(
    getEntryValue(entry, "strength"),
    getEntryValue(entry, ["actCount", "act_count"])
  ),
  values: {
    coneColor: getEntryValue(entry, ["coneColor", "cone_color"]),
    actCount: getEntryValue(entry, ["actCount", "act_count"]),
    strength: getEntryValue(entry, "strength"),
    cv1: getEntryValue(entry, ["cv1", "countCv", "count_cv"]),
    cv2: getEntryValue(entry, ["cv2", "strengthCv", "strength_cv"]),
    csp: getEntryValue(entry, "csp"),
    uPercent: getEntryValue(entry, ["uPercent", "u"]),
    cvm: getEntryValue(entry, "cvm"),
    oneMtrCv: getEntryValue(entry, ["oneMtrCv", "cv_1m"]),
    threeMtrCv: getEntryValue(entry, ["threeMtrCv", "cv_3m"]),
    tenMtrCv: getEntryValue(entry, ["tenMtrCv", "cv_10m"]),
    brOnePointFive: getEntryValue(entry, ["brOnePointFive", "br_1_5mm"]),
    cvb: getEntryValue(entry, "cvb"),
    thinMinus50: getEntryValue(entry, ["thinMinus50", "thin_minus_50"]),
    thickPlus50: getEntryValue(entry, ["thickPlus50", "thick_plus_50"]),
    nepsPlus200: getEntryValue(entry, ["nepsPlus200", "neps_plus_200"]),
    totalOne: getEntryValue(entry, ["totalOne", "total_1"]),
    thinMinus40: getEntryValue(entry, ["thinMinus40", "thin_minus_40"]),
    thickPlus35: getEntryValue(entry, ["thickPlus35", "thick_plus_35"]),
    thickPlus70: getEntryValue(entry, ["thickPlus70", "thick_plus_70"]),
    nepsPlus140: getEntryValue(entry, ["nepsPlus140", "neps_plus_140"]),
    totalTwo: getEntryValue(entry, ["totalTwo", "total_2"]),
    thinMinus30: getEntryValue(entry, ["thinMinus30", "thin_minus_30"]),
    nepsPlus400: getEntryValue(entry, ["nepsPlus400", "neps_plus_400"]),
  },
});

function UPercentParameterEntries({
  types,
  selectedType,
  onTypeChange,
  onRegisterActions,
  tablePortalTargetId,
  entryId = "",
}) {
  const dispatch = useDispatch();
  const autoconerState = useSelector((state) => state.autoconer ?? {});
  const {
    isLoading = false,
    isFetching = false,
    pendingQualityParameterEntries = [],
  } = autoconerState;
  const [entryDate, setEntryDate] = useState(getTodayDate());
  const [countName, setCountName] = useState(COUNT_NAME_OPTIONS[0]);
  const [values, setValues] = useState(createInitialValues);
  const [errors, setErrors] = useState({});
  const [portalReady, setPortalReady] = useState(false);
  const [selectedEntryId, setSelectedEntryId] = useState(null);
  const { countOptions: masterCountOptions } = useAutoconerCountOptions();
  const countDropdownOptions = useMemo(
    () => {
      const values = masterCountOptions.length
        ? masterCountOptions.map((option) => option.count_name || option.label || option.value)
        : COUNT_NAME_OPTIONS;
      return Array.from(
        new Set(
          [...values, countName]
            .map((value) => String(value || "").trim())
            .filter(Boolean)
        )
      );
    },
    [countName, masterCountOptions]
  );
  const selectedPendingEntry = useMemo(
    () =>
      pendingQualityParameterEntries.find(
        (entry) => String(getEntryId(entry)) === String(selectedEntryId)
      ) || null,
    [pendingQualityParameterEntries, selectedEntryId]
  );
  const topValues = useMemo(
    () => ({
      actCount: getEntryValue(selectedPendingEntry, ["actCount", "act_count"]) || values.actCount || "",
      strength: getEntryValue(selectedPendingEntry, "strength") || values.strength || "",
      cv1: getEntryValue(selectedPendingEntry, ["cv1", "countCv", "count_cv"]) || values.cv1 || "",
      cv2: getEntryValue(selectedPendingEntry, ["cv2", "strengthCv", "strength_cv"]) || values.cv2 || "",
      csp:
        getEntryValue(selectedPendingEntry, "csp") ||
        calculateCsp(
          getEntryValue(selectedPendingEntry, "strength") || values.strength,
          getEntryValue(selectedPendingEntry, ["actCount", "act_count"]) || values.actCount
        ) ||
        values.csp ||
        "",
    }),
    [selectedPendingEntry, values.actCount, values.strength, values.cv1, values.cv2, values.csp]
  );

  const totalOne = useMemo(
    () => sumValues(values, REGULAR_IPI_FIELDS.map((field) => field.key)),
    [values]
  );
  const totalTwo = useMemo(
    () => sumValues(values, HS_IPI_FIELDS.map((field) => field.key)),
    [values]
  );

  const mergedValues = useMemo(
    () => ({
      ...values,
      ...topValues,
      totalOne,
      totalTwo,
    }),
    [topValues, values, totalOne, totalTwo]
  );

  const pendingEntries = useMemo(
    () =>
      [...pendingQualityParameterEntries]
        .sort((leftEntry, rightEntry) => getEntrySortTimestamp(rightEntry) - getEntrySortTimestamp(leftEntry))
        .map((entry, index) => mapPendingEntry(entry, index))
        .slice(0, 5),
    [pendingQualityParameterEntries]
  );

  const handleValueChange = (fieldConfig, value) => {
    const nextValue = fieldConfig.numeric
      ? sanitizeNumericInput(value, { precision: 10, scale: 2 })
      : value;

    setValues((current) => ({
      ...current,
      [fieldConfig.key]: nextValue,
      ...(fieldConfig.key === "strength" || fieldConfig.key === "actCount"
        ? {
            csp: calculateCsp(
              fieldConfig.key === "strength" ? nextValue : current.strength,
              fieldConfig.key === "actCount" ? nextValue : current.actCount
            ),
          }
        : {}),
    }));

    setErrors((current) => {
      if (!current[fieldConfig.key]) return current;
      const next = { ...current };
      delete next[fieldConfig.key];
      return next;
    });
  };

  const clear = () => {
    setSelectedEntryId(null);
    setEntryDate(getTodayDate());
    setCountName(countDropdownOptions[0] || COUNT_NAME_OPTIONS[0]);
    setValues(createInitialValues());
    setErrors({});
  };

  const validate = () => {
    const nextErrors = {};

    if (!String(selectedType || "").trim()) nextErrors.type = true;
    if (!String(entryDate || "").trim()) nextErrors.entryDate = true;
    if (!String(countName || "").trim()) nextErrors.countName = true;

    [...QUALITY_FIELDS, ...REGULAR_IPI_FIELDS, ...HS_IPI_FIELDS, ...FINAL_FIELDS].forEach((field) => {
      if (!String(values[field.key] || "").trim()) {
        nextErrors[field.key] = true;
      }
    });

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const getPreviewData = () => [
    { label: "ID", value: selectedEntryId || "-", wide: true },
    { label: "Type", value: selectedType || "-" },
    { label: "Entry ID", value: entryId || "-" },
    { label: "Count Name", value: countName || "-", wide: true },
    ...ALL_FIELDS.map((field) => ({
      label: field.label,
      value: mergedValues[field.key] || "-",
    })),
  ];

  const submit = async () => {
    if (!validate()) return false;
    const payload = {
      id: selectedEntryId || undefined,
      inspection_type: selectedType || "U% Parameter Entries",
      entry_date: entryDate,
      count_name: countName,
      act_count: toNullableNumber(topValues.actCount),
      strength: toNullableNumber(topValues.strength),
      count_cv: toNullableNumber(topValues.cv1),
      cv1: toNullableNumber(topValues.cv1),
      strength_cv: toNullableNumber(topValues.cv2),
      cv2: toNullableNumber(topValues.cv2),
      csp: toNullableNumber(topValues.csp),
      cone_color: values.coneColor || null,
      u: toNullableNumber(values.uPercent),
      cvm: toNullableNumber(values.cvm),
      cv_1m: toNullableNumber(values.oneMtrCv),
      cv_3m: toNullableNumber(values.threeMtrCv),
      cv_10m: toNullableNumber(values.tenMtrCv),
      br_1_5mm: toNullableNumber(values.brOnePointFive),
      cvb: toNullableNumber(values.cvb),
      thin_minus_50: toNullableNumber(values.thinMinus50),
      thick_plus_50: toNullableNumber(values.thickPlus50),
      neps_plus_200: toNullableNumber(values.nepsPlus200),
      total_1: toNullableNumber(totalOne),
      thin_minus_40: toNullableNumber(values.thinMinus40),
      thick_plus_35: toNullableNumber(values.thickPlus35),
      thick_plus_70: toNullableNumber(values.thickPlus70),
      neps_plus_140: toNullableNumber(values.nepsPlus140),
      total_2: toNullableNumber(totalTwo),
      thin_minus_30: toNullableNumber(values.thinMinus30),
      neps_plus_400: toNullableNumber(values.nepsPlus400),
      inspection_phase: "other_entered",
      payload: {
        type: selectedType || "U% Parameter Entries",
        values: mergedValues,
      },
    };

    const resultAction = await dispatch(saveAutoconerParameterEntriesOther(payload));
    if (saveAutoconerParameterEntriesOther.fulfilled.match(resultAction)) {
      return true;
    }
    return false;
  };

  useEffect(() => {
    setEntryDate(getTodayDate());
  }, [selectedType]);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    dispatch(getAutoconerPendingQualityParameterEntries());
  }, [dispatch]);

  useEffect(() => {
    if (!selectedPendingEntry) return;

    setEntryDate(
      getEntryValue(selectedPendingEntry, ["entry_date", "date", "inspection_date"]) || getTodayDate()
    );
    setCountName(
      getEntryValue(selectedPendingEntry, ["count_name", "countName"]) || countDropdownOptions[0] || COUNT_NAME_OPTIONS[0]
    );
    setValues((current) => ({
      ...current,
      coneColor: getEntryValue(selectedPendingEntry, ["coneColor", "cone_color"]),
      uPercent: getEntryValue(selectedPendingEntry, ["uPercent", "u"]),
      cvm: getEntryValue(selectedPendingEntry, "cvm"),
      oneMtrCv: getEntryValue(selectedPendingEntry, ["oneMtrCv", "cv_1m"]),
      threeMtrCv: getEntryValue(selectedPendingEntry, ["threeMtrCv", "cv_3m"]),
      tenMtrCv: getEntryValue(selectedPendingEntry, ["tenMtrCv", "cv_10m"]),
      brOnePointFive: getEntryValue(selectedPendingEntry, ["brOnePointFive", "br_1_5mm"]),
      cvb: getEntryValue(selectedPendingEntry, "cvb"),
      thinMinus50: getEntryValue(selectedPendingEntry, ["thinMinus50", "thin_minus_50"]),
      thickPlus50: getEntryValue(selectedPendingEntry, ["thickPlus50", "thick_plus_50"]),
      nepsPlus200: getEntryValue(selectedPendingEntry, ["nepsPlus200", "neps_plus_200"]),
      thinMinus40: getEntryValue(selectedPendingEntry, ["thinMinus40", "thin_minus_40"]),
      thickPlus35: getEntryValue(selectedPendingEntry, ["thickPlus35", "thick_plus_35"]),
      thickPlus70: getEntryValue(selectedPendingEntry, ["thickPlus70", "thick_plus_70"]),
      nepsPlus140: getEntryValue(selectedPendingEntry, ["nepsPlus140", "neps_plus_140"]),
      thinMinus30: getEntryValue(selectedPendingEntry, ["thinMinus30", "thin_minus_30"]),
      nepsPlus400: getEntryValue(selectedPendingEntry, ["nepsPlus400", "neps_plus_400"]),
      csp: calculateCsp(
        getEntryValue(selectedPendingEntry, "strength"),
        getEntryValue(selectedPendingEntry, ["actCount", "act_count"])
      ),
    }));
  }, [countDropdownOptions, selectedPendingEntry]);

  useEffect(() => {
    if (!onRegisterActions) return;

    onRegisterActions({
      validate,
      getPreviewData,
      submit,
      onClear: clear,
      saveLabel: "Save Record",
      disabled: isLoading,
    });
  }, [onRegisterActions, selectedType, entryDate, countName, mergedValues, isLoading]);

  const renderField = (field, options = {}) => {
    const {
      value = mergedValues[field.key] || "",
      readOnly = false,
      disabled = false,
      darkDisabled = false,
      error = false,
    } = options;
    const isCspField = field.key === "csp";

    return (
      <div key={field.key} className={styles.metricField}>
        <label>{field.label}</label>
        <input
          value={value}
          onChange={(event) => handleValueChange(field, event.target.value)}
          readOnly={readOnly || isCspField}
          disabled={disabled || isCspField}
          className={`${styles.input} ${error ? styles.errorField : ""} ${(readOnly || disabled || isCspField) ? styles.readOnlyField : ""} ${darkDisabled ? styles.darkDisabledField : ""}`}
        />
      </div>
    );
  };

  const portalTarget =
    portalReady && tablePortalTargetId && typeof document !== "undefined"
      ? document.getElementById(tablePortalTargetId)
      : null;

  const pendingSection = (
    <section className={styles.pendingSection}>
      <div className={styles.pendingHeader}>
        <h3>Pending Entries</h3>
      </div>

      {pendingEntries.length ? (
        <div className={styles.pendingList}>
          {pendingEntries.map((entry) => (
            <article
              key={entry.id}
              className={styles.pendingCard}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedEntryId(entry.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setSelectedEntryId(entry.id);
                }
              }}
            >
              <div className={styles.pendingPrimaryRow}>
                <div className={styles.pendingMetaItem}>
                  <span>Entry ID</span>
                  <strong>{entryId}</strong>
                </div>
                <div className={`${styles.pendingMetaItem} ${styles.pendingMetaWide}`}>
                  <span>Count Name</span>
                  <strong>{entry.countName || "-"}</strong>
                </div>
                <div className={styles.pendingMetaItem}>
                  <span>CSP ID</span>
                  <strong>{entry.id || "-"}</strong>
                </div>
              </div>

              <div className={styles.pendingSecondaryRow}>
                <div className={styles.pendingMetaItem}>
                  <span>Cone Color</span>
                  <strong>{entry.values.coneColor || "-"}</strong>
                </div>
                <div className={styles.pendingMetaItem}>
                  <span>Act Count</span>
                  <strong>{entry.values.actCount || "-"}</strong>
                </div>
                <div className={styles.pendingMetaItem}>
                  <span>Strength</span>
                  <strong>{entry.values.strength || "-"}</strong>
                </div>
                <div className={styles.pendingMetaItem}>
                  <span>CV1</span>
                  <strong>{entry.values.cv1 || "-"}</strong>
                </div>
                <div className={styles.pendingMetaItem}>
                  <span>CV2</span>
                  <strong>{entry.values.cv2 || "-"}</strong>
                </div>
                <div className={styles.pendingMetaItem}>
                  <span>Calculated CSP</span>
                  <strong>{entry.calculatedCsp || entry.values.csp || "-"}</strong>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className={styles.emptyState}>
          {isFetching ? "Loading pending entries..." : "No pending entries available."}
        </div>
      )}
    </section>
  );

  return (
    <div className={styles.wrapper}>
      <div className={styles.topGrid}>
        <div className={styles.metricField}>
          <label>Type</label>
          <select
            value={selectedType}
            onChange={(event) => onTypeChange(event.target.value)}
            className={`${styles.input} ${styles.topControlInput} ${errors.type ? styles.errorField : ""}`}
          >
            {types.map((type) => {
              const optionValue =
                typeof type === "string"
                  ? type
                  : String(type?.name ?? type?.displayName ?? type?.value ?? type?.id ?? "").trim();
              const optionLabel =
                typeof type === "string"
                  ? type
                  : String(type?.displayName ?? type?.name ?? type?.label ?? type?.value ?? type?.id ?? "").trim();

              return (
                <option key={optionValue || optionLabel} value={optionValue}>
                  {optionLabel || optionValue}
                </option>
              );
            })}
          </select>
        </div>

        <div className={styles.metricField}>
          <label>Entry ID</label>
          <input
            type="text"
            value={entryId}
            disabled
            readOnly
            className={`${styles.input} ${styles.topControlInput} ${styles.topControlDisabled} ${errors.entryDate ? styles.errorField : ""}`}
          />
        </div>

        <div className={`${styles.metricField} ${styles.countNameField}`}>
          <label>Count Name</label>
          <select
            value={countName}
            onChange={(event) => setCountName(event.target.value)}
            className={`${styles.input} ${styles.topControlInput} ${errors.countName ? styles.errorField : ""}`}
          >
            {countDropdownOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className={styles.formCard}>
        <div className={styles.sectionBlock}>
          <div className={styles.sectionGridFive}>
            {TOP_FIELDS.map((field) =>
              renderField(field, {
                value: topValues[field.key] || "",
                disabled: true,
                darkDisabled: true,
                error: errors[field.key],
              })
            )}
          </div>
        </div>

        <div className={styles.sectionBlock}>
          <div className={styles.sectionGridFive}>
            {QUALITY_FIELDS.slice(0, 5).map((field) =>
              renderField(field, { value: values[field.key] || "", error: errors[field.key] })
            )}
          </div>
          <div className={styles.sectionGridThree}>
            {QUALITY_FIELDS.slice(5).map((field) =>
              renderField(field, { value: values[field.key] || "", error: errors[field.key] })
            )}
          </div>
        </div>

        <div className={styles.sectionBlock}>
          <div className="mb-3 text-[14px] text-[14px] font-bold text-[#1f2b3d]">Normal IPI</div>
          <div className={styles.sectionGridFive}>
            {REGULAR_IPI_FIELDS.map((field) =>
              renderField(field, { value: values[field.key] || "", error: errors[field.key] })
            )}
            {renderField({ key: "totalOne", label: "TOTAL", numeric: true }, { value: totalOne, readOnly: true })}
          </div>
        </div>

        <div className={styles.sectionBlock}>
          <div className="mb-3 text-[14px] text-[14px] font-bold text-[#1f2b3d]">Extra Sensitive IPI</div>
          <div className={styles.sectionGridFive}>
            {HS_IPI_FIELDS.filter((field) => field.key !== "thickPlus70").map((field) =>
              renderField(field, { value: values[field.key] || "", error: errors[field.key] })
            )}
            {renderField({ key: "totalTwo", label: "TOTAL", numeric: true }, { value: totalTwo, readOnly: true })}
          </div>
        </div>

        <div className={styles.sectionBlock}>
          <div className={styles.sectionGridFive}>
            {FINAL_FIELDS.map((field) =>
              renderField(field, { value: values[field.key] || "", error: errors[field.key] })
            )}
            {renderField(HS_IPI_FIELDS.find((field) => field.key === "thickPlus70"), {
              value: values.thickPlus70 || "",
              error: errors.thickPlus70,
            })}
          </div>
        </div>
      </div>

      {portalTarget ? createPortal(pendingSection, portalTarget) : pendingSection}
    </div>
  );
}

export default UPercentParameterEntries;
