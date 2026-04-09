import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useDispatch, useSelector } from "react-redux";

import styles from "@/styles/cspParameterEntries.module.css";
import { toNullableNumber } from "@/apis/autoconer";
import {
  getAutoconerParameterEntries,
  saveAutoconerParameterEntries,
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

const isUPercentEntry = (entry = {}) => {
  const inspectionType = String(entry.inspection_type || entry.type || "").toLowerCase();
  const inspectionPhase = String(entry.inspection_phase || "").toLowerCase();
  const payloadType = String(entry?.payload?.type || "").toLowerCase();

  return (
    inspectionPhase === "u_percent_entered" ||
    inspectionType.includes("u% parameter") ||
    payloadType.includes("u% parameter")
  );
};

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
    parameterEntries = [],
  } = autoconerState;
  const [entryDate, setEntryDate] = useState(getTodayDate());
  const [countName, setCountName] = useState(COUNT_NAME_OPTIONS[0]);
  const [values, setValues] = useState(createInitialValues);
  const [errors, setErrors] = useState({});
  const [portalReady, setPortalReady] = useState(false);

  const uPercentEntries = useMemo(
    () => parameterEntries.filter((entry) => isUPercentEntry(entry)).map((entry, index) => mapParameterEntry(entry, index)),
    [parameterEntries]
  );

  const selectedUPercentEntry = useMemo(() => {
    return (
      uPercentEntries.find((entry) => entry.countName === countName) ||
      uPercentEntries[0] ||
      null
    );
  }, [uPercentEntries, countName]);

  const lockedValues = useMemo(
    () => selectedUPercentEntry?.values || createInitialValues(),
    [selectedUPercentEntry]
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
    () => uPercentEntries.slice(0, 5),
    [uPercentEntries]
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
      inspection_type: selectedType || "CSP Parameter Entries",
      entry_date: entryDate,
      count_name: countName,
      act_count: toNullableNumber(values.actCount),
      strength: toNullableNumber(values.strength),
      count_cv: toNullableNumber(values.countCv),
      strength_cv: toNullableNumber(values.strengthCv),
      csp: toNullableNumber(values.csp),
      inspection_phase: "csp_entered",
      payload: {
        type: selectedType || "CSP Parameter Entries",
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
      disabled = false,
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
          className={`${styles.input} ${error ? styles.errorField : ""} ${readOnly || disabled ? styles.readOnlyField : ""}`}
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
                  <span>U%</span>
                  <strong>{entry.values.uPercent || "-"}</strong>
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
                  <span>Cone Color</span>
                  <strong>{entry.values.coneColor || "-"}</strong>
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
                {type.name}
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
              renderField(field, { value: lockedValues[field.key] || "", readOnly: true })
            )}
          </div>
          <div className={styles.sectionGridThree}>
            {QUALITY_FIELDS.slice(5).map((field) =>
              renderField(field, { value: lockedValues[field.key] || "", readOnly: true })
            )}
          </div>
        </div>

        <div className={styles.sectionBlock}>
          <div className={styles.sectionGridFive}>
            {REGULAR_IPI_FIELDS.map((field) =>
              renderField(field, { value: lockedValues[field.key] || "", readOnly: true })
            )}
            {renderField({ key: "totalOne", label: "TOTAL" }, { value: totalOne, readOnly: true })}
          </div>
        </div>

        <div className={styles.sectionBlock}>
          <div className={styles.sectionGridFive}>
            {HS_IPI_FIELDS.map((field) =>
              renderField(field, { value: lockedValues[field.key] || "", readOnly: true })
            )}
            {renderField({ key: "totalTwo", label: "TOTAL" }, { value: totalTwo, readOnly: true })}
          </div>
        </div>

        <div className={styles.sectionBlock}>
          <div className={styles.sectionGridFive}>
            {FINAL_FIELDS.map((field) =>
              renderField(field, { value: lockedValues[field.key] || "", readOnly: true })
            )}
          </div>
        </div>
      </div>

      {portalTarget ? createPortal(pendingSection, portalTarget) : null}
    </div>
  );
}

export default CspParameterEntries;
