import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { HiChevronDown, HiChevronUp } from "react-icons/hi2";
import { FaCheckCircle } from "react-icons/fa";
import SearchableSelect from "@/components/SearchableSelect";

import {
  fetchBlowroomProcessParametersApi,
  saveBlowroomProcessParameterApi,
} from "@/apis/blowroom";
import useBlowroomCountOptions from "@/hooks/useBlowroomCountOptions";
import {
  buildProcessParameterOptions,
  PROCESS_PARAMETER_CONSIGNEE_OPTIONS,
  PROCESS_PARAMETER_COUNT_OPTIONS,
} from "@/data/processParameterMasterOptions";
import { sanitizeNumericInput } from "@/utils/inputValidation";
import { createThresholdViolationTickets } from "@/utils/thresholdTicketing";
import { getNextProcessParameterId, normalizeProcessParameterId } from "@/utils/processParameterId";
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

const PROCESS_PARAMETER_SUB_DEPARTMENTS = [
  "Mixing",
  "Blow Room",
  "Carding",
  "Draw Frame",
  "Simplex",
  "Spinning",
  "Autoconer",
];

const getVersionSubDepartment = (version) =>
  String(version?.data?.subDepartment || version?.data?.sub_department || "").trim();

const isSubDepartmentComplete = (version, subDepartment) => {
  const normalized = getVersionSubDepartment(version).toLowerCase();
  if (!normalized) return true;
  return normalized === String(subDepartment || "").trim().toLowerCase();
};

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
  String(entry?.display_entry_id ?? entry?.process_parameter_id ?? entry?.parameter_id ?? entry?.param_id ?? entry?.br_code ?? "");

const mapApiEntryToVersion = (entry) => ({
  id: getEntryId(entry),
  status: "DONE",
  label: formatDisplayDate(entry?.creation_date),
  data: {
    versionId: getEntryId(entry),
    paramId: normalizeProcessParameterId(getDisplayEntryId(entry)),
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
  { entryId = "", selectedTypeName = "Process Parameter", onTypeChange, typeOptions = [], savedVersionsTargetId = "" },
  ref
) {
  const [versions, setVersions] = useState([]);
  const [form, setForm] = useState(() => createDefaultForm(selectedTypeName));
  const [errors, setErrors] = useState({});
  const [expandedVersionId, setExpandedVersionId] = useState(null);
  const [expandedSubDepartmentKey, setExpandedSubDepartmentKey] = useState("");
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [versionsError, setVersionsError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [savedProcessParameterId, setSavedProcessParameterId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { countOptions: masterCountOptions, countOptionsError, loadingCountOptions } = useBlowroomCountOptions("header");

  const countOptions = useMemo(
    () =>
      buildProcessParameterOptions(
        masterCountOptions.length
          ? masterCountOptions.map((option) => option.count_name || option.label || option.value)
          : PROCESS_PARAMETER_COUNT_OPTIONS,
        versions.map((version) => version?.data?.countName),
        form.countName
      ),
    [form.countName, masterCountOptions, versions]
  );

  const consigneeOptions = useMemo(
    () =>
      buildProcessParameterOptions(
        PROCESS_PARAMETER_CONSIGNEE_OPTIONS,
        versions.map((version) => version?.data?.consigneeName),
        form.consigneeName
      ),
    [form.consigneeName, versions]
  );

  const loadVersions = async () => {
    setLoadingVersions(true);
    try {
      const response = await fetchBlowroomProcessParametersApi({ page: 1, limit: 10 });
      const rows = Array.isArray(response?.data) ? response.data : Array.isArray(response) ? response : [];
      const nextVersions = rows
        .map(mapApiEntryToVersion)
        .sort((left, right) => Number(right.id) - Number(left.id));

      setVersions(nextVersions);
      setVersionsError("");
      const nextProcessParameterId = getNextProcessParameterId(nextVersions, "PP", 4);
      setSavedProcessParameterId(nextProcessParameterId);

      if (nextVersions.length > 0) {
        const latestCompleteVersion = nextVersions.find(isVersionComplete) || nextVersions[0];
        setForm((current) => {
          const activeVersion =
            nextVersions.find((item) => item.id === current.versionId) || latestCompleteVersion;
          return {
            ...activeVersion.data,
            versionId: "",
            paramId: nextProcessParameterId,
            type: selectedTypeName,
          };
        });
        setExpandedVersionId(latestCompleteVersion?.id || null);
      } else {
        setForm(createDefaultForm(selectedTypeName));
        setExpandedVersionId(null);
        setSavedProcessParameterId("");
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
      type: selectedTypeName || "Process Parameter",
    }));
  }, [selectedTypeName]);

  const clearError = (field) => {
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const handleFieldChange = (field, value) => {
    const nextValue = numericKeys.has(field)
      ? sanitizeNumericInput(value, { precision: field === "lineNumbers" || field === "scutcherNo" ? 10 : 10, scale: field === "lineNumbers" || field === "scutcherNo" ? 0 : 2 })
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
    const nextProcessParameterId = getNextProcessParameterId(versions, "PP", 4);
    setForm({ ...version.data, versionId: "", paramId: nextProcessParameterId, type: selectedTypeName });
    setSavedProcessParameterId(nextProcessParameterId);
    setErrors({});
    setSubmitError("");
  };

  const handleVersionToggle = (version) => {
    handleVersionSelect(version);
    if (!isVersionComplete(version)) {
      setExpandedVersionId(null);
      setExpandedSubDepartmentKey("");
      return;
    }
    setExpandedVersionId((current) => {
      const nextExpanded = current === version.id ? null : version.id;
      if (nextExpanded !== version.id) setExpandedSubDepartmentKey("");
      return nextExpanded;
    });
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
      const response = await saveBlowroomProcessParameterApi(payload);
      setSavedProcessParameterId(
        String(response?.entry_id || response?.param_id || response?.process_parameter_id || response?.id || "").trim()
      );

      try {
        await createThresholdViolationTickets({
          department: "Quality Control",
          subDepartment: "Blow Room",
          screenName: selectedTypeName || "Process Parameter",
          machineName: selectedTypeName || "Process Parameter",
          values: fieldDefs.map((field) => ({
            label: field.label,
            value: form[field.key],
          })),
        });
      } catch (ticketError) {
        console.error("Threshold ticket generation failed:", ticketError);
      }

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
      {loadingVersions ? (
        <div className={styles.infoBox}>Loading saved versions...</div>
      ) : null}

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
        const versionSubDepartment = getVersionSubDepartment(version);
        const nestedChildren = PROCESS_PARAMETER_SUB_DEPARTMENTS.map((subDepartment) => ({
          key: `${version.id}-${subDepartment}`,
          label: subDepartment,
          isExpanded:
            expandedVersionId === version.id &&
            expandedSubDepartmentKey === `${version.id}-${subDepartment}`,
          hasData:
            !versionSubDepartment ||
            versionSubDepartment.toLowerCase() === subDepartment.toLowerCase(),
          complete:
            !versionSubDepartment ||
            versionSubDepartment.toLowerCase() === subDepartment.toLowerCase(),
        }));

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
              <>
                <div className="mt-4 rounded-xl border border-[#c8d9f0] bg-[#f8fbff]">
                  <div className="px-4 py-3 text-sm font-semibold text-slate-700">Sub Departments</div>
                  <div className="flex flex-col gap-2 px-4 pb-4">
                    {nestedChildren.map((child) => (
                      <div key={child.key} className="overflow-hidden rounded-lg border border-[#c8d9f0] bg-white">
                        <button
                          type="button"
                          className={`flex w-full items-center justify-between gap-3 bg-white px-4 py-3 text-left transition-colors hover:bg-slate-50 ${
                            child.isExpanded ? "bg-[#eef5ff]" : ""
                          }`}
                          onClick={() =>
                            setExpandedSubDepartmentKey((current) =>
                              current === child.key ? "" : child.key
                            )
                          }
                        >
                          <span className="text-[13px] font-bold text-slate-900">{child.label}</span>
                          <span className="rounded-full bg-[#dfe9ff] px-3 py-1 text-[11px] font-bold text-[#3d539f]">
                            {child.complete ? "Saved" : "Pending"}
                          </span>
                        </button>
                        {child.isExpanded ? (
                          <div className="border-t border-[#dbe4f0] bg-[#eef5ff] p-4">
                            {child.hasData ? (
                              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                                {fieldDefs.map((field) => (
                                  <div
                                    key={`${child.key}-${field.key}`}
                                    className="rounded-lg border border-[#c8d9f0] bg-white px-3 py-2 shadow-[0_1px_2px_rgba(15,23,42,0.05)]"
                                  >
                                    <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                                      {field.label}
                                    </div>
                                    <div className="mt-1 text-[13px] font-bold text-slate-900">
                                      {displaySavedValue(version.data[field.key])}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                                No sub-department specific data is stored for this PP ID yet.
                              </div>
                            )}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
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
              </>
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
              placeholder={
                loadingCountOptions
                  ? "Loading count names..."
                  : countOptionsError
                    ? "Search or type count name"
                    : "Search or select count name"
              }
              ariaLabel="Count Name"
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
            value={form.versionId ? (form.paramId || savedProcessParameterId || "") : (savedProcessParameterId || "Generated on save")}
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

