import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { FaCheckCircle } from "react-icons/fa";
import { HiChevronDown, HiChevronUp } from "react-icons/hi2";
import InputScreenUploadButton from "@/components/InputScreenUploadButton";
import SearchableSelect from "@/components/SearchableSelect";
import {
  fetchSimplexProcessParameterEntries,
  submitSimplexProcessParameterEntry,
  updateSimplexProcessParameterEntry,
} from "@/apis/simplex";
import useSimplexCountOptions from "@/hooks/useSimplexCountOptions";
import {
  buildProcessParameterOptions,
  PROCESS_PARAMETER_CONSIGNEE_OPTIONS,
  PROCESS_PARAMETER_COUNT_OPTIONS,
} from "@/data/processParameterMasterOptions";
import { createThresholdViolationTickets } from "@/utils/thresholdTicketing";

const createDefaultForm = () => ({
  versionId: "",
  paramId: "",
  countName: "",
  consigneeName: "",
  creationDate: new Date().toISOString().split("T")[0],
  machineNo: "",
  make: "",
  deliveryHank: "",
  tpiTm: "",
  speed: "",
  bottomRollerSetting: "",
  topRollerSetting: "",
  breakDraft: "",
  totalDraft: "",
  creelDraft: "",
  falseTwistGrooves: "",
  spacer: "",
  topArmPressure: "",
  backPressure: "",
  middlePressure: "",
  frontPressure: "",
  coilInch: "",
  lifterCombinationWheel: "",
  lifterWheel: "",
  tensionWheel: "",
});

const cloneForm = (form) => ({ ...form });

const topFieldClass =
  "process-parameter-input w-full h-[38px] px-3 py-2 border border-[#dbe4f0] rounded-lg bg-[#F1F5F9] text-[14px] text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-colors";

const fieldDefs = [
  { key: "machineNo", label: "Machine No." },
  { key: "make", label: "Make" },
  { key: "deliveryHank", label: "Delivery Hank" },
  { key: "tpiTm", label: "TPI / TM" },
  { key: "speed", label: "Speed" },
  { key: "bottomRollerSetting", label: "Bottom Roller Setting" },
  { key: "topRollerSetting", label: "Top Roller Setting" },
  { key: "breakDraft", label: "Break Draft" },
  { key: "totalDraft", label: "Total Draft" },
  { key: "creelDraft", label: "Creel Draft" },
  { key: "falseTwistGrooves", label: "False Twist Grooves" },
  { key: "spacer", label: "Spacer" },
  { key: "topArmPressure", label: "Top Arm Pressure" },
  { key: "backPressure", label: "Back" },
  { key: "middlePressure", label: "Middle" },
  { key: "frontPressure", label: "Front" },
  { key: "coilInch", label: "Coil Inch" },
  { key: "lifterCombinationWheel", label: "Lifter Combinate Wheel" },
  { key: "lifterWheel", label: "Lifter Wheel" },
  { key: "tensionWheel", label: "Tension Wheel" },
];

const formatDisplayDate = (dateString) => {
  if (!dateString) return "";
  const normalized = String(dateString).split("T")[0];
  const [year, month, day] = normalized.split("-");
  if (!year || !month || !day) return normalized;
  return `${day}/${month}/${year}`;
};

const parseNumberValue = (value) => {
  const normalized = String(value ?? "").replace(/[^0-9.\-]/g, "").trim();
  if (!normalized) return 0;
  const parsed = Number(normalized);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const displaySavedValue = (value) => {
  const normalized = String(value ?? "").trim();
  return normalized && normalized !== "-" ? normalized : "0";
};

const isVersionComplete = (version) =>
  ["countName", "consigneeName", ...fieldDefs.map((field) => field.key)].every((field) =>
    String(version?.data?.[field] || "").trim()
  );

const mapApiEntryToVersion = (entry) => {
  const normalizedDate = String(entry?.creation_date || "").split("T")[0];

  return {
    id: String(entry?.id ?? entry?.process_parameter_id ?? entry?.param_id ?? Date.now()),
    status: "DONE",
    label: formatDisplayDate(normalizedDate),
    data: {
      versionId: String(entry?.id ?? entry?.process_parameter_id ?? entry?.param_id ?? ""),
      paramId: entry?.param_id || entry?.process_parameter_id || "",
      countName: entry?.count_name || "",
      consigneeName: entry?.consignee_name || "",
      creationDate: normalizedDate || new Date().toISOString().split("T")[0],
      machineNo: entry?.machine_no || "",
      make: entry?.make || "",
      deliveryHank: entry?.delivery_hank == null ? "" : String(entry.delivery_hank),
      tpiTm: entry?.tpi_tm || "",
      speed: entry?.speed == null ? "" : String(entry.speed),
      bottomRollerSetting: entry?.bottom_roller_setting || "",
      topRollerSetting: entry?.top_roller_setting || "",
      breakDraft: entry?.break_draft == null ? "" : String(entry.break_draft),
      totalDraft: entry?.total_draft == null ? "" : String(entry.total_draft),
      creelDraft: entry?.creel_draft == null ? "" : String(entry.creel_draft),
      falseTwistGrooves: entry?.false_twist_grooves || "",
      spacer: entry?.spacer || "",
      topArmPressure: entry?.top_arm_pressure == null ? "" : String(entry.top_arm_pressure),
      backPressure: entry?.back_pressure || "",
      middlePressure: entry?.middle_pressure || "",
      frontPressure: entry?.front_pressure || "",
      coilInch: entry?.coil_inch == null ? "" : String(entry.coil_inch),
      lifterCombinationWheel: entry?.lifter_combination_wheel || "",
      lifterWheel: entry?.lifter_wheel || "",
      tensionWheel: entry?.tension_wheel || "",
    },
  };
};

const InspectionEntryIcon = () => (
  <svg
    aria-hidden="true"
    viewBox="0 0 20 20"
    width="18"
    height="18"
    className="h-[18px] w-[18px] text-[#3d8bfd]"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M3 5.5H10.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M3 9.5H8.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M3 13.5H6.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M12.3 6.2L15.8 9.7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path
      d="M11.4 13.9L10.9 16L13 15.5L17 11.5C17.6 10.9 17.6 9.95 17 9.35L16.15 8.5C15.55 7.9 14.6 7.9 14 8.5L11.4 11.1V13.9Z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
  </svg>
);

const SavedVersionsSection = ({
  versions,
  form,
  expandedVersionId,
  onVersionSelect,
  onVersionToggle,
  loading,
  errorMessage,
}) => (
  <div className="process-parameter-history">
    {loading ? (
      <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
        Loading saved versions...
      </div>
    ) : null}
    {!loading && errorMessage ? (
      <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {errorMessage}
      </div>
    ) : null}
    {!loading && !errorMessage && versions.length === 0 ? (
      <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
        No saved versions found in the database.
      </div>
    ) : null}

    <div className="mt-4 flex flex-col gap-3">
      {versions.map((version) => {
        const isComplete = isVersionComplete(version);
        const isExpanded = expandedVersionId === version.id && isComplete;
        const isActive = version.id === form.versionId;

        return (
          <div key={version.id} className="process-version-card overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div
              className={`process-version-header grid w-full grid-cols-1 gap-3 px-4 py-3 transition-colors md:grid-cols-[120px_minmax(0,1fr)_minmax(0,1fr)_auto_auto] ${
                isActive ? "bg-[#f8fbff]" : "bg-white hover:bg-slate-50"
              }`}
            >
              <button
                type="button"
                className="process-version-cell rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left"
                onClick={() => onVersionSelect(version)}
              >
                <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                  Param ID
                </div>
                <div className="mt-1 text-[13px] font-bold text-slate-900">
                  {displaySavedValue(version.data.paramId)}
                </div>
              </button>

              <button
                type="button"
                className="process-version-cell rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left"
                onClick={() => onVersionSelect(version)}
              >
                <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                  Consignee Name
                </div>
                <div className="mt-1 text-[13px] font-bold text-slate-900">
                  {displaySavedValue(version.data.consigneeName)}
                </div>
              </button>

              <button
                type="button"
                className="process-version-cell rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left"
                onClick={() => onVersionSelect(version)}
              >
                <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                  Count Name
                </div>
                <div className="mt-1 text-[13px] font-bold text-slate-900">
                  {displaySavedValue(version.data.countName)}
                </div>
              </button>

              <div className="flex items-center justify-center text-[20px]">
                {isComplete ? <FaCheckCircle className="text-[#3d539f]" /> : null}
              </div>

              <button
                type="button"
                className="flex items-center justify-center text-[20px] text-slate-500"
                onClick={() => onVersionToggle(version)}
                aria-label={isExpanded ? "Collapse saved version details" : "Expand saved version details"}
              >
                {isExpanded ? <HiChevronUp /> : <HiChevronDown />}
              </button>
            </div>

            {isExpanded ? (
              <div className="process-version-body border-t border-[#dbe4f0] bg-[#eef5ff] p-4">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {fieldDefs.map((field) => (
                    <div
                      key={`${version.id}-${field.key}`}
                      className="process-saved-field rounded-lg border border-[#c8d9f0] bg-white px-3 py-2 shadow-[0_1px_2px_rgba(15,23,42,0.05)]"
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
                <div className="mt-3 text-[12px] text-slate-500">{version.label}</div>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  </div>
);

const SimplexProcessParameterDataEntry = forwardRef(function SimplexProcessParameterDataEntry(
  { selectedTypeName = "Process Parameter", onTypeChange, typeOptions = [], entryId = "", tablePortalTargetId = "" },
  ref
) {
  const [versions, setVersions] = useState([]);
  const [form, setForm] = useState(createDefaultForm);
  const [errors, setErrors] = useState({});
  const [expandedVersionId, setExpandedVersionId] = useState(null);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [versionsError, setVersionsError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [isMounted, setIsMounted] = useState(false);
  const { countOptions: masterCountOptions, countOptionsError, loadingCountOptions } = useSimplexCountOptions("process_parameter");

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
      const response = await fetchSimplexProcessParameterEntries({ page: 1, limit: 100 });
      const rows = Array.isArray(response?.data) ? response.data : Array.isArray(response) ? response : [];
      const nextVersions = rows.map(mapApiEntryToVersion);

      setVersions(nextVersions);
      setVersionsError("");

      if (nextVersions.length > 0) {
        const latestCompleteVersion = nextVersions.find(isVersionComplete) || nextVersions[0];
        setForm((current) => {
          const activeVersion =
            nextVersions.find((item) => item.id === current.versionId) || latestCompleteVersion;
          return { ...activeVersion.data, versionId: activeVersion.id };
        });
        setExpandedVersionId(latestCompleteVersion?.id || null);
      } else {
        setForm(createDefaultForm());
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
    setIsMounted(true);
  }, []);

  useEffect(() => {
    loadVersions();
  }, []);

  const clearFieldError = (field) => {
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const handleFieldChange = (field, value) => {
    setForm((current) => {
      const nextForm = { ...current, [field]: value };

      if (
        (field === "countName" || field === "consigneeName") &&
        String(current[field] || "").trim() !== String(value || "").trim()
      ) {
        nextForm.versionId = "";
        nextForm.paramId = "";
      }

      return nextForm;
    });
    clearFieldError(field);
    setSubmitError("");
  };

  const handleVersionSelect = (version) => {
    setForm({ ...cloneForm(version.data), versionId: version.id });
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
    if (!String(selectedTypeName || "").trim()) nextErrors.type = true;
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
    machine_no: form.machineNo,
    make: form.make,
    delivery_hank: parseNumberValue(form.deliveryHank),
    tpi_tm: form.tpiTm,
    speed: parseNumberValue(form.speed),
    bottom_roller_setting: form.bottomRollerSetting,
    top_roller_setting: form.topRollerSetting,
    break_draft: parseNumberValue(form.breakDraft),
    total_draft: parseNumberValue(form.totalDraft),
    creel_draft: parseNumberValue(form.creelDraft),
    false_twist_grooves: form.falseTwistGrooves,
    spacer: form.spacer,
    top_arm_pressure: parseNumberValue(form.topArmPressure),
    back_pressure: form.backPressure,
    middle_pressure: form.middlePressure,
    front_pressure: form.frontPressure,
    coil_inch: parseNumberValue(form.coilInch),
    lifter_combination_wheel: form.lifterCombinationWheel,
    lifter_wheel: form.lifterWheel,
    tension_wheel: form.tensionWheel,
  });

  const getPreviewData = () => [
    { label: "Type", value: selectedTypeName || "-" },
    { label: "Count Name", value: form.countName || "-" },
    { label: "Consignee Name", value: form.consigneeName || "-" },
    { label: "Entry ID", value: entryId || "-" },
    ...fieldDefs.map((field) => ({
      label: field.label,
      value: form[field.key] || "-",
    })),
  ];

  const clear = () => {
    setForm(createDefaultForm());
    setErrors({});
    setSubmitError("");
  };

  const submit = async () => {
    if (!validate()) return false;

    try {
      const payload = buildPayload();
      const selectedExistingVersion = versions.find((item) => item.id === form.versionId);

      if (selectedExistingVersion) {
        await updateSimplexProcessParameterEntry(selectedExistingVersion.id, payload);
      } else {
        await submitSimplexProcessParameterEntry(payload);
      }

      try {
        await createThresholdViolationTickets({
          department: "Quality Control",
          subDepartment: "Simplex",
          screenName: selectedTypeName || "Process Parameter",
          machineName: form.machineNo || selectedTypeName || "Process Parameter",
          values: fieldDefs.map((field) => ({
            label: field.label,
            value: form[field.key],
          })),
        });
      } catch (ticketError) {
        console.error("Threshold ticket generation failed:", ticketError);
      }

      await loadVersions();
      setSubmitError("");
      return true;
    } catch (error) {
      setSubmitError(error.message || "Unable to submit the form.");
      return false;
    }
  };

  useImperativeHandle(ref, () => ({
    clear,
    validate,
    getPreviewData,
    submit,
  }));

  const savedVersionsPortal =
    isMounted && tablePortalTargetId
      ? document.getElementById(tablePortalTargetId)
      : null;

  return (
    <>
      <div className="process-parameter-form p-0">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2 min-w-0">
            <InspectionEntryIcon />
            <span className="text-[18px] font-bold text-slate-900">Inspection Data Entry</span>
          </div>
          <InputScreenUploadButton />
        </div>

        <div className="grid grid-cols-1 gap-[18px] md:grid-cols-2 xl:grid-cols-4">
          <div className="flex flex-col gap-1.5 min-w-0">
            <label className="text-[14px] font-semibold text-slate-700">Type</label>
            <select
              className={`${topFieldClass}${errors.type ? " border-red-500 bg-red-50" : ""}`}
              value={selectedTypeName}
              onChange={(event) => onTypeChange?.(event.target.value)}
            >
              {typeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5 min-w-0">
            <label className="text-[14px] font-semibold text-slate-700">Count Name</label>
            <SearchableSelect
              className={`${topFieldClass}${errors.countName ? " border-red-500 bg-red-50" : ""}`}
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

          <div className="flex flex-col gap-1.5 min-w-0">
            <label className="text-[14px] font-semibold text-slate-700">Consignee Name</label>
            <SearchableSelect
              className={`${topFieldClass}${errors.consigneeName ? " border-red-500 bg-red-50" : ""}`}
              value={form.consigneeName}
              onChange={(value) => handleFieldChange("consigneeName", value)}
              options={consigneeOptions}
              placeholder="Search or select consignee name"
              ariaLabel="Consignee Name"
            />
          </div>

          <div className="flex flex-col gap-1.5 min-w-0">
            <label className="text-[14px] font-semibold text-slate-700">Entry ID</label>
            <input
              type="text"
              className={topFieldClass}
              value={entryId}
              readOnly
              disabled
            />
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
          {fieldDefs.map((field) => (
            <div key={field.key} className="flex flex-col gap-1.5">
              <label className="text-[13px] font-semibold text-slate-700">{field.label}</label>
              <input
                type="text"
                className={`${topFieldClass}${errors[field.key] ? " border-red-500 bg-red-50" : ""}`}
                value={form[field.key]}
                onChange={(event) => handleFieldChange(field.key, event.target.value)}
              />
            </div>
          ))}
        </div>

        {submitError ? (
          <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm font-medium text-red-700">
            {submitError}
          </div>
        ) : null}
      </div>

      {savedVersionsPortal
        ? createPortal(
            <SavedVersionsSection
              versions={versions}
              form={form}
              expandedVersionId={expandedVersionId}
              onVersionSelect={handleVersionSelect}
              onVersionToggle={handleVersionToggle}
              loading={loadingVersions}
              errorMessage={versionsError}
            />,
            savedVersionsPortal
          )
        : null}
    </>
  );
});

export default SimplexProcessParameterDataEntry;
