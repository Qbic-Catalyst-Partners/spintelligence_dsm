import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useDispatch } from "react-redux";
import { FaCheckCircle } from "react-icons/fa";
import { HiChevronDown, HiChevronUp } from "react-icons/hi2";
import InputScreenUploadButton from "@/components/InputScreenUploadButton";
import SearchableSelect from "@/components/SearchableSelect";
import { getMixingProcessParameterEntries } from "@/apis/mixing";
import useMixingCountOptions from "@/hooks/useMixingCountOptions";
import { clearMixingState, submitProcessParameter } from "@/store/slices/mixing";
import {
  buildProcessParameterOptions,
  PROCESS_PARAMETER_CONSIGNEE_OPTIONS,
  PROCESS_PARAMETER_COUNT_OPTIONS,
} from "@/data/processParameterMasterOptions";
import { coerceProcessParameterId, reserveGlobalProcessParameterId } from "@/utils/processParameterId";
import { registerProcessParameterId } from "@/utils/processParameterRegistry";
import {
  updateMixingProcessParameterEntry,
} from "@/apis/mixing";

const createBlankRow = (label) => ({
  label,
  lotNo: "",
  blend: "",
  cutLength: "",
  tenacity: "",
  elongation: "",
  mergeNo: "",
});

const createDefaultForm = () => ({
  versionId: "",
  paramId: "",
  countName: "",
  consigneeName: "",
  creationDate: new Date().toISOString().split("T")[0],
  rows: [
    createBlankRow("Blend-1"),
    createBlankRow("Blend-2"),
    createBlankRow("Blend-3"),
    createBlankRow("Blend-4"),
  ],
});

const formatDisplayDate = (dateString) => {
  if (!dateString) return "";
  const normalized = String(dateString).split("T")[0];
  const [year, month, day] = normalized.split("-");
  if (!year || !month || !day) return normalized;
  return `${day}/${month}/${year}`;
};

const cloneForm = (form) => ({
  ...form,
  rows: form.rows.map((row) => ({ ...row })),
});

const isValueZeroLike = (value) => {
  const normalized = String(value ?? "").trim();
  return !normalized || normalized === "-" || Number(normalized) === 0;
};

const isRowComplete = (row) =>
  ["lotNo", "blend", "cutLength", "tenacity", "elongation", "mergeNo"].every((field) =>
    String(row?.[field] || "").trim()
  );

const isRowAllZero = (row) =>
  ["lotNo", "blend", "cutLength", "tenacity", "elongation", "mergeNo"].every((field) =>
    isValueZeroLike(row?.[field])
  );

const isVersionComplete = (version) => {
  const rows = version?.data?.rows || [];
  if (!rows.length) return false;
  if (rows.every(isRowAllZero)) return false;
  return version?.status === "DONE" || rows.every(isRowComplete);
};

const displaySavedValue = (value) => {
  const normalized = String(value ?? "").trim();
  return normalized && normalized !== "-" ? normalized : "0";
};

const parseNumberValue = (value) => {
  const normalized = String(value ?? "").replace(/[^0-9.\-]/g, "").trim();
  if (!normalized) return 0;
  const parsed = Number(normalized);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const mapApiEntryToVersion = (entry) => {
  const normalizedDate = String(entry?.creation_date || "").split("T")[0];
  const paramId = coerceProcessParameterId(entry?.param_id || "");
  const blendMap = new Map(
    Array.isArray(entry?.blends)
      ? entry.blends.map((blend) => [Number(blend.blend_no), blend])
      : []
  );

  return {
    id: String(entry?.qc_id ?? entry?.param_id ?? Date.now()),
    status: entry?.status || "UNDONE",
    label: formatDisplayDate(normalizedDate),
    date: normalizedDate,
    data: {
      versionId: String(entry?.qc_id ?? entry?.param_id ?? ""),
      paramId,
      countName: entry?.count_name || "",
      consigneeName: entry?.consignee_name || "",
      creationDate: normalizedDate || new Date().toISOString().split("T")[0],
      rows: [1, 2, 3, 4].map((blendNo) => {
        const blend = blendMap.get(blendNo);
        return {
          label: `Blend-${blendNo}`,
          lotNo: blend?.lot_no ? String(blend.lot_no) : "",
          blend:
            blend?.percentage === null || typeof blend?.percentage === "undefined"
              ? ""
              : String(blend.percentage),
          cutLength: blend?.cut_length ? String(blend.cut_length) : "",
          tenacity:
            blend?.tenacity === null || typeof blend?.tenacity === "undefined"
              ? ""
              : String(blend.tenacity),
          elongation:
            blend?.elongation === null || typeof blend?.elongation === "undefined"
              ? ""
              : String(blend.elongation),
          mergeNo: blend?.merge_no ? String(blend.merge_no) : "",
        };
      }),
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

const SavedVersionsSection = ({
  versions,
  form,
  expandedVersionId,
  onVersionSelect,
  onVersionToggle,
  loading,
  errorMessage,
}) => (
  <div className="mixing-process-parameter-history">

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
          <div key={version.id} className="mixing-process-version-card overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div
              className={`mixing-process-version-header grid w-full grid-cols-1 gap-3 px-4 py-3 transition-colors md:grid-cols-[120px_minmax(0,1fr)_minmax(0,1fr)_auto_auto] ${
                isActive ? "bg-[#f8fbff]" : "bg-white hover:bg-slate-50"
              }`}
            >
              <button
                type="button"
                className="mixing-process-version-cell rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left"
                onClick={() => onVersionSelect(version)}
              >
                <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                  Param ID
                </div>
                <div className="mt-1 text-[13px] font-bold text-slate-900">{displaySavedValue(version.data.paramId)}</div>
              </button>

              <button
                type="button"
                className="mixing-process-version-cell rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left"
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
                className="mixing-process-version-cell rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left"
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
              <div className="mixing-process-version-body border-t border-[#dbe4f0] bg-[#eef5ff] p-4">
                <div className="flex flex-col gap-3">
                  {version.data.rows.map((row) => (
                    <div
                      key={`${version.id}-${row.label}`}
                      className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6"
                    >
                      <div className="mixing-process-saved-field rounded-lg border border-[#c8d9f0] bg-white px-3 py-2 shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
                        <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                          Lot No.
                        </div>
                        <div className="mt-1 text-[13px] font-bold text-slate-900">{displaySavedValue(row.lotNo)}</div>
                      </div>
                      <div className="mixing-process-saved-field rounded-lg border border-[#c8d9f0] bg-white px-3 py-2 shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
                        <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                          {row.label}
                        </div>
                        <div className="mt-1 text-[13px] font-bold text-slate-900">{displaySavedValue(row.blend)}</div>
                      </div>
                      <div className="mixing-process-saved-field rounded-lg border border-[#c8d9f0] bg-white px-3 py-2 shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
                        <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                          Cut Length
                        </div>
                        <div className="mt-1 text-[13px] font-bold text-slate-900">
                          {displaySavedValue(row.cutLength)}
                        </div>
                      </div>
                      <div className="mixing-process-saved-field rounded-lg border border-[#c8d9f0] bg-white px-3 py-2 shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
                        <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                          Tenacity
                        </div>
                        <div className="mt-1 text-[13px] font-bold text-slate-900">{displaySavedValue(row.tenacity)}</div>
                      </div>
                      <div className="mixing-process-saved-field rounded-lg border border-[#c8d9f0] bg-white px-3 py-2 shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
                        <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                          Elongation
                        </div>
                        <div className="mt-1 text-[13px] font-bold text-slate-900">
                          {displaySavedValue(row.elongation)}
                        </div>
                      </div>
                      <div className="mixing-process-saved-field rounded-lg border border-[#c8d9f0] bg-white px-3 py-2 shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
                        <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                          Merge No.
                        </div>
                        <div className="mt-1 text-[13px] font-bold text-slate-900">{displaySavedValue(row.mergeNo)}</div>
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

const ProcessParameterDataEntry = forwardRef(function ProcessParameterDataEntry(
  {
    onSubmitSuccess,
    entryId = "",
    selectedTypeName,
    typeOptions = [],
    onTypeChange,
    standaloneSection = false,
    savedVersionsTargetId = "",
  },
  ref
) {
  const dispatch = useDispatch();
  const formSectionRef = useRef(null);
  const [versions, setVersions] = useState([]);
  const [form, setForm] = useState(createDefaultForm);
  const [errors, setErrors] = useState({});
  const [expandedVersionId, setExpandedVersionId] = useState(null);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [versionsError, setVersionsError] = useState("");
  const [savedProcessParameterId, setSavedProcessParameterId] = useState("");
  const [isMounted, setIsMounted] = useState(false);
  const { countOptions: masterCountOptions, countOptionsError, loadingCountOptions } = useMixingCountOptions();

  const loadVersions = async () => {
    setLoadingVersions(true);
    try {
      const response = await getMixingProcessParameterEntries({ page: 1, limit: 100 });
      const nextVersions = Array.isArray(response?.data)
        ? response.data.map(mapApiEntryToVersion)
        : [];

      setVersions(nextVersions);

      if (nextVersions.length > 0) {
        setSavedProcessParameterId(await reserveGlobalProcessParameterId("PP", 4));
        setForm((current) => {
          const activeVersion =
            nextVersions.find((item) => item.id === current.versionId) || nextVersions[0];
          return {
            ...cloneForm(activeVersion.data),
            versionId: "",
            paramId: "",
          };
        });
        const latestCompleteVersion = nextVersions.find(isVersionComplete);
        setExpandedVersionId(latestCompleteVersion?.id || null);
      } else {
        setForm(createDefaultForm());
        setExpandedVersionId(null);
        setSavedProcessParameterId(await reserveGlobalProcessParameterId("PP", 4));
      }
      setVersionsError("");
    } catch (error) {
      setVersions([]);
      setExpandedVersionId(null);
      setVersionsError(error.message || "Unable to load saved versions.");
    } finally {
      setLoadingVersions(false);
    }
  };

  const countOptions = buildProcessParameterOptions(
    masterCountOptions.length
      ? masterCountOptions.map((option) => option.count_name || option.label || option.value)
      : PROCESS_PARAMETER_COUNT_OPTIONS,
    versions.map((version) => version?.data?.countName),
    form.countName
  );

  const consigneeOptions = buildProcessParameterOptions(
    PROCESS_PARAMETER_CONSIGNEE_OPTIONS,
    versions.map((version) => version?.data?.consigneeName),
    form.consigneeName
  );

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    loadVersions();
  }, []);

  const clearError = (field) => {
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const handleFieldChange = (field, value) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
    clearError(field);
  };

  const handleRowChange = (index, field, value) => {
    setForm((current) => ({
      ...current,
      rows: current.rows.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [field]: value } : row
      ),
    }));
    clearError(`row-${index}-${field}`);
  };

  const handleVersionSelect = (version) => {
    setForm({
      ...cloneForm(version.data),
      versionId: version.id,
      paramId: version.data.paramId || savedProcessParameterId || "",
    });
    setSavedProcessParameterId(version.data.paramId || savedProcessParameterId || "");
    setErrors({});
  };

  const scrollToForm = () => {
    formSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleVersionToggle = (version) => {
    setForm({
      ...cloneForm(version.data),
      versionId: version.id,
      paramId: version.data.paramId || savedProcessParameterId || "",
    });
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

    form.rows.forEach((row, index) => {
      ["lotNo", "blend", "cutLength", "tenacity", "elongation", "mergeNo"].forEach((field) => {
        if (!String(row[field] || "").trim()) {
          nextErrors[`row-${index}-${field}`] = true;
        }
      });
    });

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const buildPayload = () => ({
    process_parameter: "Mixing",
    status: "DONE",
    blends: form.rows.map((row, index) => ({
      blend_no: index + 1,
      percentage: parseNumberValue(row.blend),
      lot_no: row.lotNo,
      cut_length: row.cutLength,
      tenacity: parseNumberValue(row.tenacity),
      elongation: parseNumberValue(row.elongation),
      merge_no: row.mergeNo,
    })),
  });

  const submit = async () => {
    if (!validate()) return false;

    const payload = buildPayload();
    const response = form.versionId
      ? await updateMixingProcessParameterEntry(form.versionId, payload)
      : await dispatch(submitProcessParameter(payload)).unwrap();
    registerProcessParameterId(response, "Mixing");
    setSavedProcessParameterId(
      String(response?.entry_id || response?.param_id || response?.process_parameter_id || response?.id || "").trim()
    );
    await loadVersions();
    dispatch(clearMixingState());
    onSubmitSuccess?.(response);
    return true;
  };

  const clear = () => {
    setForm(createDefaultForm());
    setErrors({});
    setSavedProcessParameterId("");
  };

  const getPreviewData = () => [
    { label: "Count Name", value: form.countName || "-" },
    { label: "Consignee Name", value: form.consigneeName || "-" },
    { label: "Process Parameter ID", value: form.paramId || savedProcessParameterId || "-" },
    ...form.rows.flatMap((row, index) => [
      { label: `Lot No ${index + 1}`, value: row.lotNo || "-" },
      { label: row.label, value: row.blend || "-" },
      { label: `Cut Length ${index + 1}`, value: row.cutLength || "-" },
      { label: `Tenacity ${index + 1}`, value: row.tenacity || "-" },
      { label: `Elongation ${index + 1}`, value: row.elongation || "-" },
      { label: `Merge No ${index + 1}`, value: row.mergeNo || "-" },
    ]),
  ];

  useImperativeHandle(ref, () => ({
    clear,
    validate,
    getPreviewData,
    submit,
  }));

  const formContent = (
    <div ref={formSectionRef} className="mixing-process-parameter-form flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-[18px] md:grid-cols-2 xl:grid-cols-4">
        <div className="flex flex-col gap-1.5 min-w-0">
          <label className="text-[14px] font-semibold text-slate-700">Type</label>
          <select
            className={`${topFieldClass} dfk-type-select`}
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
          <label className="text-[14px] font-semibold text-slate-700">Process Parameter ID</label>
          <input
            type="text"
            className={topFieldClass}
            value={form.versionId ? (form.paramId || savedProcessParameterId || "") : (savedProcessParameterId || "Generated on save")}
            readOnly
            disabled
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {form.rows.map((row, index) => (
          <div
            key={row.label}
            className="mixing-process-row grid grid-cols-1 gap-3 rounded-[0px] border border-[transparent] bg-white p-4 md:grid-cols-2 xl:grid-cols-6"
          >
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-semibold text-slate-700">Lot No.</label>
              <input
                type="text"
                className={`${topFieldClass}${errors[`row-${index}-lotNo`] ? " border-red-500 bg-red-50" : ""}`}
                value={row.lotNo}
                onChange={(event) => handleRowChange(index, "lotNo", event.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-semibold text-slate-700">{row.label}</label>
              <input
                type="text"
                className={`${topFieldClass}${errors[`row-${index}-blend`] ? " border-red-500 bg-red-50" : ""}`}
                value={row.blend}
                onChange={(event) => handleRowChange(index, "blend", event.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-semibold text-slate-700">Cut Length</label>
              <input
                type="text"
                className={`${topFieldClass}${errors[`row-${index}-cutLength`] ? " border-red-500 bg-red-50" : ""}`}
                value={row.cutLength}
                onChange={(event) => handleRowChange(index, "cutLength", event.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-semibold text-slate-700">Tenacity</label>
              <input
                type="text"
                className={`${topFieldClass}${errors[`row-${index}-tenacity`] ? " border-red-500 bg-red-50" : ""}`}
                value={row.tenacity}
                onChange={(event) => handleRowChange(index, "tenacity", event.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-semibold text-slate-700">Elongation</label>
              <input
                type="text"
                className={`${topFieldClass}${errors[`row-${index}-elongation`] ? " border-red-500 bg-red-50" : ""}`}
                value={row.elongation}
                onChange={(event) => handleRowChange(index, "elongation", event.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-semibold text-slate-700">Merge No.</label>
              <input
                type="text"
                className={`${topFieldClass}${errors[`row-${index}-mergeNo`] ? " border-red-500 bg-red-50" : ""}`}
                value={row.mergeNo}
                onChange={(event) => handleRowChange(index, "mergeNo", event.target.value)}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  if (standaloneSection) {
    const savedVersionsPortal =
      isMounted && savedVersionsTargetId
        ? document.getElementById(savedVersionsTargetId)
        : null;

    return (
      <>
        <div className="p-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2 min-w-0">
              <InspectionEntryIcon />
              <span className="text-[18px] font-bold text-slate-900">Inspection Data Entry</span>
            </div>
            <InputScreenUploadButton />
          </div>
          {formContent}
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
  }

  return formContent;
});

export default ProcessParameterDataEntry;
