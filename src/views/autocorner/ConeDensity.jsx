import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useDispatch, useSelector } from "react-redux";
import { submitAutocornerConeDensity } from "@/store/slices/autocorner";

const today = new Date().toISOString().split("T")[0];

const topFieldClass =
  "w-full h-[42px] rounded-[10px] border border-slate-200 bg-[#F8FAFC] px-3 text-[14px] text-slate-700 outline-none transition focus:border-[#3d539f] focus:ring-2 focus:ring-[#d7def5]";

const countNameOptions = [
  "10 BLACK RECYCLE(GRC) 70D LYC YARN...",
  "20 BLACK RECYCLE(GRC) 70D LYC YARN...",
];

const autoConerOptions = ["AC01", "AC02", "AC03", "AC04"];
const coneTipOptions = ["Blue", "Red", "White"];

const createInitialForm = () => ({
  type: "Cone Density",
  testNo: "",
  date: "",
  countNameFrom: "",
  autoConerNo: "",
  baseDiaE: "",
  noseDiaE: "",
  drumFrom: "",
  drumTo: "",
  coneTip: "",
  weight: "",
  noOfCuts: "",
});

const createReadingRows = () => [
  { drumNo: "1", baseDiaE: "1", noseDiaE: "2", baseDia: "1", noseDia: "2", coneWeight: "5", coneTrav: "6", density: "4", hardness: "4" },
  { drumNo: "1", baseDiaE: "1", noseDiaE: "2", baseDia: "1", noseDia: "2", coneWeight: "5", coneTrav: "6", density: "4", hardness: "4" },
  { drumNo: "1", baseDiaE: "1", noseDiaE: "2", baseDia: "1", noseDia: "2", coneWeight: "5", coneTrav: "6", density: "4", hardness: "4" },
];

const createAllDrumEntries = () => [
  { drumNo: "1", baseDiaE: "1.00", noseDiaE: "2.00", baseDia: "1.00", noseDia: "2.00", coneWeight: "5.00", coneTraverse: "6.00", coneDensity: "4.000", percentYarn: "4.00" },
  { drumNo: "2", baseDiaE: "1.00", noseDiaE: "2.00", baseDia: "5.00", noseDia: "6.00", coneWeight: "5.00", coneTraverse: "4.00", coneDensity: "5.000", percentYarn: "3.00" },
  { drumNo: "3", baseDiaE: "1.00", noseDiaE: "2.00", baseDia: "5.00", noseDia: "4.00", coneWeight: "4.00", coneTraverse: "5.00", coneDensity: "4.000", percentYarn: "4.00" },
];

const summaryRows = [
  { label: "Average", baseDia: "3.67", noseDia: "4.00", coneWeight: "4.667", coneTraverse: "5.00", coneDensity: "4.333", percentYarn: "3.67" },
  { label: "Min", baseDia: "1.00", noseDia: "2.00", coneWeight: "4.000", coneTraverse: "4.00", coneDensity: "4.000", percentYarn: "3.00" },
  { label: "Max", baseDia: "5.00", noseDia: "6.00", coneWeight: "5.000", coneTraverse: "6.00", coneDensity: "5.000", percentYarn: "4.00" },
  { label: "Range", baseDia: "4.00", noseDia: "4.00", coneWeight: "1.000", coneTraverse: "2.00", coneDensity: "1.000", percentYarn: "1.00" },
];

const errorClass = (flag) =>
  flag ? " border-red-500 bg-rose-50 focus:border-red-500 focus:ring-red-200" : "";

const ConeDensity = forwardRef(function ConeDensity(
  { selectedTypeName = "Cone Density", onTypeChange, typeOptions = [], tablePortalTargetId },
  ref
) {
  const dispatch = useDispatch();
  const { isLoading } = useSelector((state) => state.autocorner ?? {});
  const [form, setForm] = useState(createInitialForm);
  const [readingRows] = useState(createReadingRows);
  const [allDrumEntries] = useState(createAllDrumEntries);
  const [errors, setErrors] = useState({});
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  const topHeaders = useMemo(
    () => ["Drum No.", "Base Dia (E)", "Nose Dia (E)", "Base Dia", "Nose Dia", "Cone Weight", "Cone Trav", "Density", "Hardness"],
    []
  );

  const allDrumHeaders = useMemo(
    () => ["Drum No.", "Base Dia (E)", "Nose Dia(E)", "Base Dia", "Nose Dia", "Cone Weight", "Cone Traverse", "Cone Density", "Precent Yarn"],
    []
  );

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
    ...readingRows.map((row, index) => ({
      label: `Reading ${index + 1}`,
      value: `${row.drumNo} | ${row.baseDiaE} | ${row.noseDiaE} | ${row.baseDia} | ${row.noseDia} | ${row.coneWeight} | ${row.coneTrav} | ${row.density} | ${row.hardness}`,
    })),
  ];

  const buildPayload = () => ({
    test_no: Number(form.testNo),
    entry_date: form.date,
    type: selectedTypeName || form.type,
    machine_name: form.autoConerNo,
    count_name: form.countNameFrom,
    cone_tip: form.coneTip,
    base_dia_e: Number(form.baseDiaE),
    nose_dia_e: Number(form.noseDiaE),
    drum_from: Number(form.drumFrom),
    drum_to: Number(form.drumTo),
    weight: Number(form.weight),
    no_of_cuts: Number(form.noOfCuts),
    remarks: "Normal",
    cone_readings: readingRows.map((row) => ({
      drum_no: Number(row.drumNo),
      reading_number: 1,
      short_cut: row.baseDia,
      short_name: row.noseDia,
      fault_percent: Number(row.coneWeight),
      length_mm: Number(row.coneTrav),
      weight: Number(row.baseDiaE),
      break_per_meter: Number(row.noseDiaE),
      density: Number(row.density),
      hardness: Number(row.hardness),
    })),
  });

  const submit = async () => {
    if (!validate()) return false;

    const resultAction = await dispatch(submitAutocornerConeDensity(buildPayload()));

    if (submitAutocornerConeDensity.fulfilled.match(resultAction)) {
      alert(resultAction.payload?.message || "Cone density record created successfully");
      clear();
      return true;
    }

    alert(resultAction.payload || "Failed to save cone density.");
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
    <div className="flex flex-col gap-8">
      <div className="overflow-x-auto pt-2">
        <table className="min-w-full border-collapse text-[11px] text-slate-700">
          <thead>
            <tr className="border-b border-slate-300 text-left uppercase text-slate-500">
              {topHeaders.map((header) => (
                <th key={header} className="px-0 py-3 pr-6 font-semibold">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {readingRows.map((row, index) => (
              <tr key={`${row.drumNo}-${index}`} className="border-b border-slate-200">
                <td className="px-0 py-5 pr-6">{row.drumNo}</td>
                <td className="px-0 py-5 pr-6">{row.baseDiaE}</td>
                <td className="px-0 py-5 pr-6">{row.noseDiaE}</td>
                <td className="px-0 py-5 pr-6">{row.baseDia}</td>
                <td className="px-0 py-5 pr-6">{row.noseDia}</td>
                <td className="px-0 py-5 pr-6">{row.coneWeight}</td>
                <td className="px-0 py-5 pr-6">{row.coneTrav}</td>
                <td className="px-0 py-5 pr-6">{row.density}</td>
                <td className="px-0 py-5">{row.hardness}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="w-full rounded-[12px] border border-slate-200 bg-white px-6 pb-6 pt-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <h4 className="mb-4 mt-0 text-[18px] font-bold text-slate-900">All Drum Entries</h4>
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-[11px] text-slate-700">
            <thead>
              <tr className="border-b border-slate-300 text-left uppercase text-slate-500">
                {allDrumHeaders.map((header) => (
                  <th key={header} className="px-4 py-3 font-semibold first:pl-0 last:pr-0">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allDrumEntries.map((entry, index) => (
                <tr key={`${entry.drumNo}-${index}`} className="border-b border-slate-200">
                  <td className="px-4 py-4 first:pl-0">{entry.drumNo}</td>
                  <td className="px-4 py-4">{entry.baseDiaE}</td>
                  <td className="px-4 py-4">{entry.noseDiaE}</td>
                  <td className="px-4 py-4">{entry.baseDia}</td>
                  <td className="px-4 py-4">{entry.noseDia}</td>
                  <td className="px-4 py-4">{entry.coneWeight}</td>
                  <td className="px-4 py-4">{entry.coneTraverse}</td>
                  <td className="px-4 py-4">{entry.coneDensity}</td>
                  <td className="px-4 py-4 last:pr-0">{entry.percentYarn}</td>
                </tr>
              ))}
              {summaryRows.map((row) => (
                <tr key={row.label} className="border-b border-slate-200 last:border-b-0">
                  <td className="px-4 py-4 font-bold first:pl-0">{row.label.toUpperCase()}</td>
                  <td className="px-4 py-4" />
                  <td className="px-4 py-4" />
                  <td className="px-4 py-4 font-semibold">{row.baseDia}</td>
                  <td className="px-4 py-4 font-semibold">{row.noseDia}</td>
                  <td className="px-4 py-4 font-semibold">{row.coneWeight}</td>
                  <td className="px-4 py-4 font-semibold">{row.coneTraverse}</td>
                  <td className="px-4 py-4 font-semibold">{row.coneDensity}</td>
                  <td className="px-4 py-4 font-semibold last:pr-0">{row.percentYarn}</td>
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
    { label: "Test No.", field: "testNo", type: "text", placeholder: "Enter test no." },
    { label: "Date", field: "date", type: "date", placeholder: "Enter date" },
    { label: "Count Name (From)", field: "countNameFrom", type: "select", options: countNameOptions, placeholder: "Enter count name" },
    { label: "Auto Coner No.", field: "autoConerNo", type: "select", options: autoConerOptions, placeholder: "Enter auto coner no." },
    { label: "Base Dia (E)", field: "baseDiaE", type: "text", placeholder: "Enter base dia (e)" },
    { label: "Nose Dia (E)", field: "noseDiaE", type: "text", placeholder: "Enter nose dia (e)" },
    { label: "Drum From/To", field: "drumRange", type: "pair" },
    { label: "Cone Tip", field: "coneTip", type: "select", options: coneTipOptions, placeholder: "Enter cone tip" },
    { label: "Weight", field: "weight", type: "text", placeholder: "Enter weight" },
    { label: "No. of Cuts", field: "noOfCuts", type: "text", placeholder: "Enter no. of cuts" },
  ];

  return (
    <>
      <div className="grid grid-cols-1 gap-x-4 gap-y-5 md:grid-cols-2 xl:grid-cols-3">
        {formFields.map(({ label, field, type, options = [], value, placeholder }) => {
          if (type === "pair") {
            return (
              <div key={field} className="flex flex-col gap-2">
                <label className="text-[14px] font-semibold text-slate-700">{label}</label>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    placeholder="Enter from"
                    className={`${topFieldClass}${errorClass(errors.drumFrom)}`}
                    value={form.drumFrom}
                    onChange={(event) => handleFormChange("drumFrom", event.target.value)}
                  />
                  <input
                    type="text"
                    placeholder="Enter to"
                    className={`${topFieldClass}${errorClass(errors.drumTo)}`}
                    value={form.drumTo}
                    onChange={(event) => handleFormChange("drumTo", event.target.value)}
                  />
                </div>
              </div>
            );
          }

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
        })}
      </div>
      {portalTarget ? createPortal(lowerSection, portalTarget) : null}
      {isLoading ? <p className="mt-3 text-[14px] text-[#3d539f]">Saving cone density...</p> : null}
    </>
  );
});

export default ConeDensity;
