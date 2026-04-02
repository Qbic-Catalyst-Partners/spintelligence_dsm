import React, { forwardRef, useImperativeHandle, useMemo, useState } from "react";

const detailItems = [
  "Cots Damage",
  "Apron Damage",
  "Cots Tilting",
  "Cradle Lifting",
  "Condensor Missing",
];

const machineOptions = ["MC-01", "MC-02", "MC-03", "MC-04", "MC-05", "MC-06"];
const typeOptions = ["SMXCots Change Data Entry", "SMX Breaks Study Report"];
const today = new Date().toISOString().split("T")[0];

const createDetailRows = () =>
  detailItems.map((item) => ({
    item,
    statusValue: "",
    remarks: "",
  }));

const SMXCotsChangeDataEntry = forwardRef(function SMXCotsChangeDataEntry(
  { selectedTypeName, onTypeChange },
  ref
) {
  const [form, setForm] = useState({
    type: "SMXCots Change Data Entry",
    serialNo: "1",
    date: today,
    mcName: "",
  });
  const [details, setDetails] = useState(createDetailRows);

  const canSubmit = useMemo(() => {
    if (!form.type.trim() || !form.serialNo.trim() || !form.date.trim() || !form.mcName.trim()) {
      return false;
    }

    return details.every(
      (detail) => detail.statusValue.trim() !== "" && detail.remarks.trim() !== ""
    );
  }, [details, form]);

  const handleFormChange = (field, value) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
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
  };

  const clear = () => {
    setForm({
      type: "SMXCots Change Data Entry",
      serialNo: "1",
      date: today,
      mcName: "",
    });
    setDetails(createDetailRows());
  };

  const submit = () => {
    if (!canSubmit) {
      alert("Please fill all fields.");
      return;
    }

    alert("SMX Cots Change data is ready to save.");
  };

  useImperativeHandle(ref, () => ({
    clear,
    submit,
  }));

  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-3 gap-[18px]">
        <div className="flex flex-col gap-1.5 min-w-0">
          <label className="text-[14px] font-semibold text-slate-700">Type</label>
          <select
            className="h-[38px] px-3 py-2 border border-slate-200 rounded-lg bg-slate-100 text-[14px] focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-colors"
            value={selectedTypeName}
            onChange={(e) => {
              handleFormChange("type", e.target.value);
              onTypeChange?.(e.target.value);
            }}
          >
            {typeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5 min-w-0">
          <label className="text-[14px] font-semibold text-slate-700">S. No.</label>
          <input
            type="text"
            className="w-full h-[38px] px-3 py-2 border border-slate-200 rounded-lg bg-slate-100 text-[14px] focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-colors"
            value={form.serialNo}
            onChange={(e) => handleFormChange("serialNo", e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5 min-w-0">
          <label className="text-[14px] font-semibold text-slate-700">Date</label>
          <input
            type="date"
            className="w-full h-[38px] px-3 py-2 border border-slate-200 rounded-lg bg-slate-100 text-[14px] focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-colors"
            value={form.date}
            onChange={(e) => handleFormChange("date", e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5 min-w-0 max-w-[280px]">
          <label className="text-[14px] font-semibold text-slate-700">MC Name</label>
          <select
            className="h-[38px] px-3 py-2 border border-slate-200 rounded-lg bg-slate-100 text-[14px] focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-colors"
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
                  className="w-full h-[38px] px-3 py-2 border border-slate-200 rounded-lg bg-white text-[14px] focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-colors"
                  value={detail.statusValue}
                  onChange={(e) => handleDetailChange(index, "statusValue", e.target.value)}
                />

                <input
                  type="text"
                  className="w-full h-[38px] px-3 py-2 border border-slate-200 rounded-lg bg-white text-[14px] focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-colors"
                  value={detail.remarks}
                  onChange={(e) => handleDetailChange(index, "remarks", e.target.value)}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
});

export default SMXCotsChangeDataEntry;
