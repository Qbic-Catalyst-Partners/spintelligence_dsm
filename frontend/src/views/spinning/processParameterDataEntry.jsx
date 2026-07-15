import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FaCheckCircle } from "react-icons/fa";
import { HiChevronDown, HiChevronUp } from "react-icons/hi2";
import InputScreenUploadButton from "@/components/InputScreenUploadButton";
import SearchableSelect from "@/components/SearchableSelect";
import useMixingCountOptions from "@/hooks/useMixingCountOptions";
import {
  buildProcessParameterOptions,
  PROCESS_PARAMETER_CONSIGNEE_OPTIONS,
  PROCESS_PARAMETER_COUNT_OPTIONS,
} from "@/data/processParameterMasterOptions";
import {
  coerceProcessParameterId,
  normalizeProcessParameterId,
  resolveProcessParameterDisplayId,
  reserveGlobalProcessParameterId,
} from "@/utils/processParameterId";
import { registerProcessParameterId } from "@/utils/processParameterRegistry";
import {
  spinningProcessParameterDataEntry,
  updateSpinningProcessParameterEntry,
  getSpinningProcessParameterEntries,
} from "@/apis/spinning";
import styles from "@/styles/spinning.module.css";

const createDefaultForm = () => ({
  versionId: "",
  paramId: "",
  countName: "",
  consigneeName: "",
  creationDate: new Date().toISOString().split("T")[0],
  machineNo: "",
  bottomRollSetting: "",
  topRollSetting: "",
  breakDraft: "",
  totalDraft: "",
  tpiTm: "",
  spacer: "",
  traveller: "",
  speed: "",
  make: "",
  denier: "",
  mergeNo: "",
  slubPartcyCode: "",
  slubMtr: "",
  pauseMin: "",
  pauseMax: "",
  slubMin: "",
  slubMax: "",
  thicknessMin: "",
  thicknessMax: "",
  ramp: "",
  offset: "",
  lickerin: "",
  cylinder: "",
  doffer: "",
  flats: "",
  lycraDraft: "",
  lycraPercent: "",
});

const cloneForm = (form) => ({ ...form });

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
  [
    "countName",
    "consigneeName",
    "machineNo",
    "bottomRollSetting",
    "topRollSetting",
    "breakDraft",
    "totalDraft",
    "tpiTm",
    "spacer",
    "traveller",
    "speed",
    "make",
    "denier",
    "mergeNo",
    "slubPartcyCode",
    "slubMtr",
    "pauseMin",
    "pauseMax",
    "slubMin",
    "slubMax",
    "thicknessMin",
    "thicknessMax",
    "ramp",
    "offset",
    "lickerin",
    "cylinder",
    "doffer",
    "flats",
    "lycraDraft",
    "lycraPercent",
  ].every((field) => String(version?.data?.[field] || "").trim());

const mapApiEntryToVersion = (entry) => {
  const normalizedDate = String(entry?.creation_date || "").split("T")[0];
  const paramId = coerceProcessParameterId(entry?.entry_id || entry?.param_id || "");

  return {
    id: String(entry?.qc_id ?? entry?.param_id ?? Date.now()),
    status: entry?.status || "DONE",
    label: formatDisplayDate(normalizedDate),
    date: normalizedDate,
    data: {
      versionId: String(entry?.qc_id ?? entry?.param_id ?? ""),
      paramId,
      countName: entry?.count_name || "",
      consigneeName: entry?.consignee_name || "",
      creationDate: normalizedDate || new Date().toISOString().split("T")[0],
      machineNo:
        entry?.machine_no === null || typeof entry?.machine_no === "undefined"
          ? ""
          : String(entry.machine_no),
      bottomRollSetting: entry?.bottom_roll_setting || "",
      topRollSetting: entry?.top_roll_setting || "",
      breakDraft:
        entry?.break_draft === null || typeof entry?.break_draft === "undefined"
          ? ""
          : String(entry.break_draft),
      totalDraft:
        entry?.total_draft === null || typeof entry?.total_draft === "undefined"
          ? ""
          : String(entry.total_draft),
      tpiTm: entry?.tpi_tm || "",
      spacer: entry?.spacer || "",
      traveller: entry?.traveller || "",
      speed:
        entry?.speed === null || typeof entry?.speed === "undefined"
          ? ""
          : String(entry.speed),
      make: entry?.make || "",
      denier:
        entry?.denier === null || typeof entry?.denier === "undefined"
          ? ""
          : String(entry.denier),
      mergeNo: entry?.merge_no || "",
      slubPartcyCode: entry?.slub_partcy_code || "",
      slubMtr: entry?.slub_mtr || "",
      pauseMin: entry?.pause_min === null || typeof entry?.pause_min === "undefined" ? "" : String(entry.pause_min),
      pauseMax: entry?.pause_max === null || typeof entry?.pause_max === "undefined" ? "" : String(entry.pause_max),
      slubMin: entry?.slub_min === null || typeof entry?.slub_min === "undefined" ? "" : String(entry.slub_min),
      slubMax: entry?.slub_max === null || typeof entry?.slub_max === "undefined" ? "" : String(entry.slub_max),
      thicknessMin:
        entry?.thickness_min === null || typeof entry?.thickness_min === "undefined"
          ? ""
          : String(entry.thickness_min),
      thicknessMax:
        entry?.thickness_max === null || typeof entry?.thickness_max === "undefined"
          ? ""
          : String(entry.thickness_max),
      ramp: entry?.ramp || "",
      offset: entry?.offset || "",
      lycraDraft:
        entry?.lycra_draft === null || typeof entry?.lycra_draft === "undefined"
          ? ""
          : String(entry.lycra_draft),
      lycraPercent:
        entry?.lycra_percent === null || typeof entry?.lycra_percent === "undefined"
          ? ""
          : String(entry.lycra_percent),
    },
  };
};

const topFieldClass =
  "process-parameter-input w-full h-[38px] px-3 py-2 border border-[#dbe4f0] rounded-lg bg-[#F1F5F9] text-[14px] text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-colors";

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
    <path
      d="M3 5.5H10.5"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
    <path
      d="M3 9.5H8.5"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
    <path
      d="M3 13.5H6.5"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
    <path
      d="M12.3 6.2L15.8 9.7"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
    <path
      d="M11.4 13.9L10.9 16L13 15.5L17 11.5C17.6 10.9 17.6 9.95 17 9.35L16.15 8.5C15.55 7.9 14.6 7.9 14 8.5L11.4 11.1V13.9Z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
  </svg>
);

const fieldDefs = [
  { key: "machineNo", label: "Machine No." },
  { key: "bottomRollSetting", label: "Bottom Roll Setting" },
  { key: "topRollSetting", label: "Top Roll Setting" },
  { key: "breakDraft", label: "Break Draft" },
  { key: "totalDraft", label: "Total Draft" },
  { key: "tpiTm", label: "TPI / TM" },
  { key: "spacer", label: "Spacer" },
  { key: "traveller", label: "Traveller" },
  { key: "speed", label: "Speed" },
  { key: "make", label: "Make" },
  { key: "denier", label: "Denier" },
  { key: "mergeNo", label: "Mergen Number" },
  { key: "slubPartcyCode", label: "Slub Partcy Code" },
  { key: "slubMtr", label: "Slub / Mtr" },
  { key: "pauseMin", label: "Pause Min" },
  { key: "pauseMax", label: "Pause Max" },
  { key: "slubMin", label: "Slub Min" },
  { key: "slubMax", label: "Slub Max" },
  { key: "thicknessMin", label: "Thickness Min" },
  { key: "thicknessMax", label: "Thickness Max" },
  { key: "ramp", label: "Ramp" },
  { key: "offset", label: "Offset", inputType: "onOff" },
  { key: "lycraDraft", label: "Lycra Draft" },
  { key: "lycraPercent", label: "Lycra %" },
];

const slubFieldKeys = new Set([
  "slubPartcyCode",
  "slubMtr",
  "pauseMin",
  "pauseMax",
  "slubMin",
  "slubMax",
  "thicknessMin",
  "thicknessMax",
  "ramp",
  "offset",
]);

const renderFieldInput = (field, form, errors, handleFieldChange, topFieldClass) =>
  field.inputType === "onOff" ? (
    <div key={field.key} className="flex flex-col gap-1.5">
      <label className="text-[13px] font-semibold text-slate-700">{field.label}</label>
      <div className={styles.segmentedControl}>
        <button
          type="button"
          className={`${styles.segmentButton} ${
            String(form[field.key] || "").toLowerCase() === "on" ? styles.segmentButtonActive : ""
          }`}
          onClick={() => handleFieldChange(field.key, "on")}
        >
          On
        </button>
        <button
          type="button"
          className={`${styles.segmentButton} ${
            String(form[field.key] || "").toLowerCase() === "off" ? styles.segmentButtonActive : ""
          }`}
          onClick={() => handleFieldChange(field.key, "off")}
        >
          Off
        </button>
      </div>
    </div>
  ) : (
    <div key={field.key} className="flex flex-col gap-1.5">
      <label className="text-[13px] font-semibold text-slate-700">{field.label}</label>
      <input
        type="text"
        className={`${topFieldClass}${errors[field.key] ? " border-red-500 bg-red-50" : ""}`}
        value={form[field.key]}
        onChange={(event) => handleFieldChange(field.key, event.target.value)}
      />
    </div>
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
  <div className="process-parameter-history print:hidden">
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
                <div className="mt-1 text-[13px] font-bold text-slate-900">{displaySavedValue(version.data.paramId)}</div>
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
                <div className="grid grid-cols-1 gap-4">
                  {[
                    {
                      title: "General Specification",
                      fields: fieldDefs.filter((field) => !slubFieldKeys.has(field.key)),
                      cols: "md:grid-cols-2 xl:grid-cols-4",
                    },
                    {
                      title: "Slub Specification",
                      fields: fieldDefs.filter((field) => slubFieldKeys.has(field.key)),
                      cols: "md:grid-cols-2 xl:grid-cols-4",
                    },
                  ].map((section) => (
                    <div key={`${version.id}-${section.title}`} className="rounded-xl border border-slate-200 bg-white p-4">
                      <div className="mb-4">
                        <h4 className="text-[15px] font-bold text-slate-900">{section.title}</h4>
                      </div>
                      <div className={`grid grid-cols-1 gap-3 ${section.cols}`}>
                        {section.fields.map((field) => (
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

const SpinningProcessParameterDataEntry = forwardRef(function SpinningProcessParameterDataEntry(
  {
    onSubmitSuccess,
    selectedTypeName,
    typeOptions = [],
    onTypeChange,
    entryId = "#SPN-001",
    nextEntryIdPreview = "",
    standaloneSection = false,
    savedVersionsTargetId = "",
    lockedCountName = "",
  },
  ref
) {
  const formSectionRef = useRef(null);
  const [versions, setVersions] = useState([]);
  const [form, setForm] = useState(createDefaultForm);
  const [errors, setErrors] = useState({});
  const [expandedVersionId, setExpandedVersionId] = useState(null);
  const [savedVersionsPortal, setSavedVersionsPortal] = useState(null);
  const [savedProcessParameterId, setSavedProcessParameterId] = useState("");

  const consigneeOptions = buildProcessParameterOptions(
    PROCESS_PARAMETER_CONSIGNEE_OPTIONS,
    versions.map((version) => version?.data?.consigneeName),
    form.consigneeName
  );

  const { countOptions: masterCountOptions } = useMixingCountOptions();
  const countOptions = buildProcessParameterOptions(
    masterCountOptions.length
      ? masterCountOptions.map((option) => option.count_name || option.label || option.value)
      : PROCESS_PARAMETER_COUNT_OPTIONS,
    [],
    form.countName
  );

  const loadVersions = async () => {
    let nextVersions = [];
    try {
      const response = await getSpinningProcessParameterEntries({ page: 1, limit: 200 });
      const rows = Array.isArray(response?.data) ? response.data : Array.isArray(response) ? response : [];
      nextVersions = rows.map(mapApiEntryToVersion);
    } catch {
      nextVersions = [];
    }

    setVersions(nextVersions);

    const matchByEntryId = entryId
      ? nextVersions.find(
          (item) => normalizeProcessParameterId(item.data.paramId) === normalizeProcessParameterId(entryId)
        )
      : null;

    const existingParamId = entryId || matchByEntryId?.data?.paramId || "";
    setSavedProcessParameterId(existingParamId);

    if (matchByEntryId) {
      setForm({
        ...cloneForm(matchByEntryId.data),
        versionId: matchByEntryId.id,
        paramId: existingParamId,
      });
    } else {
      setForm({ ...createDefaultForm(), paramId: existingParamId });
    }

    if (nextVersions.length > 0) {
      const latestCompleteVersion = nextVersions.find(isVersionComplete);
      setExpandedVersionId(latestCompleteVersion?.id || null);
    } else {
      setExpandedVersionId(null);
      setSavedProcessParameterId("");
    }
  };

  useEffect(() => {
    loadVersions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryId]);

  useEffect(() => {
    if (entryId) {
      setSavedProcessParameterId(entryId);
    }
  }, [entryId]);

  useEffect(() => {
    if (!lockedCountName) return;
    setForm((current) =>
      current.countName === lockedCountName ? current : { ...current, countName: lockedCountName }
    );
  }, [lockedCountName, versions]);

  useEffect(() => {
    if (!standaloneSection || !savedVersionsTargetId) {
      setSavedVersionsPortal(null);
      return;
    }

    setSavedVersionsPortal(document.getElementById(savedVersionsTargetId));
  }, [savedVersionsTargetId, standaloneSection]);

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
    setForm((current) => {
      if (field === "countName" && !entryId && !current.versionId) {
        const match = findLatestVersionByCountName(value);
        if (match) {
          return { ...cloneForm(match.data), countName: value, versionId: "", paramId: current.paramId };
        }
      }
      return { ...current, [field]: value };
    });
    clearError(field);
  };

  const handleVersionSelect = (version) => {
    setForm({ ...cloneForm(version.data), versionId: version.id, paramId: version.data.paramId || savedProcessParameterId || "" });
    setSavedProcessParameterId(version.data.paramId || savedProcessParameterId || "");
    setErrors({});
  };

  const scrollToForm = () => {
    formSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleVersionToggle = (version) => {
    setForm({ ...cloneForm(version.data), versionId: version.id, paramId: version.data.paramId || savedProcessParameterId || "" });
    if (!isVersionComplete(version)) {
      setExpandedVersionId(null);
      scrollToForm();
      setErrors({});
      return;
    }
    setExpandedVersionId((current) => (current === version.id ? null : version.id));
    setErrors({});
  };

  const validate = () => {
    const nextErrors = {};

    if (!String(form.countName || "").trim()) nextErrors.countName = true;
    if (!String(form.consigneeName || "").trim()) nextErrors.consigneeName = true;

    fieldDefs.forEach((field) => {
      if (!String(form[field.key] || "").trim()) {
        nextErrors[field.key] = true;
      }
    });

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const buildPayload = (paramId) => ({
    entry_id: String(paramId || "").trim() || undefined,
    count_name: form.countName,
    consignee_name: form.consigneeName,
    creation_date: form.creationDate,
    machine_no: parseNumberValue(form.machineNo),
    bottom_roll_setting: form.bottomRollSetting,
    top_roll_setting: form.topRollSetting,
    break_draft: parseNumberValue(form.breakDraft),
    total_draft: parseNumberValue(form.totalDraft),
    tpi_tm: form.tpiTm,
    spacer: form.spacer,
    traveller: form.traveller,
    speed: parseNumberValue(form.speed),
    make: form.make,
    denier: parseNumberValue(form.denier),
    merge_no: form.mergeNo,
    slub_partcy_code: form.slubPartcyCode,
    slub_mtr: form.slubMtr,
    pause_min: parseNumberValue(form.pauseMin),
    pause_max: parseNumberValue(form.pauseMax),
    slub_min: parseNumberValue(form.slubMin),
    slub_max: parseNumberValue(form.slubMax),
    thickness_min: parseNumberValue(form.thicknessMin),
    thickness_max: parseNumberValue(form.thicknessMax),
    ramp: form.ramp,
    offset: form.offset,
    lycra_draft: parseNumberValue(form.lycraDraft),
    lycra_percent: parseNumberValue(form.lycraPercent),
  });

  const submit = async () => {
    if (!validate()) return false;

    // entryId (the PP-000n selected via "Update Existing PP") always wins over
    // whatever this form last resolved locally, so edits never drift onto a
    // stale/wrong id.
    const paramId =
      entryId || form.paramId || savedProcessParameterId || nextEntryIdPreview || (await reserveGlobalProcessParameterId("PP", 4));
    const payload = buildPayload(paramId);

    const existingVersion = versions.find(
      (item) => normalizeProcessParameterId(item.data.paramId) === normalizeProcessParameterId(paramId)
    );

    const response = existingVersion
      ? await updateSpinningProcessParameterEntry(existingVersion.id, payload)
      : await spinningProcessParameterDataEntry(payload);
    const savedEntry = response?.data || response;

    setSavedProcessParameterId(resolveProcessParameterDisplayId(savedEntry, paramId));
    registerProcessParameterId(savedEntry, "Spinning", form.countName);

    await loadVersions();
    onSubmitSuccess?.();
    return true;
  };

  const clear = () => {
    setForm(createDefaultForm());
    setErrors({});
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

  useImperativeHandle(ref, () => ({
    clear,
    validate,
    getPreviewData,
    submit,
  }));

  const formContent = (
    <div ref={formSectionRef} className="process-parameter-form flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-[18px] md:grid-cols-2 xl:grid-cols-4 print:grid-cols-4">
        <div className="flex flex-col gap-1.5 min-w-0">
          <label className="text-[14px] font-semibold text-slate-700">Type</label>
          <select
            className={topFieldClass}
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

        <div className="flex flex-col gap-1.5 min-w-0">
          <label className="text-[14px] font-semibold text-slate-700">Count Name</label>
          <SearchableSelect
            className={`${topFieldClass}${errors.countName ? " border-red-500 bg-red-50" : ""}`}
            value={form.countName}
            onChange={(value) => handleFieldChange("countName", value)}
            options={countOptions}
            placeholder="Search or select count name"
            ariaLabel="Count Name"
            disabled={Boolean(lockedCountName)}
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
          <label className="text-[14px] font-semibold text-slate-700">Process Parameter ID</label>
          <input
            type="text"
            className={topFieldClass}
            value={form.versionId ? (form.paramId || entryId || savedProcessParameterId || "") : (entryId || savedProcessParameterId || nextEntryIdPreview || "Generated on save")}
            readOnly
            disabled
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4 print:grid-cols-4">
        {fieldDefs
          .filter((field) => !slubFieldKeys.has(field.key))
          .map((field) => renderFieldInput(field, form, errors, handleFieldChange, topFieldClass))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
        <div className="mb-4">
          <h3 className="text-[16px] font-bold text-slate-900">Slub Specification</h3>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4 print:grid-cols-4">
          {fieldDefs
            .filter((field) => slubFieldKeys.has(field.key))
            .map((field) => renderFieldInput(field, form, errors, handleFieldChange, topFieldClass))}
        </div>
      </div>

    </div>
  );

  if (standaloneSection) {
    return (
      <>
        <div className="p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <InspectionEntryIcon />
              <span className="text-[18px] font-bold text-slate-900">Inspection Data Entry</span>
            </div>
            <InputScreenUploadButton />
          </div>
          {formContent}
        </div>
      </>
    );
  }

  return formContent;
});

export default SpinningProcessParameterDataEntry;
