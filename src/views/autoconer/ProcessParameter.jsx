import { createPortal } from "react-dom";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { FaCheckCircle } from "react-icons/fa";
import { HiChevronDown, HiChevronUp } from "react-icons/hi2";
import SearchableSelect from "@/components/SearchableSelect";

import {
  fetchAutoconerConsigneeMaster,
  fetchAutoconerProcessParameters,
  submitAutoconerProcessParameter,
} from "@/apis/autoconer";
import useAutoconerCountOptions from "@/hooks/useAutoconerCountOptions";
import {
  buildProcessParameterOptions,
  PROCESS_PARAMETER_CONSIGNEE_OPTIONS,
  PROCESS_PARAMETER_COUNT_OPTIONS,
} from "@/data/processParameterMasterOptions";
import { sanitizeNumericInput } from "@/utils/inputValidation";
import { createThresholdViolationTickets } from "@/utils/thresholdTicketing";
import { getNextProcessParameterId, normalizeProcessParameterId } from "@/utils/processParameterId";
import styles from "@/styles/AutoconerProcessParameter.module.css";

const PROCESS_PARAMETER_SUB_DEPARTMENTS = [
  "Mixing",
  "Blow Room",
  "Carding",
  "Draw Frame",
  "Simplex",
  "Spinning",
  "Autoconer",
];

const createDefaultForm = (selectedType = "Process Parameter") => ({
  versionId: "",
  paramId: "",
  type: selectedType || "Process Parameter",
  countName: "",
  consigneeName: "",
  creationDate: new Date().toISOString().split("T")[0],
  machineNo: "",
  drumNo: "",
  speed: "",
  pConeIdentification: "",
  coneWeight: "",
  initialWindingTension: "",
  standardWindingTension: "",
  touchWindingTension: "",
  tReleaseAddTension: "",
  tensionReleaseEndYarnLayer: "",
  tensionReleaseDecreaseRatio: "",
  tensionReleaseValidYarnLayer: "",
  splicingSetting: "",
  waterOnOff: "",
  splicingLengthAdjustParameter: "",
  splicingNozzle: "",
  cradlePressure: "",
  coneDensity: "",
  coneCops: "",
});

const fieldDefs = [
  { key: "machineNo", label: "Machine No." },
  { key: "drumNo", label: "Drum No." },
  { key: "speed", label: "Speed", numeric: true },
  { key: "pConeIdentification", label: "P Cone Identification" },
  { key: "coneWeight", label: "Cone Weight", numeric: true },
  { key: "initialWindingTension", label: "Initial Winding Tension", numeric: true },
  { key: "standardWindingTension", label: "Standard Winding Tension", numeric: true },
  { key: "touchWindingTension", label: "Touch Winding Tension", numeric: true },
  { key: "tReleaseAddTension", label: "Release Add Tension", numeric: true },
  {
    key: "tensionReleaseEndYarnLayer",
    label: "Tension Release End Yarn Layer",
    numeric: true,
  },
  {
    key: "tensionReleaseDecreaseRatio",
    label: "Tension Release Decrease Ratio",
    numeric: true,
  },
  {
    key: "tensionReleaseValidYarnLayer",
    label: "Tension Release Valid Yarn Layer",
    numeric: true,
  },
  { key: "splicingSetting", label: "Splicing Setting" },
  { key: "waterOnOff", label: "Water On / Off" },
  {
    key: "splicingLengthAdjustParameter",
    label: "Splicing Length Adjust Parameter",
    numeric: true,
  },
  { key: "splicingNozzle", label: "Splicing Nozzle" },
  { key: "cradlePressure", label: "Cradle Pressure", numeric: true },
  { key: "coneDensity", label: "Cone Density", numeric: true },
  { key: "coneCops", label: "Cone / Cops" },
];

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

const getEntryId = (entry) => String(entry?.id ?? entry?._id ?? entry?.process_parameter_id ?? "");

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
    paramId: normalizeProcessParameterId(entry?.entry_id || entry?.ins_code || ""),
    type: "Process Parameter",
    countName: entry?.count_name || "",
    consigneeName: entry?.consignee_name || "",
    creationDate: normalizeDate(entry?.creation_date),
    machineNo: entry?.machine_no || "",
    drumNo: entry?.drum_no || "",
    speed: entry?.speed == null ? "" : String(entry.speed),
    pConeIdentification: entry?.p_cone_identification || "",
    coneWeight: entry?.cone_weight == null ? "" : String(entry.cone_weight),
    initialWindingTension:
      entry?.initial_winding_tension == null ? "" : String(entry.initial_winding_tension),
    standardWindingTension:
      entry?.standard_winding_tension == null ? "" : String(entry.standard_winding_tension),
    touchWindingTension:
      entry?.touch_winding_tension == null ? "" : String(entry.touch_winding_tension),
    tReleaseAddTension:
      entry?.t_release_add_tension == null ? "" : String(entry.t_release_add_tension),
    tensionReleaseEndYarnLayer:
      entry?.tension_release_end_yarn_layer == null
        ? ""
        : String(entry.tension_release_end_yarn_layer),
    tensionReleaseDecreaseRatio:
      entry?.tension_release_decrease_ratio == null
        ? ""
        : String(entry.tension_release_decrease_ratio),
    tensionReleaseValidYarnLayer:
      entry?.tension_release_valid_yarn_layer == null
        ? ""
        : String(entry.tension_release_valid_yarn_layer),
    splicingSetting: entry?.splicing_setting || "",
    waterOnOff: entry?.water_on_off || "",
    splicingLengthAdjustParameter:
      entry?.splicing_length_adjust_parameter == null
        ? ""
        : String(entry.splicing_length_adjust_parameter),
    splicingNozzle: entry?.splicing_nozzle || "",
    cradlePressure: entry?.cradle_pressure == null ? "" : String(entry.cradle_pressure),
    coneDensity: entry?.cone_density == null ? "" : String(entry.cone_density),
    coneCops: entry?.cone_cops || "",
  },
});

const isVersionComplete = (version) =>
  ["countName", "consigneeName", ...fieldDefs.map((field) => field.key)].every((field) =>
    String(version?.data?.[field] || "").trim()
  );

const getVersionSubDepartment = (version) =>
  String(version?.data?.subDepartment || version?.data?.sub_department || "").trim();

const buildPayload = (form, entryId = "") => ({
  scope: "process-parameter",
  count_name: form.countName,
  consignee_name: form.consigneeName,
  creation_date: form.creationDate,
  machine_no: form.machineNo,
  drum_no: form.drumNo,
  speed: Number(parseNumberValue(form.speed)) || 0,
  p_cone_identification: form.pConeIdentification,
  cone_weight: Number(parseNumberValue(form.coneWeight)) || 0,
  initial_winding_tension: Number(parseNumberValue(form.initialWindingTension)) || 0,
  standard_winding_tension: Number(parseNumberValue(form.standardWindingTension)) || 0,
  touch_winding_tension: Number(parseNumberValue(form.touchWindingTension)) || 0,
  t_release_add_tension: Number(parseNumberValue(form.tReleaseAddTension)) || 0,
  tension_release_end_yarn_layer: Number(parseNumberValue(form.tensionReleaseEndYarnLayer)) || 0,
  tension_release_decrease_ratio: Number(parseNumberValue(form.tensionReleaseDecreaseRatio)) || 0,
  tension_release_valid_yarn_layer:
    Number(parseNumberValue(form.tensionReleaseValidYarnLayer)) || 0,
  splicing_setting: form.splicingSetting,
  water_on_off: form.waterOnOff,
  splicing_length_adjust_parameter:
    Number(parseNumberValue(form.splicingLengthAdjustParameter)) || 0,
  splicing_nozzle: form.splicingNozzle,
  cradle_pressure: Number(parseNumberValue(form.cradlePressure)) || 0,
  cone_density: Number(parseNumberValue(form.coneDensity)) || 0,
  cone_cops: form.coneCops,
});

const ProcessParameter = forwardRef(function ProcessParameter(
  {
    selectedType = "Process Parameter",
    onTypeChange,
    types = [],
    savedVersionsTargetId = "",
    entryId = "",
  },
  ref
) {
  const safeSelectedType = String(selectedType?.name ?? selectedType ?? "Process Parameter").trim() || "Process Parameter";
  const [versions, setVersions] = useState([]);
  const [form, setForm] = useState(() => createDefaultForm(safeSelectedType));
  const [errors, setErrors] = useState({});
  const [expandedVersionId, setExpandedVersionId] = useState(null);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [versionsError, setVersionsError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [savedProcessParameterId, setSavedProcessParameterId] = useState("");
  const [expandedSubDepartmentKey, setExpandedSubDepartmentKey] = useState("");
  const { countOptions: masterCountOptions, countOptionsError, loadingCountOptions } = useAutoconerCountOptions("process-parameter");
  const [masterConsigneeOptions, setMasterConsigneeOptions] = useState([]);

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
        [
          ...masterConsigneeOptions,
          ...versions.map((version) => version?.data?.consigneeName),
        ],
        form.consigneeName
      ),
    [form.consigneeName, masterConsigneeOptions, versions]
  );

  const loadVersions = async () => {
    setLoadingVersions(true);
    try {
      const response = await fetchAutoconerProcessParameters({ page: 1, limit: 10 });
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
          return { ...activeVersion.data, versionId: "", paramId: nextProcessParameterId, type: safeSelectedType };
        });
        setExpandedVersionId(latestCompleteVersion?.id || null);
      } else {
        setForm(createDefaultForm(safeSelectedType));
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
    setIsMounted(true);
  }, []);

  useEffect(() => {
    loadVersions();
  }, []);

  useEffect(() => {
    let active = true;
    const loadConsigneeOptions = async () => {
      const options = await fetchAutoconerConsigneeMaster({ screen: "process-parameter" });
      if (active) setMasterConsigneeOptions(Array.isArray(options) ? options : []);
    };
    loadConsigneeOptions();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setForm((current) => ({
      ...current,
      type: safeSelectedType || "Process Parameter",
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
      ? sanitizeNumericInput(value, { precision: 10, scale: 2 })
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
    setForm({
      ...createDefaultForm(safeSelectedType),
      ...version.data,
      versionId: "",
      paramId: nextProcessParameterId,
      type: safeSelectedType,
    });
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
    if (!String(safeSelectedType || "").trim()) nextErrors.selectedType = true;
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
    { label: "Type", value: safeSelectedType || "-" },
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
      const payload = buildPayload(form, entryId);
      const response = await submitAutoconerProcessParameter(payload);
      setSavedProcessParameterId(
        String(response?.entry_id || response?.param_id || response?.process_parameter_id || response?.id || "").trim()
      );

      try {
        await createThresholdViolationTickets({
          department: "Quality Control",
          subDepartment: "Autoconer",
          screenName: safeSelectedType || "Process Parameter",
          machineName: form.machineNo || safeSelectedType || "Process Parameter",
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
        const errorMessage = String(error?.message || "");
        setSubmitError(
        /duplicate entry_id/i.test(errorMessage)
          ? "Process Parameter ID already exists. Please clear and save again to generate next ID."
            : errorMessage || "Unable to submit the form."
        );
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  const clear = () => {
    setForm(createDefaultForm(safeSelectedType));
    setErrors({});
    setSubmitError("");
    setSavedProcessParameterId("");
    setExpandedSubDepartmentKey("");
  };

  useImperativeHandle(ref, () => ({
    validate,
    submit,
    clear,
    getPreviewData,
  }));

  const savedVersionsPortal =
    isMounted && savedVersionsTargetId
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

            <div className={styles.subDepartmentWrap}>
              <div className={styles.subDepartmentTitle}>Sub Departments</div>
              <div className={styles.subDepartmentList}>
                {nestedChildren.map((child) => (
                  <div key={child.key} className={styles.subDepartmentCard}>
                    <button
                      type="button"
                      className={`${styles.subDepartmentHeader} ${
                        child.isExpanded ? styles.subDepartmentHeaderActive : ""
                      }`}
                      onClick={() =>
                        setExpandedSubDepartmentKey((current) =>
                          current === child.key ? "" : child.key
                        )
                      }
                    >
                      <span className={styles.subDepartmentName}>{child.label}</span>
                      <span className={styles.subDepartmentBadge}>
                        {child.hasData ? "Saved" : "No data"}
                      </span>
                    </button>

                    {child.isExpanded ? (
                      <div className={styles.subDepartmentBody}>
                        {child.hasData ? (
                          <div className={styles.savedFieldsGrid}>
                            {fieldDefs.map((field) => (
                              <div key={`${child.key}-${field.key}`} className={styles.savedFieldCard}>
                                <div className={styles.cellLabel}>{field.label}</div>
                                <div className={styles.savedValue}>
                                  {displaySavedValue(version.data[field.key])}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className={styles.infoBox}>
                            No sub-department specific data is stored for this PP ID yet.
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
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
              value={safeSelectedType}
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
              className={`${styles.field}${errors.consigneeName ? ` ${styles.errorField}` : ""}`}
              value={form.consigneeName || ""}
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
              className={styles.field}
              value={form.versionId ? (form.paramId || entryId || savedProcessParameterId || "") : (entryId || savedProcessParameterId || form.paramId || "")}
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

export default ProcessParameter;
