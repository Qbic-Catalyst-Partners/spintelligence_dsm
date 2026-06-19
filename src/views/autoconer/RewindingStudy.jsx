import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AiOutlineDelete } from "react-icons/ai";
import { useDispatch, useSelector } from "react-redux";
import {
  getAutoconerRewindingStudy,
  saveAutoconerRewindingStudy,
} from "@/store/slices/autoconer";
import { fetchAutoconerRewindingStudyMasterData } from "@/apis/autoconer";
import { sanitizeIntegerInput, sanitizeNumericInput } from "@/utils/inputValidation";

const today = new Date().toISOString().split("T")[0];

const topFieldClass =
  "autoconer-input w-full h-[42px] rounded-[10px] border border-slate-200 bg-[#F1F5F9] px-3 text-[14px] text-slate-700 outline-none transition focus:border-[#3d539f] focus:ring-2 focus:ring-[#d7def5]";

const tableInputClass =
  "autoconer-input w-full h-[38px] rounded-[8px] border border-slate-200 bg-[#F8FAFC] px-2 text-[14px] text-slate-700 outline-none transition focus:border-[#3d539f] focus:ring-2 focus:ring-[#d7def5]";

const compactDropdownClass =
  "autoconer-input flex h-[38px] w-full items-center justify-between rounded-[8px] border border-slate-200 bg-[#F8FAFC] px-2 text-[13px] text-slate-700 outline-none transition focus:border-[#3d539f] focus:ring-2 focus:ring-[#d7def5]";

const countNameOptions = [
  "10 GRC POLY 40D SPX 8/2 YARN CONES",
  "20 GRC POLY 40D SPX 8/2 YARN CONES",
];

const autoConerOptions = ["AC01", "AC02", "AC03", "AC04"];
const faultNameOptions = ["Splice", "Double End"];
const coneTipOptions = ["Red Color with Blue", "Blue Color with White", "Yellow Color with Black"];
const drumRangeOptions = Array.from({ length: 73 }, (_, index) => String(index));

const formFieldSanitizers = {
  drumFrom: (value) => sanitizeIntegerInput(value, 10),
  drumTo: (value) => sanitizeIntegerInput(value, 10),
  actualCount: (value) => sanitizeNumericInput(value, { precision: 10, scale: 2 }),
  drumNo: (value) => sanitizeIntegerInput(value, 10),
  weight: (value) => sanitizeNumericInput(value, { precision: 10, scale: 2 }),
  noOfCuts: (value) => sanitizeIntegerInput(value, 10),
  breakPerLakhMeter: (value) => sanitizeNumericInput(value, { precision: 10, scale: 2 }),
};

const rowFieldSanitizers = {
  drumNo: (value) => sanitizeIntegerInput(value, 10),
  readingNumber: (value) => sanitizeIntegerInput(value, 10),
  length: (value) => sanitizeNumericInput(value, { precision: 10, scale: 2 }),
  weight: (value) => sanitizeNumericInput(value, { precision: 10, scale: 2 }),
  breakPerMeter: (value) => sanitizeNumericInput(value, { precision: 10, scale: 2 }),
};

const createBlankReadingRow = () => ({
  drumNo: "",
  noOfCones: "",
  readingNumber: "",
  shortCut: "",
  shortName: "",
  faultPercent: "",
  length: "",
  weight: "",
  breakPerMeter: "",
});

const createInitialForm = () => ({
  type: "Rewinding Study",
  date: today,
  countNameFrom: "",
  autoConerNo: "",
  drumFrom: "",
  drumTo: "",
  actualCount: "",
  coneTip: "",
  drumNo: "",
  weight: "",
  noOfCuts: "",
  breakPerLakhMeter: "",
});

const createReadingRows = (count = "", drumNo = "", weight = "") => {
  const total = Number(count);

  if (!String(drumNo).trim()) {
    return [
      {
        drumNo: "",
        noOfCones: "",
        readingNumber: "",
        shortCut: "",
        shortName: "",
        faultPercent: "",
        length: "",
        weight: "",
        breakPerMeter: "",
      },
    ];
  }

  if (!Number.isInteger(total) || total <= 0) {
    return [
      {
        drumNo: "",
        noOfCones: "",
        readingNumber: "",
        shortCut: "",
        shortName: "",
        faultPercent: "",
        length: "",
        weight: "",
        breakPerMeter: "",
      },
    ];
  }

  return Array.from({ length: total }, (_, index) => ({
    drumNo: "",
    noOfCones: "",
    readingNumber: String(index + 1),
    shortCut: "",
    shortName: "",
    faultPercent: "",
    length: "",
    weight: "",
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
      noOfCones: String(row.no_of_cones ?? row.noOfCones ?? entry.no_of_cones ?? entry.noOfCones ?? "-"),
      faultName: String(row.short_cut ?? row.shortCut ?? "-"),
      noOfFaults: String(row.reading_number ?? row.readingNumber ?? index + 1),
      percentFault: String(row.fault_percent ?? row.faultPercent ?? "-"),
      weight: String(row.weight ?? entry.weight ?? "-"),
      length: String(row.length_mm ?? row.length ?? "-"),
    }));
  }

  return [
    {
      drumNo: String(entry.drum_no ?? entry.drumNo ?? entry.drum_from ?? "-"),
      noOfCones: String(entry.no_of_cones ?? entry.noOfCones ?? "-"),
      faultName: String(entry.short_cut ?? entry.shortCut ?? "-"),
      noOfFaults: String(entry.reading_number ?? entry.readingNumber ?? "1"),
      percentFault: String(entry.fault_percent ?? entry.faultPercent ?? "-"),
      weight: String(entry.weight ?? "-"),
      length: String(entry.length_mm ?? entry.length ?? "-"),
    },
  ];
};

const errorClass = (flag) =>
  flag
    ? " !border-red-500 !bg-[#fff1f2] focus:!border-red-500 focus:!ring-[rgba(239,68,68,0.35)] [box-shadow:0_0_0_1000px_#fff1f2_inset]"
    : "";

const formatFaultPercent = (faultCount = 0, totalFaultCount = 0) => {
  const faults = Number(faultCount);
  const total = Number(totalFaultCount);
  if (!Number.isFinite(faults) || !Number.isFinite(total) || total <= 0) return "0.00";
  return (faults / total).toFixed(2);
};

const isBlankReadingRow = (row = {}) =>
  ![
    row.drumNo,
    row.noOfCones,
    row.shortName,
    row.shortCut,
    row.faultPercent,
    row.length,
    row.weight,
    row.breakPerMeter,
  ].some((value) => String(value || "").trim());

const toNumberOrNull = (value) => {
  if (value === "" || value === null || value === undefined) return null;
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
};

const RewindingStudy = forwardRef(function RewindingStudy(
  {
    selectedTypeName = "Rewinding Study",
    onTypeChange,
    typeOptions = [],
    tablePortalTargetId,
    entryId = "",
  },
  ref
) {
  const dispatch = useDispatch();
  const { isLoading } = useSelector((state) => state.autoconer ?? {});
  const [form, setForm] = useState(createInitialForm);
  const [readingRows, setReadingRows] = useState([createBlankReadingRow()]);
  const [errors, setErrors] = useState({});
  const [portalReady, setPortalReady] = useState(false);
  const [openDropdown, setOpenDropdown] = useState(null);
  const [dropdownMenuStyle, setDropdownMenuStyle] = useState(null);
  const [countNameDropdownOptions, setCountNameDropdownOptions] = useState(countNameOptions);
  const [autoconerDropdownOptions, setAutoconerDropdownOptions] = useState(autoConerOptions);
  const [countCodeByName, setCountCodeByName] = useState({});
  const [formMessage, setFormMessage] = useState("");
  const [formMessageIsError, setFormMessageIsError] = useState(false);
  const dropdownTriggerRefs = useRef({});
  const rewindingStudy = useSelector((state) => state.autoconer?.rewindingStudy ?? []);
  const drumNoOptions = useMemo(() => Array.from({ length: 120 }, (_, index) => String(index + 1)), []);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      const menu = document.getElementById("row-drum-dropdown-menu");
      const trigger = openDropdown ? dropdownTriggerRefs.current[openDropdown] : null;
      if (!menu?.contains(event.target) && !trigger?.contains(event.target)) {
        setOpenDropdown(null);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [openDropdown]);

  useEffect(() => {
    if (!openDropdown?.startsWith("row-drum-")) return undefined;

    const trigger = dropdownTriggerRefs.current[openDropdown];
    if (!trigger) return undefined;

    const rect = trigger.getBoundingClientRect();
    setDropdownMenuStyle({
      top: rect.bottom + 6,
      left: rect.left,
      width: rect.width,
    });
    return undefined;
  }, [openDropdown]);

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
    setReadingRows([createBlankReadingRow()]);
    setErrors({});
    setFormMessage("");
    setFormMessageIsError(false);
  };

  const buildPayload = () => {
    const filledRows = readingRows.filter((row) => !isBlankReadingRow(row));

    return {
      entry_date: form.date,
      type: selectedTypeName || form.type,
      machine_name: form.autoConerNo,
      count_name: form.countNameFrom,
      cntcode: countCodeByName[form.countNameFrom] || undefined,
      cone_tip: form.coneTip,
      drum_from: toNumberOrNull(form.drumFrom),
      drum_to: toNumberOrNull(form.drumTo),
      drum_no: toNumberOrNull(filledRows[0]?.drumNo ?? form.drumNo),
      no_of_cones: toNumberOrNull(filledRows[0]?.noOfCones ?? ""),
      actual_count: toNumberOrNull(form.actualCount),
      weight: toNumberOrNull(form.weight),
      no_of_cuts: toNumberOrNull(form.noOfCuts),
      break_per_lakh: toNumberOrNull(form.breakPerLakhMeter),
      remarks: "Normal",
      drum_inspections: filledRows.map((row) => ({
        reading_number: toNumberOrNull(row.readingNumber) || 1,
        short_cut: row.shortCut || null,
        short_name: row.shortName || null,
        fault_percent: toNumberOrNull(formatFaultPercent(row.shortCut, totalFaults)) || 0,
        length_mm: toNumberOrNull(row.length) || 0,
        weight: toNumberOrNull(row.weight) || 0,
        break_per_meter: toNumberOrNull(row.breakPerMeter) || 0,
        percent_yarn: toNumberOrNull(row.breakPerMeter) || 0,
        appearance_ok: true,
      })),
    };
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
    const payload = buildPayload();
    const nextErrors = {};

    const requiredTopLevel = [
      "entry_date",
      "type",
      "machine_name",
      "count_name",
      "cone_tip",
      "drum_from",
      "drum_to",
      "no_of_cones",
      "actual_count",
      "no_of_cuts",
      "drum_inspections",
    ];

    requiredTopLevel.forEach((field) => {
      const value = payload[field];
      const missing =
        value === null ||
        value === undefined ||
        value === "" ||
        (Array.isArray(value) && value.length === 0);
      if (missing) nextErrors[field] = true;
    });

    (payload.drum_inspections || []).forEach((row, index) => {
      const rowRequired = ["reading_number", "short_cut", "short_name", "fault_percent", "length_mm", "weight", "break_per_meter", "percent_yarn", "appearance_ok"];
      rowRequired.forEach((field) => {
        const value = row[field];
        const missing =
          field === "appearance_ok"
            ? value === null || value === undefined
            : value === null || value === undefined || value === "";
        if (missing) nextErrors[`drum_inspections[${index}].${field}`] = true;
      });
    });

    setErrors(nextErrors);
    return {
      valid: Object.keys(nextErrors).length === 0,
      missingField: Object.keys(nextErrors)[0] || "",
      payload,
    };
  };

  const getPreviewData = () => [
    ...Object.entries(form).map(([label, value]) => ({
      label: label === "date" ? "Entry ID" : label,
      value: label === "date" ? entryId || "-" : value || "-",
    })),
    ...readingRows.filter((row) => !isBlankReadingRow(row)).map((row, index) => ({
      label: `Reading ${index + 1}`,
      value: `${row.drumNo} | ${row.readingNumber} | ${row.shortName || "-"} | ${row.shortCut || "-"} | ${formatFaultPercent(row.shortCut, totalFaults)} | ${row.length} | ${row.weight} | ${row.breakPerMeter}`,
    })),
  ];

  const submit = async () => {
    const validationResult = validate();
    if (!validationResult.valid) {
      setFormMessage(`Missing required field: ${validationResult.missingField}`);
      setFormMessageIsError(true);
      return false;
    }

    console.log("Rewinding Study payload:", validationResult.payload);
    const resultAction = await dispatch(saveAutoconerRewindingStudy(validationResult.payload));

    if (saveAutoconerRewindingStudy.fulfilled.match(resultAction)) {
      dispatch(getAutoconerRewindingStudy({ page: 1, limit: 10 }));
      const successMessage = resultAction.payload?.message || "Rewinding study saved successfully.";
      clear();
      setFormMessage(successMessage);
      setFormMessageIsError(false);
      return true;
    }

    setFormMessage(resultAction.payload || resultAction.error?.message || "Unable to save rewinding study.");
    setFormMessageIsError(true);
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
      if (!nextRows.length) return current.length ? current : [
        createBlankReadingRow(),
      ];

      const mergedRows = nextRows.map((nextRow) => {
        const existingRow = current.find((row) => row.readingNumber === nextRow.readingNumber);
        return existingRow
          ? {
              ...nextRow,
              ...existingRow,
              drumNo: existingRow.drumNo || "",
              noOfCones: existingRow.noOfCones || "",
              weight: existingRow.weight || "",
            }
          : nextRow;
      });

      if (current.length > mergedRows.length) {
        mergedRows.push(
          ...current.slice(mergedRows.length).map((row) => ({
            ...createBlankReadingRow(),
            ...row,
          }))
        );
      }

      return mergedRows;
    });
  }, [form.noOfCuts, form.drumNo, form.weight]);

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
    <div className="relative">
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
    { label: "Type", field: "type", type: "select", options: typeOptions, value: selectedTypeName || form.type, placeholder: "Rewinding Study" },
    { label: "Entry ID", field: "date", type: "text", value: entryId, placeholder: "Entry ID" },
    { label: "Count Name (From)", field: "countNameFrom", type: "select", options: countNameDropdownOptions, placeholder: "Select count name" },
    { label: "Actual Count", field: "actualCount", type: "text", placeholder: "0.00" },
    { label: "Auto Coner No.", field: "autoConerNo", type: "select", options: autoconerDropdownOptions, placeholder: "Select auto coner" },
    { label: "Cone Tip", field: "coneTip", type: "select", options: coneTipOptions, placeholder: "Select cone tip" },
  ];

  const topPortalTarget =
    portalReady && tablePortalTargetId && typeof document !== "undefined"
      ? document.getElementById(tablePortalTargetId)
      : null;

  const totalCones = useMemo(
    () => readingRows.filter((row) => !isBlankReadingRow(row)).reduce((sum, row) => sum + (Number(row.noOfCones) || 0), 0),
    [readingRows]
  );
  const totalFaults = useMemo(
    () => readingRows.filter((row) => !isBlankReadingRow(row)).reduce((sum, row) => sum + (Number(row.shortCut) || 0), 0),
    [readingRows]
  );
  const rowFaultPercents = useMemo(
    () => readingRows.map((row) => (isBlankReadingRow(row) ? "0.00" : formatFaultPercent(row.shortCut, totalFaults))),
    [readingRows, totalFaults]
  );
  const totalWeight = useMemo(
    () => readingRows.filter((row) => !isBlankReadingRow(row)).reduce((sum, row) => sum + (Number(row.weight) || 0), 0),
    [readingRows]
  );
  const totalLength = useMemo(
    () => readingRows.filter((row) => !isBlankReadingRow(row)).reduce((sum, row) => sum + (Number(row.breakPerMeter) || 0), 0),
    [readingRows]
  );
  const breakPerMillionMeter = useMemo(() => {
    if (!Number.isFinite(totalLength) || totalLength <= 0) return "0.00";
    return ((totalCones * 1000000) / totalLength).toFixed(2);
  }, [totalCones, totalLength]);

  useEffect(() => {
    setForm((current) =>
      current.breakPerLakhMeter === breakPerMillionMeter
        ? current
        : { ...current, breakPerLakhMeter: breakPerMillionMeter }
    );
  }, [breakPerMillionMeter]);

  const generatedTableSection = (
    <div className="w-full">
      <div className="mb-4 w-full max-w-[320px]">
        <label className="mb-2 block text-[14px] font-semibold text-slate-700">No. of Cuts</label>
        <input
          type="number"
          min="0"
          step="1"
          placeholder="0"
          className={`${topFieldClass}${errorClass(errors.noOfCuts)}`}
          value={form.noOfCuts}
          onChange={(event) => handleFormChange("noOfCuts", event.target.value)}
        />
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-[12px] text-slate-700">
          <colgroup>
            <col className="w-[12%]" />
            <col className="w-[12%]" />
            <col className="w-[12%]" />
            <col className="w-[12%]" />
            <col className="w-[12%]" />
            <col className="w-[12%]" />
            <col className="w-[12%]" />
            <col className="w-[16%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-slate-300 text-left text-[12px] uppercase tracking-wide text-slate-500">
              <th className="px-2 py-3 font-semibold">DRUM NO.</th>
              <th className="px-2 py-3 font-semibold">NO. OF CONES</th>
              <th className="px-2 py-3 font-semibold">FAULT NAME</th>
              <th className="px-2 py-3 font-semibold">NO. OF FAULTS</th>
              <th className="px-2 py-3 font-semibold">% FAULT</th>
              <th className="px-2 py-3 font-semibold">WEIGHT (Kgs)</th>
              <th className="px-2 py-3 font-semibold">LENGTH (meters)</th>
              <th className="px-2 py-3 font-semibold" />
            </tr>
          </thead>
          <tbody>
            {readingRows.map((row, index) => (
              <tr key={`${index}-${row.drumNo}-${row.readingNumber}`} className="border-b border-slate-200 last:border-b-0">
                <td className="px-2 py-3">
                  <div
                    className="relative w-full"
                    ref={(node) => {
                      if (node) dropdownTriggerRefs.current[`row-drum-${index}`] = node;
                    }}
                  >
                    <button
                      type="button"
                      className={`${compactDropdownClass}${errorClass(errors[`row-${index}-drumNo`])}`}
                      onClick={(event) => {
                        const rect = event.currentTarget.getBoundingClientRect();
                        setDropdownMenuStyle({
                          top: rect.bottom + 6,
                          left: rect.left,
                          width: rect.width,
                        });
                        setOpenDropdown((current) => (current === `row-drum-${index}` ? null : `row-drum-${index}`));
                      }}
                      >
                      <span className={row.drumNo ? "text-slate-700" : "text-slate-400"}>
                        {row.drumNo || ""}
                      </span>
                      <svg
                        className="h-3.5 w-3.5 text-slate-500"
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
                  </div>
                </td>
                <td className="px-2 py-3">
                  <input
                    type="text"
                    inputMode="numeric"
                    className={`${tableInputClass}${errorClass(errors[`row-${index}-noOfCones`])}`}
                    value={row.noOfCones}
                    onChange={(event) => handleRowChange(index, "noOfCones", event.target.value)}
                  />
                </td>
                <td className="px-2 py-3">
                  <select
                    className={`${tableInputClass}${errorClass(errors[`row-${index}-shortName`])}`}
                    value={row.shortName || ""}
                    onChange={(event) => handleRowChange(index, "shortName", event.target.value || null)}
                  >
                    <option value="">Select</option>
                    {faultNameOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-2 py-3">
                  <input
                    type="text"
                    placeholder=""
                    className={`${tableInputClass}${errorClass(errors[`row-${index}-shortCut`])}`}
                    value={row.shortCut}
                    onChange={(event) => handleRowChange(index, "shortCut", event.target.value || null)}
                  />
                </td>
                <td className="px-2 py-3">
                  <input
                    type="text"
                    readOnly
                    className={`${tableInputClass} bg-slate-50`}
                    value={rowFaultPercents[index] || "0.00"}
                  />
                </td>
                <td className="px-2 py-3">
                  <input
                    type="text"
                    inputMode="decimal"
                    className={`${tableInputClass}${errorClass(errors[`row-${index}-weight`])}`}
                    value={row.weight}
                    onChange={(event) => handleRowChange(index, "weight", event.target.value)}
                  />
                </td>
                <td className="px-2 py-3">
                  <input
                    type="text"
                    inputMode="decimal"
                    className={`${tableInputClass}${errorClass(errors[`row-${index}-breakPerMeter`])}`}
                    value={row.breakPerMeter}
                    onChange={(event) => handleRowChange(index, "breakPerMeter", event.target.value)}
                  />
                </td>
                <td className="px-2 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      className="flex h-9 w-9 items-center justify-center rounded-[8px] border border-[#f4a5a0] bg-[#f8e5e4] text-[#ef4444]"
                      onClick={() =>
                        setReadingRows((current) => current.filter((_, rowIndex) => rowIndex !== index))
                      }
                      aria-label="Remove row"
                    >
                      <AiOutlineDelete className="text-[18px]" />
                    </button>
                    <button
                      type="button"
                      className="flex h-9 w-9 items-center justify-center rounded-[8px] bg-[#4659a8] text-white shadow-sm"
                      onClick={() =>
                        setReadingRows((current) => [
                          ...current.slice(0, index + 1),
                          createBlankReadingRow(),
                          ...current.slice(index + 1),
                        ])
                      }
                      aria-label="Add row"
                    >
                      <span className="text-[22px] leading-none">+</span>
                    </button>
                  </div>
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
            {readingRows.length ? (
              <tr className="border-t border-slate-300 align-top text-[12px] text-slate-500">
                <td className="px-2 py-3" />
                <td className="px-2 py-3">
                  <div className="space-y-1">
                    <div className="text-[11px] font-semibold uppercase text-slate-500">TOTAL CONES</div>
                    <input
                      type="text"
                      readOnly
                      value={String(totalCones)}
                      className="w-full h-[38px] rounded-[8px] border border-slate-200 bg-slate-50 px-2 text-[14px] text-slate-700 outline-none"
                    />
                  </div>
                </td>
                <td className="px-2 py-3" />
                <td className="px-2 py-3">
                  <div className="space-y-1">
                    <div className="text-[11px] font-semibold uppercase text-slate-500">TOTAL FAULTS</div>
                    <input
                      type="text"
                      readOnly
                      value={String(totalFaults)}
                      className="w-full h-[38px] rounded-[8px] border border-slate-200 bg-slate-50 px-2 text-[14px] text-slate-700 outline-none"
                    />
                  </div>
                </td>
                <td className="px-2 py-3" />
                <td className="px-2 py-3">
                  <div className="space-y-1">
                    <div className="text-[11px] font-semibold uppercase text-slate-500">TOTAL WEIGHT (Kgs)</div>
                    <input
                      type="text"
                      readOnly
                      value={String(totalWeight)}
                      className="w-full h-[38px] rounded-[8px] border border-slate-200 bg-slate-50 px-2 text-[14px] text-slate-700 outline-none"
                    />
                  </div>
                </td>
                <td className="px-2 py-3">
                  <div className="space-y-1">
                    <div className="text-[11px] font-semibold uppercase text-slate-500">TOTAL LENGTH (m)</div>
                    <input
                      type="text"
                      readOnly
                      value={String(totalLength)}
                      className="w-full h-[38px] rounded-[8px] border border-slate-200 bg-slate-50 px-2 text-[14px] text-slate-700 outline-none"
                    />
                  </div>
                </td>
                <td className="px-2 py-3" />
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div className="mt-10 w-full max-w-[320px]">
        <label className="mb-2 block text-[14px] font-semibold text-slate-700">Break / 1 Million Meter</label>
          <input
            type="text"
            placeholder="0.00"
            readOnly
            className={`${topFieldClass}${errorClass(errors.breakPerLakhMeter)}`}
            value={breakPerMillionMeter}
          />
        </div>
    </div>
  );

  const rowDrumMenu =
    portalReady && openDropdown?.startsWith("row-drum-") && dropdownMenuStyle
      ? createPortal(
          <div
            id="row-drum-dropdown-menu"
            className="fixed z-[9999] max-h-48 overflow-y-auto rounded-[8px] border border-slate-200 bg-white py-1 shadow-[0_8px_24px_rgba(15,23,42,0.18)]"
            style={{
              top: dropdownMenuStyle.top,
              left: dropdownMenuStyle.left,
              width: dropdownMenuStyle.width,
            }}
          >
            {drumNoOptions.map((option) => (
              <button
                key={option}
                type="button"
                className="block w-full px-2 py-2 text-left text-[13px] text-slate-700 hover:bg-slate-50"
                onClick={() => {
                  const rowIndex = Number(String(openDropdown).replace("row-drum-", ""));
                  handleRowChange(rowIndex, "drumNo", option);
                  setOpenDropdown(null);
                }}
              >
                {option}
              </button>
            ))}
          </div>,
          document.body
        )
      : null;

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
              ) : type === "select" && field === "coneTip" ? (
                <select
                  className={`${topFieldClass}${errorClass(errors[field])}`}
                  value={fieldValue}
                  onChange={(event) => handleFormChange(field, event.target.value)}
                >
                  <option value="">{placeholder || "Select"}</option>
                  {options.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : type === "select" && (field === "countNameFrom" || field === "autoConerNo") ? (
                <select
                  className={`${topFieldClass}${errorClass(errors[field])}`}
                  value={fieldValue}
                  onChange={(event) => handleFormChange(field, event.target.value)}
                >
                  <option value="">{placeholder || "Select"}</option>
                  {options.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
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
      {formMessage ? (
        <div
          className={`mt-4 rounded-[10px] border px-4 py-3 text-[14px] ${
            formMessageIsError
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {formMessage}
        </div>
      ) : null}
      {topPortalTarget ? createPortal(generatedTableSection, topPortalTarget) : null}
      {rowDrumMenu}
      {isLoading ? <p className="mt-3 text-[14px] text-[#3d539f]">Saving rewinding study...</p> : null}
    </>
  );
});

export default RewindingStudy;
