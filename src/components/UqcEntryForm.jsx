import React, { forwardRef, useImperativeHandle, useState } from "react";
import { sanitizeNumericInput } from "@/utils/inputValidation";

const today = new Date().toISOString().split("T")[0];

const topFieldClass =
  "w-full h-[38px] px-3 py-2 border border-slate-200 rounded-lg bg-slate-100 text-[14px] focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-colors";

const textareaClass =
  "w-full min-h-[92px] px-3 py-2 border border-slate-200 rounded-lg bg-slate-100 text-[14px] focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-colors resize-none";

const errorClass = (flag) =>
  flag ? " border-red-500 focus:ring-red-400 focus:border-red-500" : "";

const errorStyle = (flag) =>
  flag ? { borderColor: "#ef4444", backgroundColor: "#fff1f2" } : undefined;

const createInitialForm = (departmentValue) => ({
  entry_type: "U% Data Entry",
  entry_date: today,
  shift: "",
  variety: "",
  department: departmentValue,
  mc_no: "",
  u_percent: "",
  cvm: "",
  cvm_1m: "",
  cvm_3m: "",
  remarks: "",
});

const UQC_NUMERIC_FIELDS = new Set(["u_percent", "cvm", "cvm_1m", "cvm_3m"]);

const UqcEntryForm = forwardRef(function UqcEntryForm(
  {
    typeOptions = [],
    selectedType,
    onTypeChange,
    departmentValue,
    shiftOptions = ["Shift A", "Shift B", "Shift C"],
    varietyOptions = ["Cotton"],
    machineOptions = ["MC-01", "MC-02", "MC-03", "MC-04"],
    submitHandler,
    hideTypeField = false,
  },
  ref
) {
  const [form, setForm] = useState(() => createInitialForm(departmentValue));
  const [errors, setErrors] = useState({});

  const handleChange = (field, value) => {
    const nextValue = UQC_NUMERIC_FIELDS.has(field)
      ? sanitizeNumericInput(value, { precision: 10, scale: 2 })
      : value;

    setForm((current) => ({
      ...current,
      [field]: nextValue,
    }));
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const clear = () => {
    setForm(createInitialForm(departmentValue));
    setErrors({});
  };

  const validate = () => {
    const nextErrors = {};
    if (!hideTypeField && !selectedType?.trim()) nextErrors.entry_type = true;
    if (!form.entry_date.trim()) nextErrors.entry_date = true;
    if (!form.shift.trim()) nextErrors.shift = true;
    if (!form.variety.trim()) nextErrors.variety = true;
    if (!form.department.trim()) nextErrors.department = true;
    if (!form.mc_no.trim()) nextErrors.mc_no = true;
    if (form.u_percent === "") nextErrors.u_percent = true;
    if (form.cvm === "") nextErrors.cvm = true;
    if (form.cvm_1m === "") nextErrors.cvm_1m = true;
    if (form.cvm_3m === "") nextErrors.cvm_3m = true;
    if (!form.remarks.trim()) nextErrors.remarks = true;

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const getPayload = () => ({
    entry_type: "U% Data Entry",
    entry_date: form.entry_date,
    shift: form.shift,
    variety: form.variety,
    department: form.department,
    mc_no: form.mc_no,
    u_percent: Number(form.u_percent),
    cvm: Number(form.cvm),
    cvm_1m: Number(form.cvm_1m),
    cvm_3m: Number(form.cvm_3m),
    remarks: form.remarks.trim(),
  });

  const submit = async () => {
    if (!validate()) return false;
    await submitHandler?.(getPayload());
    return true;
  };

  const getPreviewData = () => [
    { label: "Type", value: "U% Data Entry" },
    { label: "Entry Date", value: form.entry_date || "-" },
    { label: "Shift", value: form.shift || "-" },
    { label: "Variety", value: form.variety || "-" },
    { label: "Department", value: form.department || "-" },
    { label: "MC No.", value: form.mc_no || "-" },
    { label: "U%", value: form.u_percent || "-" },
    { label: "CVM", value: form.cvm || "-" },
    { label: "1m CVM", value: form.cvm_1m || "-" },
    { label: "3m CVM", value: form.cvm_3m || "-" },
    { label: "Remarks", value: form.remarks || "-" },
  ];

  useImperativeHandle(ref, () => ({
    clear,
    validate,
    getPreviewData,
    getPayload,
    submit,
  }));

  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-3 gap-[18px]">
        {!hideTypeField && (
          <div className="flex flex-col gap-1.5 min-w-0">
            <label className="text-[14px] font-semibold text-slate-700">Type</label>
            <select
              className={`${topFieldClass}${errorClass(errors.entry_type)}`}
              value={selectedType}
              onChange={(e) => onTypeChange?.(e.target.value)}
              style={errorStyle(errors.entry_type)}
            >
              {typeOptions.map((option) => (
                <option key={option.id} value={option.name}>
                  {option.displayName ?? option.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex flex-col gap-1.5 min-w-0">
          <label className="text-[14px] font-semibold text-slate-700">Entry Date</label>
          <input
            type="date"
            className={`${topFieldClass}${errorClass(errors.entry_date)}`}
            value={form.entry_date}
            onChange={(e) => handleChange("entry_date", e.target.value)}
            style={errorStyle(errors.entry_date)}
          />
        </div>

        <div className="flex flex-col gap-1.5 min-w-0">
          <label className="text-[14px] font-semibold text-slate-700">Shift</label>
          <select
            className={`${topFieldClass}${errorClass(errors.shift)}`}
            value={form.shift}
            onChange={(e) => handleChange("shift", e.target.value)}
            style={errorStyle(errors.shift)}
          >
            <option value="">Select Shift</option>
            {shiftOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5 min-w-0">
          <label className="text-[14px] font-semibold text-slate-700">Variety</label>
          <select
            className={`${topFieldClass}${errorClass(errors.variety)}`}
            value={form.variety}
            onChange={(e) => handleChange("variety", e.target.value)}
            style={errorStyle(errors.variety)}
          >
            <option value="">Select Variety</option>
            {varietyOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5 min-w-0">
          <label className="text-[14px] font-semibold text-slate-700">Department</label>
          <input
            type="text"
            className={`${topFieldClass}${errorClass(errors.department)}`}
            value={form.department}
            readOnly
            style={errorStyle(errors.department)}
          />
        </div>

        <div className="flex flex-col gap-1.5 min-w-0">
          <label className="text-[14px] font-semibold text-slate-700">MC No.</label>
          <select
            className={`${topFieldClass}${errorClass(errors.mc_no)}`}
            value={form.mc_no}
            onChange={(e) => handleChange("mc_no", e.target.value)}
            style={errorStyle(errors.mc_no)}
          >
            <option value="">Select MC No.</option>
            {machineOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5 min-w-0">
          <label className="text-[14px] font-semibold text-slate-700">U%</label>
          <input
            type="number"
            step="0.01"
            className={`${topFieldClass}${errorClass(errors.u_percent)}`}
            value={form.u_percent}
            onChange={(e) => handleChange("u_percent", e.target.value)}
            inputMode="decimal"
            style={errorStyle(errors.u_percent)}
          />
        </div>

        <div className="flex flex-col gap-1.5 min-w-0">
          <label className="text-[14px] font-semibold text-slate-700">CVM</label>
          <input
            type="number"
            step="0.01"
            className={`${topFieldClass}${errorClass(errors.cvm)}`}
            value={form.cvm}
            onChange={(e) => handleChange("cvm", e.target.value)}
            inputMode="decimal"
            style={errorStyle(errors.cvm)}
          />
        </div>

        <div className="flex flex-col gap-1.5 min-w-0">
          <label className="text-[14px] font-semibold text-slate-700">1m CVM</label>
          <input
            type="number"
            step="0.01"
            className={`${topFieldClass}${errorClass(errors.cvm_1m)}`}
            value={form.cvm_1m}
            onChange={(e) => handleChange("cvm_1m", e.target.value)}
            inputMode="decimal"
            style={errorStyle(errors.cvm_1m)}
          />
        </div>

        <div className="flex flex-col gap-1.5 min-w-0">
          <label className="text-[14px] font-semibold text-slate-700">3m CVM</label>
          <input
            type="number"
            step="0.01"
            className={`${topFieldClass}${errorClass(errors.cvm_3m)}`}
            value={form.cvm_3m}
            onChange={(e) => handleChange("cvm_3m", e.target.value)}
            inputMode="decimal"
            style={errorStyle(errors.cvm_3m)}
          />
        </div>

        <div className="col-span-3 flex flex-col gap-1.5 min-w-0">
          <label className="text-[14px] font-semibold text-slate-700">Remarks</label>
          <textarea
            className={`${textareaClass}${errorClass(errors.remarks)}`}
            value={form.remarks}
            onChange={(e) => handleChange("remarks", e.target.value)}
            style={errorStyle(errors.remarks)}
          />
        </div>
      </div>
    </div>
  );
});

export default UqcEntryForm;
