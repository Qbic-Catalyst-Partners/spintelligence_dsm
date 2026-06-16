import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useDispatch, useSelector } from "react-redux";
import SearchableSelect from "@/components/SearchableSelect";
import {
  getAutoconerConeDensity,
  saveAutoconerConeDensity,
} from "@/store/slices/autoconer";
import { fetchAutoconerConeDensityMasterData as fetchConeDensityMasterData } from "@/apis/autoconer";
import { toNullableNumber } from "@/apis/autoconer";
import { sanitizeIntegerInput, sanitizeNumericInput } from "@/utils/inputValidation";

const today = new Date().toISOString().split("T")[0];

const topFieldClass =
  "autoconer-input w-full h-[42px] rounded-[10px] border border-slate-200 bg-[#F1F5F9] px-3 text-[14px] text-slate-700 outline-none transition focus:border-[#3d539f] focus:ring-2 focus:ring-[#d7def5]";

const countNameOptions = [];
const autoConerOptions = [];
const coneTipOptions = ["Blue", "Red", "White"];

const formFieldSanitizers = {
  baseDiaE: (value) => sanitizeNumericInput(value, { precision: 10, scale: 2 }),
  noseDiaE: (value) => sanitizeNumericInput(value, { precision: 10, scale: 2 }),
  drumFrom: (value) => sanitizeIntegerInput(value, 10),
  drumTo: (value) => sanitizeIntegerInput(value, 10),
};

const rowFieldSanitizers = {
  baseDiaE: (value) => sanitizeNumericInput(value, { precision: 10, scale: 2 }),
  noseDiaE: (value) => sanitizeNumericInput(value, { precision: 10, scale: 2 }),
  baseDia: (value) => sanitizeNumericInput(value, { precision: 10, scale: 2 }),
  noseDia: (value) => sanitizeNumericInput(value, { precision: 10, scale: 2 }),
  coneWeight: (value) => sanitizeNumericInput(value, { precision: 10, scale: 2 }),
  coneTrav: (value) => sanitizeNumericInput(value, { precision: 10, scale: 2 }),
  density: (value) => sanitizeNumericInput(value, { precision: 10, scale: 3 }),
  hardness: (value) => sanitizeNumericInput(value, { precision: 10, scale: 3 }),
};

const createInitialForm = () => ({
  type: "Cone Density",
  date: today,
  countNameFrom: "",
  countCode: "",
  autoConerNo: "",
  baseDiaE: "",
  noseDiaE: "",
  drumFrom: "",
  drumTo: "",
  coneTip: "",
});

const tableInputClass =
  "autoconer-input w-full h-[38px] rounded-[8px] border border-slate-200 bg-[#F8FAFC] px-2 text-[14px] text-slate-700 outline-none transition focus:border-[#3d539f] focus:ring-2 focus:ring-[#d7def5]";

const createReadingRows = (from = "", to = "", baseDiaE = "", noseDiaE = "") => {
  const start = Number(from);
  const end = Number(to);

  if (!Number.isInteger(start) || !Number.isInteger(end) || start <= 0 || end < start) {
    return [];
  }

  return Array.from({ length: end - start + 1 }, (_, index) => ({
    drumNo: String(start + index),
    baseDiaE: baseDiaE || "",
    noseDiaE: noseDiaE || "",
    baseDia: "",
    noseDia: "",
    coneWeight: "",
    coneTrav: "",
    density: "",
    hardness: "",
  }));
};

const mapConeDensityEntryToRows = (entry = {}) => {
  const nestedRows = Array.isArray(entry.cone_density_readings)
    ? entry.cone_density_readings
    : Array.isArray(entry.cone_readings)
      ? entry.cone_readings
      : Array.isArray(entry.readings)
        ? entry.readings
      : [];

  if (nestedRows.length > 0) {
    return nestedRows.map((row, index) => ({
      drumNo: String(row.drum_no ?? row.drumNo ?? entry.drum_from ?? "-"),
      baseDiaE: String(row.base_dia_e ?? entry.base_dia_e ?? "-"),
      noseDiaE: String(row.nose_dia_e ?? entry.nose_dia_e ?? "-"),
      baseDia: String(row.base_dia ?? row.baseDia ?? "-"),
      noseDia: String(row.nose_dia ?? row.noseDia ?? "-"),
      coneWeight: String(row.cone_weight ?? row.weight ?? row.coneWeight ?? "-"),
      coneTraverse: String(row.cone_traverse ?? row.coneTrav ?? "-"),
      coneDensity: String(row.density ?? row.cone_density ?? row.coneDensity ?? "-"),
      percentYarn: String(row.hardness ?? "-"),
      label: index,
    }));
  }

  return [
    {
      drumNo: String(entry.drum_from ?? entry.drumNo ?? "-"),
      baseDiaE: String(entry.base_dia_e ?? "-"),
      noseDiaE: String(entry.nose_dia_e ?? "-"),
      baseDia: String(entry.base_dia ?? "-"),
      noseDia: String(entry.nose_dia ?? "-"),
      coneWeight: String(entry.cone_weight ?? "-"),
      coneTraverse: String(entry.cone_traverse ?? "-"),
      coneDensity: String(entry.cone_density ?? "-"),
      percentYarn: String(entry.percent_yarn ?? "-"),
      label: 0,
    },
  ];
};

const errorClass = (flag) =>
  flag
    ? " !border-red-500 !bg-[#fff1f2] focus:!border-red-500 focus:!ring-[rgba(239,68,68,0.35)] [box-shadow:0_0_0_1000px_#fff1f2_inset]"
    : "";

const ConeDensity = forwardRef(function ConeDensity(
  {
    selectedTypeName = "Cone Density",
    onTypeChange,
    typeOptions = [],
    tablePortalTargetId,
    postFooterPortalTargetId,
    entryId = "",
  },
  ref
) {
  const dispatch = useDispatch();
  const { isLoading, isFetching, coneDensity = [] } = useSelector((state) => state.autoconer ?? {});
  const [form, setForm] = useState(createInitialForm);
  const [readingRows, setReadingRows] = useState([]);
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState("");
  const [countOptions, setCountOptions] = useState(countNameOptions);
  const [autoconerOptions, setAutoconerOptions] = useState(autoConerOptions);
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
    setSubmitError("");
  };

  const handleRowChange = (index, field, value) => {
    const nextValue = rowFieldSanitizers[field] ? rowFieldSanitizers[field](value) : value;
    setReadingRows((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [field]: nextValue } : row
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
    if (!readingRows.length) nextErrors.drumRange = true;
    readingRows.forEach((row, index) => {
      ["baseDiaE", "noseDiaE", "baseDia", "noseDia", "coneWeight", "coneTrav", "density", "hardness"].forEach((field) => {
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
      value: `${row.drumNo} | ${row.baseDiaE} | ${row.noseDiaE} | ${row.baseDia} | ${row.noseDia} | ${row.coneWeight} | ${row.coneTrav} | ${row.density} | ${row.hardness}`,
    })),
  ];

  const buildPayload = () => ({
    entry_id: entryId || undefined,
    entry_date: form.date,
    type: selectedTypeName || form.type,
    machine_name: form.autoConerNo,
    count_name: form.countNameFrom,
    cntcode: form.countCode || undefined,
    cone_tip: form.coneTip,
    base_dia_e: toNullableNumber(form.baseDiaE),
    nose_dia_e: toNullableNumber(form.noseDiaE),
    drum_from: toNullableNumber(form.drumFrom),
    drum_to: toNullableNumber(form.drumTo),
    weight: null,
    no_of_cuts: null,
    remarks: "Normal",
    cone_readings: readingRows.map((row) => ({
      drum_no: toNullableNumber(row.drumNo),
      base_dia_e: toNullableNumber(row.baseDiaE),
      nose_dia_e: toNullableNumber(row.noseDiaE),
      base_dia: toNullableNumber(row.baseDia),
      nose_dia: toNullableNumber(row.noseDia),
      cone_weight: toNullableNumber(row.coneWeight),
      cone_traverse: toNullableNumber(row.coneTrav),
      density: toNullableNumber(row.density),
      hardness: toNullableNumber(row.hardness),
    })),
  });

  const submit = async () => {
    if (!validate()) return false;

    setSubmitError("");
    const resultAction = await dispatch(saveAutoconerConeDensity(buildPayload()));

    if (saveAutoconerConeDensity.fulfilled.match(resultAction)) {
      dispatch(getAutoconerConeDensity({ page: 1, limit: 1000 }));
      return true;
    }

    const errorMessage = String(resultAction?.payload || resultAction?.error?.message || "");
    setSubmitError(
      /duplicate entry_id/i.test(errorMessage)
        ? "Entry ID already exists. Please clear and save again to generate next ID."
        : errorMessage || "Unable to submit cone density."
    );
    return false;
  };

  useImperativeHandle(ref, () => ({
    clear,
    validate,
    getPreviewData,
    submit,
  }));

  useEffect(() => {
    dispatch(getAutoconerConeDensity({ page: 1, limit: 1000 }));
  }, [dispatch]);

  useEffect(() => {
    let isCancelled = false;

    const loadMasterData = async () => {
      try {
        const response = await fetchConeDensityMasterData();
        if (isCancelled) return;

        const countOptsFromNewShape = Array.isArray(response?.count_options)
          ? response.count_options
              .map((item) => {
                const code = String(item?.cntcode ?? "").trim();
                const name = String(item?.cntname ?? "").trim();
                if (!name) return null;
                return {
                  value: code || name,
                  label: name,
                  code: code || "",
                };
              })
              .filter(Boolean)
          : [];

        const autoconerOptsFromNewShape = Array.isArray(response?.autoconer_options)
          ? response.autoconer_options
              .map((item) => {
                const value = String(item?.value ?? "").trim();
                const label = String(item?.label ?? value).trim();
                if (!value && !label) return null;
                return {
                  value: value || label,
                  label: label || value,
                };
              })
              .filter(Boolean)
          : [];

        const countOptsFromLegacy = Array.isArray(response?.count_names)
          ? response.count_names
              .map((item) => {
                const label = String(
                  (item && typeof item === "object"
                    ? item.cntname ?? item.count_name ?? item.label ?? item.name
                    : item) ?? ""
                ).trim();
                if (!label) return null;
                return { value: label, label, code: "" };
              })
              .filter(Boolean)
          : [];

        const autoconerOptsFromLegacy = Array.isArray(response?.autoconer_nos)
          ? response.autoconer_nos
              .map((item) => {
                const label = String(
                  (item && typeof item === "object"
                    ? item.label ?? item.value ?? item.name
                    : item) ?? ""
                ).trim();
                if (!label) return null;
                return { value: label, label };
              })
              .filter(Boolean)
          : [];

        const uniqueByValue = (options) => {
          const map = new Map();
          options.forEach((option) => {
            if (!map.has(option.value)) map.set(option.value, option);
          });
          return Array.from(map.values());
        };

        setCountOptions(uniqueByValue([...countOptsFromNewShape, ...countOptsFromLegacy]));
        setAutoconerOptions(uniqueByValue([...autoconerOptsFromNewShape, ...autoconerOptsFromLegacy]));
      } catch (_error) {
        if (isCancelled) return;
        setCountOptions([]);
        setAutoconerOptions([]);
      }
    };

    loadMasterData();
    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    setReadingRows((current) => {
      const nextRows = createReadingRows(
        form.drumFrom,
        form.drumTo,
        form.baseDiaE,
        form.noseDiaE
      );

      if (!nextRows.length) return [];

      return nextRows.map((nextRow) => {
        const existingRow = current.find((row) => row.drumNo === nextRow.drumNo);
        return existingRow
          ? {
              ...nextRow,
              ...existingRow,
              baseDiaE: form.baseDiaE || existingRow.baseDiaE || "",
              noseDiaE: form.noseDiaE || existingRow.noseDiaE || "",
            }
          : nextRow;
      });
    });
  }, [form.drumFrom, form.drumTo, form.baseDiaE, form.noseDiaE]);

  const allDrumEntries = useMemo(
    () => coneDensity.flatMap((entry) => mapConeDensityEntryToRows(entry)),
    [coneDensity]
  );

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
                <td className="px-0 py-5 pr-6">
                  <input
                    type="text"
                    className={`${tableInputClass}${errorClass(errors[`row-${index}-baseDiaE`])}`}
                    value={row.baseDiaE}
                    onChange={(event) => handleRowChange(index, "baseDiaE", event.target.value)}
                  />
                </td>
                <td className="px-0 py-5 pr-6">
                  <input
                    type="text"
                    className={`${tableInputClass}${errorClass(errors[`row-${index}-noseDiaE`])}`}
                    value={row.noseDiaE}
                    onChange={(event) => handleRowChange(index, "noseDiaE", event.target.value)}
                  />
                </td>
                <td className="px-0 py-5 pr-6">
                  <input
                    type="text"
                    className={`${tableInputClass}${errorClass(errors[`row-${index}-baseDia`])}`}
                    value={row.baseDia}
                    onChange={(event) => handleRowChange(index, "baseDia", event.target.value)}
                  />
                </td>
                <td className="px-0 py-5 pr-6">
                  <input
                    type="text"
                    className={`${tableInputClass}${errorClass(errors[`row-${index}-noseDia`])}`}
                    value={row.noseDia}
                    onChange={(event) => handleRowChange(index, "noseDia", event.target.value)}
                  />
                </td>
                <td className="px-0 py-5 pr-6">
                  <input
                    type="text"
                    className={`${tableInputClass}${errorClass(errors[`row-${index}-coneWeight`])}`}
                    value={row.coneWeight}
                    onChange={(event) => handleRowChange(index, "coneWeight", event.target.value)}
                  />
                </td>
                <td className="px-0 py-5 pr-6">
                  <input
                    type="text"
                    className={`${tableInputClass}${errorClass(errors[`row-${index}-coneTrav`])}`}
                    value={row.coneTrav}
                    onChange={(event) => handleRowChange(index, "coneTrav", event.target.value)}
                  />
                </td>
                <td className="px-0 py-5 pr-6">
                  <input
                    type="text"
                    className={`${tableInputClass}${errorClass(errors[`row-${index}-density`])}`}
                    value={row.density}
                    onChange={(event) => handleRowChange(index, "density", event.target.value)}
                  />
                </td>
                <td className="px-0 py-5">
                  <input
                    type="text"
                    className={`${tableInputClass}${errorClass(errors[`row-${index}-hardness`])}`}
                    value={row.hardness}
                    onChange={(event) => handleRowChange(index, "hardness", event.target.value)}
                  />
                </td>
              </tr>
            ))}
            {!readingRows.length ? (
              <tr>
                <td colSpan={9} className="px-0 py-5 text-center text-[12px] text-slate-400">
                  Enter a valid drum range to generate drum rows.
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
              {!allDrumEntries.length ? (
                <tr>
                  <td colSpan={9} className="px-4 py-5 text-center text-[12px] text-slate-400">
                    {isFetching ? "Loading last 10 cone density entries..." : "No cone density entries available."}
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
    { label: "Entry ID", field: "date", type: "text", value: entryId, placeholder: "Entry ID" },
    { label: "Count Name (From)", field: "countNameFrom", type: "select", options: countOptions, placeholder: "Enter count name" },
    { label: "Auto Coner No.", field: "autoConerNo", type: "select", options: autoconerOptions, placeholder: "Enter auto coner no." },
    { label: "Base Dia (E)", field: "baseDiaE", type: "text", placeholder: "Enter base dia (e)" },
    { label: "Nose Dia (E)", field: "noseDiaE", type: "text", placeholder: "Enter nose dia (e)" },
    { label: "Drum From/To", field: "drumRange", type: "pair" },
    { label: "Cone Tip", field: "coneTip", type: "text", placeholder: "Enter cone tip" },
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
                    className={`${topFieldClass}${errorClass(errors.drumFrom || errors.drumRange)}`}
                    value={form.drumFrom}
                    onChange={(event) => handleFormChange("drumFrom", event.target.value)}
                  />
                  <input
                    type="text"
                    placeholder="Enter to"
                    className={`${topFieldClass}${errorClass(errors.drumTo || errors.drumRange)}`}
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
              {type === "select" && (field === "countNameFrom" || field === "autoConerNo") ? (
                <SearchableSelect
                  className={`${topFieldClass}${errorClass(errors[field])}`}
                  value={fieldValue}
                  onChange={(nextValue) => {
                    if (field === "countNameFrom") {
                      const selected = options.find((option) => {
                        if (!option || typeof option !== "object") return option === nextValue;
                        return String(option.value) === nextValue || String(option.label) === nextValue;
                      });
                      if (selected && typeof selected === "object") {
                        handleFormChange("countNameFrom", selected.label || "");
                        handleFormChange("countCode", selected.code || "");
                      } else {
                        handleFormChange("countNameFrom", nextValue);
                        handleFormChange("countCode", "");
                      }
                    } else {
                      handleFormChange(field, nextValue);
                    }
                    if (field === "type") onTypeChange?.(nextValue);
                  }}
                  options={options.map((option) => (option && typeof option === "object" ? option.label : option))}
                  placeholder={placeholder || "Enter value"}
                />
              ) : type === "select" ? (
                <select
                  className={`${topFieldClass}${errorClass(errors[field])}`}
                  value={fieldValue}
                  onChange={(event) => {
                    handleFormChange(field, event.target.value);
                    if (field === "type") onTypeChange?.(event.target.value);
                  }}
                >
                  <option value="">{placeholder || "Enter value"}</option>
                  {options.map((option) => {
                    const isObject = option && typeof option === "object";
                    const optionValue = isObject ? option.value : option;
                    const optionLabel = isObject ? option.label : option;
                    return (
                      <option key={optionValue} value={optionValue}>
                        {optionLabel}
                      </option>
                    );
                  })}
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
      {submitError ? <p className="mt-3 text-[14px] text-red-600">{submitError}</p> : null}
      {isLoading ? <p className="mt-3 text-[14px] text-[#3d539f]">Saving cone density...</p> : null}
    </>
  );
});

export default ConeDensity;
