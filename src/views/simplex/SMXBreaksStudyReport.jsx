import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useDispatch, useSelector } from "react-redux";
import { fetchSimplexStudyMachineNames } from "@/apis/simplex";
import { submitSimplexStudyReport } from "@/store/slices/simplex";

const today = new Date().toISOString().split("T")[0];

const simplexOptions = [
  "SMX 002",
  ...Array.from({ length: 13 }, (_, index) => `SMX ${String(index + 1).padStart(2, "0")}`),
];

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
  "SLIVER BREAKS",
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

const percentageBreakColumns = breakColumns.slice(0, breakColumns.indexOf("SLIVER BREAKS") + 1);

const formatNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? String(Math.round(parsed)) : "0";
};

const parseNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseBreakEntries = (value) =>
  String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const countBreakEntries = (value) => parseBreakEntries(value).length;

const formatPercentage = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : "0.00";
};

const getColumnBreakValues = (breakMatrix, columnLabel) =>
  breakRows.flatMap((rowLabel) => parseBreakEntries(breakMatrix[rowLabel]?.[columnLabel]));

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
      columnAccumulator[columnLabel] = "";
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
    entryId = "",
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
  const [simplexNoOptions, setSimplexNoOptions] = useState(simplexOptions);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    let isCancelled = false;

    const loadSimplexNos = async () => {
      try {
        const response = await fetchSimplexStudyMachineNames();
        if (isCancelled) return;

        const apiOptions = Array.isArray(response?.simplex_nos)
          ? response.simplex_nos
          : Array.isArray(response?.machine_names)
            ? response.machine_names
            : Array.isArray(response?.data)
              ? response.data.map((item) => item?.simplex_no || item?.machine_name || item?.s_no)
              : [];

        const cleaned = apiOptions
          .map((item) => String(item || "").trim())
          .filter(Boolean);

        const merged = [...new Set([...simplexOptions, ...cleaned])];
        setSimplexNoOptions(merged);
      } catch (_error) {
        if (!isCancelled) setSimplexNoOptions(simplexOptions);
      }
    };

    loadSimplexNos();
    return () => {
      isCancelled = true;
    };
  }, []);

  const totalTime = useMemo(() => {
    if (!form.startTime || !form.endTime) return "";

    const [startHours, startMinutes] = form.startTime.split(":");
    const [endHours, endMinutes] = form.endTime.split(":");

    const start = Number(startHours) * 60 + Number(startMinutes);
    const end = Number(endHours) * 60 + Number(endMinutes);

    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return "";

    return String(end - start);
  }, [form.endTime, form.startTime]);

  const calculatedHank = useMemo(() => {
    if (form.startHk === "" || form.finishHk === "") return "";

    const startHk = Number(form.startHk);
    const finishHk = Number(form.finishHk);
    if (!Number.isFinite(startHk) || !Number.isFinite(finishHk)) return "";

    return formatNumber(finishHk - startHk);
  }, [form.finishHk, form.startHk]);

  const calculatedRunningSpdl = useMemo(() => {
    if (form.ttSpdl === "" || form.ideals === "") return "";

    const totalSpindles = Number(form.ttSpdl);
    const idleSpindles = Number(form.ideals);
    if (!Number.isFinite(totalSpindles) || !Number.isFinite(idleSpindles)) return "";

    return formatNumber(totalSpindles - idleSpindles);
  }, [form.ideals, form.ttSpdl]);

  const columnTotals = useMemo(
    () =>
      breakColumns.reduce((accumulator, columnLabel) => {
        accumulator[columnLabel] = breakRows.reduce(
          (sum, rowLabel) => sum + countBreakEntries(breakMatrix[rowLabel]?.[columnLabel]),
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
    const nextValue =
      (field === "startTime" || field === "endTime") && value ? value.slice(0, 5) : value;

    setForm((current) => ({
      ...current,
      [field]: nextValue,
    }));

    setErrors((previous) => {
      if (!previous.form?.[field] && !["startHk", "finishHk", "ttSpdl", "ideals"].includes(field)) return previous;
      const nextForm = { ...(previous.form || {}) };
      delete nextForm[field];
      if (field === "startHk" || field === "finishHk") delete nextForm.hank;
      if (field === "ttSpdl" || field === "ideals") delete nextForm.runningSpdl;
      return { ...previous, form: nextForm };
    });
  };

  const handleMatrixChange = (rowLabel, columnLabel, value) => {
    const sanitized = value === "" ? "" : value.replace(/[^\d,\s]/g, "");

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
      if (key === "hank" || key === "runningSpdl") return;
      if (String(value).trim() === "") nextErrors.form[key] = true;
    });
    if (!calculatedHank) nextErrors.form.hank = true;
    if (!calculatedRunningSpdl) nextErrors.form.runningSpdl = true;

    setErrors(nextErrors);

    return (
      Object.keys(nextErrors.form).length === 0 &&
      Object.keys(nextErrors.matrix).length === 0
    );
  };

  const getPreviewData = () => {
    const items = [
      { label: "Type", value: selectedTypeName || form.type },
      { label: "Entry ID", value: entryId || "#SIM-001" },
      ...Object.entries(form)
        .filter(([key]) => key !== "type" && key !== "date")
        .map(([key, value]) => ({
          label: formatLabel(key),
          value:
            key === "hank"
              ? calculatedHank || "-"
              : key === "runningSpdl"
                ? calculatedRunningSpdl || "-"
                : value || "-",
        })),
      { label: "Total Minutes", value: totalTime || "-" },
    ];

    breakRows.forEach((rowLabel) => {
      breakColumns.forEach((columnLabel) => {
        items.push({
          label: `${rowLabel} - ${columnLabel}`,
          value: breakMatrix[rowLabel]?.[columnLabel] || "",
        });
      });
    });

    breakColumns.forEach((columnLabel) => {
      items.push({
        label: `Total Breaks - ${columnLabel}`,
        value: formatNumber(columnTotals[columnLabel]),
      });
    });

    items.push({
      label: "Total Breaks (Grand)",
      value: formatNumber(grandTotal),
    });

    percentageBreakColumns.forEach((columnLabel) => {
      items.push({
        label: `Breaks % - ${columnLabel}`,
        value: `${formatPercentage(percentageTotals[columnLabel])}%`,
      });
    });

    return items;
  };

  const formFields = [
    { label: "Type", field: "type", type: "select", options: typeOptions, value: selectedTypeName || form.type },
    { label: "Simplex No.", field: "simplexNo", type: "select", options: simplexNoOptions, placeholder: "Select" },
    { label: "Entry ID", field: "entryId", type: "readonly", value: entryId || "#SIM-001" },
    { label: "Start Time", field: "startTime", type: "time" },
    { label: "End Time", field: "endTime", type: "time" },
    { label: "Total Minutes", field: "totalTime", type: "readonly", value: totalTime ? `${totalTime} mins` : "0 mins" },
    { label: "TPI", field: "tpi", type: "text" },
    { label: "TPM", field: "tpm", type: "text" },
    { label: "Start HK", field: "startHk", type: "text" },
    { label: "Finish HK", field: "finishHk", type: "text" },
    { label: "Average Speed", field: "averageSpeed", type: "text" },
    { label: "Hank", field: "hank", type: "readonly", value: calculatedHank || "0" },
    { label: "Mixing", field: "mixing", type: "text" },
    { label: "Roving HK", field: "rovingHk", type: "text" },
    { label: "Doff Length", field: "doffLength", type: "text" },
    { label: "RH%", field: "rhPercent", type: "text" },
    { label: "TEMP%", field: "tempPercent", type: "text" },
    { label: "Total Spindles", field: "ttSpdl", type: "text" },
    { label: "Running Spindles", field: "runningSpdl", type: "readonly", value: calculatedRunningSpdl || "0" },
    { label: "Idle Spindles", field: "ideals", type: "text", placeholder: "Lorem Ipsum" },
    { label: "Sider Name", field: "sName", type: "text" },
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
                  inputMode="text"
                  placeholder="1,2,3"
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
            <div className="text-[12px] font-semibold uppercase text-slate-700">
              Total Breaks
              <span className="block text-[11px] font-bold text-[#3d539f]">
                Grand: {formatNumber(grandTotal)}
              </span>
            </div>
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
            <div className="text-[12px] font-semibold uppercase text-slate-700">Breaks %</div>
            {percentageBreakColumns.map((columnLabel) => (
              <input
                key={`percent-${columnLabel}`}
                type="text"
                readOnly
                className={`${tableFieldClass} text-slate-500`}
                value={`${formatPercentage(percentageTotals[columnLabel])}%`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );

const buildStudyPayload = () => ({
    s_no: form.simplexNo,
    entry_date: form.date,
    machine_name: form.simplexNo,
    operator_name: form.sName,
    shift: "A",
    start_time: form.startTime,
    end_time: form.endTime,
    start_hk: form.startHk,
    finish_hk: form.finishHk,
    total_spdl: form.ttSpdl,
    idle_spindles: form.ideals,
    ideals: form.ideals,
    s_name: form.sName,
    inspection_items: breakColumns.map((columnLabel) => ({
      item_name: columnLabel,
      status_value: getColumnBreakValues(breakMatrix, columnLabel),
      remarks: "",
    })),
    user_fiber_parameters: {
      A1: breakMatrix["0 - 200"]["Roving Breaks at Finger"] || "0",
      A2: breakMatrix["0 - 200"]["Roving Breaks at Front Roller Nip"] || "0",
      A3: breakMatrix["0 - 200"]["Roving Breaks at Between Flyer"] || "0",
      A4: breakMatrix["0 - 200"].Undraft || "0",
      B1: breakMatrix["201 - 400"]["Roving Breaks at Finger"] || "0",
      B2: breakMatrix["201 - 400"]["Roving Breaks at Front Roller Nip"] || "0",
      B3: breakMatrix["201 - 400"]["Roving Breaks at Between Flyer"] || "0",
      B4: breakMatrix["201 - 400"].Undraft || "0",
      C1: breakMatrix["401 - 600"]["Roving Breaks at Finger"] || "0",
      C2: breakMatrix["401 - 600"]["Roving Breaks at Front Roller Nip"] || "0",
      C3: breakMatrix["401 - 600"]["Roving Breaks at Between Flyer"] || "0",
      C4: breakMatrix["401 - 600"].Undraft || "0",
      D1: breakMatrix["601 - 800"]["Roving Breaks at Finger"] || "0",
      D2: breakMatrix["601 - 800"]["Roving Breaks at Front Roller Nip"] || "0",
      D3: breakMatrix["601 - 800"]["Roving Breaks at Between Flyer"] || "0",
      D4: breakMatrix["601 - 800"].Undraft || "0",
    },
    epi_parameters: {
      yarn_a1: parseNumber(columnTotals["Roving Breaks at Finger"]),
      yarn_a2: parseNumber(columnTotals["Roving Breaks at Front Roller Nip"]),
      yarn_a3: parseNumber(columnTotals["Roving Breaks at Between Flyer"]),
      yarn_a4: parseNumber(columnTotals.Undraft),
      yarn_b1: parseNumber(columnTotals["Top Roller Lapping"]),
      yarn_b2: parseNumber(columnTotals["Bottom Roller Lapping"]),
      yarn_b3: parseNumber(columnTotals["SLIVER BREAKS"]),
      yarn_b4: parseNumber(columnTotals["Can Exhaust"]),
    },
    other_field_values: {
      time: form.startTime,
      start_time: form.startTime,
      end_time: form.endTime,
      start_hk: form.startHk,
      finish_hk: form.finishHk,
      hank: calculatedHank,
      total_spdl: form.ttSpdl,
      idle_spindles: form.ideals,
      ideals: form.ideals,
      running_spdl: calculatedRunningSpdl,
      s_name: form.sName,
      sider_name: form.sName,
      break_count: parseNumber(grandTotal),
      remarks: JSON.stringify({
        type: selectedTypeName || form.type,
        tpi: form.tpi,
        tpm: form.tpm,
        average_speed: form.averageSpeed,
        mixing: form.mixing,
        roving_hk: form.rovingHk,
        doff_length: form.doffLength,
        rh_percent: form.rhPercent,
        temp_percent: form.tempPercent,
        end_time: form.endTime,
        total_time: totalTime,
        total_time_in_mins: totalTime,
        total_spdl: form.ttSpdl,
        idle_spindles: form.ideals,
        running_spdl: calculatedRunningSpdl,
        hank: calculatedHank,
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
                  step={type === "time" ? "60" : undefined}
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
