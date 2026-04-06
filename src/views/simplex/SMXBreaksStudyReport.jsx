import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useDispatch, useSelector } from "react-redux";
import { submitSimplexStudyReport } from "@/store/slices/simplex";

const today = new Date().toISOString().split("T")[0];

const simplexOptions = ["SX-01", "SX-02", "SX-03", "SX-04", "SX-05", "SX-06"];

const topFieldClass =
  "w-full h-[42px] rounded-[10px] border border-slate-200 bg-slate-50 px-3 text-[14px] text-slate-700 outline-none transition focus:border-[#3d539f] focus:ring-2 focus:ring-[#d7def5]";
const tableFieldClass =
  "w-full h-[40px] rounded-[8px] border border-slate-200 bg-slate-50 px-3 text-[13px] text-slate-600 outline-none transition focus:border-[#3d539f] focus:ring-2 focus:ring-[#d7def5]";

const breakColumns = [
  "Roving Breaks at Finger",
  "Roving Breaks at Front Roller Nip",
  "Roving Breaks at Between Flyer",
  "Undraft",
  "Top Roller Lapping",
  "Bottom Roller Lapping",
  "Silver Breaks",
  "Can Exhaust",
  "Unknown Stop",
];

const breakRows = [
  "0 - 200",
  "201 - 400",
  "401 - 600",
  "601 - 800",
  "801 - 1000",
  "1001 - 1200",
  "1201 - 1400",
  "Repeated Spindle",
];

const formatNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : "0.00";
};

const parseNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const createInitialForm = () => ({
  type: "SMX Breaks Study Report",
  simplexNo: "",
  date: today,
  startTime: "",
  endTime: "",
  tpi: "",
  tpm: "",
  startHk: "",
  finishHk: "",
  averageSpeed: "",
  hank: "",
  mixing: "",
  rovingHk: "",
  doffLength: "",
  rhPercent: "",
  tempPercent: "",
  ttSpdl: "",
  runningSpdl: "",
  ideals: "",
  sName: "",
});

const createInitialBreakMatrix = () =>
  breakRows.reduce((rowAccumulator, rowLabel) => {
    rowAccumulator[rowLabel] = breakColumns.reduce((columnAccumulator, columnLabel) => {
      columnAccumulator[columnLabel] = "0.00";
      return columnAccumulator;
    }, {});
    return rowAccumulator;
  }, {});

const errorClass = (flag) =>
  flag ? " border-red-500 bg-rose-50 focus:border-red-500 focus:ring-red-200" : "";
const topFieldStyle = { backgroundColor: "#f1f5f9" };
const tableFieldStyle = { backgroundColor: "#f8fafc" };
const getFieldStyle = (flag, variant = "top") =>
  flag
    ? { borderColor: "#ef4444", backgroundColor: "#fff1f2" }
    : variant === "table"
      ? tableFieldStyle
      : topFieldStyle;

const formatLabel = (value) =>
  value
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (char) => char.toUpperCase())
    .replace("Rh Percent", "RH%")
    .replace("Temp Percent", "TEMP%")
    .replace("Tt Spdl", "TT_SPDL")
    .replace("S Name", "S. Name");

const SMXBreaksStudyReport = forwardRef(function SMXBreaksStudyReport(
  {
    selectedTypeName = "SMX Breaks Study Report",
    onTypeChange,
    typeOptions = [],
    tablePortalTargetId,
  },
  ref
) {
  const dispatch = useDispatch();
  const { isLoading } = useSelector((state) => state.simplex ?? {});
  const [form, setForm] = useState(createInitialForm);
  const [breakMatrix, setBreakMatrix] = useState(createInitialBreakMatrix);
  const [errors, setErrors] = useState({ form: {}, matrix: {} });
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  const totalTime = useMemo(() => {
    if (!form.startTime || !form.endTime) return "";

    const [startHours, startMinutes, startSeconds = "0"] = form.startTime.split(":");
    const [endHours, endMinutes, endSeconds = "0"] = form.endTime.split(":");

    const start = Number(startHours) * 3600 + Number(startMinutes) * 60 + Number(startSeconds);
    const end = Number(endHours) * 3600 + Number(endMinutes) * 60 + Number(endSeconds);

    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return "";

    const diff = end - start;
    const hours = String(Math.floor(diff / 3600)).padStart(2, "0");
    const minutes = String(Math.floor((diff % 3600) / 60)).padStart(2, "0");
    const seconds = String(diff % 60).padStart(2, "0");

    return `${hours}:${minutes}:${seconds}`;
  }, [form.endTime, form.startTime]);

  const columnTotals = useMemo(
    () =>
      breakColumns.reduce((accumulator, columnLabel) => {
        accumulator[columnLabel] = breakRows.reduce(
          (sum, rowLabel) => sum + parseNumber(breakMatrix[rowLabel]?.[columnLabel]),
          0
        );
        return accumulator;
      }, {}),
    [breakMatrix]
  );

  const grandTotal = useMemo(
    () => Object.values(columnTotals).reduce((sum, value) => sum + value, 0),
    [columnTotals]
  );

  const percentageTotals = useMemo(
    () =>
      breakColumns.reduce((accumulator, columnLabel) => {
        const total = columnTotals[columnLabel] || 0;
        accumulator[columnLabel] = grandTotal > 0 ? (total / grandTotal) * 100 : 0;
        return accumulator;
      }, {}),
    [columnTotals, grandTotal]
  );

  const handleFormChange = (field, value) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));

    setErrors((previous) => {
      if (!previous.form?.[field]) return previous;
      const nextForm = { ...(previous.form || {}) };
      delete nextForm[field];
      return { ...previous, form: nextForm };
    });
  };

  const handleMatrixChange = (rowLabel, columnLabel, value) => {
    const sanitized = value === "" ? "" : value.replace(/[^\d.]/g, "");

    setBreakMatrix((current) => ({
      ...current,
      [rowLabel]: {
        ...current[rowLabel],
        [columnLabel]: sanitized,
      },
    }));

    setErrors((previous) => {
      if (!previous.matrix?.[rowLabel]?.[columnLabel]) return previous;
      const nextMatrix = { ...(previous.matrix || {}) };
      const nextRow = { ...(nextMatrix[rowLabel] || {}) };
      delete nextRow[columnLabel];
      nextMatrix[rowLabel] = nextRow;
      return { ...previous, matrix: nextMatrix };
    });
  };

  const clear = () => {
    setForm(createInitialForm());
    setBreakMatrix(createInitialBreakMatrix());
    setErrors({ form: {}, matrix: {} });
  };

  const validate = () => {
    const nextErrors = { form: {}, matrix: {} };

    Object.entries(form).forEach(([key, value]) => {
      if (String(value).trim() === "") nextErrors.form[key] = true;
    });

    breakRows.forEach((rowLabel) => {
      breakColumns.forEach((columnLabel) => {
        if (String(breakMatrix[rowLabel]?.[columnLabel] ?? "").trim() === "") {
          if (!nextErrors.matrix[rowLabel]) nextErrors.matrix[rowLabel] = {};
          nextErrors.matrix[rowLabel][columnLabel] = true;
        }
      });
    });

    setErrors(nextErrors);

    return (
      Object.keys(nextErrors.form).length === 0 &&
      Object.keys(nextErrors.matrix).length === 0
    );
  };

  const getPreviewData = () => {
    const items = [
      { label: "Type", value: selectedTypeName || form.type },
      ...Object.entries(form)
        .filter(([key]) => key !== "type")
        .map(([key, value]) => ({
          label: formatLabel(key),
          value: value || "-",
        })),
      { label: "Total Time", value: totalTime || "-" },
    ];

    breakRows.forEach((rowLabel) => {
      breakColumns.forEach((columnLabel) => {
        items.push({
          label: `${rowLabel} - ${columnLabel}`,
          value: breakMatrix[rowLabel]?.[columnLabel] || "0.00",
        });
      });
    });

    breakColumns.forEach((columnLabel) => {
      items.push({
        label: `Total Breaks - ${columnLabel}`,
        value: formatNumber(columnTotals[columnLabel]),
      });
      items.push({
        label: `Breaks % - ${columnLabel}`,
        value: `${formatNumber(percentageTotals[columnLabel])}%`,
      });
    });

    return items;
  };

  const formFields = [
    { label: "Type", field: "type", type: "select", options: typeOptions, value: selectedTypeName || form.type },
    { label: "Simplex No.", field: "simplexNo", type: "select", options: simplexOptions, placeholder: "Select" },
    { label: "Date", field: "date", type: "date" },
    { label: "Start Time", field: "startTime", type: "time" },
    { label: "End Time", field: "endTime", type: "time" },
    { label: "Total Time", field: "totalTime", type: "readonly", value: totalTime || "HH:MM:SS" },
    { label: "TPI", field: "tpi", type: "text" },
    { label: "TPM", field: "tpm", type: "text" },
    { label: "Start HK", field: "startHk", type: "text" },
    { label: "Finish HK", field: "finishHk", type: "text" },
    { label: "Average Speed", field: "averageSpeed", type: "text" },
    { label: "Hank", field: "hank", type: "text", placeholder: "Lorem Ipsum" },
    { label: "Mixing", field: "mixing", type: "text" },
    { label: "Roving HK", field: "rovingHk", type: "text" },
    { label: "Doff Length", field: "doffLength", type: "text" },
    { label: "RH%", field: "rhPercent", type: "text" },
    { label: "TEMP%", field: "tempPercent", type: "text" },
    { label: "TT_SPDL", field: "ttSpdl", type: "text" },
    { label: "Running Spdl", field: "runningSpdl", type: "text" },
    { label: "ideals", field: "ideals", type: "text", placeholder: "Lorem Ipsum" },
    { label: "S. Name", field: "sName", type: "text" },
  ];

  const tableSection = (
    <section className="overflow-x-auto px-1">
      <div className="min-w-[1120px]">
        <div className="grid grid-cols-[100px_repeat(9,minmax(0,1fr))] gap-x-3 gap-y-4 text-[11px] font-semibold uppercase tracking-[0.01em] text-slate-600">
          <div className="flex items-end pb-2">Length</div>
          {breakColumns.map((columnLabel) => (
            <div key={columnLabel} className="flex items-end pb-2 leading-5">
              {columnLabel}
            </div>
          ))}
        </div>

        <div className="mt-1 flex flex-col gap-3">
          {breakRows.map((rowLabel) => (
            <div
              key={rowLabel}
              className="grid grid-cols-[100px_repeat(9,minmax(0,1fr))] items-center gap-x-3 gap-y-3"
            >
              <div className="text-[12px] font-semibold uppercase text-slate-700">
                {rowLabel}
              </div>

              {breakColumns.map((columnLabel) => (
                <input
                  key={`${rowLabel}-${columnLabel}`}
                  type="text"
                  inputMode="decimal"
                  className={`${tableFieldClass}${errorClass(errors.matrix?.[rowLabel]?.[columnLabel])}`}
                  style={getFieldStyle(errors.matrix?.[rowLabel]?.[columnLabel], "table")}
                  value={breakMatrix[rowLabel]?.[columnLabel] ?? ""}
                  onChange={(event) =>
                    handleMatrixChange(rowLabel, columnLabel, event.target.value)
                  }
                />
              ))}
            </div>
          ))}
        </div>

        <div className="mt-4 border-t border-slate-200 pt-4">
          <div className="grid grid-cols-[100px_repeat(9,minmax(0,1fr))] items-center gap-x-3 gap-y-3">
            <div className="text-[12px] font-semibold uppercase text-slate-700">Total Breaks</div>
            {breakColumns.map((columnLabel) => (
              <input
                key={`total-${columnLabel}`}
                type="text"
                readOnly
                className={`${tableFieldClass} text-slate-500`}
                value={formatNumber(columnTotals[columnLabel])}
              />
            ))}
          </div>
        </div>

        <div className="mt-4 border-t border-slate-200 pt-4">
          <div className="grid grid-cols-[100px_repeat(9,minmax(0,1fr))] items-center gap-x-3 gap-y-3">
            <div className="text-[12px] font-semibold uppercase text-slate-700">Breaks</div>
            {breakColumns.map((columnLabel) => (
              <input
                key={`percent-${columnLabel}`}
                type="text"
                readOnly
                className={`${tableFieldClass} text-slate-500`}
                value={`${formatNumber(percentageTotals[columnLabel])}%`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );

  const buildStudyPayload = () => ({
    s_no: "1",
    entry_date: form.date,
    machine_name: form.simplexNo,
    operator_name: form.sName,
    shift: "A",
    inspection_items: [
      { item_name: "TPI", status_value: form.tpi, remarks: "" },
      { item_name: "TPM", status_value: form.tpm, remarks: "" },
      { item_name: "Start HK", status_value: form.startHk, remarks: "" },
      { item_name: "Finish HK", status_value: form.finishHk, remarks: "" },
      { item_name: "Average Speed", status_value: form.averageSpeed, remarks: "" },
      { item_name: "Hank", status_value: form.hank, remarks: "" },
      { item_name: "Mixing", status_value: form.mixing, remarks: "" },
      { item_name: "Roving HK", status_value: form.rovingHk, remarks: "" },
      { item_name: "Doff Length", status_value: form.doffLength, remarks: "" },
      { item_name: "RH%", status_value: form.rhPercent, remarks: "" },
      { item_name: "TEMP%", status_value: form.tempPercent, remarks: "" },
      { item_name: "TT_SPDL", status_value: form.ttSpdl, remarks: "" },
      { item_name: "Running Spdl", status_value: form.runningSpdl, remarks: "" },
      { item_name: "Ideals", status_value: form.ideals, remarks: "" },
    ],
    user_fiber_parameters: {
      A1: breakMatrix["0 - 200"]["Roving Breaks at Finger"] || "0.00",
      A2: breakMatrix["0 - 200"]["Roving Breaks at Front Roller Nip"] || "0.00",
      A3: breakMatrix["0 - 200"]["Roving Breaks at Between Flyer"] || "0.00",
      A4: breakMatrix["0 - 200"].Undraft || "0.00",
      B1: breakMatrix["201 - 400"]["Roving Breaks at Finger"] || "0.00",
      B2: breakMatrix["201 - 400"]["Roving Breaks at Front Roller Nip"] || "0.00",
      B3: breakMatrix["201 - 400"]["Roving Breaks at Between Flyer"] || "0.00",
      B4: breakMatrix["201 - 400"].Undraft || "0.00",
      C1: breakMatrix["401 - 600"]["Roving Breaks at Finger"] || "0.00",
      C2: breakMatrix["401 - 600"]["Roving Breaks at Front Roller Nip"] || "0.00",
      C3: breakMatrix["401 - 600"]["Roving Breaks at Between Flyer"] || "0.00",
      C4: breakMatrix["401 - 600"].Undraft || "0.00",
      D1: breakMatrix["601 - 800"]["Roving Breaks at Finger"] || "0.00",
      D2: breakMatrix["601 - 800"]["Roving Breaks at Front Roller Nip"] || "0.00",
      D3: breakMatrix["601 - 800"]["Roving Breaks at Between Flyer"] || "0.00",
      D4: breakMatrix["601 - 800"].Undraft || "0.00",
    },
    epi_parameters: {
      yarn_a1: parseNumber(columnTotals["Roving Breaks at Finger"]),
      yarn_a2: parseNumber(columnTotals["Roving Breaks at Front Roller Nip"]),
      yarn_a3: parseNumber(columnTotals["Roving Breaks at Between Flyer"]),
      yarn_a4: parseNumber(columnTotals.Undraft),
      yarn_b1: parseNumber(columnTotals["Top Roller Lapping"]),
      yarn_b2: parseNumber(columnTotals["Bottom Roller Lapping"]),
      yarn_b3: parseNumber(columnTotals["Silver Breaks"]),
      yarn_b4: parseNumber(columnTotals["Can Exhaust"]),
    },
    other_field_values: {
      time: form.startTime,
      break_count: parseNumber(grandTotal),
      remarks: JSON.stringify({
        type: selectedTypeName || form.type,
        end_time: form.endTime,
        total_time: totalTime,
        unknown_stop_total: formatNumber(columnTotals["Unknown Stop"]),
        repeated_spindle: breakMatrix["Repeated Spindle"],
      }),
    },
  });

  const portalTarget =
    portalReady && tablePortalTargetId && typeof document !== "undefined"
      ? document.getElementById(tablePortalTargetId)
      : null;

  const submitForm = async () => {
    if (!validate()) return false;

    const resultAction = await dispatch(submitSimplexStudyReport(buildStudyPayload()));

    if (submitSimplexStudyReport.fulfilled.match(resultAction)) {
      clear();
      return true;
    }

    return false;
  };

  useImperativeHandle(ref, () => ({
    clear,
    validate,
    getPreviewData,
    submit: submitForm,
  }));

  return (
    <>
      <div className="grid grid-cols-1 gap-x-4 gap-y-5 md:grid-cols-2 xl:grid-cols-3">
        {formFields.map(({ label, field, type, options = [], placeholder, value }) => {
          const fieldValue = value ?? form[field] ?? "";

          return (
            <div key={field} className="flex min-w-0 flex-col gap-2">
              <label className="text-[13px] font-semibold text-slate-700">{label}</label>

              {type === "select" ? (
                <select
                  className={`${topFieldClass}${errorClass(errors.form?.[field])}`}
                  style={getFieldStyle(errors.form?.[field])}
                  value={fieldValue}
                  onChange={(event) => {
                    handleFormChange(field, event.target.value);
                    if (field === "type") onTypeChange?.(event.target.value);
                  }}
                >
                  {field === "simplexNo" && <option value="">{placeholder || "Select"}</option>}
                  {options.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={type === "readonly" ? "text" : type}
                  step={type === "time" ? "1" : undefined}
                  readOnly={type === "readonly"}
                  placeholder={placeholder}
                  className={`${topFieldClass}${type === "readonly" ? " text-slate-500" : ""}${errorClass(errors.form?.[field])}`}
                  style={getFieldStyle(errors.form?.[field])}
                  value={fieldValue}
                  onChange={(event) => handleFormChange(field, event.target.value)}
                />
              )}
            </div>
          );
        })}
      </div>

      {portalTarget ? createPortal(tableSection, portalTarget) : null}
      {isLoading ? <p className="mt-3 text-[14px] text-[#3d539f]">Saving study report...</p> : null}
    </>
  );
});

export default SMXBreaksStudyReport;
