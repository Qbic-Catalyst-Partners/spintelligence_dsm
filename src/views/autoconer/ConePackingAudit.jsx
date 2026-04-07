import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useDispatch, useSelector } from "react-redux";
import {
  getAutoconerConePackingAudit,
  saveAutoconerConePackingAudit,
} from "@/store/slices/autoconer";
import { toNullableNumber } from "@/apis/autoconer";
import { sanitizeIntegerInput, sanitizeNumericInput } from "@/utils/inputValidation";

const today = new Date().toISOString().split("T")[0];

const topFieldClass =
  "w-full h-[42px] rounded-[10px] border border-slate-200 !bg-[#F1F5F9] px-3 text-[14px] text-slate-700 outline-none transition focus:border-[#3d539f] focus:ring-2 focus:ring-[#d7def5]";

const countNameOptions = [
  "10 COTTON POLY LINEN 60/20/20...",
  "20 COTTON POLY LINEN 60/20/20...",
];

const createInitialForm = () => ({
  type: "Cone Packing Audit",
  date: today,
  packedDate: today,
  countName: "",
  grossWtStd: "",
  grossWtAct: "",
  boxColour: "",
  coneColour: "",
  gumTapeColour: "",
  countLabel: "",
  coneDamage: "",
  coverMissing: "",
  coneHardness: "",
  stapCone: "",
  disk: "",
  barcode: "",
  centerPad: "",
  netWeight: "",
  tareWeight: "",
  strapColour: "",
  noOfCuts: "",
});

const formFieldSanitizers = {
  grossWtStd: (value) => sanitizeNumericInput(value, { precision: 6, scale: 2 }),
  grossWtAct: (value) => sanitizeNumericInput(value, { precision: 6, scale: 2 }),
  netWeight: (value) => sanitizeNumericInput(value, { precision: 10, scale: 2 }),
  tareWeight: (value) => sanitizeNumericInput(value, { precision: 6, scale: 2 }),
  noOfCuts: (value) => sanitizeIntegerInput(value, 10),
};

const tableInputClass =
  "w-full h-[38px] rounded-[8px] border border-slate-200 !bg-[#F8FAFC] px-2 text-[14px] text-slate-700 outline-none transition focus:border-[#3d539f] focus:ring-2 focus:ring-[#d7def5]";

const createReadingRows = (count = "") => {
  const total = Number(count);

  if (!Number.isInteger(total) || total <= 0) {
    return [];
  }

  return Array.from({ length: total }, (_, index) => ({
    readingNumber: String(index + 1),
    precentYarn: "",
  }));
};

const mapConePackingEntryToRows = (entry = {}) => {
  const drumEntries = Array.isArray(entry.drum_entries) ? entry.drum_entries : [];
  const yarnReadings = Array.isArray(entry.yarn_readings)
    ? entry.yarn_readings
    : [];
  const coneReadings = Array.isArray(entry.cone_readings) ? entry.cone_readings : [];
  const readingRows = yarnReadings.length >= coneReadings.length ? yarnReadings : coneReadings;

  if (drumEntries.length > 0 || readingRows.length > 0) {
    const rowCount = Math.max(drumEntries.length, readingRows.length);

    return Array.from({ length: rowCount }, (_, index) => {
      const drumRow = drumEntries[index] ?? {};
      const readingRow = readingRows[index] ?? {};

      return {
        readingNumber: String(readingRow.reading_number ?? readingRow.readingNumber ?? index + 1),
        precentYarn: String(readingRow.percent_yarn ?? readingRow.precentYarn ?? readingRow.percentYarn ?? "-"),
        grossWeight: String(
          drumRow.gross_weight ?? entry.gross_weight_actual ?? entry.grossWtAct ?? "-"
        ),
        average: String(drumRow.average ?? entry.net_weight ?? entry.netWeight ?? "-"),
        drumNo: String(drumRow.drum_no ?? drumRow.drumNo ?? index + 1),
        grossWeightRaw: drumRow.gross_weight ?? null,
        averageRaw: drumRow.average ?? null,
        label: index,
      };
    });
  }

  return [
    {
      readingNumber: String(entry.reading_number ?? "1"),
      precentYarn: String(entry.percent_yarn ?? "-"),
      grossWeight: String(entry.gross_weight_actual ?? entry.grossWtAct ?? "-"),
      average: String(entry.net_weight ?? entry.netWeight ?? "-"),
      drumNo: String(entry.drum_no ?? "1"),
      grossWeightRaw: entry.gross_weight ?? null,
      averageRaw: entry.average ?? null,
      label: 0,
    },
  ];
};

const errorClass = (flag) =>
  flag
    ? " !border-red-500 !bg-[#fff1f2] focus:!border-red-500 focus:!ring-[rgba(239,68,68,0.35)] [box-shadow:0_0_0_1000px_#fff1f2_inset]"
    : "";

const ConePackingAudit = forwardRef(function ConePackingAudit(
  { selectedTypeName = "Cone Packing Audit", onTypeChange, typeOptions = [], tablePortalTargetId },
  ref
) {
  const dispatch = useDispatch();
  const { isLoading, isFetching, conePackingAudit = [] } = useSelector((state) => state.autoconer ?? {});
  const [form, setForm] = useState(createInitialForm);
  const [rows, setRows] = useState([]);
  const [errors, setErrors] = useState({});
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  const handleFormChange = (field, value) => {
    const nextValue = formFieldSanitizers[field] ? formFieldSanitizers[field](value) : value;
    setForm((current) => ({ ...current, [field]: nextValue }));
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const clear = () => {
    setForm(createInitialForm());
    setRows([]);
    setErrors({});
  };

  const handleGenerateRows = () => {
    const nextRows = createReadingRows(form.noOfCuts);
    setRows((current) => {
      if (!nextRows.length) return [];

      return nextRows.map((nextRow) => {
        const existingRow = current.find((row) => row.readingNumber === nextRow.readingNumber);
        return existingRow ? { ...nextRow, ...existingRow } : nextRow;
      });
    });
    setErrors((current) => {
      const next = { ...current };
      delete next.noOfCuts;
      delete next.generatedRows;
      return next;
    });
  };

  const handleRowChange = (index, value) => {
    const nextValue = sanitizeNumericInput(value, { precision: 6, scale: 2 });
    setRows((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, precentYarn: nextValue } : row
      )
    );
    setErrors((current) => {
      if (!current[`row-${index}-precentYarn`]) return current;
      const next = { ...current };
      delete next[`row-${index}-precentYarn`];
      return next;
    });
  };

  const validate = () => {
    const nextErrors = {};
    Object.entries(form).forEach(([key, value]) => {
      if (String(value).trim() === "") nextErrors[key] = true;
    });
    if (!rows.length) nextErrors.generatedRows = true;
    rows.forEach((row, index) => {
      if (!String(row.precentYarn || "").trim()) {
        nextErrors[`row-${index}-precentYarn`] = true;
      }
    });
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const getPreviewData = () => [
    ...Object.entries(form).map(([label, value]) => ({ label, value: value || "-" })),
    ...rows.map((row, index) => ({
      label: `Reading ${index + 1}`,
      value: `${row.readingNumber} | ${row.precentYarn}`,
    })),
  ];

  const buildPayload = () => ({
    inspection_date: form.date,
    packed_date: form.packedDate,
    count_name: form.countName,
    gross_weight_std: toNullableNumber(form.grossWtStd),
    gross_weight_actual: toNullableNumber(form.grossWtAct),
    box_colour: form.boxColour,
    cone_colour: form.coneColour,
    gum_tape_colour: form.gumTapeColour,
    count_label: String(form.countLabel).toLowerCase() === "yes",
    cone_damage: String(form.coneDamage).toLowerCase() === "yes",
    cover_missing: String(form.coverMissing).toLowerCase() === "yes",
    cone_hardness: String(form.coneHardness).toLowerCase() === "yes",
    stap_cone: String(form.stapCone).toLowerCase() === "yes",
    disk: String(form.disk).toLowerCase() === "yes",
    barcode: String(form.barcode).toLowerCase() === "yes",
    center_pad: form.centerPad,
    net_weight: toNullableNumber(String(form.netWeight).replace(/,/g, "")),
    tare_weight: toNullableNumber(form.tareWeight),
    strap_colour: form.strapColour,
    drum_entries: rows.map((row, index) => ({
      drum_no: index + 1,
      gross_weight: toNullableNumber(form.grossWtAct),
      average: toNullableNumber(row.precentYarn),
    })),
    yarn_readings: rows.map((row) => ({
      reading_number: toNullableNumber(row.readingNumber),
      percent_yarn: toNullableNumber(row.precentYarn),
    })),
    cone_readings: rows.map((row) => ({
      reading_number: toNullableNumber(row.readingNumber),
      percent_yarn: toNullableNumber(row.precentYarn),
    })),
  });

  const submit = async () => {
    if (!validate()) return false;

    const resultAction = await dispatch(saveAutoconerConePackingAudit(buildPayload()));

    if (saveAutoconerConePackingAudit.fulfilled.match(resultAction)) {
      dispatch(getAutoconerConePackingAudit({ page: 1, limit: 10 }));
      return true;
    }

    return false;
  };

  useImperativeHandle(ref, () => ({
    clear,
    validate,
    getPreviewData,
    submit,
  }));

  useEffect(() => {
    dispatch(getAutoconerConePackingAudit({ page: 1, limit: 10 }));
  }, [dispatch]);

  const allDrumEntries = useMemo(
    () => conePackingAudit.flatMap((entry) => mapConePackingEntryToRows(entry)).slice(0, 10),
    [conePackingAudit]
  );

  const portalTarget =
    portalReady && tablePortalTargetId && typeof document !== "undefined"
      ? document.getElementById(tablePortalTargetId)
      : null;

  const lowerSection = (
    <div className="grid gap-8 pt-2 lg:grid-cols-[260px_minmax(0,1fr)] lg:items-start">
      <div>
        <div className="mb-5 max-w-[184px]">
          <label className="mb-2 block text-[14px] font-semibold text-slate-700">No. of Cuts</label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Enter cuts"
              className={`${topFieldClass}${errorClass(errors.noOfCuts || errors.generatedRows)}`}
              value={form.noOfCuts}
              onChange={(event) => handleFormChange("noOfCuts", event.target.value)}
            />
            <button
              type="button"
              className="h-[30px] rounded-[6px] bg-[#4056a8] px-3 text-[11px] font-semibold text-white"
              onClick={handleGenerateRows}
            >
              Generate
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-[11px] text-slate-700">
            <thead>
              <tr className="border-b border-slate-300 text-left uppercase text-slate-500">
                <th className="px-0 py-3 pr-6 font-semibold">Reading Number</th>
                <th className="px-0 py-3 font-semibold">Precent Yarn</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.readingNumber} className="border-b border-slate-200">
                  <td className="px-0 py-4 pr-6">{row.readingNumber}</td>
                  <td className="px-0 py-4">
                    <input
                      type="text"
                      className={`${tableInputClass}${errorClass(errors[`row-${index}-precentYarn`])}`}
                      value={row.precentYarn}
                      onChange={(event) => handleRowChange(index, event.target.value)}
                    />
                  </td>
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <td colSpan={2} className="px-0 py-5 text-center text-[12px] text-slate-400">
                    Enter a valid number of cuts to generate rows.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="max-w-[460px] rounded-[12px] border border-slate-200 bg-white px-6 pb-6 pt-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <h4 className="mb-4 mt-0 text-[18px] font-bold text-slate-900">All Drum Entries</h4>
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-[11px] text-slate-700">
            <thead>
              <tr className="border-b border-slate-300 text-left uppercase text-slate-500">
                <th className="px-4 py-3 font-semibold first:pl-0">Reading No.</th>
                <th className="px-4 py-3 font-semibold">Percent Yarn</th>
                <th className="px-4 py-3 font-semibold">Gross Weight</th>
                <th className="px-4 py-3 font-semibold last:pr-0">Average</th>
              </tr>
            </thead>
            <tbody>
              {allDrumEntries.map((entry, index) => (
                <tr key={`${entry.readingNumber}-${index}`} className="border-b border-slate-200 last:border-b-0">
                  <td className="px-4 py-4 first:pl-0">{entry.readingNumber}</td>
                  <td className="px-4 py-4">{entry.precentYarn}</td>
                  <td className="px-4 py-4">{entry.grossWeight}</td>
                  <td className="px-4 py-4 last:pr-0">{entry.average}</td>
                </tr>
              ))}
              {!allDrumEntries.length ? (
                <tr>
                  <td colSpan={4} className="px-4 py-5 text-center text-[12px] text-slate-400">
                    {isFetching ? "Loading last 10 cone packing audit entries..." : "No cone packing audit entries available."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const formFields = [
    { label: "Type", field: "type", type: "select", options: typeOptions, value: selectedTypeName || form.type, placeholder: "Enter type" },
    { label: "Date", field: "date", type: "date", placeholder: "Enter date" },
    { label: "Packed Date", field: "packedDate", type: "date", placeholder: "Enter packed date" },
  ];

  const detailFields = [
    { label: "Gross Wt. (Std)", field: "grossWtStd", type: "text", placeholder: "Enter gross std" },
    { label: "Gross Wt. (Act)", field: "grossWtAct", type: "text", placeholder: "Enter gross act" },
    { label: "Box Colour", field: "boxColour", type: "text", placeholder: "Enter box colour" },
    { label: "Cone Colour", field: "coneColour", type: "text", placeholder: "Enter cone colour" },
    { label: "Gum Tape Colour", field: "gumTapeColour", type: "text", placeholder: "Enter gum tape colour" },
    { label: "Count Label", field: "countLabel", type: "text", placeholder: "Yes / No" },
    { label: "Cone Damage", field: "coneDamage", type: "text", placeholder: "Yes / No" },
    { label: "Cover Missing", field: "coverMissing", type: "text", placeholder: "Yes / No" },
    { label: "Cone Hardness", field: "coneHardness", type: "text", placeholder: "Yes / No" },
    { label: "Stap Cone", field: "stapCone", type: "text", placeholder: "Yes / No" },
    { label: "Disk", field: "disk", type: "text", placeholder: "Yes / No" },
    { label: "Barcode", field: "barcode", type: "text", placeholder: "Yes / No" },
    { label: "Center Pad", field: "centerPad", type: "text", placeholder: "Enter center pad" },
    { label: "Net Weight", field: "netWeight", type: "text", placeholder: "Enter net weight" },
    { label: "Tare Weight", field: "tareWeight", type: "text", placeholder: "Enter tare weight" },
    { label: "Strap Colour", field: "strapColour", type: "text", placeholder: "Enter strap colour" },
  ];

  const renderField = ({ label, field, type, options = [], value, placeholder }) => {
    const fieldValue = value ?? form[field] ?? "";

    return (
      <div key={field} className="flex flex-col gap-2">
        <label className="text-[14px] font-semibold text-slate-700">{label}</label>
        {type === "select" ? (
          <select
            className={`${topFieldClass}${errorClass(errors[field])}`}
            value={fieldValue}
            onChange={(event) => {
              handleFormChange(field, event.target.value);
              if (field === "type") onTypeChange?.(event.target.value);
            }}
          >
            <option value="">{placeholder || "Enter value"}</option>
            {options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        ) : (
          <input
            type={type}
            placeholder={placeholder}
            className={`${topFieldClass}${errorClass(errors[field])}`}
            value={fieldValue}
            onChange={(event) => handleFormChange(field, event.target.value)}
            disabled={field === "date" || field === "packedDate"}
          />
        )}
      </div>
    );
  };

  return (
    <>
      <div className="flex flex-col gap-10">
        <div className="grid grid-cols-1 gap-x-8 gap-y-5 md:grid-cols-2 xl:grid-cols-3">
          {formFields.map(renderField)}
        </div>

        <div className="grid grid-cols-1 gap-x-8 gap-y-5 xl:grid-cols-[184px_184px_184px]">
          {renderField({
            label: "Count Name",
            field: "countName",
            type: "select",
            options: countNameOptions,
            placeholder: "Enter count name",
          })}
        </div>

        <div className="grid grid-cols-1 gap-x-8 gap-y-5 md:grid-cols-2 xl:grid-cols-4">
          {detailFields.map(renderField)}
        </div>
      </div>
      {portalTarget ? createPortal(lowerSection, portalTarget) : null}
      {isLoading ? <p className="mt-3 text-[14px] text-[#3d539f]">Saving cone packing audit...</p> : null}
    </>
  );
});

export default ConePackingAudit;
