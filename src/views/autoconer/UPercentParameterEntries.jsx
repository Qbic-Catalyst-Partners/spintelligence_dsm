import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useDispatch, useSelector } from "react-redux";

import styles from "@/styles/uPercentParameterEntries.module.css";
import { toNullableNumber } from "@/apis/autoconer";
import {
  getAutoconerParameterEntries,
  saveAutoconerParameterEntries,
} from "@/store/slices/autoconer";
import { sanitizeNumericInput } from "@/utils/inputValidation";

const COUNT_NAME_OPTIONS = [
  "12 BLACK POLY SLUB DS-0700 70D SPX...",
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

const mapParameterEntry = (entry = {}, index = 0) => {
  const values = createInitialValues();
  ALL_FIELDS.forEach((field) => {
    values[field.key] = getEntryValue(entry, field.key);
  });

  if (!values.totalOne) {
    values.totalOne = sumValues(values, REGULAR_IPI_FIELDS.map((field) => field.key));
  }

  if (!values.totalTwo) {
    values.totalTwo = sumValues(values, HS_IPI_FIELDS.map((field) => field.key));
  }

  return {
    id: entry.id || entry._id || entry.entry_id || `${entry.entry_date || "entry"}-${index}`,
    date: getEntryValue(entry, ["entry_date", "date", "inspection_date"]),
    countName: getEntryValue(entry, ["count_name", "countName"]),
    values,
  };
};

const isCspEntry = (entry = {}) => {
  const inspectionType = String(entry.inspection_type || entry.type || "").toLowerCase();
  const inspectionPhase = String(entry.inspection_phase || "").toLowerCase();
  const payloadType = String(entry?.payload?.type || "").toLowerCase();

  return (
    inspectionPhase === "csp_entered" ||
    inspectionType.includes("csp parameter") ||
    payloadType.includes("csp parameter")
  );
};

function UPercentParameterEntries({
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
    parameterEntries = [],
  } = autoconerState;
  const [entryDate, setEntryDate] = useState(getTodayDate());
  const [countName, setCountName] = useState(COUNT_NAME_OPTIONS[0]);
  const [values, setValues] = useState(createInitialValues);
  const [errors, setErrors] = useState({});
  const [portalReady, setPortalReady] = useState(false);

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
      totalOne,
      totalTwo,
    }),
    [values, totalOne, totalTwo]
  );

  const pendingEntries = useMemo(
    () =>
      parameterEntries
        .filter((entry) => isCspEntry(entry))
        .map((entry, index) => mapParameterEntry(entry, index)),
    [parameterEntries]
  );

  const handleValueChange = (fieldConfig, value) => {
    const nextValue = fieldConfig.numeric
      ? sanitizeNumericInput(value, { precision: 10, scale: 2 })
      : value;

    setValues((current) => ({
      ...current,
      [fieldConfig.key]: nextValue,
    }));

    setErrors((current) => {
      if (!current[fieldConfig.key]) return current;
      const next = { ...current };
      delete next[fieldConfig.key];
      return next;
    });
  };

  const clear = () => {
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

    [...TOP_FIELDS, ...QUALITY_FIELDS, ...REGULAR_IPI_FIELDS, ...HS_IPI_FIELDS, ...FINAL_FIELDS].forEach((field) => {
      if (!String(values[field.key] || "").trim()) {
        nextErrors[field.key] = true;
      }
    });

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const getPreviewData = () => [
    { label: "Type", value: selectedType || "-" },
    { label: "Date", value: entryDate || "-" },
    { label: "Count Name", value: countName || "-" },
    ...ALL_FIELDS.map((field) => ({
      label: field.label,
      value: mergedValues[field.key] || "-",
    })),
  ];

  const submit = async () => {
    if (!validate()) return false;

    const payload = {
      inspection_type: selectedType || "U% Parameter Entries",
      entry_date: entryDate,
      count_name: countName,
      act_count: toNullableNumber(values.actCount),
      strength: toNullableNumber(values.strength),
      cv1: toNullableNumber(values.cv1),
      cv2: toNullableNumber(values.cv2),
      csp: toNullableNumber(values.csp),
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
      inspection_phase: "u_percent_entered",
      payload: {
        type: selectedType || "U% Parameter Entries",
        values: mergedValues,
      },
    };

    const resultAction = await dispatch(saveAutoconerParameterEntries(payload));
    if (saveAutoconerParameterEntries.fulfilled.match(resultAction)) {
      dispatch(getAutoconerParameterEntries());
    }
    return saveAutoconerParameterEntries.fulfilled.match(resultAction);
  };

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    setEntryDate(getTodayDate());
  }, [selectedType]);

  useEffect(() => {
    dispatch(getAutoconerParameterEntries());
  }, [dispatch]);

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

  const portalTarget =
    portalReady && tablePortalTargetId && typeof document !== "undefined"
      ? document.getElementById(tablePortalTargetId)
      : null;

  const renderField = (field, options = {}) => {
    const {
      value = mergedValues[field.key] || "",
      readOnly = false,
      error = false,
    } = options;

    return (
      <div key={field.key} className={styles.metricField}>
        <label>{field.label}</label>
        <input
          value={value}
          onChange={(event) => handleValueChange(field, event.target.value)}
          readOnly={readOnly}
          className={`${styles.input} ${error ? styles.errorField : ""} ${readOnly ? styles.readOnlyField : ""}`}
        />
      </div>
    );
  };

  const pendingSection = (
    <section className={styles.pendingSection}>
      <div className={styles.pendingHeader}>
        <h3>Pending Entries</h3>
      </div>

      {pendingEntries.length ? (
        <div className={styles.pendingList}>
          {pendingEntries.map((entry) => (
            <article key={entry.id} className={styles.pendingCard}>
              <div className={styles.pendingMetaGrid}>
                <div className={styles.pendingMetaItem}>
                  <span>CSP</span>
                  <strong>{entry.values.csp || "-"}</strong>
                </div>
                <div className={styles.pendingMetaItem}>
                  <span>Date</span>
                  <strong>{entry.date || "-"}</strong>
                </div>
                <div className={`${styles.pendingMetaItem} ${styles.pendingMetaWide}`}>
                  <span>Count Name</span>
                  <strong>{entry.countName || "-"}</strong>
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
                  <span>Thick +70%</span>
                  <strong>{entry.values.thickPlus70 || "-"}</strong>
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
            className={`${styles.input} ${errors.type ? styles.errorField : ""}`}
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
            className={`${styles.input} ${styles.readOnlyField} ${errors.entryDate ? styles.errorField : ""}`}
          />
        </div>

        <div className={`${styles.metricField} ${styles.countNameField}`}>
          <label>Count Name</label>
          <select
            value={countName}
            onChange={(event) => setCountName(event.target.value)}
            className={`${styles.input} ${errors.countName ? styles.errorField : ""}`}
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
          <div className={styles.sectionGridFive}>
            {REGULAR_IPI_FIELDS.map((field) =>
              renderField(field, { value: values[field.key] || "", error: errors[field.key] })
            )}
            {renderField({ key: "totalOne", label: "TOTAL", numeric: true }, { value: totalOne, readOnly: true })}
          </div>
        </div>

        <div className={styles.sectionBlock}>
          <div className={styles.sectionGridFive}>
            {HS_IPI_FIELDS.map((field) =>
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
          </div>
        </div>
      </div>

      {portalTarget ? createPortal(pendingSection, portalTarget) : null}
    </div>
  );
}

export default UPercentParameterEntries;
