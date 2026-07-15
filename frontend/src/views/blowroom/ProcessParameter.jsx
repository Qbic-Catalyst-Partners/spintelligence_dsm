import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { HiChevronDown, HiChevronUp } from "react-icons/hi2";
import { FaCheckCircle } from "react-icons/fa";
import SearchableSelect from "@/components/SearchableSelect";
import useMixingCountOptions from "@/hooks/useMixingCountOptions";

import {
  buildProcessParameterOptions,
  PROCESS_PARAMETER_CONSIGNEE_OPTIONS,
  PROCESS_PARAMETER_COUNT_OPTIONS,
} from "@/data/processParameterMasterOptions";
import { sanitizeNumericInput } from "@/utils/inputValidation";
import {
  coerceProcessParameterId,
  normalizeProcessParameterId,
  reserveGlobalProcessParameterId,
  resolveProcessParameterDisplayId,
} from "@/utils/processParameterId";
import { registerProcessParameterId } from "@/utils/processParameterRegistry";
import {
  saveBlowroomProcessParameterApi,
  updateBlowroomProcessParameterApi,
  fetchBlowroomProcessParametersApi,
} from "@/apis/blowroom";
import styles from "@/styles/ProcessParameter.module.css";

const createDefaultForm = (selectedTypeName = "Process Parameter") => ({
  versionId: "",
  paramId: "",
  type: selectedTypeName || "Process Parameter",
  countName: "",
  consigneeName: "",
  creationDate: new Date().toISOString().split("T")[0],
  lineNumbers: "",
  rotaryBeaterSpeed: "",
  depth: "",
  mpmDeliverySpeed: "",
  mpmDeliveryPascals: "",
  condensorSpeed: "",
  rkFeedRollBeater: "",
  rkBeaterSpeed: "",
  flexiToFeedRollBeater: "",
  flexiBeaterSpeed: "",
  scutcherNo: "",
  rkMoSpeed: "",
  kbSpeed: "",
  gridBar: "",
  lapWeight: "",
  uniclean: "",
  srs: "",
  rkFlexi: "",
});

const fieldDefs = [
  { key: "lineNumbers", label: "Line Numbers" },
  { key: "rotaryBeaterSpeed", label: "Rotary Beater Speed" },
  { key: "depth", label: "Depth" },
  { key: "mpmDeliverySpeed", label: "MPM Delivery Speed" },
  { key: "mpmDeliveryPascals", label: "MPM Delivery Pascals" },
  { key: "condensorSpeed", label: "Condensor Speed" },
  { key: "rkFeedRollBeater", label: "RK Feed Roll Beater" },
  { key: "rkBeaterSpeed", label: "RK Beater Speed" },
  { key: "flexiToFeedRollBeater", label: "Flexi to Feed Roll Beater" },
  { key: "flexiBeaterSpeed", label: "Flexi Beater Speed" },
  { key: "scutcherNo", label: "Scutcher No" },
  { key: "rkMoSpeed", label: "RK MO Speed" },
  { key: "kbSpeed", label: "KB Speed" },
  { key: "gridBar", label: "Grid Bar" },
  { key: "lapWeight", label: "Lap Weight" },
  { key: "uniclean", label: "Uniclean" },
  { key: "srs", label: "SRS" },
  { key: "rkFlexi", label: "RK Flexi" },
];

const topFieldClass = styles.topField;
const numericKeys = new Set(fieldDefs.map((field) => field.key));

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

const parseNumberValue = (value, decimals = 2) => {
  const parsed = Number(String(value ?? "").trim());
  if (Number.isNaN(parsed)) return decimals === 0 ? 0 : "0.00";
  return decimals === 0 ? Math.trunc(parsed) : parsed.toFixed(decimals);
};

const getEntryId = (entry) =>
  String(entry?.br_id ?? entry?.id ?? entry?._id ?? entry?.process_parameter_id ?? entry?.parameter_id ?? entry?.param_id ?? "");

const getDisplayEntryId = (entry) =>
  String(entry?.entry_id ?? entry?.display_entry_id ?? entry?.process_parameter_id ?? entry?.parameter_id ?? entry?.param_id ?? entry?.br_code ?? "");

const mapApiEntryToVersion = (entry) => ({
  id: getEntryId(entry),
  status: "DONE",
  label: formatDisplayDate(entry?.creation_date),
  data: {
    versionId: getEntryId(entry),
    paramId: coerceProcessParameterId(getDisplayEntryId(entry)),
    type: "Process Parameter",
    countName: entry?.count_name || "",
    consigneeName: entry?.consignee_name || "",
    creationDate: normalizeDate(entry?.creation_date),
    lineNumbers: entry?.line_numbers == null ? "" : String(entry.line_numbers),
    rotaryBeaterSpeed: entry?.rotary_beater_speed == null ? "" : String(entry.rotary_beater_speed),
    depth: entry?.depth == null ? "" : String(entry.depth),
    mpmDeliverySpeed: entry?.mpm_delivery_speed == null ? "" : String(entry.mpm_delivery_speed),
    mpmDeliveryPascals: entry?.mpm_delivery_pascals == null ? "" : String(entry.mpm_delivery_pascals),
    condensorSpeed: entry?.condensor_speed == null ? "" : String(entry.condensor_speed),
    rkFeedRollBeater: entry?.rk_feed_roll_beater == null ? "" : String(entry.rk_feed_roll_beater),
    rkBeaterSpeed: entry?.rk_beater_speed == null ? "" : String(entry.rk_beater_speed),
    flexiToFeedRollBeater:
      entry?.flexi_to_feed_roll_beater == null ? "" : String(entry.flexi_to_feed_roll_beater),
    flexiBeaterSpeed: entry?.flexi_beater_speed == null ? "" : String(entry.flexi_beater_speed),
    scutcherNo: entry?.scutcher_no == null ? "" : String(entry.scutcher_no),
    rkMoSpeed: entry?.rk_mo_speed == null ? "" : String(entry.rk_mo_speed),
    kbSpeed: entry?.kb_speed == null ? "" : String(entry.kb_speed),
    gridBar: entry?.grid_bar == null ? "" : String(entry.grid_bar),
    lapWeight: entry?.lap_weight == null ? "" : String(entry.lap_weight),
    uniclean: entry?.uniclean == null ? "" : String(entry.uniclean),
    srs: entry?.srs == null ? "" : String(entry.srs),
    rkFlexi: entry?.rk_flexi == null ? "" : String(entry.rk_flexi),
  },
});

const isVersionComplete = (version) =>
  ["countName", "consigneeName", ...fieldDefs.map((field) => field.key)].every((field) =>
    String(version?.data?.[field] || "").trim()
  );

const displaySavedValue = (value) => {
  const normalized = String(value ?? "").trim();
  return normalized && normalized !== "-" ? normalized : "0";
};

const ProcessParameter = forwardRef(function ProcessParameter(
  { entryId = "", nextEntryIdPreview = "", selectedTypeName = "Process Parameter", onTypeChange, typeOptions = [], savedVersionsTargetId = "", lockedCountName = "" },
  ref
) {
  const [versions, setVersions] = useState([]);
  const [form, setForm] = useState(() => createDefaultForm(selectedTypeName));
  const [errors, setErrors] = useState({});
  const [expandedVersionId, setExpandedVersionId] = useState(null);
  const [submitError, setSubmitError] = useState("");
  const [savedProcessParameterId, setSavedProcessParameterId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previewNextId, setPreviewNextId] = useState("");

  const consigneeOptions = useMemo(
    () =>
      buildProcessParameterOptions(
        PROCESS_PARAMETER_CONSIGNEE_OPTIONS,
        versions.map((version) => version?.data?.consigneeName),
        form.consigneeName
      ),
    [form.consigneeName, versions]
  );

  const { countOptions: masterCountOptions } = useMixingCountOptions();
  const countOptions = useMemo(
    () =>
      buildProcessParameterOptions(
        masterCountOptions.length
          ? masterCountOptions.map((option) => option.count_name || option.label || option.value)
          : PROCESS_PARAMETER_COUNT_OPTIONS,
        [],
        form.countName
      ),
    [form.countName, masterCountOptions]
  );

  const loadVersions = async () => {
    let response;
    try {
      response = await fetchBlowroomProcessParametersApi({ page: 1, limit: 200 });
    } catch {
      setVersions([]);
      setForm({ ...createDefaultForm(selectedTypeName), paramId: entryId || "" });
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
          type: selectedTypeName,
        });
      } else {
        setForm({ ...createDefaultForm(selectedTypeName), paramId: entryId || "" });
      }
      setExpandedVersionId(latestCompleteVersion?.id || null);
    } else {
      setForm({ ...createDefaultForm(selectedTypeName), paramId: entryId || "" });
      setExpandedVersionId(null);
      setSavedProcessParameterId(entryId || "");
    }
  };

  useEffect(() => {
    loadVersions();
  }, []);

  useEffect(() => {
    if (entryId) {
      setSavedProcessParameterId(entryId);
    }
  }, [entryId]);

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
      type: selectedTypeName || "Process Parameter",
    }));
  }, [selectedTypeName]);

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
    const nextValue = numericKeys.has(field)
      ? sanitizeNumericInput(value, { precision: field === "lineNumbers" || field === "scutcherNo" ? 10 : 10, scale: field === "lineNumbers" || field === "scutcherNo" ? 0 : 2 })
      : value;

    setForm((current) => {
      if (field === "countName" && !entryId && !current.versionId) {
        const match = findLatestVersionByCountName(nextValue);
        if (match) {
          return { ...match.data, countName: nextValue, versionId: "", paramId: current.paramId, type: selectedTypeName };
        }
      }

      const nextForm = { ...current, [field]: nextValue };
      if (
        !entryId &&
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
    setForm({ ...version.data, versionId: version.id, paramId: version.data.paramId || savedProcessParameterId || "", type: selectedTypeName });
    setSavedProcessParameterId(version.data.paramId || savedProcessParameterId || "");
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
    if (!String(selectedTypeName || "").trim()) nextErrors.selectedType = true;
    if (!String(form.countName || "").trim()) nextErrors.countName = true;
    if (!String(form.consigneeName || "").trim()) nextErrors.consigneeName = true;
    if (!String(form.creationDate || "").trim()) nextErrors.creationDate = true;
    fieldDefs.forEach((field) => {
      if (!String(form[field.key] || "").trim()) nextErrors[field.key] = true;
    });
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const buildPayload = () => ({
    entry_id: (entryId || form.paramId || savedProcessParameterId) || undefined,
    count_name: form.countName,
    consignee_name: form.consigneeName,
    creation_date: form.creationDate,
    line_numbers: Number(parseNumberValue(form.lineNumbers, 0)) || 0,
    rotary_beater_speed: parseNumberValue(form.rotaryBeaterSpeed),
    depth: parseNumberValue(form.depth),
    mpm_delivery_speed: parseNumberValue(form.mpmDeliverySpeed),
    mpm_delivery_pascals: parseNumberValue(form.mpmDeliveryPascals),
    condensor_speed: parseNumberValue(form.condensorSpeed),
    rk_feed_roll_beater: parseNumberValue(form.rkFeedRollBeater),
    rk_beater_speed: parseNumberValue(form.rkBeaterSpeed),
    flexi_to_feed_roll_beater: parseNumberValue(form.flexiToFeedRollBeater),
    flexi_beater_speed: parseNumberValue(form.flexiBeaterSpeed),
    scutcher_no: Number(parseNumberValue(form.scutcherNo, 0)) || 0,
    rk_mo_speed: parseNumberValue(form.rkMoSpeed),
    kb_speed: parseNumberValue(form.kbSpeed),
    grid_bar: parseNumberValue(form.gridBar),
    lap_weight: parseNumberValue(form.lapWeight),
    uniclean: parseNumberValue(form.uniclean),
    srs: parseNumberValue(form.srs),
    rk_flexi: parseNumberValue(form.rkFlexi),
  });

  const resetForm = () => {
    setForm(createDefaultForm(selectedTypeName));
    setErrors({});
    setSubmitError("");
    setSavedProcessParameterId("");
  };

  const getPreviewData = () => [
    { label: "Type", value: selectedTypeName || "-" },
    { label: "Count Name", value: form.countName || "-" },
    { label: "Consignee Name", value: form.consigneeName || "-" },
    { label: "Process Parameter ID", value: form.paramId || savedProcessParameterId || "-" },
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
      const payload = buildPayload();
      const targetIdForMatch = entryId || form.paramId;
      const existingVersion = targetIdForMatch
        ? versions.find(
            (v) => normalizeProcessParameterId(v.data.paramId) === normalizeProcessParameterId(targetIdForMatch)
          )
        : null;
      const targetVersionId = form.versionId || existingVersion?.id;
      const response = targetVersionId
        ? await updateBlowroomProcessParameterApi(targetVersionId, payload)
        : await saveBlowroomProcessParameterApi(payload);

      const nextParamId = resolveProcessParameterDisplayId(response, form.paramId || entryId || savedProcessParameterId);
      registerProcessParameterId(response, "Blowroom", form.countName);
      setSavedProcessParameterId(nextParamId);

      await loadVersions();
      return true;
    } catch (error) {
      setSubmitError(error.message || "Unable to submit the form.");
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  useImperativeHandle(ref, () => ({
    validate,
    submit,
    clear: resetForm,
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
              className={`${topFieldClass}${errors.selectedType ? ` ${styles.errorField}` : ""}`}
              value={selectedTypeName}
              onChange={(event) => onTypeChange?.(event.target.value)}
            >
              <option value="">Select Type</option>
              {typeOptions.map((item) => (
                <option key={item.id} value={item.name}>
                  {item.displayName ?? item.name}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.fieldGroup}>
            <label>Count Name</label>
            <SearchableSelect
              className={`${topFieldClass}${errors.countName ? ` ${styles.errorField}` : ""}`}
              value={form.countName}
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
              className={`${topFieldClass}${errors.consigneeName ? ` ${styles.errorField}` : ""}`}
              value={form.consigneeName}
              onChange={(value) => handleFieldChange("consigneeName", value)}
              options={consigneeOptions}
              placeholder="Search or select consignee name"
              ariaLabel="Consignee Name"
            />
          </div>

          <div className={styles.fieldGroup}>
          <label>Process Parameter ID</label>
          <input
            type="text"
            className={topFieldClass}
            value={form.paramId || entryId || savedProcessParameterId || previewNextId || "Generating..."}
            readOnly
            disabled
          />
          </div>
        </div>

        <div className={styles.fieldsGrid}>
          {fieldDefs.map((field) => (
            <div
              key={field.key}
              className={`${styles.fieldGroup} ${
                field.key === "flexiToFeedRollBeater" || field.key === "flexiBeaterSpeed"
                  ? styles.wideField
                  : ""
              }`}
            >
              <label>{field.label}</label>
              <input
                type="text"
                className={`${topFieldClass}${errors[field.key] ? ` ${styles.errorField}` : ""}`}
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

export default ProcessParameter;

