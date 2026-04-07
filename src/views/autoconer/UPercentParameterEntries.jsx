import { useEffect, useMemo, useState } from "react";
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

const METRIC_FIELDS = [
  { key: "actCount", label: "Act Count", disabled: true, numeric: true },
  { key: "strength", label: "Strength", disabled: true, numeric: true },
  { key: "cv1", label: "CV1", disabled: true, numeric: true },
  { key: "cv2", label: "CV2", disabled: true, numeric: true },
  { key: "csp", label: "CSP", disabled: true, numeric: true },
  { key: "coneColor", label: "Cone Color", disabled: false, numeric: false },
  { key: "uPercent", label: "U", disabled: false, numeric: true },
  { key: "cvm", label: "CVM", disabled: false, numeric: true },
  { key: "oneMtrCv", label: "1Mtr CV", disabled: false, numeric: true },
  { key: "threeMtrCv", label: "3Mtr CV", disabled: false, numeric: true },
  { key: "tenMtrCv", label: "10Mtr CV", disabled: false, numeric: true },
  { key: "brOnePointFive", label: "BR 1.5mm", disabled: false, numeric: true },
  { key: "cvb", label: "CVB", disabled: false, numeric: true },
  { key: "thinMinus50", label: "Thin -50%", disabled: false, numeric: true },
  { key: "thickPlus50", label: "Thick +50%", disabled: false, numeric: true },
  { key: "nepsPlus200", label: "Neps +200%", disabled: false, numeric: true },
  { key: "totalOne", label: "Total", disabled: false, numeric: true },
  { key: "thinMinus40", label: "Thin -40%", disabled: false, numeric: true },
  { key: "thickPlus35", label: "Thick +35%", disabled: false, numeric: true },
  { key: "thickPlus70", label: "Thick +70%", disabled: false, numeric: true },
  { key: "nepsPlus140", label: "Neps +140%", disabled: false, numeric: true },
  { key: "totalTwo", label: "Total", disabled: false, numeric: true },
  { key: "thinMinus30", label: "Thin -30%", disabled: false, numeric: true },
  { key: "nepsPlus400", label: "Neps +400%", disabled: false, numeric: true },
];

const createInitialValues = () =>
  METRIC_FIELDS.reduce((accumulator, field) => {
    accumulator[field.key] = "";
    return accumulator;
  }, {});

const getTodayDate = () => new Date().toISOString().split("T")[0];

function UPercentParameterEntries({
  types,
  selectedType,
  onTypeChange,
  onRegisterActions,
}) {
  const dispatch = useDispatch();
  const { isLoading = false } = useSelector((state) => state.autoconer ?? {});
  const [entryDate, setEntryDate] = useState(getTodayDate());
  const [countName, setCountName] = useState(COUNT_NAME_OPTIONS[0]);
  const [values, setValues] = useState(createInitialValues);
  const [errors, setErrors] = useState({});

  const editableFields = useMemo(
    () => METRIC_FIELDS.filter((field) => !field.disabled),
    []
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

    editableFields.forEach((field) => {
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
    ...METRIC_FIELDS.map((field) => ({
      label: field.label,
      value: values[field.key] || "-",
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
      total_1: toNullableNumber(values.totalOne),
      thin_minus_40: toNullableNumber(values.thinMinus40),
      thick_plus_35: toNullableNumber(values.thickPlus35),
      thick_plus_70: toNullableNumber(values.thickPlus70),
      neps_plus_140: toNullableNumber(values.nepsPlus140),
      total_2: toNullableNumber(values.totalTwo),
      thin_minus_30: toNullableNumber(values.thinMinus30),
      neps_plus_400: toNullableNumber(values.nepsPlus400),
      inspection_phase: "u_percent_entered",
      payload: {
        type: selectedType || "U% Parameter Entries",
        values,
      },
    };

    const resultAction = await dispatch(saveAutoconerParameterEntries(payload));
    if (saveAutoconerParameterEntries.fulfilled.match(resultAction)) {
      dispatch(getAutoconerParameterEntries());
    }
    return saveAutoconerParameterEntries.fulfilled.match(resultAction);
  };

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
  }, [onRegisterActions, selectedType, entryDate, countName, values, isLoading]);

  return (
    <div className={styles.wrapper}>
      <div className={styles.topGrid}>
        <div className={styles.field}>
          <label>Type</label>
          <select
            value={selectedType}
            onChange={(event) => onTypeChange(event.target.value)}
            className={errors.type ? styles.errorField : ""}
          >
            {types.map((type) => (
              <option key={type.id} value={type.name}>
                {type.name}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <label>Date</label>
          <input
            type="date"
            value={entryDate}
            onChange={(event) => setEntryDate(event.target.value)}
            className={errors.entryDate ? styles.errorField : ""}
          />
        </div>

        <div className={styles.field}>
          <label>Count Name</label>
          <select
            value={countName}
            onChange={(event) => setCountName(event.target.value)}
            className={errors.countName ? styles.errorField : ""}
          >
            {COUNT_NAME_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className={styles.metricsGrid}>
        {METRIC_FIELDS.map((field) => (
          <div key={field.key} className={styles.field}>
            <label>{field.label}</label>
            <input
              value={values[field.key]}
              onChange={(event) => handleValueChange(field, event.target.value)}
              disabled={field.disabled}
              className={
                errors[field.key]
                  ? styles.errorField
                  : field.disabled
                    ? styles.disabledField
                    : ""
              }
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default UPercentParameterEntries;
