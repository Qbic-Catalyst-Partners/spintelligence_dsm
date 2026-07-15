import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { useSelector } from "react-redux";
import { FaCheckCircle } from "react-icons/fa";
import { HiChevronDown, HiChevronUp } from "react-icons/hi2";
import { MdOutlineEditNote } from "react-icons/md";

import Footer from "@/components/Footer";
import InputScreenUploadButton from "@/components/InputScreenUploadButton";
import PreviewModal from "@/components/PreviewModal";
import SuccessModal from "@/components/SuccessModal";
import SearchableSelect from "@/components/SearchableSelect";
import useMixingCountOptions from "@/hooks/useMixingCountOptions";
import {
  buildProcessParameterOptions,
  PROCESS_PARAMETER_CONSIGNEE_OPTIONS,
  PROCESS_PARAMETER_COUNT_OPTIONS,
} from "@/data/processParameterMasterOptions";
import styles from "@/styles/draw-frame.module.css";
import { sanitizeNumericInput } from "@/utils/inputValidation";
import {
  normalizeProcessParameterId,
  resolveProcessParameterDisplayId,
  reserveGlobalProcessParameterId,
} from "@/utils/processParameterId";
import { registerProcessParameterId } from "@/utils/processParameterRegistry";
import {
  submitDrawFrameHeaderEntry,
  updateDrawFrameHeaderEntry,
  fetchDrawFrameHeaderEntries,
  submitDrawFrameFinisherEntry,
  updateDrawFrameFinisherEntry,
  fetchDrawFrameFinisherEntries,
} from "@/apis/draw-frame";
import { recordSubmittedNotebook } from "@/utils/submittedNotebookRecorder";

const today = new Date().toISOString().split("T")[0];

const TYPE_CONFIG = {
  "PP - Breaker Drawing": {
    namespace: "draw-frame-breaker",
    entryScope: "breaker",
    successMessage: "Draw frame breaker entry created successfully",
    entryLabel: "breaker",
    topRow: [
      { key: "type", label: "Type", control: "type-select", required: true },
      {
        key: "countName",
        label: "Count Name",
        control: "select",
        placeholder: "Select Count Name",
        required: true,
      },
      {
        key: "consigneeName",
        label: "Consignee Name",
        control: "select",
        placeholder: "Select Consignee Name",
        required: true,
      },
      { key: "creationDate", label: "Entry ID", control: "entry-id-display", required: true },
    ],
    middleRow: [
      { key: "make", label: "Make", required: true },
      { key: "noOfEnds", label: "No. of Ends", required: true },
      { key: "bottomRollSetting", label: "Bottom Roll Setting", required: true },
      { key: "breakerDraft", label: "Break Draft", required: true },
      { key: "totalDraft", label: "Total Draft", required: true },
      { key: "hank", label: "Hank", required: true },
    ],
    bottomRow: [
      { key: "webTensionDraft", label: "Web Tension Draft", required: true },
      { key: "trumpetSize", label: "Trumpet Size", required: true },
      { key: "deliverySpeed", label: "Delivery Speed", required: true },
      { key: "pressureBar", label: "Pressure Bar", required: true },
    ],
    createForm: (selectedType) => ({
      versionId: "",
      paramId: "",
      type: selectedType || "PP - Breaker Drawing",
      countName: "",
      consigneeName: "",
      creationDate: today,
      make: "",
      noOfEnds: "",
      bottomRollSetting: "",
      breakerDraft: "",
      totalDraft: "",
      hank: "",
      webTensionDraft: "",
      trumpetSize: "",
      deliverySpeed: "",
      pressureBar: "",
    }),
    buildPayload: (form, entryId) => ({
      entry_id: entryId || undefined,
      type: form.type,
      entry_scope: "breaker",
      count_name: form.countName,
      consignee_name: form.consigneeName,
      creation_date: form.creationDate,
      make: form.make,
      no_of_ends: parseNumberValue(form.noOfEnds),
      bottom_roll_setting: form.bottomRollSetting,
      breaker_draft: parseNumberValue(form.breakerDraft),
      total_draft: parseNumberValue(form.totalDraft),
      hank: parseNumberValue(form.hank),
      web_tension_draft: parseNumberValue(form.webTensionDraft),
      trumpet_size: parseNumberValue(form.trumpetSize),
      delivery_speed: parseNumberValue(form.deliverySpeed),
      pressure_bar: form.pressureBar,
    }),
    normalizeEntries: normalizeBreakerEntries,
  },
  "PP - Finisher Drawing": {
    namespace: "draw-frame-finisher",
    entryScope: "finisher",
    successMessage: "Draw frame finisher entry created successfully",
    entryLabel: "finisher",
    topRow: [
      { key: "type", label: "Type", control: "type-select", required: true },
      {
        key: "countName",
        label: "Count Name",
        control: "select",
        placeholder: "Select Count Name",
        required: true,
      },
      {
        key: "consigneeName",
        label: "Consignee Name",
        control: "select",
        placeholder: "Select Consignee Name",
        required: true,
      },
      { key: "creationDate", label: "Entry ID", control: "entry-id-display", required: true },
    ],
    middleRow: [
      { key: "make", label: "Make", required: true },
      { key: "noOfEnds", label: "No. of Ends", required: true },
      { key: "bottomRollSetting", label: "Bottom Roll Setting", required: true },
      { key: "breakDraft", label: "Break Draft", required: true },
      { key: "totalDraft", label: "Total Draft", required: true },
      { key: "webTensionDraft", label: "Web Tension Draft", required: true },
    ],
    bottomRow: [
      { key: "trumpetSize", label: "Trumpet Size", required: true },
      { key: "insertSize", label: "Insert Size", required: true },
      { key: "webFunnelSize", label: "Web Funnel Size", required: true },
      { key: "deliveryHank", label: "Delivery hank", required: true },
      { key: "deliverySpeed", label: "Delivery Speed", required: true },
      { key: "pressureBar", label: "Pressure Bar", required: true },
      { key: "scanningRollsSize", label: "Scanning Roll Size", required: true },
    ],
    createForm: (selectedType) => ({
      versionId: "",
      paramId: "",
      type: selectedType || "PP - Finisher Drawing",
      countName: "",
      consigneeName: "",
      creationDate: today,
      make: "",
      noOfEnds: "",
      bottomRollSetting: "",
      breakDraft: "",
      totalDraft: "",
      webTensionDraft: "",
      trumpetSize: "",
      insertSize: "",
      webFunnelSize: "",
      deliveryHank: "",
      deliverySpeed: "",
      pressureBar: "",
      scanningRollsSize: "",
    }),
    buildPayload: (form, entryId) => ({
      entry_id: entryId || undefined,
      entry_scope: "finisher",
      count_name: form.countName,
      consignee_name: form.consigneeName,
      creation_date: form.creationDate,
      make: form.make,
      no_of_ends: parseNumberValue(form.noOfEnds),
      bottom_roll_setting: form.bottomRollSetting,
      break_draft: parseNumberValue(form.breakDraft),
      total_draft: parseNumberValue(form.totalDraft),
      web_tension_draft: parseNumberValue(form.webTensionDraft),
      trumpet_size: parseNumberValue(form.trumpetSize),
      insert_size: parseNumberValue(form.insertSize),
      web_funnel_size: parseNumberValue(form.webFunnelSize),
      delivery_hank: parseNumberValue(form.deliveryHank),
      delivery_speed: parseNumberValue(form.deliverySpeed),
      pressure_bar: form.pressureBar,
      scanning_rolls_size: form.scanningRollsSize,
    }),
    normalizeEntries: normalizeFinisherEntries,
  },
};

const numericFields = new Set([
  "noOfEnds",
  "breakerDraft",
  "breakDraft",
  "totalDraft",
  "hank",
  "webTensionDraft",
  "trumpetSize",
  "deliverySpeed",
  "insertSize",
  "webFunnelSize",
  "deliveryHank",
]);

function parseNumberValue(value) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return 0;
  const parsed = Number(normalized);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function formatDisplayDate(value) {
  if (!value) return "";
  const parts = String(value).split("-");
  if (parts.length !== 3) return value;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function normalizeBreakerEntries(payload) {
  const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [];
  return rows.map((entry, index) => ({
    id: String(entry?.ins_id || entry?.id || index),
    paramId: getDisplayEntryId(entry),
    countName: entry?.count_name || "",
    consigneeName: entry?.consignee_name || "",
    creationDate: entry?.creation_date || "",
    data: {
      versionId: String(entry?.ins_id || entry?.id || index),
      paramId: getDisplayEntryId(entry),
      type: "PP - Breaker Drawing",
      countName: entry?.count_name || "",
      consigneeName: entry?.consignee_name || "",
      creationDate: String(entry?.creation_date || "").split("T")[0] || today,
      make: entry?.make || "",
      noOfEnds: entry?.no_of_ends == null ? "" : String(entry.no_of_ends),
      bottomRollSetting: entry?.bottom_roll_setting || "",
      breakerDraft: entry?.breaker_draft == null ? "" : String(entry.breaker_draft),
      totalDraft: entry?.total_draft == null ? "" : String(entry.total_draft),
      hank: entry?.hank == null ? "" : String(entry.hank),
      webTensionDraft: entry?.web_tension_draft == null ? "" : String(entry.web_tension_draft),
      trumpetSize: entry?.trumpet_size == null ? "" : String(entry.trumpet_size),
      deliverySpeed: entry?.delivery_speed == null ? "" : String(entry.delivery_speed),
      pressureBar: entry?.pressure_bar || "",
    },
    details: [
      { label: "Make", value: entry?.make },
      { label: "No. of Ends", value: entry?.no_of_ends },
      { label: "Bottom Roll Setting", value: entry?.bottom_roll_setting },
      { label: "Break Draft", value: entry?.breaker_draft },
      { label: "Total Draft", value: entry?.total_draft },
      { label: "Hank", value: entry?.hank },
      { label: "Web Tension Draft", value: entry?.web_tension_draft },
      { label: "Trumpet Size", value: entry?.trumpet_size },
      { label: "Delivery Speed", value: entry?.delivery_speed },
      { label: "Pressure Bar", value: entry?.pressure_bar },
    ],
  }));
}

function normalizeFinisherEntries(payload) {
  const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [];
  return rows.map((entry, index) => ({
    id: String(entry?.id || index),
    paramId: getDisplayEntryId(entry),
    countName: entry?.count_name || "",
    consigneeName: entry?.consignee_name || "",
    creationDate: entry?.creation_date || "",
    data: {
      versionId: String(entry?.id || index),
      paramId: getDisplayEntryId(entry),
      type: "PP - Finisher Drawing",
      countName: entry?.count_name || "",
      consigneeName: entry?.consignee_name || "",
      creationDate: String(entry?.creation_date || "").split("T")[0] || today,
      make: entry?.make || "",
      noOfEnds: entry?.no_of_ends == null ? "" : String(entry.no_of_ends),
      bottomRollSetting: entry?.bottom_roll_setting || "",
      breakDraft: entry?.break_draft == null ? "" : String(entry.break_draft),
      totalDraft: entry?.total_draft == null ? "" : String(entry.total_draft),
      webTensionDraft: entry?.web_tension_draft == null ? "" : String(entry.web_tension_draft),
      trumpetSize: entry?.trumpet_size == null ? "" : String(entry.trumpet_size),
      insertSize: entry?.insert_size == null ? "" : String(entry.insert_size),
      webFunnelSize: entry?.web_funnel_size == null ? "" : String(entry.web_funnel_size),
      deliveryHank: entry?.delivery_hank == null ? "" : String(entry.delivery_hank),
      deliverySpeed: entry?.delivery_speed == null ? "" : String(entry.delivery_speed),
      pressureBar: entry?.pressure_bar || "",
      scanningRollsSize: entry?.scanning_rolls_size || "",
    },
    details: [
      { label: "Make", value: entry?.make },
      { label: "No. of Ends", value: entry?.no_of_ends },
      { label: "Bottom Roll Setting", value: entry?.bottom_roll_setting },
      { label: "Break Draft", value: entry?.break_draft },
      { label: "Total Draft", value: entry?.total_draft },
      { label: "Web Tension Draft", value: entry?.web_tension_draft },
      { label: "Trumpet Size", value: entry?.trumpet_size },
      { label: "Insert Size", value: entry?.insert_size },
      { label: "Web Funnel Size", value: entry?.web_funnel_size },
      { label: "Delivery hank", value: entry?.delivery_hank },
      { label: "Delivery Speed", value: entry?.delivery_speed },
      { label: "Pressure Bar", value: entry?.pressure_bar },
      { label: "Scanning Roll Size", value: entry?.scanning_rolls_size },
    ],
  }));
}

function displaySavedValue(value) {
  const normalized = String(value ?? "").trim();
  return normalized && normalized !== "-" ? normalized : "-";
}

function getDisplayEntryId(entry, fallback = "") {
  return (
    normalizeProcessParameterId(
      entry?.entry_id ||
        entry?.process_parameter_id ||
        entry?.param_id ||
        entry?.parameter_id ||
        entry?.id ||
        fallback
    ) || String(fallback || "").trim()
  );
}

function isEntryComplete(entry) {
  return Array.isArray(entry?.details) && entry.details.some((detail) => String(detail?.value ?? "").trim());
}

function extractEntrySequence(value) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return 0;
  const match = normalized.match(/(\d+)(?!.*\d)/);
  return match ? Number(match[1]) || 0 : 0;
}

function getEntrySortValue(entry) {
  const dateValue = entry?.creationDate ? new Date(`${String(entry.creationDate).split("T")[0]}T00:00:00`).getTime() : 0;
  if (Number.isFinite(dateValue) && dateValue > 0) return dateValue;

  const paramSequence = extractEntrySequence(entry?.paramId);
  if (paramSequence > 0) return paramSequence;

  const idSequence = extractEntrySequence(entry?.id);
  if (idSequence > 0) return idSequence;

  return 0;
}

const DrawFrameHeaderEntry = forwardRef(function DrawFrameHeaderEntry(
  { entryId = "", nextEntryIdPreview = "", typeOptions, selectedType, onTypeChange, onSubmitSuccess, lockedCountName = "" },
  ref
) {
  const router = useRouter();
  const user = useSelector((state) => state.auth?.user);
  const activeType = TYPE_CONFIG[selectedType] ? selectedType : "PP - Breaker Drawing";
  const activeConfig = TYPE_CONFIG[activeType];

  const [form, setForm] = useState(() => activeConfig.createForm(activeType));
  const [errors, setErrors] = useState({});
  const [showPreview, setShowPreview] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formMessage, setFormMessage] = useState("");
  const [recentEntries, setRecentEntries] = useState([]);
  const [expandedEntryId, setExpandedEntryId] = useState(null);

  useEffect(() => {
    const nextType = TYPE_CONFIG[selectedType] ? selectedType : "PP - Breaker Drawing";
    setForm(TYPE_CONFIG[nextType].createForm(nextType));
    setErrors({});
    setFormMessage("");
  }, [selectedType]);

  const allFields = useMemo(
    () => [...activeConfig.topRow, ...activeConfig.middleRow, ...activeConfig.bottomRow],
    [activeConfig]
  );

  const loadEntries = async (type = activeType) => {
    const config = TYPE_CONFIG[type];
    let rows = [];
    setFormMessage("");
    try {
      if (type === "PP - Finisher Drawing") {
        const response = await fetchDrawFrameFinisherEntries({ page: 1, limit: 100 });
        rows = Array.isArray(response) ? response : Array.isArray(response?.data) ? response.data : [];
      } else {
        const response = await fetchDrawFrameHeaderEntries({ page: 1, limit: 100 });
        const allRows = Array.isArray(response) ? response : Array.isArray(response?.data) ? response.data : [];
        rows = allRows.filter((row) => (row?.entry_scope || "").toLowerCase() !== "finisher");
      }
    } catch (error) {
      setFormMessage(error.message || "Unable to load saved draw frame entries.");
    }
    const normalizedEntries = config
      .normalizeEntries(rows)
      .sort((left, right) => getEntrySortValue(right) - getEntrySortValue(left));
    setRecentEntries(normalizedEntries);

    const matchByEntryId = entryId
      ? normalizedEntries.find(
          (entry) => normalizeProcessParameterId(entry.paramId) === normalizeProcessParameterId(entryId)
        )
      : null;

    if (matchByEntryId) {
      setForm({
        ...matchByEntryId.data,
        versionId: matchByEntryId.id,
        paramId: entryId || matchByEntryId.data.paramId || "",
      });
    } else {
      setForm({ ...config.createForm(type), paramId: entryId || "" });
    }
  };

  useEffect(() => {
    loadEntries(activeType);
  }, [activeType]);

  useEffect(() => {
    if (!lockedCountName) return;
    setForm((current) =>
      current.countName === lockedCountName ? current : { ...current, countName: lockedCountName }
    );
  }, [lockedCountName, recentEntries]);

  useEffect(() => {
    if (!recentEntries.length) {
      setExpandedEntryId(null);
      return;
    }

    setExpandedEntryId((current) =>
      recentEntries.some((entry) => String(entry.id) === String(current))
        ? current
        : recentEntries[0].id
    );
  }, [recentEntries]);

  const { countOptions: masterCountOptions } = useMixingCountOptions();
  const countNameOptions = useMemo(
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

  const consigneeOptions = useMemo(
    () =>
      buildProcessParameterOptions(
        PROCESS_PARAMETER_CONSIGNEE_OPTIONS,
        recentEntries.map((entry) => String(entry.consigneeName || "").trim()),
        form.consigneeName
      ),
    [form.consigneeName, recentEntries]
  );

  const previewItems = useMemo(
    () =>
      allFields.map((field) => ({
        label: field.label,
        value:
          field.key === "creationDate"
            ? formatDisplayDate(form.creationDate) || "-"
            : form[field.key] || "-",
      })),
    [allFields, form]
  );

  useImperativeHandle(ref, () => ({
    getPreviewData: () => [
      { label: "Process Parameter ID", value: form.paramId || "-" },
      ...previewItems,
    ],
  }));

  const resetForm = () => {
    setForm(activeConfig.createForm(activeType));
    setErrors({});
    setFormMessage("");
  };

  const findLatestEntryByCountName = (countName) => {
    const normalizeCountName = (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
    const normalized = normalizeCountName(countName);
    if (!normalized) return null;
    return (
      recentEntries
        .filter((entry) => normalizeCountName(entry.data.countName) === normalized)
        .sort((a, b) => {
          const sortValue = (e) => {
            const paramId = String(e?.paramId || "").trim();
            const numericParamId = Number(paramId);
            if (paramId && Number.isFinite(numericParamId)) return numericParamId;
            if (paramId) return paramId.toLowerCase();
            const numericId = Number(e?.id);
            return Number.isFinite(numericId) ? numericId : String(e?.id || "").toLowerCase();
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
    const nextValue = numericFields.has(field)
      ? sanitizeNumericInput(value, { precision: 10, scale: 2 })
      : value;

    setForm((current) => {
      if (field === "countName" && !entryId && !current.versionId) {
        const match = findLatestEntryByCountName(nextValue);
        if (match) {
          return { ...match.data, countName: nextValue, versionId: "", paramId: current.paramId };
        }
      }

      const nextForm = {
        ...current,
        [field]: nextValue,
      };

      if (
        (field === "countName" || field === "consigneeName") &&
        String(current[field] || "").trim() !== String(nextValue || "").trim()
      ) {
        nextForm.versionId = "";
        nextForm.paramId = "";
      }

      return nextForm;
    });

    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });

    if (formMessage) setFormMessage("");
  };

  const handleTypeSelection = (value) => {
    onTypeChange(value);
  };

  const validate = () => {
    const nextErrors = {};
    if (!String(selectedType || "").trim()) nextErrors.selectedType = true;

    allFields.forEach((field) => {
      if (field.required && !String(form[field.key] || "").trim()) {
        nextErrors[field.key] = true;
      }
    });

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSave = () => {
    if (!validate()) {
      setFormMessage("Please fill all required fields before saving.");
      return;
    }
    setFormMessage("");
    setShowPreview(true);
  };

  const handleSubmit = async () => {
    try {
      setIsSubmitting(true);
      const selectedExistingEntry = recentEntries.find(
        (entry) => String(entry.id) === String(form.versionId)
      );
      const paramId = selectedExistingEntry
        ? form.paramId || entryId
        : entryId || form.paramId || nextEntryIdPreview || (await reserveGlobalProcessParameterId("PP", 4));
      const payload = {
        ...activeConfig.buildPayload(form, entryId),
        entry_id: paramId,
        param_id: paramId,
      };
      const isFinisher = activeType === "PP - Finisher Drawing";
      const response = selectedExistingEntry
        ? isFinisher
          ? await updateDrawFrameFinisherEntry(selectedExistingEntry.id, payload)
          : await updateDrawFrameHeaderEntry(selectedExistingEntry.id, payload)
        : isFinisher
          ? await submitDrawFrameFinisherEntry(payload)
          : await submitDrawFrameHeaderEntry(payload);
      const savedEntry = response?.data || response;

      registerProcessParameterId(savedEntry, activeType, form.countName);
      setForm((current) => ({
        ...current,
        paramId,
      }));
      await loadEntries(activeType);

      try {
        await recordSubmittedNotebook({
          department: "Quality Control",
          subDepartment: "Draw Frame",
          notebookName: activeType,
          entryId: paramId,
          previewItems,
          user,
        });
      } catch (recordError) {
        console.warn(
          "Draw frame submitted notebook record failed:",
          recordError?.response?.data || recordError?.message || recordError
        );
      }

      onSubmitSuccess?.(savedEntry);
      setShowPreview(false);
      setShowSuccess(true);
    } catch (error) {
      setFormMessage(error.message || `Unable to submit draw frame ${activeConfig.entryLabel} entry.`);
      setShowPreview(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSuccessClose = () => {
    setShowSuccess(false);
    resetForm();
  };

  const handleEntrySelect = (entry) => {
    setForm({ ...activeConfig.createForm(activeType), ...entry.data, versionId: entry.id });
    setErrors({});
    setFormMessage("");
  };

  const handleEntryToggle = (entry) => {
    handleEntrySelect(entry);
    if (!isEntryComplete(entry)) {
      setExpandedEntryId(null);
      return;
    }
    setExpandedEntryId((current) => (String(current) === String(entry.id) ? null : entry.id));
  };

  const renderField = (field) => {
    const hasError = field.key === "type" ? errors.selectedType : errors[field.key];
    const controlClass = `${styles.input} ${styles.headerEntryControl} ${
      hasError ? styles.inputError : ""
    }`;

    if (field.control === "type-select") {
      return (
        <div key={field.key} className={styles.field}>
          <label className={styles.label}>{field.label}</label>
          <select
            value={selectedType}
            onChange={(event) => handleTypeSelection(event.target.value)}
            className={`${styles.select} ${styles.headerEntryControl} ${
              errors.selectedType ? styles.inputError : ""
            }`}
          >
            {typeOptions.map((option) => (
              <option key={option.id} value={option.name}>
                {option.displayName ?? option.name}
              </option>
            ))}
          </select>
        </div>
      );
    }

    if (field.control === "select" && field.key === "countName") {
      return (
        <div key={field.key} className={styles.field}>
          <label className={styles.label}>{field.label}</label>
          <SearchableSelect
            value={form.countName || ""}
            onChange={(value) => handleFieldChange(field.key, value)}
            className={`${styles.input} ${styles.headerEntryControl} ${
              errors.countName ? styles.inputError : ""
            }`}
            options={countNameOptions}
            placeholder={field.placeholder}
            ariaLabel={field.label}
            disabled={Boolean(lockedCountName)}
          />
        </div>
      );
    }

    if (field.control === "select" && field.key === "consigneeName") {
      return (
        <div key={field.key} className={styles.field}>
          <label className={styles.label}>{field.label}</label>
          <SearchableSelect
            value={form.consigneeName || ""}
            onChange={(value) => handleFieldChange(field.key, value)}
            className={`${styles.input} ${styles.headerEntryControl} ${
              errors.consigneeName ? styles.inputError : ""
            }`}
            options={consigneeOptions}
            placeholder={field.placeholder}
            ariaLabel={field.label}
          />
        </div>
      );
    }

    if (field.control === "entry-id-display") {
      return (
        <div key={field.key} className={styles.field}>
          <label className={styles.label}>{field.label}</label>
          <input
            type="text"
            value={form.paramId || entryId || nextEntryIdPreview || "Generated on save"}
            readOnly
            disabled
            className={`${styles.input} ${hasError ? styles.inputError : ""}`}
          />
        </div>
      );
    }

    return (
      <div
        key={field.key}
        className={`${styles.field} ${
          field.key === "scanningRollsSize" ? styles.headerEntrySingleField : ""
        }`}
      >
        <label className={styles.label}>{field.label}</label>
        <input
          type="text"
          value={form[field.key] || ""}
          onChange={(event) => handleFieldChange(field.key, event.target.value)}
          className={controlClass}
        />
      </div>
    );
  };

  return (
    <>
      <div className={`${styles.card} ${styles.inspectionCard}`}>
        <div className={styles.cardBody}>
          <div className={styles.sectionHeader}>
            <MdOutlineEditNote className={styles.sectionIcon} />
            <h2 className={styles.sectionTitle}>Inspection Data Entry</h2>
            <InputScreenUploadButton className="ml-auto" />
          </div>
          <div className={styles.sectionDivider} />

          <div className={styles.headerEntryWrap}>
            <div className={`${styles.headerEntryGrid} ${styles.headerEntryGridTop}`}>
              {activeConfig.topRow.map(renderField)}
            </div>

            <div className={`${styles.headerEntryGrid} ${styles.headerEntryGridMiddle}`}>
              {activeConfig.middleRow.map(renderField)}
            </div>

            <div className={`${styles.headerEntryGrid} ${styles.headerEntryGridBottom}`}>
              {activeConfig.bottomRow.map(renderField)}
            </div>
          </div>

          {formMessage ? <p className={styles.messageError}>{formMessage}</p> : null}

          <div className={styles.headerEntryFooter}>
            <Footer
              onBack={() => router.push("/departments/quality-control")}
              onClear={resetForm}
              onSave={handleSave}
              saveLabel={isSubmitting ? "Submitting..." : "Save Record"}
              disabled={isSubmitting}
            />
          </div>
        </div>
      </div>

      <PreviewModal
        open={showPreview}
        title="Quality Control - Draw Frame Notebook"
        subtitle="Preview"
        items={previewItems}
        typeValue={selectedType}
        onCancel={() => setShowPreview(false)}
        onConfirm={handleSubmit}
        confirmLabel="Submit"
      />

      <SuccessModal
        open={showSuccess}
        message={activeConfig.successMessage}
        typeValue={selectedType}
        onClose={handleSuccessClose}
      />

      <div className={styles.headerEntryList}>
        {recentEntries.length ? (
          recentEntries.map((entry, index) => (
            <div key={`${entry.id}-${index}`} className={styles.headerEntryCard}>
              <div className={styles.headerEntryCardHeader}>
                <button
                  type="button"
                  className={`${styles.headerEntryMetaBlock} ${styles.headerEntrySelect}`}
                  onClick={() => handleEntrySelect(entry)}
                >
                  <span className={styles.headerEntryMetaLabel}>Param ID</span>
                  <span className={styles.headerEntryMetaValue}>{displaySavedValue(entry.paramId || entry.id)}</span>
                </button>
                <button
                  type="button"
                  className={`${styles.headerEntryMetaMain} ${styles.headerEntrySelect}`}
                  onClick={() => handleEntrySelect(entry)}
                >
                  <span className={styles.headerEntryMetaLabel}>Consignee Name</span>
                  <span className={styles.headerEntryMetaValue}>{displaySavedValue(entry.consigneeName)}</span>
                </button>
                <button
                  type="button"
                  className={`${styles.headerEntryMetaMain} ${styles.headerEntrySelect}`}
                  onClick={() => handleEntrySelect(entry)}
                >
                  <span className={styles.headerEntryMetaLabel}>Count Name</span>
                  <span className={styles.headerEntryMetaValue}>{displaySavedValue(entry.countName)}</span>
                </button>
                <div className={styles.headerEntryCardStatus}>
                  {isEntryComplete(entry) ? <FaCheckCircle className={styles.headerEntryStatusIcon} /> : null}
                </div>
                <button
                  type="button"
                  className={styles.headerEntryToggle}
                  onClick={() => handleEntryToggle(entry)}
                  aria-label={
                    String(expandedEntryId) === String(entry.id)
                      ? "Collapse saved entry details"
                      : "Expand saved entry details"
                  }
                >
                  {String(expandedEntryId) === String(entry.id) ? <HiChevronUp /> : <HiChevronDown />}
                </button>
              </div>

              {String(expandedEntryId) === String(entry.id) ? (
                <div className={styles.headerEntryCardDetails}>
                  <div className={styles.headerEntryDetailsGrid}>
                    {entry.details.map((detail) => (
                      <div key={`${entry.id}-${detail.label}`} className={styles.headerEntryDetailItem}>
                        <span className={styles.headerEntryMetaLabel}>{detail.label}</span>
                        <span className={styles.headerEntryMetaValue}>{displaySavedValue(detail.value)}</span>
                      </div>
                    ))}
                  </div>
                  <div className={styles.headerEntryCardDate}>
                    {formatDisplayDate(entry.creationDate) || "-"}
                  </div>
                </div>
              ) : null}
            </div>
          ))
        ) : (
          <p className={styles.messageInfo}>No entries found.</p>
        )}
      </div>
    </>
  );
});

export default DrawFrameHeaderEntry;
