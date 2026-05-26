import React, { forwardRef, useImperativeHandle, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  getSimplexCotsChangeEntries,
  submitSimplexCotsChange,
} from "@/store/slices/simplex";

const detailItems = [
  "Cots Damage",
  "Apron Damage",
  "Cots Tilting",
  "Cradle Lifting",
  "Condensor Missing",
];

const machineOptions = ["MC-01", "MC-02", "MC-03", "MC-04", "MC-05", "MC-06"];
const today = new Date().toISOString().split("T")[0];
const defaultFieldStyle = { backgroundColor: "#f1f5f9" };
const defaultTableFieldStyle = { backgroundColor: "#f8fafc" };
const getFieldStyle = (flag, variant = "default") =>
  flag
    ? { borderColor: "#ef4444", backgroundColor: "#fff1f2" }
    : variant === "table"
      ? defaultTableFieldStyle
      : defaultFieldStyle;

const createDetailRows = () =>
  detailItems.map((item) => ({
    item,
    statusValue: "",
    remarks: "",
  }));

const SMXCotsChangeDataEntry = forwardRef(function SMXCotsChangeDataEntry(
  { selectedTypeName = "SMXCots Change Data Entry", onTypeChange, typeOptions = [], entryId = "" },
  ref
) {
  const dispatch = useDispatch();
  const { isLoading } = useSelector((state) => state.simplex ?? {});
  const [form, setForm] = useState({
    type: "SMXCots Change Data Entry",
    serialNo: "1",
    date: today,
    mcName: "",
  });
  const [details, setDetails] = useState(createDetailRows);
  const [errors, setErrors] = useState({});

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
      serialNo: "1",
      date: today,
      mcName: "",
    });
    setDetails(createDetailRows());
    setErrors({});
  };

  const validate = () => {
    const nextErrors = {
      form: {},
      details: {},
    };

    if (!form.type.trim()) nextErrors.form.type = true;
    if (!form.serialNo.trim()) nextErrors.form.serialNo = true;
    if (!form.date.trim()) nextErrors.form.date = true;
    if (!form.mcName.trim()) nextErrors.form.mcName = true;

    details.forEach((detail, index) => {
      const detailErrors = {};
      if (!detail.statusValue.trim()) detailErrors.statusValue = true;
      if (!detail.remarks.trim()) detailErrors.remarks = true;
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
    s_no: form.serialNo,
    entry_date: form.date,
    machine_name: form.mcName,
    items: details.map((detail) => ({
      item_name: detail.item,
      status_value: detail.statusValue,
      remarks: detail.remarks,
    })),
  });

  const submit = async () => {
    if (!validate()) return false;
    const resultAction = await dispatch(submitSimplexCotsChange(buildPayload()));

    if (submitSimplexCotsChange.fulfilled.match(resultAction)) {
      dispatch(getSimplexCotsChangeEntries({ page: 1, limit: 10 }));
      return true;
    }

    return false;
  };

  const getPreviewData = () => {
    const items = [
      { label: "Type", value: form.type },
      { label: "S. No.", value: form.serialNo },
      { label: "Entry ID", value: entryId || "-" },
      { label: "MC Name", value: form.mcName },
    ];

    details.forEach((detail, index) => {
      items.push({ label: `${index + 1}. ${detail.item} - Status`, value: detail.statusValue || "-" });
      items.push({ label: `${index + 1}. ${detail.item} - Remarks`, value: detail.remarks || "-" });
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
          <label className="text-[14px] font-semibold text-slate-700">S. No.</label>
          <input
            type="text"
            className={`w-full h-[38px] px-3 py-2 border border-slate-200 rounded-lg bg-slate-100 text-[14px] focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-colors ${
              errors.form?.serialNo ? "border-red-500 focus:ring-red-400 focus:border-red-500" : ""
            }`}
            style={getFieldStyle(errors.form?.serialNo)}
            value={form.serialNo}
            onChange={(e) => handleFormChange("serialNo", e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5 min-w-0">
          <label className="text-[14px] font-semibold text-slate-700">Entry ID</label>
          <input
            type="text"
            className="w-full h-[38px] px-3 py-2 border border-slate-200 rounded-lg bg-slate-100 text-[14px] focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-colors"
            value={entryId}
            disabled
            readOnly
          />
        </div>

        <div className="flex flex-col gap-1.5 min-w-0">
          <label className="text-[14px] font-semibold text-slate-700">MC Name</label>
          <select
            className={`h-[38px] px-3 py-2 border border-slate-200 rounded-lg bg-slate-100 text-[14px] focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-colors ${
              errors.form?.mcName ? "border-red-500 focus:ring-red-400 focus:border-red-500" : ""
            }`}
            style={getFieldStyle(errors.form?.mcName)}
            value={form.mcName}
            onChange={(e) => handleFormChange("mcName", e.target.value)}
          >
            <option value="">Select MC Name</option>
            {machineOptions.map((machine) => (
              <option key={machine} value={machine}>
                {machine}
              </option>
            ))}
          </select>
        </div>

        <div />
        <div />
      </div>

      <div className="flex flex-col gap-4">
        <h3 className="m-0 text-[14px] font-bold text-slate-900">Damage / Status Details</h3>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="grid grid-cols-[1.1fr_1fr_1.4fr] gap-3 px-4 pb-3 text-[14px] font-bold text-slate-800">
            <div>Item</div>
            <div>Status / Value</div>
            <div>Remarks</div>
          </div>

          <div className="flex flex-col gap-3">
            {details.map((detail, index) => (
              <div
                key={detail.item}
                className="grid grid-cols-[1.1fr_1fr_1.4fr] items-center gap-3 px-4"
              >
                <div className="text-[14px] text-slate-700">{detail.item}</div>

                <input
                  type="text"
                  className={`w-full h-[38px] px-3 py-2 border border-slate-200 rounded-lg bg-white text-[14px] focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-colors ${
                    errors.details?.[index]?.statusValue ? "border-red-500 focus:ring-red-400 focus:border-red-500" : ""
                  }`}
                  style={getFieldStyle(errors.details?.[index]?.statusValue, "table")}
                  value={detail.statusValue}
                  onChange={(e) => handleDetailChange(index, "statusValue", e.target.value)}
                />

                <input
                  type="text"
                  className={`w-full h-[38px] px-3 py-2 border border-slate-200 rounded-lg bg-white text-[14px] focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-colors ${
                    errors.details?.[index]?.remarks ? "border-red-500 focus:ring-red-400 focus:border-red-500" : ""
                  }`}
                  style={getFieldStyle(errors.details?.[index]?.remarks, "table")}
                  value={detail.remarks}
                  onChange={(e) => handleDetailChange(index, "remarks", e.target.value)}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
      {isLoading ? <p style={{ marginTop: "12px", color: "#2563eb" }}>Saving...</p> : null}
    </div>
  );
});

export default SMXCotsChangeDataEntry;
