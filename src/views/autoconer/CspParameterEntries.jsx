import { useEffect, useMemo, useState } from "react";
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

const METRIC_FIELDS = [
  { key: "actCount", label: "Act Count", editable: true },
  { key: "strength", label: "Strength", editable: true },
  { key: "countCv", label: "Count CV", editable: true },
  { key: "strengthCv", label: "Strength CV", editable: true },
  { key: "csp", label: "CSP", editable: true },
  { key: "coneColor", label: "Cone Color", editable: false },
  { key: "uPercent", label: "U%", editable: false },
  { key: "cvm", label: "CVM", editable: false },
  { key: "oneMtrCv", label: "1Mtr CV", editable: false },
  { key: "threeMtrCv", label: "3Mtr CV", editable: false },
  { key: "tenMtrCv", label: "10Mtr CV", editable: false },
  { key: "unevenness", label: "---------", editable: false },
  { key: "cvb", label: "CVB", editable: false },
  { key: "thinMinus50", label: "Thin -50%", editable: false },
  { key: "thickPlus50", label: "Thick +50%", editable: false },
  { key: "nepsPlus200", label: "Neps +200%", editable: false },
  { key: "totalOne", label: "Total", editable: false },
  { key: "thinMinus40", label: "Thin -40%", editable: false },
  { key: "thickPlus35", label: "Thick +35%", editable: false },
  { key: "thickPlus70", label: "Thick +70%", editable: false },
  { key: "nepsPlus140", label: "Neps +140%", editable: false },
  { key: "totalTwo", label: "Total", editable: false },
  { key: "thinMinus30", label: "Thin -30%", editable: false },
  { key: "nepsPlus400", label: "Neps +400%", editable: false },
];

const createInitialValues = () =>
  METRIC_FIELDS.reduce((accumulator, field) => {
    accumulator[field.key] = "";
    return accumulator;
  }, {});

const getTodayDate = () => new Date().toISOString().split("T")[0];

function CspParameterEntries({
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
    () => METRIC_FIELDS.filter((field) => field.editable),
    []
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
            onChange={(e) => onTypeChange(e.target.value)}
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
            onChange={(e) => setEntryDate(e.target.value)}
            disabled
            className={errors.entryDate ? styles.errorField : ""}
          />
        </div>

        <div className={styles.field}>
          <label>Count Name</label>
          <select
            value={countName}
            onChange={(e) => setCountName(e.target.value)}
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
              onChange={(e) => handleValueChange(field.key, e.target.value)}
              disabled={!field.editable}
              className={
                field.editable && errors[field.key]
                  ? styles.errorField
                  : !field.editable
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

export default CspParameterEntries;
