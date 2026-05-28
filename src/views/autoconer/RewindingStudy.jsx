import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useDispatch, useSelector } from "react-redux";
import SearchableSelect from "@/components/SearchableSelect";
import {
  getAutoconerRewindingStudy,
  saveAutoconerRewindingStudy,
} from "@/store/slices/autoconer";
import { fetchAutoconerRewindingStudyMasterData } from "@/apis/autoconer";
import { sanitizeIntegerInput, sanitizeNumericInput } from "@/utils/inputValidation";

const today = new Date().toISOString().split("T")[0];

const topFieldClass =
  "autoconer-input w-full h-[42px] rounded-[10px] border border-slate-200 bg-[#F1F5F9] px-3 text-[14px] text-slate-700 outline-none transition focus:border-[#3d539f] focus:ring-2 focus:ring-[#d7def5]";

const compactSelectClass = "";

const tableInputClass =
  "autoconer-input w-full h-[38px] rounded-[8px] border border-slate-200 bg-[#F8FAFC] px-2 text-[14px] text-slate-700 outline-none transition focus:border-[#3d539f] focus:ring-2 focus:ring-[#d7def5]";

const countNameOptions = [
  "10 GRC POLY 40D SPX 8/2 YARN CONES",
  "20 GRC POLY 40D SPX 8/2 YARN CONES",
];

const autoConerOptions = ["AC01", "AC02", "AC03", "AC04"];
const coneTipOptions = ["Red Color with Blue", "Blue Color with White", "Yellow Color with Black"];
const drumRangeOptions = Array.from({ length: 73 }, (_, index) => String(index));

const formFieldSanitizers = {
  testNo: (value) => sanitizeIntegerInput(value, 10),
  drumFrom: (value) => sanitizeIntegerInput(value, 10),
  drumTo: (value) => sanitizeIntegerInput(value, 10),
  noOfCones: (value) => sanitizeIntegerInput(value, 10),
  drumNo: (value) => sanitizeIntegerInput(value, 10),
  weight: (value) => sanitizeNumericInput(value, { precision: 10, scale: 2 }),
  noOfCuts: (value) => sanitizeIntegerInput(value, 10),
  breakPerLakhMeter: (value) => sanitizeNumericInput(value, { precision: 10, scale: 2 }),
  coneTip: (value) => String(value || "").toUpperCase(),
};

const rowFieldSanitizers = {
  drumNo: (value) => sanitizeIntegerInput(value, 10),
  readingNumber: (value) => sanitizeIntegerInput(value, 10),
  faultPercent: (value) => sanitizeNumericInput(value, { precision: 10, scale: 2 }),
  length: (value) => sanitizeNumericInput(value, { precision: 10, scale: 2 }),
  weight: (value) => sanitizeNumericInput(value, { precision: 10, scale: 2 }),
  breakPerMeter: (value) => sanitizeNumericInput(value, { precision: 10, scale: 2 }),
};

const createInitialForm = () => ({
  type: "Rewinding Study",
  testNo: "",
  date: today,
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

const createReadingRows = (count = "", drumNo = "", weight = "") => {
  const total = Number(count);

  if (!Number.isInteger(total) || total <= 0 || !String(drumNo).trim()) {
    return [];
  }

  return Array.from({ length: total }, (_, index) => ({
    drumNo: drumNo || "",
    readingNumber: String(index + 1),
    shortCut: "",
    shortName: "",
    faultPercent: "",
    length: "",
    weight: weight || "",
    breakPerMeter: "",
  }));
};

const buildDrumNumberOptions = (from = "", to = "") => {
  const start = Number(from);
  const end = Number(to);

  if (!Number.isInteger(start) || !Number.isInteger(end) || start <= 0 || end < start) {
    return [];
  }

  return Array.from({ length: end - start + 1 }, (_, index) => String(start + index));
};

const mapRewindingEntryToRows = (entry = {}) => {
  const nestedRows = Array.isArray(entry.drum_inspections)
    ? entry.drum_inspections
    : Array.isArray(entry.readings)
      ? entry.readings
      : [];

  if (nestedRows.length > 0) {
    return nestedRows.map((row, index) => ({
      drumNo: String(row.drum_no ?? row.drumNo ?? entry.drum_no ?? entry.drum_from ?? "-"),
      readingNumber: String(row.reading_number ?? row.readingNumber ?? index + 1),
      shortCut: row.short_cut ?? row.shortCut ?? "-",
      shortName: row.short_name ?? row.shortName ?? "-",
      faultPercent: String(row.fault_percent ?? row.faultPercent ?? "-"),
      length: String(row.length_mm ?? row.length ?? "-"),
      weight: String(row.weight ?? entry.weight ?? "-"),
      percentYarn: String(
        row.percent_yarn ?? row.percentYarn ?? row.break_per_meter ?? row.breakPerMeter ?? "-"
      ),
    }));
  }

  return [
    {
      drumNo: String(entry.drum_no ?? entry.drumNo ?? entry.drum_from ?? "-"),
      readingNumber: String(entry.reading_number ?? entry.readingNumber ?? "1"),
      shortCut: entry.short_cut ?? entry.shortCut ?? "-",
      shortName: entry.short_name ?? entry.shortName ?? "-",
      faultPercent: String(entry.fault_percent ?? entry.faultPercent ?? "-"),
      length: String(entry.length_mm ?? entry.length ?? "-"),
      weight: String(entry.weight ?? "-"),
      percentYarn: String(entry.percent_yarn ?? entry.percentYarn ?? entry.break_per_lakh ?? "-"),
    },
  ];
};

const errorClass = (flag) =>
  flag
    ? " !border-red-500 !bg-[#fff1f2] focus:!border-red-500 focus:!ring-[rgba(239,68,68,0.35)] [box-shadow:0_0_0_1000px_#fff1f2_inset]"
    : "";

const RewindingStudy = forwardRef(function RewindingStudy(
  {
    selectedTypeName = "Rewinding Study",
    onTypeChange,
    typeOptions = [],
    tablePortalTargetId,
    postFooterPortalTargetId,
    entryId = "",
  },
  ref
) {
  const dispatch = useDispatch();
  const { isLoading, isFetching, rewindingStudy = [] } = useSelector((state) => state.autoconer ?? {});
  const [form, setForm] = useState(createInitialForm);
  const [readingRows, setReadingRows] = useState([]);
  const [errors, setErrors] = useState({});
  const [portalReady, setPortalReady] = useState(false);
  const [openDropdown, setOpenDropdown] = useState(null);
  const [countNameDropdownOptions, setCountNameDropdownOptions] = useState(countNameOptions);
  const [autoconerDropdownOptions, setAutoconerDropdownOptions] = useState(autoConerOptions);
  const [countCodeByName, setCountCodeByName] = useState({});
  const dropdownAreaRef = useRef(null);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (!dropdownAreaRef.current?.contains(event.target)) {
        setOpenDropdown(null);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
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
    setReadingRows([]);
    setErrors({});
  };

  const handleRowChange = (index, field, value) => {
    const nextValue = rowFieldSanitizers[field] ? rowFieldSanitizers[field](value) : value;
    setReadingRows((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index
          ? {
              ...row,
              [field]: nextValue,
            }
          : row
      )
    );
    setErrors((current) => {
      if (!current[`row-${index}-${field}`]) return current;
      const next = { ...current };
      delete next[`row-${index}-${field}`];
      return next;
    });
  };

  const validate = () => {
    const nextErrors = {};
    Object.entries(form).forEach(([key, value]) => {
      if (String(value).trim() === "") nextErrors[key] = true;
    });
    if (!readingRows.length) nextErrors.noOfCuts = true;
    readingRows.forEach((row, index) => {
      ["shortCut", "shortName", "faultPercent", "length", "weight", "breakPerMeter"].forEach((field) => {
        if (!String(row[field] || "").trim()) {
          nextErrors[`row-${index}-${field}`] = true;
        }
      });
    });
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const getPreviewData = () => [
    ...Object.entries(form).map(([label, value]) => ({
      label: label === "date" ? "Entry ID" : label,
      value: label === "date" ? entryId || "-" : value || "-",
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
    cntcode: countCodeByName[form.countNameFrom] || undefined,
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
        reading_number: Number(row.readingNumber) || 1,
        short_cut: row.shortCut || null,
        short_name: row.shortName || null,
        fault_percent: Number(row.faultPercent) || 0,
        length_mm: Number(row.length) || 0,
        weight: Number(row.weight) || 0,
        break_per_meter: Number(row.breakPerMeter) || 0,
        percent_yarn: Number(row.breakPerMeter) || 0,
        appearance_ok: true,
      })),
  });

  const submit = async () => {
    if (!validate()) return false;

    const resultAction = await dispatch(saveAutoconerRewindingStudy(buildPayload()));

    if (saveAutoconerRewindingStudy.fulfilled.match(resultAction)) {
      dispatch(getAutoconerRewindingStudy({ page: 1, limit: 10 }));
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
    dispatch(getAutoconerRewindingStudy({ page: 1, limit: 10 }));
  }, [dispatch]);

  useEffect(() => {
    let isCancelled = false;
    const loadMasterData = async () => {
      try {
        const response = await fetchAutoconerRewindingStudyMasterData();
        if (isCancelled) return;

        const masterData = response?.data && typeof response.data === "object" ? response.data : response;

        const countOptionsFromObjects = Array.isArray(masterData?.count_options)
          ? masterData.count_options
              .map((item) => ({
                code: String(
                  item?.cntcode ??
                    item?.cntCode ??
                    item?.count_code ??
                    item?.countCode ??
                    ""
                ).trim(),
                name: String(
                  item?.cntname ??
                    item?.cntName ??
                    item?.count_name ??
                    item?.countName ??
                    item?.label ??
                    ""
                ).trim(),
              }))
              .filter((item) => item.name)
          : [];
        const legacyCountOptions = Array.isArray(masterData?.count_names)
          ? masterData.count_names.map((value) => String(value || "").trim()).filter(Boolean)
          : [];
        const nextCountNames = [
          ...countOptionsFromObjects.map((item) => item.name),
          ...legacyCountOptions,
        ].filter(Boolean);
        const uniqueCountNames = Array.from(new Set(nextCountNames));

        const nextCodeMap = {};
        countOptionsFromObjects.forEach((item) => {
          if (item.name) nextCodeMap[item.name] = item.code;
        });

        const autoconerObjectOptions = Array.isArray(masterData?.autoconer_options)
          ? masterData.autoconer_options
              .map((item) =>
                String(
                  item?.value ??
                    item?.label ??
                    item?.acname ??
                    item?.ac_name ??
                    item?.machine_name ??
                    ""
                ).trim()
              )
              .filter(Boolean)
          : [];
        const legacyAutoconer = Array.isArray(masterData?.autoconer_nos)
          ? masterData.autoconer_nos.map((value) => String(value || "").trim()).filter(Boolean)
          : [];
        const uniqueAutoconers = Array.from(
          new Set([...autoconerObjectOptions, ...legacyAutoconer])
        );

        if (uniqueCountNames.length) setCountNameDropdownOptions(uniqueCountNames);
        if (uniqueAutoconers.length) setAutoconerDropdownOptions(uniqueAutoconers);
        setCountCodeByName(nextCodeMap);
      } catch (error) {
        if (!isCancelled) {
          setCountCodeByName({});
        }
      }
    };
    loadMasterData();
    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    setReadingRows((current) => {
      const nextRows = createReadingRows(form.noOfCuts, form.drumNo, form.weight);

      if (!nextRows.length) return [];

      return nextRows.map((nextRow) => {
        const existingRow = current.find((row) => row.readingNumber === nextRow.readingNumber);
        return existingRow
          ? {
              ...nextRow,
              ...existingRow,
              drumNo: form.drumNo || existingRow.drumNo || "",
              weight: form.weight || existingRow.weight || "",
            }
          : nextRow;
      });
    });
  }, [form.noOfCuts, form.drumNo, form.weight]);

  const allDrumEntries = useMemo(
    () => rewindingStudy.flatMap((entry) => mapRewindingEntryToRows(entry)).slice(0, 10),
    [rewindingStudy]
  );

  const drumNumberOptions = useMemo(
    () => buildDrumNumberOptions(form.drumFrom, form.drumTo),
    [form.drumFrom, form.drumTo]
  );

  useEffect(() => {
    setForm((current) => {
      if (!current.drumNo) return current;
      return { ...current, drumNo: "" };
    });
    setOpenDropdown(null);
  }, [form.drumFrom, form.drumTo]);

  const renderDownwardDropdown = ({ field, value, options, placeholder, errorFlag }) => (
    <div className="relative" ref={openDropdown === field ? dropdownAreaRef : null}>
      <button
        type="button"
        className={`${topFieldClass} flex items-center justify-between text-left${errorClass(errorFlag)}`}
        onClick={() => setOpenDropdown((current) => (current === field ? null : field))}
      >
        <span className={value ? "text-slate-700" : "text-slate-400"}>
          {value || placeholder}
        </span>
        <svg
          className="h-4 w-4 text-slate-500"
          viewBox="0 0 20 20"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            d="M5 7.5L10 12.5L15 7.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {openDropdown === field ? (
        <div className="autoconer-menu absolute left-0 right-0 top-full z-20 mt-1 max-h-52 overflow-y-auto rounded-[10px] border border-slate-200 bg-white py-1 shadow-[0_8px_24px_rgba(15,23,42,0.12)]">
          <button
            type="button"
            className="block w-full px-3 py-2 text-left text-[14px] text-slate-400 hover:bg-slate-50"
            onClick={() => {
              handleFormChange(field, "");
              setOpenDropdown(null);
            }}
          >
            {placeholder}
          </button>
          {options.map((option) => (
            <button
              key={option}
              type="button"
              className="block w-full px-3 py-2 text-left text-[14px] text-slate-700 hover:bg-slate-50"
              onClick={() => {
                handleFormChange(field, option);
                setOpenDropdown(null);
              }}
            >
              {option}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );

  const formFields = [
    { label: "Type", field: "type", type: "select", options: typeOptions, value: selectedTypeName || form.type, placeholder: "Enter type" },
    { label: "Test No.", field: "testNo", type: "text", placeholder: "Enter test no." },
    { label: "Entry ID", field: "date", type: "text", value: entryId, placeholder: "Entry ID" },
    { label: "Count Name (From)", field: "countNameFrom", type: "select", options: countNameDropdownOptions, placeholder: "Enter count name" },
    { label: "Auto Coner No.", field: "autoConerNo", type: "select", options: autoconerDropdownOptions, placeholder: "Enter auto coner no." },
    { label: "Drum From/To", field: "drumRange", type: "pair" },
    { label: "No. of Cones", field: "noOfCones", type: "text", placeholder: "Enter no. of cones" },
    { label: "Cone Tip", field: "coneTip", type: "text", placeholder: "Enter cone tip" },
    {
      label: "Drum No.",
      field: "drumNo",
      type: "select",
      options: drumNumberOptions,
      placeholder: "Select",
      className: compactSelectClass,
      wrapperClassName: "",
    },
    { label: "Weight", field: "weight", type: "text", placeholder: "Enter weight" },
    { label: "No. of Cuts", field: "noOfCuts", type: "text", placeholder: "Enter no. of cuts" },
  ];

  const topPortalTarget =
    portalReady && tablePortalTargetId && typeof document !== "undefined"
      ? document.getElementById(tablePortalTargetId)
      : null;

  const bottomPortalTarget =
    portalReady && postFooterPortalTargetId && typeof document !== "undefined"
      ? document.getElementById(postFooterPortalTargetId)
      : null;

  const generatedTableSection = (
    <div className="px-6 pt-2">
      <div className="overflow-x-auto">
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
          {readingRows.map((row, index) => (
            <tr key={`${row.drumNo}-${row.readingNumber}`} className="border-b border-slate-200">
              <td className="px-0 py-4 pr-6">{row.drumNo}</td>
              <td className="px-0 py-4 pr-6">{row.readingNumber}</td>
              <td className="px-0 py-4 pr-6">
                <input
                  type="text"
                  className={`${tableInputClass}${errorClass(errors[`row-${index}-shortCut`])}`}
                  value={row.shortCut}
                  onChange={(event) => handleRowChange(index, "shortCut", event.target.value)}
                />
              </td>
              <td className="px-0 py-4 pr-6">
                <input
                  type="text"
                  className={`${tableInputClass}${errorClass(errors[`row-${index}-shortName`])}`}
                  value={row.shortName}
                  onChange={(event) => handleRowChange(index, "shortName", event.target.value)}
                />
              </td>
              <td className="px-0 py-4 pr-6">
                <input
                  type="text"
                  className={`${tableInputClass}${errorClass(errors[`row-${index}-faultPercent`])}`}
                  value={row.faultPercent}
                  onChange={(event) => handleRowChange(index, "faultPercent", event.target.value)}
                />
              </td>
              <td className="px-0 py-4 pr-6">
                <input
                  type="text"
                  className={`${tableInputClass}${errorClass(errors[`row-${index}-length`])}`}
                  value={row.length}
                  onChange={(event) => handleRowChange(index, "length", event.target.value)}
                />
              </td>
              <td className="px-0 py-4 pr-6">
                <input
                  type="text"
                  className={`${tableInputClass}${errorClass(errors[`row-${index}-weight`])}`}
                  value={row.weight}
                  onChange={(event) => handleRowChange(index, "weight", event.target.value)}
                />
              </td>
              <td className="px-0 py-4">
                <input
                  type="text"
                  className={`${tableInputClass}${errorClass(errors[`row-${index}-breakPerMeter`])}`}
                  value={row.breakPerMeter}
                  onChange={(event) => handleRowChange(index, "breakPerMeter", event.target.value)}
                />
              </td>
            </tr>
          ))}
          {!readingRows.length ? (
            <tr>
              <td colSpan={8} className="px-0 py-5 text-center text-[12px] text-slate-400">
                Enter a valid number of cuts to generate rows.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
      </div>
    </div>
  );

  const summarySection = (
    <div className="flex flex-col gap-8 pt-6">
      <div className="max-w-[160px]">
        <label className="mb-2 block text-[14px] font-semibold text-slate-700">Break / 1 Lakh Meter</label>
        <input
          type="text"
          placeholder="Break / 1 Lakh Meter"
          className={`${topFieldClass}${errorClass(errors.breakPerLakhMeter)}`}
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
              {!allDrumEntries.length ? (
                <tr>
                  <td colSpan={8} className="px-4 py-5 text-center text-[12px] text-slate-400">
                    {isFetching ? "Loading last 10 rewinding entries..." : "No rewinding entries available."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <div className="grid grid-cols-1 gap-x-4 gap-y-5 md:grid-cols-2 xl:grid-cols-3">
        {formFields.map(({ label, field, type, options = [], value, placeholder, className = "", wrapperClassName = "" }) => {
          if (type === "pair") {
            return (
              <div key={field} className="flex flex-col gap-2">
                <label className="text-[14px] font-semibold text-slate-700">{label}</label>
                <div className="grid grid-cols-2 gap-3">
                  {renderDownwardDropdown({
                    field: "drumFrom",
                    value: form.drumFrom,
                    options: drumRangeOptions,
                    placeholder: "Select from",
                    errorFlag: errors.drumFrom,
                  })}
                  {renderDownwardDropdown({
                    field: "drumTo",
                    value: form.drumTo,
                    options: drumRangeOptions,
                    placeholder: "Select to",
                    errorFlag: errors.drumTo,
                  })}
                </div>
              </div>
            );
          }

          const fieldValue = value ?? form[field] ?? "";

          return (
            <div key={field} className={`flex flex-col gap-2 ${wrapperClassName}`}>
              <label className="text-[14px] font-semibold text-slate-700">{label}</label>

              {type === "select" && field === "drumNo" ? (
                renderDownwardDropdown({
                  field,
                  value: fieldValue,
                  options,
                  placeholder: placeholder || "Select",
                  errorFlag: errors[field],
                })
              ) : type === "select" && (field === "countNameFrom" || field === "autoConerNo") ? (
                <SearchableSelect
                  className={`${topFieldClass}${errorClass(errors[field])}`}
                  value={fieldValue}
                  options={options}
                  placeholder={placeholder || "Type to search..."}
                  onChange={(nextValue) => handleFormChange(field, nextValue)}
                  ariaLabel={field === "countNameFrom" ? "Count Name" : "Auto Coner No"}
                />
              ) : type === "select" ? (
                <select
                  className={`${topFieldClass} ${className}${errorClass(errors[field])}`}
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
                  disabled={field === "date"}
                />
              )}
            </div>
          );
        })}
      </div>
      {topPortalTarget ? createPortal(generatedTableSection, topPortalTarget) : null}
      {bottomPortalTarget ? createPortal(summarySection, bottomPortalTarget) : null}
      {isLoading ? <p className="mt-3 text-[14px] text-[#3d539f]">Saving rewinding study...</p> : null}
    </>
  );
});

export default RewindingStudy;
