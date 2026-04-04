import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useDispatch, useSelector } from "react-redux";
import { saveAutoconerRewindingStudy } from "@/store/slices/autoconer";

const today = new Date().toISOString().split("T")[0];

const topFieldClass =
  "w-full h-[42px] rounded-[10px] border border-slate-200 bg-[#F8FAFC] px-3 text-[14px] text-slate-700 outline-none transition focus:border-[#3d539f] focus:ring-2 focus:ring-[#d7def5]";

const tableInputClass =
  "w-full h-[38px] rounded-[8px] border border-slate-200 bg-slate-50 px-2 text-[12px] text-slate-700 outline-none transition focus:border-[#3d539f] focus:ring-2 focus:ring-[#d7def5]";

const countNameOptions = [
  "10 GRC POLY 40D SPX 8/2 YARN CONES",
  "20 GRC POLY 40D SPX 8/2 YARN CONES",
];

const autoConerOptions = ["AC01", "AC02", "AC03", "AC04"];
const coneTipOptions = ["Red Color with Blue", "Blue Color with White", "Yellow Color with Black"];

const createInitialForm = () => ({
  type: "Rewinding Study",
  testNo: "",
  date: "",
  countNameFrom: "",
  autoConerNo: "",
  drumFrom: "",
  drumTo: "",
  noOfCones: "",
  coneTip: "",
  drumNo: "",
  weight: "",
  noOfCuts: "",
  breakPerLakhMeter: "",
});

const createReadingRows = () => [
  {
    drumNo: "4",
    readingNumber: "1",
    shortCut: "L",
    shortName: "B1",
    faultPercent: "34",
    length: "89",
    weight: "12",
    breakPerMeter: "0.98",
  },
  {
    drumNo: "4",
    readingNumber: "2",
    shortCut: "E",
    shortName: "E",
    faultPercent: "23",
    length: "32",
    weight: "12",
    breakPerMeter: "0.98",
  },
];

const createAllDrumEntries = () => [
  { drumNo: "2", readingNumber: "1", shortCut: "L", shortName: "B1", faultPercent: "12", length: "34", weight: "12", percentYarn: "0.96" },
  { drumNo: "2", readingNumber: "2", shortCut: "L", shortName: "E", faultPercent: "23", length: "89", weight: "12", percentYarn: "0.98" },
  { drumNo: "3", readingNumber: "1", shortCut: "L", shortName: "B1", faultPercent: "12", length: "34", weight: "12", percentYarn: "0.96" },
  { drumNo: "3", readingNumber: "2", shortCut: "S", shortName: "E", faultPercent: "23", length: "89", weight: "12", percentYarn: "0.98" },
  { drumNo: "4", readingNumber: "1", shortCut: "L", shortName: "B1", faultPercent: "34", length: "89", weight: "12", percentYarn: "0.96" },
  { drumNo: "4", readingNumber: "2", shortCut: "E", shortName: "E", faultPercent: "23", length: "32", weight: "12", percentYarn: "0.98" },
];

const errorClass = (flag) =>
  flag ? " border-red-500 bg-rose-50 focus:border-red-500 focus:ring-red-200" : "";

const RewindingStudy = forwardRef(function RewindingStudy(
  { selectedTypeName = "Rewinding Study", onTypeChange, typeOptions = [], tablePortalTargetId },
  ref
) {
  const dispatch = useDispatch();
  const { isLoading } = useSelector((state) => state.autoconer ?? {});
  const [form, setForm] = useState(createInitialForm);
  const [readingRows, setReadingRows] = useState(createReadingRows);
  const [allDrumEntries] = useState(createAllDrumEntries);
  const [errors, setErrors] = useState({});
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  const tableHeaders = useMemo(
    () => ["Drum No.", "Reading Number", "Short Cut", "Short Name", "% Fault", "Length (mm)", "Weight", "Break / Meter"],
    []
  );

  const allDrumHeaders = useMemo(
    () => ["Drum No.", "Reading Number", "Short Cut", "Short Name", "% Fault", "Length (mm)", "Weight", "Percent Yarn"],
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
    setReadingRows(createReadingRows());
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
    ...Object.entries(form).map(([label, value]) => ({
      label,
      value: value || "-",
    })),
    ...readingRows.map((row, index) => ({
      label: `Reading ${index + 1}`,
      value: `${row.drumNo} | ${row.readingNumber} | ${row.shortCut} | ${row.shortName} | ${row.faultPercent} | ${row.length} | ${row.weight} | ${row.breakPerMeter}`,
    })),
  ];

  const buildPayload = () => ({
    test_no: Number(form.testNo),
    entry_date: form.date,
    type: selectedTypeName || form.type,
    machine_name: form.autoConerNo,
    count_name: form.countNameFrom,
    cone_tip: form.coneTip,
    drum_from: Number(form.drumFrom),
    drum_to: Number(form.drumTo),
    drum_no: Number(form.drumNo),
    no_of_cones: Number(form.noOfCones),
    weight: Number(form.weight),
    no_of_cuts: Number(form.noOfCuts),
    break_per_lakh: Number(form.breakPerLakhMeter),
    remarks: "Normal",
    drum_inspections: readingRows.map((row) => ({
      drum_no: Number(row.drumNo),
      appearance_ok: true,
    })),
  });

  const submit = async () => {
    if (!validate()) return false;

    const resultAction = await dispatch(saveAutoconerRewindingStudy(buildPayload()));

    if (saveAutoconerRewindingStudy.fulfilled.match(resultAction)) {
      alert(resultAction.payload?.message || "Rewinding study created successfully");
      clear();
      return true;
    }

    alert(resultAction.payload || "Failed to save rewinding study.");
    return false;
  };

  useImperativeHandle(ref, () => ({
    clear,
    validate,
    getPreviewData,
    submit,
  }));

  const formFields = [
    { label: "Type", field: "type", type: "select", options: typeOptions, value: selectedTypeName || form.type, placeholder: "Enter type" },
    { label: "Test No.", field: "testNo", type: "text", placeholder: "Enter test no." },
    { label: "Date", field: "date", type: "date", placeholder: "Enter date" },
    { label: "Count Name (From)", field: "countNameFrom", type: "select", options: countNameOptions, placeholder: "Enter count name" },
    { label: "Auto Coner No.", field: "autoConerNo", type: "select", options: autoConerOptions, placeholder: "Enter auto coner no." },
    { label: "Drum From/To", field: "drumRange", type: "pair" },
    { label: "No. of Cones", field: "noOfCones", type: "text", placeholder: "Enter no. of cones" },
    { label: "Cone Tip", field: "coneTip", type: "select", options: coneTipOptions, placeholder: "Enter cone tip" },
    { label: "Drum No.", field: "drumNo", type: "text", placeholder: "Enter drum no." },
    { label: "Weight", field: "weight", type: "text", placeholder: "Enter weight" },
    { label: "No. of Cuts", field: "noOfCuts", type: "text", placeholder: "Enter no. of cuts" },
  ];

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
              {tableHeaders.map((header) => (
                <th key={header} className="px-0 py-3 pr-6 font-semibold">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {readingRows.map((row) => (
              <tr key={`${row.drumNo}-${row.readingNumber}`} className="border-b border-slate-200">
                <td className="px-0 py-4 pr-6">{row.drumNo}</td>
                <td className="px-0 py-4 pr-6">{row.readingNumber}</td>
                <td className="px-0 py-4 pr-6">{row.shortCut}</td>
                <td className="px-0 py-4 pr-6">{row.shortName}</td>
                <td className="px-0 py-4 pr-6">{row.faultPercent}</td>
                <td className="px-0 py-4 pr-6">{row.length}</td>
                <td className="px-0 py-4 pr-6">{row.weight}</td>
                <td className="px-0 py-4">{row.breakPerMeter}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="max-w-[160px]">
        <label className="mb-2 block text-[14px] font-semibold text-slate-700">Break per Lakh Meter</label>
        <input
          type="text"
          placeholder="Enter break per lakh meter"
          className={topFieldClass}
          value={form.breakPerLakhMeter}
          onChange={(event) => handleFormChange("breakPerLakhMeter", event.target.value)}
        />
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
                <tr key={`${entry.drumNo}-${entry.readingNumber}-${index}`} className="border-b border-slate-200 last:border-b-0">
                  <td className="px-4 py-4 first:pl-0">{entry.drumNo}</td>
                  <td className="px-4 py-4">{entry.readingNumber}</td>
                  <td className="px-4 py-4">{entry.shortCut}</td>
                  <td className="px-4 py-4">{entry.shortName}</td>
                  <td className="px-4 py-4">{entry.faultPercent}</td>
                  <td className="px-4 py-4">{entry.length}</td>
                  <td className="px-4 py-4">{entry.weight}</td>
                  <td className="px-4 py-4 last:pr-0">{entry.percentYarn}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

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
      {isLoading ? <p className="mt-3 text-[14px] text-[#3d539f]">Saving rewinding study...</p> : null}
    </>
  );
});

export default RewindingStudy;
