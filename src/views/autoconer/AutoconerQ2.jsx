import { createPortal } from "react-dom";
import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { FaCheckCircle } from "react-icons/fa";
import { HiChevronDown, HiChevronUp } from "react-icons/hi2";

import SearchableSelect from "@/components/SearchableSelect";
import useMixingCountOptions from "@/hooks/useMixingCountOptions";
import {
  buildProcessParameterOptions,
  PROCESS_PARAMETER_CONSIGNEE_OPTIONS,
  PROCESS_PARAMETER_COUNT_OPTIONS,
} from "@/data/processParameterMasterOptions";
import { sanitizeNumericInput } from "@/utils/inputValidation";
import {
  normalizeProcessParameterId,
  reserveGlobalProcessParameterId,
  resolveProcessParameterDisplayId,
} from "@/utils/processParameterId";
import { registerProcessParameterId } from "@/utils/processParameterRegistry";
import {
  submitAutoconerQ2Entry,
  updateAutoconerQ2Entry,
  fetchAutoconerQ2Entries,
} from "@/apis/autoconer";
import styles from "@/styles/AutoconerQ2.module.css";


const fieldDefs = [
  { key: "nValue", label: "N", numeric: true },
  { key: "sValue", label: "S", numeric: true },
  { key: "lValue", label: "L", numeric: true },
  { key: "lh1", label: "LH1", numeric: true },
  { key: "lh2", label: "LH2", numeric: true },
  { key: "lh3", label: "LH3", numeric: true },
  { key: "lh4", label: "LH4", numeric: true },
  { key: "lh5", label: "LH5", numeric: true },
  { key: "lh6", label: "LH6", numeric: true },
  { key: "tht", label: "THT", numeric: true },
  { key: "th1", label: "TH1", numeric: true },
  { key: "th2", label: "TH2", numeric: true },
  { key: "th3", label: "TH3", numeric: true },
  { key: "th4", label: "TH4", numeric: true },
  { key: "th5", label: "TH5", numeric: true },
  { key: "th6", label: "TH6", numeric: true },
  { key: "cp", label: "CP", numeric: true },
  { key: "cm", label: "CM", numeric: true },
  { key: "ccp", label: "CCP", numeric: true },
  { key: "ccm", label: "CCM", numeric: true },
  { key: "pc", label: "PC", numeric: true },
  { key: "faultDistance", label: "Fault Distance", numeric: true, wide: true },
  { key: "noOfFaults", label: "No. of Faults", numeric: true, integer: true, wide: true },
  { key: "jp", label: "JP", numeric: true },
  { key: "jm", label: "JM", numeric: true },
  { key: "up", label: "UP", numeric: true },
  { key: "fl", label: "FL", numeric: true },
  { key: "flh1", label: "FLH1", numeric: true },
  { key: "flh2", label: "FLH2", numeric: true },
  { key: "flh3", label: "FLH3", numeric: true },
  { key: "flh4", label: "FLH4", numeric: true },
  { key: "fd", label: "FD", numeric: true },
  { key: "fdh1", label: "FDH1", numeric: true },
  { key: "fdh2", label: "FDH2", numeric: true },
  { key: "fdh3", label: "FDH3", numeric: true },
  { key: "fdh4", label: "FDH4", numeric: true },
  { key: "fdh5", label: "FDH5", numeric: true },
  { key: "referenceLength", label: "Reference Length", numeric: true, wide: true },
  { key: "measurement", label: "Measurement", numeric: true, wide: true },
  { key: "upperAlarmLimit", label: "Upper Alarm Limit", numeric: true, wide: true },
  { key: "lowerAlarmLimit", label: "Lower Alarm Limit", numeric: true, wide: true },
  { key: "action", label: "Action" },
];

const createDefaultForm = (selectedType = "PP - Autoconer Q2") => ({
  versionId: "",
  paramId: "",
  type: selectedType || "PP - Autoconer Q2",
  countName: "",
  consigneeName: "",
  creationDate: new Date().toISOString().split("T")[0],
  nValue: "",
  sValue: "",
  lValue: "",
  lh1: "",
  lh2: "",
  lh3: "",
  lh4: "",
  lh5: "",
  lh6: "",
  tht: "",
  th1: "",
  th2: "",
  th3: "",
  th4: "",
  th5: "",
  th6: "",
  cp: "",
  cm: "",
  ccp: "",
  ccm: "",
  pc: "",
  faultDistance: "",
  noOfFaults: "",
  jp: "",
  jm: "",
  up: "",
  fl: "",
  flh1: "",
  flh2: "",
  flh3: "",
  flh4: "",
  fd: "",
  fdh1: "",
  fdh2: "",
  fdh3: "",
  fdh4: "",
  fdh5: "",
  referenceLength: "",
  measurement: "",
  upperAlarmLimit: "",
  lowerAlarmLimit: "",
  action: "",
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

const getEntryId = (entry) => String(entry?.id ?? entry?._id ?? entry?.q2_id ?? "");

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
    type: "PP - Autoconer Q2",
    countName: entry?.count_name || "",
    consigneeName: entry?.consignee_name || "",
    creationDate: normalizeDate(entry?.creation_date),
    nValue: entry?.n_value == null ? "" : String(entry.n_value),
    sValue: entry?.s_value == null ? "" : String(entry.s_value),
    lValue: entry?.l_value == null ? "" : String(entry.l_value),
    lh1: entry?.lh1 == null ? "" : String(entry.lh1),
    lh2: entry?.lh2 == null ? "" : String(entry.lh2),
    lh3: entry?.lh3 == null ? "" : String(entry.lh3),
    lh4: entry?.lh4 == null ? "" : String(entry.lh4),
    lh5: entry?.lh5 == null ? "" : String(entry.lh5),
    lh6: entry?.lh6 == null ? "" : String(entry.lh6),
    tht: entry?.tht == null ? "" : String(entry.tht),
    th1: entry?.th1 == null ? "" : String(entry.th1),
    th2: entry?.th2 == null ? "" : String(entry.th2),
    th3: entry?.th3 == null ? "" : String(entry.th3),
    th4: entry?.th4 == null ? "" : String(entry.th4),
    th5: entry?.th5 == null ? "" : String(entry.th5),
    th6: entry?.th6 == null ? "" : String(entry.th6),
    cp: entry?.cp == null ? "" : String(entry.cp),
    cm: entry?.cm == null ? "" : String(entry.cm),
    ccp: entry?.ccp == null ? "" : String(entry.ccp),
    ccm: entry?.ccm == null ? "" : String(entry.ccm),
    pc: entry?.pc == null ? "" : String(entry.pc),
    faultDistance: entry?.fault_distance == null ? "" : String(entry.fault_distance),
    noOfFaults: entry?.no_of_faults == null ? "" : String(entry.no_of_faults),
    jp: entry?.jp == null ? "" : String(entry.jp),
    jm: entry?.jm == null ? "" : String(entry.jm),
    up: entry?.up == null ? "" : String(entry.up),
    fl: entry?.fl == null ? "" : String(entry.fl),
    flh1: entry?.flh1 == null ? "" : String(entry.flh1),
    flh2: entry?.flh2 == null ? "" : String(entry.flh2),
    flh3: entry?.flh3 == null ? "" : String(entry.flh3),
    flh4: entry?.flh4 == null ? "" : String(entry.flh4),
    fd: entry?.fd == null ? "" : String(entry.fd),
    fdh1: entry?.fdh1 == null ? "" : String(entry.fdh1),
    fdh2: entry?.fdh2 == null ? "" : String(entry.fdh2),
    fdh3: entry?.fdh3 == null ? "" : String(entry.fdh3),
    fdh4: entry?.fdh4 == null ? "" : String(entry.fdh4),
    fdh5: entry?.fdh5 == null ? "" : String(entry.fdh5),
    referenceLength: entry?.reference_length == null ? "" : String(entry.reference_length),
    measurement: entry?.measurement == null ? "" : String(entry.measurement),
    upperAlarmLimit: entry?.upper_alarm_limit == null ? "" : String(entry.upper_alarm_limit),
    lowerAlarmLimit: entry?.lower_alarm_limit == null ? "" : String(entry.lower_alarm_limit),
    action: entry?.action || "",
  },
});

const isVersionComplete = (version) =>
  ["countName", "consigneeName", ...fieldDefs.map((field) => field.key)].every((field) =>
    String(version?.data?.[field] || "").trim()
  );

const buildPayload = (form, entryId = "") => ({
  entry_id: (form.paramId || entryId) || undefined,
  count_name: form.countName,
  consignee_name: form.consigneeName,
  creation_date: form.creationDate,
  n_value: Number(parseNumberValue(form.nValue)) || 0,
  s_value: Number(parseNumberValue(form.sValue)) || 0,
  l_value: Number(parseNumberValue(form.lValue)) || 0,
  lh1: Number(parseNumberValue(form.lh1)) || 0,
  lh2: Number(parseNumberValue(form.lh2)) || 0,
  lh3: Number(parseNumberValue(form.lh3)) || 0,
  lh4: Number(parseNumberValue(form.lh4)) || 0,
  lh5: Number(parseNumberValue(form.lh5)) || 0,
  lh6: Number(parseNumberValue(form.lh6)) || 0,
  tht: Number(parseNumberValue(form.tht)) || 0,
  th1: Number(parseNumberValue(form.th1)) || 0,
  th2: Number(parseNumberValue(form.th2)) || 0,
  th3: Number(parseNumberValue(form.th3)) || 0,
  th4: Number(parseNumberValue(form.th4)) || 0,
  th5: Number(parseNumberValue(form.th5)) || 0,
  th6: Number(parseNumberValue(form.th6)) || 0,
  cp: Number(parseNumberValue(form.cp)) || 0,
  cm: Number(parseNumberValue(form.cm)) || 0,
  ccp: Number(parseNumberValue(form.ccp)) || 0,
  ccm: Number(parseNumberValue(form.ccm)) || 0,
  pc: Number(parseNumberValue(form.pc)) || 0,
  fault_distance: Number(parseNumberValue(form.faultDistance)) || 0,
  no_of_faults: Number(parseNumberValue(form.noOfFaults, 0)) || 0,
  jp: Number(parseNumberValue(form.jp)) || 0,
  jm: Number(parseNumberValue(form.jm)) || 0,
  up: Number(parseNumberValue(form.up)) || 0,
  fl: Number(parseNumberValue(form.fl)) || 0,
  flh1: Number(parseNumberValue(form.flh1)) || 0,
  flh2: Number(parseNumberValue(form.flh2)) || 0,
  flh3: Number(parseNumberValue(form.flh3)) || 0,
  flh4: Number(parseNumberValue(form.flh4)) || 0,
  fd: Number(parseNumberValue(form.fd)) || 0,
  fdh1: Number(parseNumberValue(form.fdh1)) || 0,
  fdh2: Number(parseNumberValue(form.fdh2)) || 0,
  fdh3: Number(parseNumberValue(form.fdh3)) || 0,
  fdh4: Number(parseNumberValue(form.fdh4)) || 0,
  fdh5: Number(parseNumberValue(form.fdh5)) || 0,
  reference_length: Number(parseNumberValue(form.referenceLength)) || 0,
  measurement: Number(parseNumberValue(form.measurement)) || 0,
  upper_alarm_limit: Number(parseNumberValue(form.upperAlarmLimit)) || 0,
  lower_alarm_limit: Number(parseNumberValue(form.lowerAlarmLimit)) || 0,
  action: form.action,
});

const AutoconerQ2 = forwardRef(function AutoconerQ2(
  {
    selectedType = "PP - Autoconer Q2",
    onTypeChange,
    types = [],
    savedVersionsTargetId = "",
    entryId = "",
    nextEntryIdPreview = "",
    lockedCountName = "",
  },
  ref
) {
  const [versions, setVersions] = useState([]);
  const [form, setForm] = useState(() => createDefaultForm(selectedType));
  const [errors, setErrors] = useState({});
  const [expandedVersionId, setExpandedVersionId] = useState(null);
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previewNextId, setPreviewNextId] = useState("");
  const displayEntryId = form.paramId || entryId || previewNextId || "Generating next ID...";

  const { countOptions: masterCountOptions } = useMixingCountOptions();
  const countOptions = buildProcessParameterOptions(
    masterCountOptions.length
      ? masterCountOptions.map((option) => option.count_name || option.label || option.value)
      : PROCESS_PARAMETER_COUNT_OPTIONS,
    [],
    form.countName
  );
  const consigneeOptions = buildProcessParameterOptions(
    PROCESS_PARAMETER_CONSIGNEE_OPTIONS,
    versions.map((version) => version?.data?.consigneeName),
    form.consigneeName
  );

  const loadVersions = async () => {
    let response;
    try {
      response = await fetchAutoconerQ2Entries({ page: 1, limit: 200 });
    } catch {
      setVersions([]);
      setForm({ ...createDefaultForm(selectedType), paramId: entryId || "" });
      setExpandedVersionId(null);
      setSavedProcessParameterId(entryId || "");
      return;
    }
    const rows = Array.isArray(response?.data) ? response.data : [];
    const nextVersions = rows
      .map(mapApiEntryToVersion)
      .sort((left, right) => Number(right.id) - Number(left.id));

    setVersions(nextVersions);

    if (nextVersions.length > 0) {
      const latestCompleteVersion = nextVersions.find(isVersionComplete) || nextVersions[0];
      const matchByEntryId = entryId
        ? nextVersions.find(
            (item) => normalizeProcessParameterId(item.data.paramId) === normalizeProcessParameterId(entryId)
          )
        : null;
      if (matchByEntryId) {
        setForm({
          ...matchByEntryId.data,
          versionId: matchByEntryId.id,
          paramId: entryId || matchByEntryId.data.paramId || "",
          type: selectedType,
        });
      } else {
        setForm({ ...createDefaultForm(selectedType), paramId: entryId || "" });
      }
      setExpandedVersionId(latestCompleteVersion?.id || null);
    } else {
      setForm({ ...createDefaultForm(selectedType), paramId: entryId || "" });
      setExpandedVersionId(null);
    }
  };

  useEffect(() => {
    loadVersions();
  }, []);

  useEffect(() => {
    if (entryId) return;
    if (nextEntryIdPreview) {
      setPreviewNextId(nextEntryIdPreview);
      return;
    }
    let cancelled = false;
    reserveGlobalProcessParameterId("PP", 4).then((nextId) => {
      if (!cancelled) setPreviewNextId(nextId);
    });
    return () => {
      cancelled = true;
    };
  }, [entryId, nextEntryIdPreview]);

  useEffect(() => {
    setForm((current) => ({
      ...current,
      type: selectedType || "PP - Autoconer Q2",
    }));
  }, [selectedType]);

  useEffect(() => {
    if (!lockedCountName) return;
    setForm((current) =>
      current.countName === lockedCountName ? current : { ...current, countName: lockedCountName }
    );
  }, [lockedCountName, versions]);

  const clearError = (field) => {
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const findLatestVersionByCountName = (countName) => {
    const normalizeCountName = (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
    const normalized = normalizeCountName(countName);
    if (!normalized) return null;
    return (
      versions
        .filter((version) => normalizeCountName(version.data.countName) === normalized)
        .sort((a, b) => {
          const sortValue = (v) => {
            const paramId = String(v?.data?.paramId || "").trim();
            const numericParamId = Number(paramId);
            if (paramId && Number.isFinite(numericParamId)) return numericParamId;
            if (paramId) return paramId.toLowerCase();
            const numericId = Number(v?.id);
            return Number.isFinite(numericId) ? numericId : String(v?.id || "").toLowerCase();
          };
          const aValue = sortValue(a);
          const bValue = sortValue(b);
          if (typeof aValue === "number" && typeof bValue === "number") return bValue - aValue;
          return String(bValue).localeCompare(String(aValue), undefined, {
            numeric: true,
            sensitivity: "base",
          });
        })[0] || null
    );
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
      if (field === "countName" && !entryId && !current.versionId) {
        const match = findLatestVersionByCountName(nextValue);
        if (match) {
          return { ...match.data, countName: nextValue, versionId: "", paramId: current.paramId, type: selectedType };
        }
      }

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
    setForm({
      ...createDefaultForm(selectedType),
      ...version.data,
      versionId: version.id,
      type: selectedType,
    });
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
    { label: "Entry ID", value: form.paramId || entryId || "-" },
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
      const response = form.versionId
        ? await updateAutoconerQ2Entry(form.versionId, payload)
        : await submitAutoconerQ2Entry(payload);

      const nextParamId = resolveProcessParameterDisplayId(response, form.paramId || entryId);
      setForm((current) => ({ ...current, paramId: nextParamId }));
      registerProcessParameterId(response, "Autoconer", form.countName);

      await loadVersions();
      return true;
    } catch (error) {
      setSubmitError(error?.message || "Unable to submit the form.");
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
      {versions.length === 0 ? (
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
              {types.map((item) => {
                const value = typeof item === "string" ? item : String(item?.name ?? "").trim();
                const label = typeof item === "string" ? item : String(item?.displayName ?? item?.name ?? "").trim();
                return (
                  <option key={value} value={value}>
                    {label || value}
                  </option>
                );
              })}
            </select>
          </div>

          <div className={styles.fieldGroup}>
            <label>Count Name</label>
            <SearchableSelect
              className={`${styles.field}${errors.countName ? ` ${styles.errorField}` : ""}`}
              value={form.countName || ""}
              onChange={(value) => handleFieldChange("countName", value)}
              options={countOptions}
              placeholder="Search or select count name"
              ariaLabel="Count Name"
              disabled={Boolean(lockedCountName)}
            />
          </div>

          <div className={styles.fieldGroup}>
            <label>Consignee Name</label>
            <SearchableSelect
              className={`${styles.field}${errors.consigneeName ? ` ${styles.errorField}` : ""}`}
              value={form.consigneeName || ""}
              onChange={(value) => handleFieldChange("consigneeName", value)}
              options={consigneeOptions}
              placeholder="Search or select consignee name"
              ariaLabel="Consignee Name"
            />
          </div>

          <div className={styles.fieldGroup}>
            <label>Entry ID</label>
            <input
              type="text"
              className={styles.field}
              value={displayEntryId}
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
                  value={form[field.key] || ""}
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

export default AutoconerQ2;
