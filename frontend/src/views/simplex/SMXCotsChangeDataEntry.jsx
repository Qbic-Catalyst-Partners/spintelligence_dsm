import React, { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import SearchableSelect from "@/components/SearchableSelect";
import NotebookCustomFields from "@/components/NotebookCustomFields";
import { fetchSimplexMachineMaster } from "@/apis/simplex";
import { createSmxMachineOptions } from "@/views/simplex/smxMachineNames";
import {
  getSimplexCotsChangeEntries,
  submitSimplexCotsChange,
} from "@/store/slices/simplex";
import { saveNotebookCustomFieldValuesApi } from "@/apis/notebookCustomFieldsApi";

const detailItems = [
  "Front Cots Damage",
  "Third Cots Damage",
  "Back Cots Damage",
  "Apron Damage",
  "Front Cots Tilting",
  "Second Cots Tilting",
  "Third Cots Tilting",
  "Back Cots Tilting",
  "Cradle Lifting",
  "Floating Condensor Missing",
  "Middle Condensor Missing",
  "Back Condensor Missing",
  "Others 1",
  "Others 2",
];

const today = new Date().toISOString().split("T")[0];
const defaultFieldStyle = { backgroundColor: "#f1f5f9" };
const defaultTableFieldStyle = { backgroundColor: "#ffffff" };
const topInputClass =
  "w-full h-[38px] px-3 py-2 border border-slate-200 rounded-lg bg-slate-100 text-[14px] focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-colors disabled:bg-slate-100 disabled:text-slate-700 disabled:opacity-100";
const getFieldStyle = (flag, variant = "default") =>
  flag
    ? { borderColor: "#ef4444", backgroundColor: "#fff1f2" }
    : variant === "table"
      ? defaultTableFieldStyle
      : defaultFieldStyle;

const createDetailRows = () =>
  detailItems.map((item) => ({
    item,
    value: "",
  }));

const SMXCotsChangeDataEntry = forwardRef(function SMXCotsChangeDataEntry(
  { selectedTypeName = "SMXCots Change Data Entry", onTypeChange, typeOptions = [], entryId = "" },
  ref
) {
  const dispatch = useDispatch();
  const { isLoading } = useSelector((state) => state.simplex ?? {});
  const [form, setForm] = useState({
    type: "SMXCots Change Data Entry",
    date: today,
    mcName: "",
  });
  const [details, setDetails] = useState(createDetailRows);
  const [errors, setErrors] = useState({});
  const [machineOptions, setMachineOptions] = useState(createSmxMachineOptions);
  const [customFieldValues, setCustomFieldValues] = useState({});

  const handleCustomFieldChange = (fieldId, value) => {
    setCustomFieldValues((prev) => ({ ...prev, [fieldId]: value }));
  };

  useEffect(() => {
    let active = true;

    fetchSimplexMachineMaster()
      .then((options) => {
        if (!active) return;
        const apiOptions = Array.isArray(options) ? options : [];
        const merged = [
          ...createSmxMachineOptions(),
          ...apiOptions.map((item) => {
            const machineName = String(item?.label || item?.value || item?.mc_name || item?.mc_no || item || "").trim();
            return machineName ? { value: machineName, label: machineName } : null;
          }).filter(Boolean),
        ];
        const seen = new Set();
        setMachineOptions(
          merged.filter((item) => {
            if (seen.has(item.value)) return false;
            seen.add(item.value);
            return true;
          })
        );
      })
      .catch(() => {
        if (!active) return;
        setMachineOptions(createSmxMachineOptions());
      });

    return () => {
      active = false;
    };
  }, []);

  const handleFormChange = (field, value) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
    setErrors((prev) => {
      if (!prev.form?.[field]) return prev;
      const nextForm = { ...(prev.form || {}) };
      delete nextForm[field];
      return { ...prev, form: nextForm };
    });
  };

  const handleDetailChange = (index, field, value) => {
    setDetails((current) =>
      current.map((detail, detailIndex) =>
        detailIndex === index
          ? {
              ...detail,
              [field]: value,
            }
          : detail
      )
    );
    setErrors((prev) => {
      if (!prev.details?.[index]?.[field]) return prev;
      const nextDetails = { ...(prev.details || {}) };
      const nextRow = { ...(nextDetails[index] || {}) };
      delete nextRow[field];
      nextDetails[index] = nextRow;
      return { ...prev, details: nextDetails };
    });
  };

  const clear = () => {
    setForm({
      type: "SMXCots Change Data Entry",
      date: today,
      mcName: "",
    });
    setDetails(createDetailRows());
    setErrors({});
    setCustomFieldValues({});
  };

  const validate = () => {
    const nextErrors = {
      form: {},
      details: {},
    };

    if (!form.type.trim()) nextErrors.form.type = true;
    if (!form.date.trim()) nextErrors.form.date = true;
    if (!form.mcName.trim()) nextErrors.form.mcName = true;

    details.forEach((detail, index) => {
      const detailErrors = {};
      if (!detail.value.trim()) detailErrors.value = true;
      if (Object.keys(detailErrors).length) nextErrors.details[index] = detailErrors;
    });

    setErrors(nextErrors);
    return (
      Object.keys(nextErrors.form).length === 0 &&
      Object.keys(nextErrors.details).length === 0
    );
  };

  const buildPayload = () => ({
    type: selectedTypeName || form.type,
    entry_id: entryId,
    entry_date: form.date,
    machine_name: form.mcName,
    items: details.map((detail) => ({
      item_name: detail.item,
      status_value: detail.value,
    })),
  });

  const submit = async () => {
    if (!validate()) return false;
    const resultAction = await dispatch(submitSimplexCotsChange(buildPayload()));

    if (submitSimplexCotsChange.fulfilled.match(resultAction)) {
      dispatch(getSimplexCotsChangeEntries({ page: 1, limit: 10 }));

      const linkedEntryId = entryId;
      const customFieldEntries = Object.entries(customFieldValues).filter(([, v]) => String(v ?? '').trim() !== '');
      if (linkedEntryId && customFieldEntries.length) {
        try {
          await saveNotebookCustomFieldValuesApi(
            linkedEntryId,
            customFieldEntries.map(([customFieldId, value]) => ({ custom_field_id: customFieldId, value }))
          );
        } catch (customFieldError) {
          console.error("Failed to save custom field values:", customFieldError);
        }
      }

      return true;
    }

    return false;
  };

  const getPreviewData = () => {
    const items = [
      { label: "Type", value: form.type },
      { label: "Entry ID", value: entryId || "-" },
      { label: "MC Name", value: form.mcName },
    ];

    details.forEach((detail, index) => {
      items.push({ label: `${index + 1}. ${detail.item}`, value: detail.value || "-" });
    });

    return items;
  };

  useImperativeHandle(ref, () => ({
    clear,
    validate,
    getPreviewData,
    submit,
  }));

  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-3 gap-[18px]">
          <div className="flex flex-col gap-1.5 min-w-0">
            <label className="text-[14px] font-semibold text-slate-700">Type</label>
            <select
            className={`h-[38px] px-3 py-2 border border-slate-200 rounded-lg bg-slate-100 text-[14px] focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-colors ${
              errors.form?.type ? "border-red-500 focus:ring-red-400 focus:border-red-500" : ""
            }`}
            style={getFieldStyle(errors.form?.type)}
            value={selectedTypeName}
            onChange={(e) => onTypeChange?.(e.target.value)}
          >
            {typeOptions.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
            </select>
          </div>

        <div className="flex flex-col gap-1.5 min-w-0">
          <label className="text-[14px] font-semibold text-slate-700">Entry ID</label>
          <input
            type="text"
            className={topInputClass}
            style={{ backgroundColor: "#f1f5f9" }}
            value={entryId}
            disabled
            readOnly
          />
        </div>

        <div className="flex flex-col gap-1.5 min-w-0">
          <label className="text-[14px] font-semibold text-slate-700">MC Name</label>
          <SearchableSelect
            className={`h-[38px] px-3 py-2 border border-slate-200 rounded-lg bg-slate-100 text-[14px] focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-colors ${
              errors.form?.mcName ? "border-red-500 focus:ring-red-400 focus:border-red-500" : ""
            }`}
            value={form.mcName}
            onChange={(value) => handleFormChange("mcName", value)}
            options={machineOptions}
            placeholder="-- Select MC Name --"
            ariaLabel="MC Name"
          />
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <h3 className="m-0 text-[14px] font-bold text-slate-900">Damage / Status Details</h3>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="grid grid-cols-1 gap-x-5 gap-y-4 md:grid-cols-2 xl:grid-cols-3 print:grid-cols-3">
            {details.map((detail, index) => (
              <div key={detail.item} className="flex flex-col gap-1.5 min-w-0">
                <label className="text-[14px] font-semibold text-slate-700">{detail.item}</label>
                <input
                  type="text"
                  className={`w-full h-[38px] px-3 py-2 border border-slate-200 rounded-lg bg-slate-100 text-[14px] focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-colors ${
                    errors.details?.[index]?.value ? "border-red-500 focus:ring-red-400 focus:border-red-500" : ""
                  }`}
                  style={getFieldStyle(errors.details?.[index]?.value)}
                  value={detail.value}
                  onChange={(e) => handleDetailChange(index, "value", e.target.value)}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
      {isLoading ? <p style={{ marginTop: "12px", color: "#2563eb" }}>Saving...</p> : null}

      <NotebookCustomFields
        department="Quality Control"
        subDepartment="Simplex"
        notebook="SMXCots Change Data Entry"
        entryId={entryId}
        values={customFieldValues}
        onChange={handleCustomFieldChange}
      />
    </div>
  );
});

export default SMXCotsChangeDataEntry;
