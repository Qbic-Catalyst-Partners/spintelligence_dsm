import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { FiPlus, FiTrash2 } from "react-icons/fi";
import { useDispatch, useSelector } from "react-redux";
import { fetchSimplexStudyMachineNames } from "@/apis/simplex";
import SearchableSelect from "@/components/SearchableSelect";
import NotebookCustomFields from "@/components/NotebookCustomFields";
import useEmployeeOptions from "@/hooks/useEmployeeOptions";
import { submitSimplexStudyReport } from "@/store/slices/simplex";
import { saveNotebookCustomFieldValuesApi } from "@/apis/notebookCustomFieldsApi";
import { createThresholdViolationTickets } from "@/utils/thresholdTicketing";

const today = new Date().toISOString().split("T")[0];

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
  "1401 - 1600",
  "1601 - 1800",
  "1801 - 2000",
  "2001 - 2200",
  "2201 - 2400",
  "2401 - 2600",
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

const getTotalBreakPercentages = (breakMatrix) => {
  const columnTotals = breakColumns.reduce((accumulator, columnLabel) => {
    accumulator[columnLabel] = breakRows.reduce(
      (sum, rowLabel) => sum + countBreakEntries(breakMatrix[rowLabel]?.[columnLabel]),
      0
    );
    return accumulator;
  }, {});
  const grandTotal = breakColumns.reduce((sum, columnLabel) => sum + columnTotals[columnLabel], 0);
  const percentages = breakColumns.reduce((accumulator, columnLabel) => {
    accumulator[columnLabel] = grandTotal > 0 ? (columnTotals[columnLabel] / grandTotal) * 100 : 0;
    return accumulator;
  }, {});

  return { columnTotals, grandTotal, percentages };
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

const createEmptyRowValues = () =>
  breakColumns.reduce((accumulator, columnLabel) => {
    accumulator[columnLabel] = "";
    return accumulator;
  }, {});

let matrixRowIdCounter = 0;
const createMatrixRow = () => ({
  id: `row-${Date.now()}-${matrixRowIdCounter++}`,
  length: "",
  values: createEmptyRowValues(),
});

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
  const [matrixRows, setMatrixRows] = useState(() => [createMatrixRow()]);
  // Derived, sparse (only-added-rows) matrix in the same {[length]: {[column]: value}}
  // shape the totals/percentage math below already expects - keeps that math unchanged
  // while the table itself moved from 13 always-rendered rows to user-added ones.
  const breakMatrix = useMemo(() => {
    const result = {};
    matrixRows.forEach((row) => {
      if (row.length) result[row.length] = row.values;
    });
    return result;
  }, [matrixRows]);
  const usedLengths = useMemo(
    () => new Set(matrixRows.map((row) => row.length).filter(Boolean)),
    [matrixRows]
  );
  const [errors, setErrors] = useState({ form: {}, matrix: {} });
  const [portalReady, setPortalReady] = useState(false);
  const [simplexNoOptions, setSimplexNoOptions] = useState([]);
  const [machineNamesError, setMachineNamesError] = useState("");
  const [machineNamesReloadKey, setMachineNamesReloadKey] = useState(0);
  const { employeeOptions, employeeOptionsError, loadingEmployeeOptions } = useEmployeeOptions("simplex");
  const [customFieldValues, setCustomFieldValues] = useState({});

  const handleCustomFieldChange = (fieldId, value) => {
    setCustomFieldValues((prev) => ({ ...prev, [fieldId]: value }));
  };

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    let isCancelled = false;

    const loadSimplexNos = async () => {
      setMachineNamesError("");
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

        setSimplexNoOptions(cleaned);
      } catch (error) {
        if (isCancelled) return;
        setSimplexNoOptions([]);
        // Previously failed silently, leaving the Simplex No. dropdown permanently empty with no
        // indication anything went wrong - the request now also times out (apiConfig's default
        // timeout) instead of hanging forever, so this always resolves one way or the other.
        setMachineNamesError(
          error?.message || "Unable to load Simplex No. options. Check your connection and retry."
        );
      }
    };

    loadSimplexNos();
    return () => {
      isCancelled = true;
    };
  }, [machineNamesReloadKey]);

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

  const noOfBreaksPer100Spindles = useMemo(() => {
    const runningSpindles = Number(calculatedRunningSpdl);

    if (!Number.isFinite(runningSpindles) || runningSpindles <= 0) {
      return breakColumns.reduce((accumulator, columnLabel) => {
        accumulator[columnLabel] = 0;
        return accumulator;
      }, {});
    }

    return breakColumns.reduce((accumulator, columnLabel) => {
      const total = columnTotals[columnLabel] || 0;
      accumulator[columnLabel] = (total * 100) / runningSpindles;
      return accumulator;
    }, {});
  }, [calculatedRunningSpdl, columnTotals]);

  const grandTotalBreakPercent = useMemo(() => {
    const runningSpindles = Number(calculatedRunningSpdl);
    const totalMinutes = Number(totalTime);

    if (!Number.isFinite(runningSpindles) || !Number.isFinite(totalMinutes)) return "";
    if (runningSpindles <= 0 || totalMinutes <= 0 || grandTotal <= 0) return "0.00";

    return formatPercentage((grandTotal * 100) / (runningSpindles * (totalMinutes / 60)));
  }, [calculatedRunningSpdl, grandTotal, totalTime]);

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

  const handleRowLengthChange = (rowId, nextLength) => {
    setMatrixRows((current) =>
      current.map((row) => (row.id === rowId ? { ...row, length: nextLength } : row))
    );
  };

  const handleRowValueChange = (rowId, columnLabel, value) => {
    const sanitized = value === "" ? "" : value.replace(/[^\d,\s]/g, "");

    setMatrixRows((current) =>
      current.map((row) =>
        row.id === rowId
          ? { ...row, values: { ...row.values, [columnLabel]: sanitized } }
          : row
      )
    );

    setErrors((previous) => {
      if (!previous.matrix?.[rowId]?.[columnLabel]) return previous;
      const nextMatrix = { ...(previous.matrix || {}) };
      const nextRow = { ...(nextMatrix[rowId] || {}) };
      delete nextRow[columnLabel];
      nextMatrix[rowId] = nextRow;
      return { ...previous, matrix: nextMatrix };
    });
  };

  const addMatrixRow = () => {
    if (matrixRows.length >= breakRows.length) return;
    setMatrixRows((current) => [...current, createMatrixRow()]);
  };

  const removeMatrixRow = (rowId) => {
    setMatrixRows((current) =>
      current.length > 1 ? current.filter((row) => row.id !== rowId) : current
    );
  };

  const clear = () => {
    setForm(createInitialForm());
    setMatrixRows([createMatrixRow()]);
    setErrors({ form: {}, matrix: {} });
    setCustomFieldValues({});
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

    matrixRows.forEach((row) => {
      if (!row.length) return;
      breakColumns.forEach((columnLabel) => {
        const value = row.values[columnLabel];
        if (String(value ?? "").trim() === "") return;
        items.push({
          label: `${row.length} - ${columnLabel}`,
          value,
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

    const totalBreakPercentages = getTotalBreakPercentages(breakMatrix).percentages;
    breakColumns.forEach((columnLabel) => {
      items.push({
        label: `TOTAL BREAK (%) - ${columnLabel}`,
        value: `${formatPercentage(totalBreakPercentages[columnLabel])}%`,
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
    { label: "Average Speed", field: "averageSpeed", type: "text" },
    { label: "Start HK", field: "startHk", type: "text" },
    { label: "Finish HK", field: "finishHk", type: "text" },
    { label: "Hank", field: "hank", type: "readonly", value: calculatedHank || "0" },
    { label: "Mixing", field: "mixing", type: "text" },
    { label: "Roving HK", field: "rovingHk", type: "text" },
    { label: "Doff Length", field: "doffLength", type: "text" },
    { label: "RH%", field: "rhPercent", type: "text" },
    { label: "TEMP%", field: "tempPercent", type: "text" },
    { label: "Total Spindles", field: "ttSpdl", type: "text" },
    { label: "Idle Spindles", field: "ideals", type: "text", placeholder: "Lorem Ipsum" },
    { label: "Running Spindles", field: "runningSpdl", type: "readonly", value: calculatedRunningSpdl || "0" },
    {
      label: "Sider Name",
      field: "sName",
      type: "employee",
      options: employeeOptions,
      placeholder: loadingEmployeeOptions
        ? "Loading employees..."
        : employeeOptionsError
          ? "Type employee name"
          : "Select Employee",
    },
  ];

  const tableSection = (
    <section className="overflow-x-auto px-1">
      <div className="min-w-[1120px]">
        {(() => {
          const { columnTotals: totalCounts, grandTotal: totalCount, percentages } = getTotalBreakPercentages(breakMatrix);
          return (
            <>
        <div className="flex items-end gap-3">
          <div className="grid flex-1 grid-cols-[100px_repeat(9,minmax(0,1fr))] gap-x-3 gap-y-4 text-[10px] font-semibold uppercase tracking-[0.01em] text-slate-600">
            <div className="flex items-end pb-2">Length</div>
            {breakColumns.map((columnLabel) => (
              <div key={columnLabel} className="flex items-end pb-2 leading-4">
                {columnLabel}
              </div>
            ))}
          </div>
          <div className="h-0 w-[64px] shrink-0" aria-hidden="true" />
        </div>

        <div className="mt-1 flex flex-col gap-3">
          {matrixRows.map((row, rowIndex) => {
            const lengthOptions = breakRows.filter(
              (label) => label === row.length || !usedLengths.has(label)
            );
            const isLastRow = rowIndex === matrixRows.length - 1;
            const canAddRow = matrixRows.length < breakRows.length;
            return (
              <div key={row.id} className="flex items-center gap-3">
                <div className="grid flex-1 grid-cols-[100px_repeat(9,minmax(0,1fr))] items-center gap-x-3 gap-y-3">
                  <select
                    className={`${tableFieldClass}${errorClass(errors.matrix?.[row.id]?.length)}`}
                    style={getFieldStyle(errors.matrix?.[row.id]?.length, "table")}
                    value={row.length}
                    onChange={(event) => handleRowLengthChange(row.id, event.target.value)}
                  >
                    <option value="">Select</option>
                    {lengthOptions.map((label) => (
                      <option key={label} value={label}>
                        {label}
                      </option>
                    ))}
                  </select>

                  {breakColumns.map((columnLabel) => (
                    <input
                      key={`${row.id}-${columnLabel}`}
                      type="text"
                      inputMode="text"
                      placeholder="1,2,3"
                      className={`${tableFieldClass}${errorClass(errors.matrix?.[row.id]?.[columnLabel])}`}
                      style={getFieldStyle(errors.matrix?.[row.id]?.[columnLabel], "table")}
                      value={row.values[columnLabel] ?? ""}
                      onChange={(event) =>
                        handleRowValueChange(row.id, columnLabel, event.target.value)
                      }
                    />
                  ))}
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {isLastRow ? (
                    <button
                      type="button"
                      onClick={addMatrixRow}
                      disabled={!canAddRow}
                      aria-label="Add row"
                      title="Add row"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-[6px] bg-[#4f63b6] text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <FiPlus />
                    </button>
                  ) : (
                    <span className="inline-block h-7 w-7" aria-hidden="true" />
                  )}
                  <button
                    type="button"
                    onClick={() => removeMatrixRow(row.id)}
                    disabled={matrixRows.length <= 1}
                    aria-label="Delete row"
                    title="Delete row"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-[6px] border border-[#ffcecf] bg-[#fff4f4] text-[#f04f56] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <FiTrash2 />
                  </button>
                </div>
              </div>
            );
          })}
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
                value={formatNumber(totalCounts[columnLabel])}
              />
            ))}
          </div>
        </div>

        <div className="mt-3">
          <div className="grid grid-cols-[100px_repeat(9,minmax(0,1fr))] items-center gap-x-3 gap-y-3">
            <div className="text-[12px] font-semibold uppercase text-slate-700">Grand Total</div>
            <input
              type="text"
              readOnly
              className={`${tableFieldClass} col-start-2 text-slate-500`}
              value={formatNumber(totalCount)}
            />
            <div />
            <div />
            <div />
            <div />
            <div />
            <div />
            <div />
            <div />
            <div />
          </div>
        </div>

        <div className="mt-4 border-t border-slate-200 pt-4">
          <div className="grid grid-cols-[100px_repeat(9,minmax(0,1fr))] items-center gap-x-3 gap-y-3">
            <div className="text-[12px] font-semibold uppercase text-slate-700"> No. of breaks 100 spindles / hr</div>
            {percentageBreakColumns.map((columnLabel) => (
              <input
                key={`percent-${columnLabel}`}
                type="text"
                readOnly
                className={`${tableFieldClass} text-slate-500`}
                value={`${formatPercentage(noOfBreaksPer100Spindles[columnLabel])}%`}
              />
            ))}
          </div>
        </div>

        <div className="mt-4 border-t border-slate-200 pt-4">
          <div className="grid grid-cols-[100px_minmax(0,160px)] items-center gap-x-3 gap-y-3">
            <div className="text-[12px] font-semibold uppercase text-slate-700">TOTAL No. OF BREAKS/100SH</div>
            <input
              type="text"
              readOnly
              className={`${tableFieldClass} text-slate-500`}
              value={grandTotalBreakPercent ? `${grandTotalBreakPercent}%` : ""}
            />
          </div>
        </div>
            </>
          );
        })()}
      </div>
    </section>
  );

  const buildStudyPayload = () => ({
    s_no: form.simplexNo,
    entry_id: entryId,
    entry_date: form.date,
    machine_name: form.simplexNo,
    operator_name: form.sName,
    study_type: selectedTypeName || form.type,
    start_time: form.startTime,
    end_time: form.endTime,
    start_hk: form.startHk,
    finish_hk: form.finishHk,
    total_spdl: form.ttSpdl,
    idle_spindles: form.ideals,
    ideals: form.ideals,
    s_name: form.sName,
    // One item per (length range x break type) cell the user actually filled in, not every
    // combination across all 13 length ranges - getSmxBreaksStudyCellValue in ReportsPage.jsx
    // already looks these up by matching item_name + length_range and treats a missing match
    // as blank, so a sparse list here (only the rows/cells that were added) is safe to send.
    items: matrixRows.flatMap((row) => {
      if (!row.length) return [];
      return breakColumns
        .filter((columnLabel) => String(row.values[columnLabel] ?? "").trim() !== "")
        .map((columnLabel) => ({
          item_name: columnLabel,
          length_range: row.length,
          status_value: row.values[columnLabel],
          remarks: "",
        }));
    }),
    other_field_values: {
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
      // Send the same Grand Total Breakage % this screen already shows (TOTAL No. OF
      // BREAKS/100SH, formatPercentage's own 2-decimal rounding) - the backend stores this
      // as-is now instead of recomputing its own copy from the raw cells, so what's saved
      // always matches exactly what the user saw on screen when they submitted.
      overall_breakage_percent: grandTotalBreakPercent || null,
      // Same reasoning as break_count/overall_breakage_percent above, for the two per-column
      // summary rows (TOTAL BREAKS and NO. OF BREAKS 100 SPINDLES/HR) this screen shows - sent
      // as {columnLabel: value} objects matching this screen's own columnTotals/
      // noOfBreaksPer100Spindles state exactly, formatted to the same 2 decimals the UI displays.
      column_total_breaks: columnTotals,
      // "No. of breaks 100 spindles/hr" only ever shows percentageBreakColumns (up through
      // SLIVER BREAKS) on screen - Can Exhaust/Unknown Stop have no input for this row at all
      // (see the table render below), so they shouldn't be sent/stored here either.
      column_breaks_per_100sh: percentageBreakColumns.reduce((accumulator, columnLabel) => {
        accumulator[columnLabel] = Number(formatPercentage(noOfBreaksPer100Spindles[columnLabel]));
        return accumulator;
      }, {}),
      study_type: selectedTypeName || form.type,
      tpi: form.tpi,
      tpm: form.tpm,
      average_speed: form.averageSpeed,
      mixing: form.mixing,
      roving_hk: form.rovingHk,
      doff_length: form.doffLength,
      rh_percent: form.rhPercent,
      temp_percent: form.tempPercent,
      // No JSON blob here anymore - every field it used to duplicate (type/tpi/tpm/
      // average_speed/mixing/roving_hk/doff_length/rh_percent/temp_percent/end_time/total_spdl/
      // idle_spindles/running_spdl/hank) is already sent above as its own dedicated key, and the
      // backend's parseSmxOtherFieldsRemarks() never read this JSON blob in the first place (it
      // only ever extracts S.NAME/START/END/TOTAL_MINUTES from the plain delimited remarks text) -
      // it was purely dead duplication.
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

      try {
        await createThresholdViolationTickets({
          department: "Quality Control",
          subDepartment: "Simplex",
          screenName: selectedTypeName || form.type,
          machineName: form.simplexNo || selectedTypeName || form.type,
          entryId,
          values: formFields
            .filter((f) => f.field && f.field !== "entryId")
            .map((f) => ({ label: f.label, value: f.value ?? form[f.field] ?? "" })),
        });
      } catch (thresholdError) {
        console.error("Failed to evaluate value thresholds:", thresholdError);
      }

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
      {machineNamesError ? (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-[10px] border border-red-200 bg-red-50 px-4 py-2.5 text-[13px] text-red-700 print:hidden">
          <span>{machineNamesError}</span>
          <button
            type="button"
            className="shrink-0 rounded-[8px] border border-red-300 bg-white px-3 py-1 font-semibold text-red-700 hover:bg-red-100"
            onClick={() => setMachineNamesReloadKey((key) => key + 1)}
          >
            Retry
          </button>
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-x-4 gap-y-5 md:grid-cols-2 xl:grid-cols-3 print:grid-cols-3">
        {formFields.map(({ label, field, type, options = [], placeholder, value, dropUp = false }) => {
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
              ) : type === "employee" ? (
                <SearchableSelect
                  className={`${topFieldClass}${errorClass(errors.form?.[field])}`}
                  value={fieldValue}
                  onChange={(nextValue) => handleFormChange(field, nextValue)}
                  options={options}
                  placeholder={placeholder}
                  ariaLabel={label}
                  dropUp={dropUp}
                />
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

      <NotebookCustomFields
        department="Quality Control"
        subDepartment="Simplex"
        notebook="SMX Breaks Study Report"
        entryId={entryId}
        values={customFieldValues}
        onChange={handleCustomFieldChange}
      />
    </>
  );
});

export default SMXBreaksStudyReport;
