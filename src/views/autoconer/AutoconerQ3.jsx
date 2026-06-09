import { createPortal } from "react-dom";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { FaCheckCircle } from "react-icons/fa";
import { HiChevronDown, HiChevronUp } from "react-icons/hi2";

import {
  fetchAutoconerQ3Entries,
  submitAutoconerQ3Entry,
  updateAutoconerQ3Entry,
} from "@/apis/autoconer";
import useAutoconerCountOptions from "@/hooks/useAutoconerCountOptions";
import { sanitizeNumericInput } from "@/utils/inputValidation";
import styles from "@/styles/AutoconerQ2.module.css";


const fieldDefs = [
  { key: "nsl1", label: "NSL1", numeric: true },
  { key: "nsl2", label: "NSL2", numeric: true },
  { key: "nsl3", label: "NSL3", numeric: true },
  { key: "nsl4", label: "NSL4", numeric: true },
  { key: "nsl5", label: "NSL5", numeric: true },
  { key: "nsl6", label: "NSL6", numeric: true },
  { key: "nsl7", label: "NSL7", numeric: true },
  { key: "t1", label: "T1", numeric: true },
  { key: "t2", label: "T2", numeric: true },
  { key: "t3", label: "T3", numeric: true },
  { key: "t4", label: "T4", numeric: true },
  { key: "t5", label: "T5", numeric: true },
  { key: "pfSensing", label: "PF Sensing", numeric: true, wide: true },
  { key: "pfNoOfPeriods", label: "PF No. of Periods", numeric: true, integer: true, wide: true },
  { key: "oc", label: "OC", numeric: true },
  { key: "cp", label: "CP", numeric: true },
  { key: "cm", label: "CM", numeric: true },
  { key: "ccp1", label: "CCP1", numeric: true },
  { key: "ccp2", label: "CCP2", numeric: true },
  { key: "ccm1", label: "CCM1", numeric: true },
  { key: "ccm2", label: "CCM2", numeric: true },
  { key: "jp1", label: "JP1", numeric: true },
  { key: "jp2", label: "JP2", numeric: true },
  { key: "jp3", label: "JP3", numeric: true },
  { key: "jp4", label: "JP4", numeric: true },
  { key: "jp5", label: "JP5", numeric: true },
  { key: "jp6", label: "JP6", numeric: true },
  { key: "jp7", label: "JP7", numeric: true },
  { key: "jpClearing", label: "JP Clearing", numeric: true, wide: true },
  { key: "jpUPercent", label: "JP U%", numeric: true, wide: true },
  { key: "jpJm", label: "JP JM", numeric: true, wide: true },
  { key: "fd1", label: "FD1", numeric: true },
  { key: "fd2", label: "FD2", numeric: true },
  { key: "fd3", label: "FD3", numeric: true },
  { key: "fd4", label: "FD4", numeric: true },
  { key: "fd5", label: "FD5", numeric: true },
  { key: "fd6", label: "FD6", numeric: true },
  { key: "referenceLength", label: "Reference Length", numeric: true, wide: true },
  { key: "suction", label: "Suction", numeric: true, wide: true },
  { key: "measurement", label: "Measurement", numeric: true, wide: true },
  { key: "upperLimit", label: "Upper Limit", numeric: true, wide: true },
  { key: "lowerLimit", label: "Lower Limit", numeric: true, wide: true },
  { key: "action", label: "Action" },
  { key: "suctionStatus", label: "Suction Status" },
  { key: "blocking", label: "Blocking" },
];

const createDefaultForm = (selectedType = "PP - Autoconer Q3") => ({
  versionId: "",
  paramId: "",
  type: selectedType || "PP - Autoconer Q3",
  countName: "",
  consigneeName: "",
  creationDate: new Date().toISOString().split("T")[0],
  nsl1: "",
  nsl2: "",
  nsl3: "",
  nsl4: "",
  nsl5: "",
  nsl6: "",
  nsl7: "",
  t1: "",
  t2: "",
  t3: "",
  t4: "",
  t5: "",
  pfSensing: "",
  pfNoOfPeriods: "",
  oc: "",
  cp: "",
  cm: "",
  ccp1: "",
  ccp2: "",
  ccm1: "",
  ccm2: "",
  jp1: "",
  jp2: "",
  jp3: "",
  jp4: "",
  jp5: "",
  jp6: "",
  jp7: "",
  jpClearing: "",
  jpUPercent: "",
  jpJm: "",
  fd1: "",
  fd2: "",
  fd3: "",
  fd4: "",
  fd5: "",
  fd6: "",
  referenceLength: "",
  suction: "",
  measurement: "",
  upperLimit: "",
  lowerLimit: "",
  action: "",
  suctionStatus: "",
  blocking: "",
});

const normalizeDate = (value) => {
  if (!value) return new Date().toISOString().split("T")[0];
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString().split("T")[0];
  return parsed.toISOString().split("T")[0];
};

const formatDisplayDate = (value) => {
  const normalized = normalizeDate(value);
  const [year, month, day] = normalized.split("-");
  return year && month && day ? `${day}/${month}/${year}` : normalized;
};

const getEntryId = (entry) => String(entry?.id ?? entry?._id ?? entry?.q3_id ?? "");

const displaySavedValue = (value) => {
  const normalized = String(value ?? "").trim();
  return normalized && normalized !== "-" ? normalized : "0";
};

const parseNumberValue = (value, decimals = 2) => {
  const parsed = Number(String(value ?? "").trim());
  if (Number.isNaN(parsed)) return decimals === 0 ? 0 : "0.00";
  return decimals === 0 ? Math.trunc(parsed) : parsed.toFixed(decimals);
};

const mapApiEntryToVersion = (entry) => ({
  id: getEntryId(entry),
  label: formatDisplayDate(entry?.creation_date),
  data: {
    versionId: getEntryId(entry),
    paramId: entry?.entry_id || entry?.ins_code || "",
    type: "PP - Autoconer Q3",
    countName: entry?.count_name || "",
    consigneeName: entry?.consignee_name || "",
    creationDate: normalizeDate(entry?.creation_date),
    nsl1: entry?.nsl1 == null ? "" : String(entry.nsl1),
    nsl2: entry?.nsl2 == null ? "" : String(entry.nsl2),
    nsl3: entry?.nsl3 == null ? "" : String(entry.nsl3),
    nsl4: entry?.nsl4 == null ? "" : String(entry.nsl4),
    nsl5: entry?.nsl5 == null ? "" : String(entry.nsl5),
    nsl6: entry?.nsl6 == null ? "" : String(entry.nsl6),
    nsl7: entry?.nsl7 == null ? "" : String(entry.nsl7),
    t1: entry?.t1 == null ? "" : String(entry.t1),
    t2: entry?.t2 == null ? "" : String(entry.t2),
    t3: entry?.t3 == null ? "" : String(entry.t3),
    t4: entry?.t4 == null ? "" : String(entry.t4),
    t5: entry?.t5 == null ? "" : String(entry.t5),
    pfSensing: entry?.pf_sensing == null ? "" : String(entry.pf_sensing),
    pfNoOfPeriods: entry?.pf_no_of_periods == null ? "" : String(entry.pf_no_of_periods),
    oc: entry?.oc == null ? "" : String(entry.oc),
    cp: entry?.cp == null ? "" : String(entry.cp),
    cm: entry?.cm == null ? "" : String(entry.cm),
    ccp1: entry?.ccp1 == null ? "" : String(entry.ccp1),
    ccp2: entry?.ccp2 == null ? "" : String(entry.ccp2),
    ccm1: entry?.ccm1 == null ? "" : String(entry.ccm1),
    ccm2: entry?.ccm2 == null ? "" : String(entry.ccm2),
    jp1: entry?.jp1 == null ? "" : String(entry.jp1),
    jp2: entry?.jp2 == null ? "" : String(entry.jp2),
    jp3: entry?.jp3 == null ? "" : String(entry.jp3),
    jp4: entry?.jp4 == null ? "" : String(entry.jp4),
    jp5: entry?.jp5 == null ? "" : String(entry.jp5),
    jp6: entry?.jp6 == null ? "" : String(entry.jp6),
    jp7: entry?.jp7 == null ? "" : String(entry.jp7),
    jpClearing: entry?.jp_clearing == null ? "" : String(entry.jp_clearing),
    jpUPercent: entry?.jp_u_percent == null ? "" : String(entry.jp_u_percent),
    jpJm: entry?.jp_jm == null ? "" : String(entry.jp_jm),
    fd1: entry?.fd1 == null ? "" : String(entry.fd1),
    fd2: entry?.fd2 == null ? "" : String(entry.fd2),
    fd3: entry?.fd3 == null ? "" : String(entry.fd3),
    fd4: entry?.fd4 == null ? "" : String(entry.fd4),
    fd5: entry?.fd5 == null ? "" : String(entry.fd5),
    fd6: entry?.fd6 == null ? "" : String(entry.fd6),
    referenceLength: entry?.reference_length == null ? "" : String(entry.reference_length),
    suction: entry?.suction == null ? "" : String(entry.suction),
    measurement: entry?.measurement == null ? "" : String(entry.measurement),
    upperLimit: entry?.upper_limit == null ? "" : String(entry.upper_limit),
    lowerLimit: entry?.lower_limit == null ? "" : String(entry.lower_limit),
    action: entry?.action || "",
    suctionStatus: entry?.suction_status || "",
    blocking: entry?.blocking || "",
  },
});

const isVersionComplete = (version) =>
  ["countName", "consigneeName", ...fieldDefs.map((field) => field.key)].every((field) =>
    String(version?.data?.[field] || "").trim()
  );

const buildPayload = (form, entryId = "") => ({
  entry_id: entryId || undefined,
  count_name: form.countName,
  consignee_name: form.consigneeName,
  creation_date: form.creationDate,
  nsl1: Number(parseNumberValue(form.nsl1)) || 0,
  nsl2: Number(parseNumberValue(form.nsl2)) || 0,
  nsl3: Number(parseNumberValue(form.nsl3)) || 0,
  nsl4: Number(parseNumberValue(form.nsl4)) || 0,
  nsl5: Number(parseNumberValue(form.nsl5)) || 0,
  nsl6: Number(parseNumberValue(form.nsl6)) || 0,
  nsl7: Number(parseNumberValue(form.nsl7)) || 0,
  t1: Number(parseNumberValue(form.t1)) || 0,
  t2: Number(parseNumberValue(form.t2)) || 0,
  t3: Number(parseNumberValue(form.t3)) || 0,
  t4: Number(parseNumberValue(form.t4)) || 0,
  t5: Number(parseNumberValue(form.t5)) || 0,
  pf_sensing: Number(parseNumberValue(form.pfSensing)) || 0,
  pf_no_of_periods: Number(parseNumberValue(form.pfNoOfPeriods, 0)) || 0,
  oc: Number(parseNumberValue(form.oc)) || 0,
  cp: Number(parseNumberValue(form.cp)) || 0,
  cm: Number(parseNumberValue(form.cm)) || 0,
  ccp1: Number(parseNumberValue(form.ccp1)) || 0,
  ccp2: Number(parseNumberValue(form.ccp2)) || 0,
  ccm1: Number(parseNumberValue(form.ccm1)) || 0,
  ccm2: Number(parseNumberValue(form.ccm2)) || 0,
  jp1: Number(parseNumberValue(form.jp1)) || 0,
  jp2: Number(parseNumberValue(form.jp2)) || 0,
  jp3: Number(parseNumberValue(form.jp3)) || 0,
  jp4: Number(parseNumberValue(form.jp4)) || 0,
  jp5: Number(parseNumberValue(form.jp5)) || 0,
  jp6: Number(parseNumberValue(form.jp6)) || 0,
  jp7: Number(parseNumberValue(form.jp7)) || 0,
  jp_clearing: Number(parseNumberValue(form.jpClearing)) || 0,
  jp_u_percent: Number(parseNumberValue(form.jpUPercent)) || 0,
  jp_jm: Number(parseNumberValue(form.jpJm)) || 0,
  fd1: Number(parseNumberValue(form.fd1)) || 0,
  fd2: Number(parseNumberValue(form.fd2)) || 0,
  fd3: Number(parseNumberValue(form.fd3)) || 0,
  fd4: Number(parseNumberValue(form.fd4)) || 0,
  fd5: Number(parseNumberValue(form.fd5)) || 0,
  fd6: Number(parseNumberValue(form.fd6)) || 0,
  reference_length: Number(parseNumberValue(form.referenceLength)) || 0,
  suction: Number(parseNumberValue(form.suction)) || 0,
  measurement: Number(parseNumberValue(form.measurement)) || 0,
  upper_limit: Number(parseNumberValue(form.upperLimit)) || 0,
  lower_limit: Number(parseNumberValue(form.lowerLimit)) || 0,
  action: form.action,
  suction_status: form.suctionStatus,
  blocking: form.blocking,
});

const AutoconerQ3 = forwardRef(function AutoconerQ3(
  {
    selectedType = "PP - Autoconer Q3",
    onTypeChange,
    types = [],
    savedVersionsTargetId = "",
    entryId = "",
  },
  ref
) {
  const [versions, setVersions] = useState([]);
  const [form, setForm] = useState(() => createDefaultForm(selectedType));
  const [errors, setErrors] = useState({});
  const [expandedVersionId, setExpandedVersionId] = useState(null);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [versionsError, setVersionsError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { countOptions: masterCountOptions } = useAutoconerCountOptions();

  const countOptions = useMemo(
    () =>
      Array.from(
        new Set(
          masterCountOptions
            .map((option) => String(option?.count_name || option?.label || option?.value || "").trim())
            .filter(Boolean)
            .concat(
              versions
            .map((version) => String(version?.data?.countName || "").trim())
            .filter(Boolean)
            )
            .concat(String(form.countName || "").trim() ? [String(form.countName || "").trim()] : [])
        )
      ),
    [form.countName, masterCountOptions, versions]
  );

  const consigneeOptions = useMemo(
    () =>
      Array.from(
        new Set(
          versions
            .map((version) => String(version?.data?.consigneeName || "").trim())
            .filter(Boolean)
            .concat(
              String(form.consigneeName || "").trim()
                ? [String(form.consigneeName || "").trim()]
                : []
            )
        )
      ),
    [form.consigneeName, versions]
  );

  const loadVersions = async () => {
    setLoadingVersions(true);
    try {
      const response = await fetchAutoconerQ3Entries({ page: 1, limit: 10 });
      const rows = Array.isArray(response?.data) ? response.data : Array.isArray(response) ? response : [];
      const nextVersions = rows
        .map(mapApiEntryToVersion)
        .sort((left, right) => Number(right.id) - Number(left.id));

      setVersions(nextVersions);
      setVersionsError("");

      if (nextVersions.length > 0) {
        const latestCompleteVersion = nextVersions.find(isVersionComplete) || nextVersions[0];
        setForm((current) => {
          const activeVersion =
            nextVersions.find((item) => item.id === current.versionId) || latestCompleteVersion;
          return { ...activeVersion.data, versionId: activeVersion.id, type: selectedType };
        });
        setExpandedVersionId(latestCompleteVersion?.id || null);
      } else {
        setForm(createDefaultForm(selectedType));
        setExpandedVersionId(null);
      }
    } catch (error) {
      setVersions([]);
      setExpandedVersionId(null);
      setVersionsError(error.message || "Unable to load saved versions.");
    } finally {
      setLoadingVersions(false);
    }
  };

  useEffect(() => {
    loadVersions();
  }, []);

  useEffect(() => {
    setForm((current) => ({
      ...current,
      type: selectedType || "PP - Autoconer Q3",
    }));
  }, [selectedType]);

  const clearError = (field) => {
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const handleFieldChange = (field, value) => {
    const fieldDef = fieldDefs.find((item) => item.key === field);
    const nextValue = fieldDef?.numeric
      ? sanitizeNumericInput(value, {
          precision: 10,
          scale: fieldDef.integer ? 0 : 2,
          integerOnly: fieldDef.integer,
        })
      : value;

    setForm((current) => {
      const nextForm = { ...current, [field]: nextValue };
      if (
        (field === "countName" || field === "consigneeName") &&
        String(current[field] || "").trim() !== String(nextValue || "").trim()
      ) {
        nextForm.versionId = "";
        nextForm.paramId = "";
      }
      return nextForm;
    });
    clearError(field);
  };

  const handleVersionSelect = (version) => {
    setForm({ ...version.data, versionId: version.id, type: selectedType });
    setErrors({});
    setSubmitError("");
  };

  const handleVersionToggle = (version) => {
    handleVersionSelect(version);
    if (!isVersionComplete(version)) {
      setExpandedVersionId(null);
      return;
    }
    setExpandedVersionId((current) => (current === version.id ? null : version.id));
  };

  const validate = () => {
    const nextErrors = {};
    if (!String(selectedType || "").trim()) nextErrors.selectedType = true;
    if (!String(form.countName || "").trim()) nextErrors.countName = true;
    if (!String(form.consigneeName || "").trim()) nextErrors.consigneeName = true;
    if (!String(form.creationDate || "").trim()) nextErrors.creationDate = true;
    fieldDefs.forEach((field) => {
      if (!String(form[field.key] || "").trim()) nextErrors[field.key] = true;
    });
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const getPreviewData = () => [
    { label: "Type", value: selectedType || "-" },
    { label: "Count Name", value: form.countName || "-" },
    { label: "Consignee Name", value: form.consigneeName || "-" },
    { label: "Entry ID", value: entryId || "-" },
    ...fieldDefs.map((field) => ({
      label: field.label,
      value: form[field.key] || "-",
    })),
  ];

  const submit = async () => {
    if (!validate()) return false;

    try {
      setIsSubmitting(true);
      setSubmitError("");
      const payload = buildPayload(form, entryId);
      const selectedExistingVersion = versions.find((item) => item.id === form.versionId);

      if (selectedExistingVersion) {
        const { entry_id, ...updatePayload } = payload;
        await updateAutoconerQ3Entry(selectedExistingVersion.id, updatePayload);
      } else {
        await submitAutoconerQ3Entry(payload);
      }

      await loadVersions();
      return true;
    } catch (error) {
      const errorMessage = String(error?.message || "");
      setSubmitError(
        /duplicate entry_id/i.test(errorMessage)
          ? "Entry ID already exists. Please clear and save again to generate next ID."
          : errorMessage || "Unable to submit the form."
      );
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  const clear = () => {
    setForm(createDefaultForm(selectedType));
    setErrors({});
    setSubmitError("");
  };

  useImperativeHandle(ref, () => ({
    validate,
    submit,
    clear,
    getPreviewData,
  }));

  const savedVersionsPortal =
    typeof document !== "undefined" && savedVersionsTargetId
      ? document.getElementById(savedVersionsTargetId)
      : null;

  const historySection = (
    <div className={styles.historyWrap}>
      {loadingVersions ? <div className={styles.infoBox}>Loading saved versions...</div> : null}
      {!loadingVersions && versionsError ? (
        <div className={styles.errorMessage}>{versionsError}</div>
      ) : null}
      {!loadingVersions && !versionsError && versions.length === 0 ? (
        <div className={styles.infoBox}>No saved versions found in the database.</div>
      ) : null}

      {versions.map((version) => {
        const isComplete = isVersionComplete(version);
        const isExpanded = expandedVersionId === version.id && isComplete;
        const isActive = version.id === form.versionId;

        return (
          <div key={version.id} className={styles.versionCard}>
            <div className={`${styles.versionHeader} ${isActive ? styles.versionHeaderActive : ""}`}>
              <button type="button" className={styles.versionCell} onClick={() => handleVersionSelect(version)}>
                <span className={styles.cellLabel}>Param ID</span>
                <span className={styles.cellValue}>{displaySavedValue(version.data.paramId)}</span>
              </button>

              <button type="button" className={styles.versionCell} onClick={() => handleVersionSelect(version)}>
                <span className={styles.cellLabel}>Consignee Name</span>
                <span className={styles.cellValue}>{displaySavedValue(version.data.consigneeName)}</span>
              </button>

              <button type="button" className={styles.versionCell} onClick={() => handleVersionSelect(version)}>
                <span className={styles.cellLabel}>Count Name</span>
                <span className={styles.cellValue}>{displaySavedValue(version.data.countName)}</span>
              </button>

              <div className={styles.statusCell}>
                {isComplete ? <FaCheckCircle className={styles.checkIcon} /> : null}
              </div>

              <button
                type="button"
                className={styles.expandButton}
                onClick={() => handleVersionToggle(version)}
                aria-label={isExpanded ? "Collapse saved version details" : "Expand saved version details"}
              >
                {isExpanded ? <HiChevronUp /> : <HiChevronDown />}
              </button>
            </div>

            {isExpanded ? (
              <div className={styles.versionBody}>
                <div className={styles.savedFieldsGrid}>
                  {fieldDefs.map((field) => (
                    <div key={`${version.id}-${field.key}`} className={styles.savedFieldCard}>
                      <div className={styles.cellLabel}>{field.label}</div>
                      <div className={styles.savedValue}>{displaySavedValue(version.data[field.key])}</div>
                    </div>
                  ))}
                </div>
                <div className={styles.versionDate}>{version.label}</div>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );

  return (
    <>
      <div className={styles.container}>
        <div className={styles.topGrid}>
          <div className={styles.fieldGroup}>
            <label>Type</label>
            <select
              className={`${styles.field}${errors.selectedType ? ` ${styles.errorField}` : ""}`}
              value={selectedType}
              onChange={(event) => onTypeChange?.(event.target.value)}
            >
              <option value="">Select Type</option>
              {types.map((item) => (
                <option key={item.id} value={item.name}>
                  {item.displayName ?? item.name}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.fieldGroup}>
            <label>Count Name</label>
            <select
              className={`${styles.field}${errors.countName ? ` ${styles.errorField}` : ""}`}
              value={form.countName}
              onChange={(event) => handleFieldChange("countName", event.target.value)}
            >
              <option value="">Select Count Name</option>
              {countOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.fieldGroup}>
            <label>Consignee Name</label>
            <select
              className={`${styles.field}${errors.consigneeName ? ` ${styles.errorField}` : ""}`}
              value={form.consigneeName}
              onChange={(event) => handleFieldChange("consigneeName", event.target.value)}
            >
              <option value="">Select Consignee Name</option>
              {consigneeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.fieldGroup}>
            <label>Entry ID</label>
            <input
              type="text"
              className={styles.field}
              value={entryId}
              readOnly
              disabled
            />
          </div>
        </div>

        <div className={styles.fieldsGrid}>
          {fieldDefs.map((field) => (
            <div
              key={field.key}
              className={`${styles.fieldGroup}${field.wide ? ` ${styles.wideField}` : ""}`}
            >
              <label>{field.label}</label>
              <input
                type="text"
                className={`${styles.field}${errors[field.key] ? ` ${styles.errorField}` : ""}`}
                value={form[field.key]}
                onChange={(event) => handleFieldChange(field.key, event.target.value)}
              />
            </div>
          ))}
        </div>

        {submitError ? <div className={styles.errorMessage}>{submitError}</div> : null}
        {isSubmitting ? <div className={styles.loadingMessage}>Submitting...</div> : null}
      </div>

      {savedVersionsPortal ? createPortal(historySection, savedVersionsPortal) : historySection}
    </>
  );
});

export default AutoconerQ3;
