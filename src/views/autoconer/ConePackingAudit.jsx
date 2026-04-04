import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useDispatch, useSelector } from "react-redux";
import { saveAutoconerConePackingAudit } from "@/store/slices/autoconer";

const today = new Date().toISOString().split("T")[0];

const topFieldClass =
  "w-full h-[42px] rounded-[10px] border border-slate-200 bg-slate-50 px-3 text-[14px] text-slate-700 outline-none transition focus:border-[#3d539f] focus:ring-2 focus:ring-[#d7def5]";

const countNameOptions = [
  "10 COTTON POLY LINEN 60/20/20...",
  "20 COTTON POLY LINEN 60/20/20...",
];

const createInitialForm = () => ({
  type: "Cone Packing Audit",
  date: "",
  packedDate: "",
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

const createReadingRows = () => [
  { readingNumber: "1", precentYarn: "8.00" },
  { readingNumber: "2", precentYarn: "37.88" },
  { readingNumber: "3", precentYarn: "103.12" },
];

const allDrumEntries = [
  { drumNo: "1", grossWeight: "47.54", average: "47.550" },
  { drumNo: "2", grossWeight: "47.56", average: "47.550" },
];

const errorClass = (flag) =>
  flag ? " border-red-500 bg-rose-50 focus:border-red-500 focus:ring-red-200" : "";

const ConePackingAudit = forwardRef(function ConePackingAudit(
  { selectedTypeName = "Cone Packing Audit", onTypeChange, typeOptions = [], tablePortalTargetId },
  ref
) {
  const dispatch = useDispatch();
  const { isLoading } = useSelector((state) => state.autoconer ?? {});
  const [form, setForm] = useState(createInitialForm);
  const [rows] = useState(createReadingRows);
  const [errors, setErrors] = useState({});
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  const handleFormChange = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const clear = () => {
    setForm(createInitialForm());
    setErrors({});
  };

  const validate = () => {
    const nextErrors = {};
    Object.entries(form).forEach(([key, value]) => {
      if (String(value).trim() === "") nextErrors[key] = true;
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
    gross_weight_std: Number(form.grossWtStd),
    gross_weight_actual: Number(form.grossWtAct),
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
    net_weight: Number(String(form.netWeight).replace(/,/g, "")),
    tare_weight: Number(form.tareWeight),
    strap_colour: form.strapColour,
    drum_entries: allDrumEntries.map((entry) => ({
      drum_no: Number(entry.drumNo),
      gross_weight: Number(entry.grossWeight),
      average: Number(entry.average),
    })),
    cone_readings: rows.map((row) => ({
      reading_number: Number(row.readingNumber),
      percent_yarn: Number(row.precentYarn),
    })),
  });

  const submit = async () => {
    if (!validate()) return false;

    const resultAction = await dispatch(saveAutoconerConePackingAudit(buildPayload()));

    if (saveAutoconerConePackingAudit.fulfilled.match(resultAction)) {
      alert(resultAction.payload?.message || "Cone packing audit created successfully");
      clear();
      return true;
    }

    alert(resultAction.payload || "Failed to save cone packing audit.");
    return false;
  };

  useImperativeHandle(ref, () => ({
    clear,
    validate,
    getPreviewData,
    submit,
  }));

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
              className={`${topFieldClass}${errorClass(errors.noOfCuts)}`}
              value={form.noOfCuts}
              onChange={(event) => handleFormChange("noOfCuts", event.target.value)}
            />
            <button
              type="button"
              className="h-[30px] rounded-[6px] bg-[#4056a8] px-3 text-[11px] font-semibold text-white"
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
              {rows.map((row) => (
                <tr key={row.readingNumber} className="border-b border-slate-200">
                  <td className="px-0 py-4 pr-6">{row.readingNumber}</td>
                  <td className="px-0 py-4">{row.precentYarn}</td>
                </tr>
              ))}
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
                <th className="px-4 py-3 font-semibold first:pl-0">Drum No.</th>
                <th className="px-4 py-3 font-semibold">Gross Weight</th>
                <th className="px-4 py-3 font-semibold last:pr-0">Average</th>
              </tr>
            </thead>
            <tbody>
              {allDrumEntries.map((entry) => (
                <tr key={entry.drumNo} className="border-b border-slate-200 last:border-b-0">
                  <td className="px-4 py-4 first:pl-0">{entry.drumNo}</td>
                  <td className="px-4 py-4">{entry.grossWeight}</td>
                  <td className="px-4 py-4 last:pr-0">{entry.average}</td>
                </tr>
              ))}
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
