import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useDispatch, useSelector } from "react-redux";

import styles from "@/styles/cspParameterEntries.module.css";
import { toNullableNumber } from "@/apis/autoconer";
import {
  getAutoconerPendingCspParameterEntries,
  saveAutoconerParameterEntriesCsp,
} from "@/store/slices/autoconer";
import { sanitizeNumericInput } from "@/utils/inputValidation";

const COUNT_NAME_OPTIONS = [
  "12 RECYCLE (GRG) POLY COTTON CW 49.5",
  "20 WHITE POLY 40D SPX YARN CONES",
  "30 BLACK POLY VISCOSE 65/35 40D SPX YARN CONES",
];

const TOP_FIELDS = [
  { key: "actCount", label: "Act Count", editable: true },
  { key: "strength", label: "Strength", editable: true },
  { key: "countCv", label: "Count CV", editable: true },
  { key: "strengthCv", label: "Strength CV", editable: true },
  { key: "csp", label: "CSP", editable: true },
];

const QUALITY_FIELDS = [
  { key: "coneColor", label: "Cone Color" },
  { key: "uPercent", label: "U%" },
  { key: "cvm", label: "CVM" },
  { key: "oneMtrCv", label: "1Mtr CV" },
  { key: "threeMtrCv", label: "3Mtr CV" },
  { key: "tenMtrCv", label: "10Mtr CV" },
  { key: "brOnePointFive", label: "BR 1.5mm" },
  { key: "cvb", label: "CVB" },
];

const REGULAR_IPI_FIELDS = [
  { key: "thinMinus50", label: "Thin -50%" },
  { key: "thickPlus50", label: "Thick +50%" },
  { key: "nepsPlus200", label: "Neps +200%" },
];

const HS_IPI_FIELDS = [
  { key: "thinMinus40", label: "Thin -40%" },
  { key: "thickPlus35", label: "Thick +35%" },
  { key: "thickPlus70", label: "Thick +70%" },
  { key: "nepsPlus140", label: "Neps +140%" },
];

const FINAL_FIELDS = [
  { key: "thinMinus30", label: "Thin -30%" },
  { key: "nepsPlus400", label: "Neps +400%" },
];

const HS_IPI_DISPLAY_FIELDS = HS_IPI_FIELDS.filter((field) => field.key !== "thickPlus70");
const FINAL_DISPLAY_FIELDS = [
  FINAL_FIELDS[0],
  HS_IPI_FIELDS.find((field) => field.key === "thickPlus70"),
  FINAL_FIELDS[1],
].filter(Boolean);

const ALL_FIELDS = [
  ...TOP_FIELDS,
  ...QUALITY_FIELDS,
  ...REGULAR_IPI_FIELDS,
  { key: "totalOne", label: "Total" },
  ...HS_IPI_FIELDS,
  { key: "totalTwo", label: "Total" },
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

  if (!hasExplicitTime) {
    const [yearPart, monthPart, dayPart] = rawValue.split("-");
    if (yearPart && monthPart && dayPart) {
      date.setFullYear(Number(yearPart), Number(monthPart) - 1, Number(dayPart));
    }
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
  values: {
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
    coneColor: getEntryValue(entry, ["coneColor", "cone_color"]),
    actCount: getEntryValue(entry, ["actCount", "act_count"]),
    strength: getEntryValue(entry, "strength"),
    cv1: getEntryValue(entry, ["cv1", "countCv", "count_cv"]),
    cv2: getEntryValue(entry, ["cv2", "strengthCv", "strength_cv"]),
    csp: getEntryValue(entry, "csp"),
  },
});

function CspParameterEntries({
  types,
  selectedType,
  onTypeChange,
  onRegisterActions,
  tablePortalTargetId,
}) {
  const dispatch = useDispatch();
  const autoconerState = useSelector((state) => state.autoconer ?? {});
  const {
    isLoading = false,
    isFetching = false,
    pendingCspParameterEntries = [],
  } = autoconerState;
  const [entryDate, setEntryDate] = useState(getTodayDate());
  const [countName, setCountName] = useState(COUNT_NAME_OPTIONS[0]);
  const [values, setValues] = useState(createInitialValues);
  const [errors, setErrors] = useState({});
  const [portalReady, setPortalReady] = useState(false);
  const [selectedEntryId, setSelectedEntryId] = useState(null);
  const selectedPendingEntry = useMemo(
    () =>
      pendingCspParameterEntries.find(
        (entry) => String(getEntryId(entry)) === String(selectedEntryId)
      ) || null,
    [pendingCspParameterEntries, selectedEntryId]
  );
  const lockedValues = useMemo(
    () =>
      selectedPendingEntry
        ? {
            ...createInitialValues(),
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
            totalOne: getEntryValue(selectedPendingEntry, ["totalOne", "total_1"]),
            thinMinus40: getEntryValue(selectedPendingEntry, ["thinMinus40", "thin_minus_40"]),
            thickPlus35: getEntryValue(selectedPendingEntry, ["thickPlus35", "thick_plus_35"]),
            thickPlus70: getEntryValue(selectedPendingEntry, ["thickPlus70", "thick_plus_70"]),
            nepsPlus140: getEntryValue(selectedPendingEntry, ["nepsPlus140", "neps_plus_140"]),
            totalTwo: getEntryValue(selectedPendingEntry, ["totalTwo", "total_2"]),
            thinMinus30: getEntryValue(selectedPendingEntry, ["thinMinus30", "thin_minus_30"]),
            nepsPlus400: getEntryValue(selectedPendingEntry, ["nepsPlus400", "neps_plus_400"]),
          }
        : createInitialValues(),
    [selectedPendingEntry]
  );

  const totalOne = useMemo(
    () => lockedValues.totalOne || sumValues(lockedValues, REGULAR_IPI_FIELDS.map((field) => field.key)),
    [lockedValues]
  );
  const totalTwo = useMemo(
    () => lockedValues.totalTwo || sumValues(lockedValues, HS_IPI_FIELDS.map((field) => field.key)),
    [lockedValues]
  );

  const mergedValues = useMemo(
    () => ({
      ...lockedValues,
      ...values,
      totalOne,
      totalTwo,
    }),
    [lockedValues, values, totalOne, totalTwo]
  );

  const pendingEntries = useMemo(
    () =>
      [...pendingCspParameterEntries]
        .sort((leftEntry, rightEntry) => getEntrySortTimestamp(rightEntry) - getEntrySortTimestamp(leftEntry))
        .map((entry, index) => mapPendingEntry(entry, index))
        .slice(0, 5),
    [pendingCspParameterEntries]
  );

  const handleValueChange = (field, value) => {
    const nextValue = sanitizeNumericInput(value, { precision: 10, scale: 2 });
    setValues((current) => ({
      ...current,
      [field]: nextValue,
    }));
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const clear = () => {
    setSelectedEntryId(null);
    setEntryDate(getTodayDate());
    setCountName(COUNT_NAME_OPTIONS[0]);
    setValues(createInitialValues());
    setErrors({});
  };

  const validate = () => {
    const nextErrors = {};

    if (!String(selectedType || "").trim()) nextErrors.type = true;
    if (!String(entryDate || "").trim()) nextErrors.entryDate = true;
    if (!String(countName || "").trim()) nextErrors.countName = true;

    TOP_FIELDS.forEach((field) => {
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
    { label: "Date", value: formatPreviewDateTime(entryDate) },
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
      inspection_type: selectedType || "CSP Parameter Entries",
      entry_date: entryDate,
      count_name: countName,
      act_count: toNullableNumber(values.actCount),
      strength: toNullableNumber(values.strength),
      count_cv: toNullableNumber(values.countCv),
      cv1: toNullableNumber(values.countCv),
      strength_cv: toNullableNumber(values.strengthCv),
      cv2: toNullableNumber(values.strengthCv),
      csp: toNullableNumber(values.csp),
      cone_color: lockedValues.coneColor || null,
      u: toNullableNumber(lockedValues.uPercent),
      cvm: toNullableNumber(lockedValues.cvm),
      cv_1m: toNullableNumber(lockedValues.oneMtrCv),
      cv_3m: toNullableNumber(lockedValues.threeMtrCv),
      cv_10m: toNullableNumber(lockedValues.tenMtrCv),
      br_1_5mm: toNullableNumber(lockedValues.brOnePointFive),
      cvb: toNullableNumber(lockedValues.cvb),
      thin_minus_50: toNullableNumber(lockedValues.thinMinus50),
      thick_plus_50: toNullableNumber(lockedValues.thickPlus50),
      neps_plus_200: toNullableNumber(lockedValues.nepsPlus200),
      total_1: toNullableNumber(totalOne),
      thin_minus_40: toNullableNumber(lockedValues.thinMinus40),
      thick_plus_35: toNullableNumber(lockedValues.thickPlus35),
      thick_plus_70: toNullableNumber(lockedValues.thickPlus70),
      neps_plus_140: toNullableNumber(lockedValues.nepsPlus140),
      total_2: toNullableNumber(totalTwo),
      thin_minus_30: toNullableNumber(lockedValues.thinMinus30),
      neps_plus_400: toNullableNumber(lockedValues.nepsPlus400),
      inspection_phase: "csp_entered",
      payload: {
        type: selectedType || "CSP Parameter Entries",
        values: {
          actCount: values.actCount || "",
          strength: values.strength || "",
          countCv: values.countCv || "",
          cv1: values.countCv || "",
          strengthCv: values.strengthCv || "",
          cv2: values.strengthCv || "",
          csp: values.csp || "",
          coneColor: lockedValues.coneColor || "",
          uPercent: lockedValues.uPercent || "",
          cvm: lockedValues.cvm || "",
          oneMtrCv: lockedValues.oneMtrCv || "",
          threeMtrCv: lockedValues.threeMtrCv || "",
          tenMtrCv: lockedValues.tenMtrCv || "",
          brOnePointFive: lockedValues.brOnePointFive || "",
          cvb: lockedValues.cvb || "",
          thinMinus50: lockedValues.thinMinus50 || "",
          thickPlus50: lockedValues.thickPlus50 || "",
          nepsPlus200: lockedValues.nepsPlus200 || "",
          totalOne,
          thinMinus40: lockedValues.thinMinus40 || "",
          thickPlus35: lockedValues.thickPlus35 || "",
          thickPlus70: lockedValues.thickPlus70 || "",
          nepsPlus140: lockedValues.nepsPlus140 || "",
          totalTwo,
          thinMinus30: lockedValues.thinMinus30 || "",
          nepsPlus400: lockedValues.nepsPlus400 || "",
        },
      },
    };

    const resultAction = await dispatch(saveAutoconerParameterEntriesCsp(payload));
    if (saveAutoconerParameterEntriesCsp.fulfilled.match(resultAction)) {
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
    dispatch(getAutoconerPendingCspParameterEntries());
  }, [dispatch]);

  useEffect(() => {
    if (!selectedPendingEntry) return;

    setEntryDate(
      getEntryValue(selectedPendingEntry, ["entry_date", "date", "inspection_date"]) || getTodayDate()
    );
    setCountName(
      getEntryValue(selectedPendingEntry, ["count_name", "countName"]) || COUNT_NAME_OPTIONS[0]
    );
    setValues((current) => ({
      ...current,
      actCount: getEntryValue(selectedPendingEntry, ["actCount", "act_count"]),
      strength: getEntryValue(selectedPendingEntry, "strength"),
      countCv: getEntryValue(selectedPendingEntry, ["countCv", "count_cv"]),
      strengthCv: getEntryValue(selectedPendingEntry, ["strengthCv", "strength_cv"]),
      csp: getEntryValue(selectedPendingEntry, "csp"),
    }));
  }, [selectedPendingEntry]);

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

    return (
      <div key={field.key} className={styles.metricField}>
        <label>{field.label}</label>
        <input
          value={value}
          onChange={(event) => handleValueChange(field.key, event.target.value)}
          readOnly={readOnly}
          disabled={disabled}
          className={`${styles.input} ${error ? styles.errorField : ""} ${readOnly || disabled ? styles.readOnlyField : ""} ${darkDisabled ? styles.darkDisabledField : ""}`}
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
              <div className={styles.pendingTopRow}>
                <div className={styles.pendingMetaItem}>
                  <span>Date</span>
                  <strong>{entry.date || "-"}</strong>
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

              <div className={styles.pendingDataGrid}>
                <div className={styles.pendingMetaItem}>
                  <span>U</span>
                  <strong>{entry.values.uPercent || "-"}</strong>
                </div>
                <div className={styles.pendingMetaItem}>
                  <span>CVM</span>
                  <strong>{entry.values.cvm || "-"}</strong>
                </div>
                <div className={styles.pendingMetaItem}>
                  <span>1Mtr CV</span>
                  <strong>{entry.values.oneMtrCv || "-"}</strong>
                </div>
                <div className={styles.pendingMetaItem}>
                  <span>3Mtr CV</span>
                  <strong>{entry.values.threeMtrCv || "-"}</strong>
                </div>
                <div className={styles.pendingMetaItem}>
                  <span>10Mtr CV</span>
                  <strong>{entry.values.tenMtrCv || "-"}</strong>
                </div>
                <div className={styles.pendingMetaItem}>
                  <span>BR 1.5mm</span>
                  <strong>{entry.values.brOnePointFive || "-"}</strong>
                </div>
                <div className={styles.pendingMetaItem}>
                  <span>CVB</span>
                  <strong>{entry.values.cvb || "-"}</strong>
                </div>
                <div className={styles.pendingMetaItem}>
                  <span>Thin -50%</span>
                  <strong>{entry.values.thinMinus50 || "-"}</strong>
                </div>
                <div className={styles.pendingMetaItem}>
                  <span>Thick +50%</span>
                  <strong>{entry.values.thickPlus50 || "-"}</strong>
                </div>
                <div className={styles.pendingMetaItem}>
                  <span>Neps +200%</span>
                  <strong>{entry.values.nepsPlus200 || "-"}</strong>
                </div>
                <div className={styles.pendingMetaItem}>
                  <span>Total</span>
                  <strong>{entry.values.totalOne || "-"}</strong>
                </div>
                <div className={styles.pendingMetaItem}>
                  <span>Thin -40%</span>
                  <strong>{entry.values.thinMinus40 || "-"}</strong>
                </div>
                <div className={styles.pendingMetaItem}>
                  <span>Thick +35%</span>
                  <strong>{entry.values.thickPlus35 || "-"}</strong>
                </div>
                <div className={styles.pendingMetaItem}>
                  <span>Neps +140%</span>
                  <strong>{entry.values.nepsPlus140 || "-"}</strong>
                </div>
                <div className={styles.pendingMetaItem}>
                  <span>Total</span>
                  <strong>{entry.values.totalTwo || "-"}</strong>
                </div>
                <div className={styles.pendingMetaItem}>
                  <span>Thin -30%</span>
                  <strong>{entry.values.thinMinus30 || "-"}</strong>
                </div>
                <div className={styles.pendingMetaItem}>
                  <span>Thick +70%</span>
                  <strong>{entry.values.thickPlus70 || "-"}</strong>
                </div>
                <div className={styles.pendingMetaItem}>
                  <span>Neps +400%</span>
                  <strong>{entry.values.nepsPlus400 || "-"}</strong>
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
            {types.map((type) => (
              <option key={type.id} value={type.name}>
                {type.displayName ?? type.name}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.metricField}>
          <label>Date</label>
          <input
            type="date"
            value={entryDate}
            onChange={(event) => setEntryDate(event.target.value)}
            disabled
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
            {COUNT_NAME_OPTIONS.map((option) => (
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
              renderField(field, { value: values[field.key] || "", error: errors[field.key] })
            )}
          </div>
        </div>

        <div className={styles.sectionBlock}>
          <div className={styles.sectionGridFive}>
            {QUALITY_FIELDS.slice(0, 5).map((field) =>
              renderField(field, { value: lockedValues[field.key] || "", disabled: true, darkDisabled: true })
            )}
          </div>
          <div className={styles.sectionGridThree}>
            {QUALITY_FIELDS.slice(5).map((field) =>
              renderField(field, { value: lockedValues[field.key] || "", disabled: true, darkDisabled: true })
            )}
          </div>
        </div>

        <div className={styles.sectionBlock}>
          <div className={styles.sectionGridFive}>
            {REGULAR_IPI_FIELDS.map((field) =>
              renderField(field, { value: lockedValues[field.key] || "", disabled: true, darkDisabled: true })
            )}
            {renderField({ key: "totalOne", label: "TOTAL" }, { value: totalOne, disabled: true, darkDisabled: true })}
          </div>
        </div>

        <div className={styles.sectionBlock}>
          <div className={styles.sectionGridFive}>
            {HS_IPI_DISPLAY_FIELDS.map((field) =>
              renderField(field, { value: lockedValues[field.key] || "", disabled: true, darkDisabled: true })
            )}
            {renderField({ key: "totalTwo", label: "TOTAL" }, { value: totalTwo, disabled: true, darkDisabled: true })}
          </div>
        </div>

        <div className={styles.sectionBlock}>
          <div className={styles.sectionGridFive}>
            {FINAL_DISPLAY_FIELDS.map((field) =>
              renderField(field, { value: lockedValues[field.key] || "", disabled: true, darkDisabled: true })
            )}
          </div>
        </div>
      </div>

      {portalTarget ? createPortal(pendingSection, portalTarget) : pendingSection}
    </div>
  );
}

export default CspParameterEntries;
