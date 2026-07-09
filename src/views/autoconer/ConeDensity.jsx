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
import { sanitizeDrumRangeInput, sanitizeIntegerInput, sanitizeNumericInput } from "@/utils/inputValidation";

const today = new Date().toISOString().split("T")[0];

const topFieldClass =
  "autoconer-input w-full h-[42px] rounded-[10px] border border-slate-200 bg-[#F1F5F9] px-3 text-[14px] text-slate-700 outline-none transition focus:border-[#3d539f] focus:ring-2 focus:ring-[#d7def5]";

const countNameOptions = [];
const autoConerOptions = [];
const coneTipOptions = ["Blue", "Red", "White"];

const formFieldSanitizers = {
  drumFrom: (value) => sanitizeDrumRangeInput(value, { min: 1, max: 100, maxDigits: 3 }),
  drumTo: (value) => sanitizeDrumRangeInput(value, { min: 1, max: 100, maxDigits: 3 }),
};

const isValidDrumRange = (from, to) => {
  const start = Number(from);
  const end = Number(to);
  return Number.isInteger(start) && Number.isInteger(end) && start >= 1 && end <= 100 && start < end;
};

const rowFieldSanitizers = {
  baseDiaE: (value) => sanitizeNumericInput(value, { precision: 10, scale: 2 }),
  noseDiaE: (value) => sanitizeNumericInput(value, { precision: 10, scale: 2 }),
  baseDia: (value) => sanitizeNumericInput(value, { precision: 10, scale: 2 }),
  noseDia: (value) => sanitizeNumericInput(value, { precision: 10, scale: 2 }),
  coneWeight: (value) => sanitizeNumericInput(value, { precision: 10, scale: 2 }),
  coneTrav: (value) => sanitizeNumericInput(value, { precision: 10, scale: 2 }),
  density: (value) => sanitizeNumericInput(value, { precision: 10, scale: 2 }),
  volume: (value) => sanitizeNumericInput(value, { precision: 10, scale: 2 }),
  gmsPerCm3: (value) => sanitizeNumericInput(value, { precision: 10, scale: 3 }),
  gmsLitre: (value) => sanitizeNumericInput(value, { precision: 10, scale: 3 }),
  windingSpeed: (value) => sanitizeNumericInput(value, { precision: 10, scale: 2 }),
  cnTension: (value) => sanitizeNumericInput(value, { precision: 10, scale: 2 }),
  tensionerRpm: (value) => sanitizeNumericInput(value, { precision: 10, scale: 2 }),
  tensionerForce: (value) => sanitizeNumericInput(value, { precision: 10, scale: 2 }),
  nCradlePressure: (value) => sanitizeNumericInput(value, { precision: 10, scale: 2 }),
};

const createInitialForm = () => ({
  type: "Cone Density",
  date: today,
  countNameFrom: "",
  countCode: "",
  autoConerNo: "",
  drumFrom: "",
  drumTo: "",
  coneTip: "",
});

const tableInputClass =
  "autoconer-input w-full h-[38px] rounded-[8px] border border-slate-200 bg-[#F8FAFC] px-2 text-[14px] text-slate-700 outline-none transition focus:border-[#3d539f] focus:ring-2 focus:ring-[#d7def5]";

const createReadingRows = (from = "", to = "") => {
  const start = Number(from);
  const end = Number(to);

  if (!isValidDrumRange(from, to)) {
    return [];
  }

  return Array.from({ length: end - start + 1 }, (_, index) => ({
    drumNo: String(start + index),
    baseDiaE: "",
    noseDiaE: "",
    baseDia: "",
    noseDia: "",
    coneWeight: "",
    coneTrav: "",
    density: "",
    volume: "",
    gmsPerCm3: "",
    gmsLitre: "",
    windingSpeed: "",
    cnTension: "",
    tensionerRpm: "",
    tensionerForce: "",
    nCradlePressure: "",
    remarks: "",
  }));
};

const mapConeDensityEntryToRows = (entry = {}) => {
  const nestedRows = Array.isArray(entry.drums)
    ? entry.drums
    : Array.isArray(entry.cone_density_readings)
    ? entry.cone_density_readings
    : Array.isArray(entry.cone_readings)
      ? entry.cone_readings
      : Array.isArray(entry.readings)
        ? entry.readings
      : [];

  if (nestedRows.length > 0) {
    return nestedRows.map((row, index) => ({
      drumNo: String(row.drum_no ?? row.drumNo ?? entry.drum_from ?? "-"),
      baseDiaE: String(row.base_dia_e_d1 ?? row.base_dia_e ?? entry.base_dia_e ?? "-"),
      noseDiaE: String(row.nose_dia_e_d2 ?? row.nose_dia_e ?? entry.nose_dia_e ?? "-"),
      baseDia: String(row.base_dia_i_d3 ?? row.base_dia ?? row.baseDia ?? "-"),
      noseDia: String(row.nose_dia_i_d4 ?? row.nose_dia ?? row.noseDia ?? "-"),
      coneWeight: String(row.cone_weight_gms ?? row.cone_weight ?? row.weight ?? row.coneWeight ?? "-"),
      coneTraverse: String(row.cone_traverse ?? row.coneTrav ?? "-"),
      coneDensity: String(row.density_gms_cm3 ?? row.density ?? row.cone_density ?? row.coneDensity ?? "-"),
      percentYarn: String(row.hardness ?? "-"),
      slantHeight: String(row.slant_height_b1 ?? row.slant_height ?? row.slantHeight ?? "-"),
      verticalHeight: String(row.vertical_height_b2 ?? row.vertical_height ?? row.verticalHeight ?? "-"),
      volume: String(row.volume_cm3 ?? row.volume ?? "-"),
      gmsPerCm3: String(row.density_gms_cm3 ?? row.gms_per_cm3 ?? row.gmsPerCm3 ?? "-"),
      gmsPerLitre: String(row.gms_litre ?? row.gms_per_litre ?? row.gmsPerLitre ?? "-"),
      windingSpeed: String(row.winding_speed_m_min ?? row.winding_speed ?? row.windingSpeed ?? "-"),
      cnTension: String(row.cn_tension ?? row.cnTension ?? "-"),
      tensionerRpm: String(row.tensioner_rpm ?? row.tensionerRpm ?? "-"),
      tensionerForce: String(row.tensioner_force ?? row.tensionerForce ?? "-"),
      nCradlePressure: String(row.n_cradle_pressure ?? row.nCradlePressure ?? "-"),
      remarks: String(row.remarks ?? "-"),
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
      slantHeight: String(entry.slant_height ?? "-"),
      verticalHeight: String(entry.vertical_height ?? "-"),
      volume: String(entry.volume ?? "-"),
      gmsPerCm3: String(entry.gms_per_cm3 ?? "-"),
      gmsPerLitre: String(entry.gms_per_litre ?? "-"),
      gmsPerCm3: String(entry.gms_per_cm3 ?? "-"),
      windingSpeed: String(entry.winding_speed ?? "-"),
      cnTension: String(entry.cn_tension ?? "-"),
      tensionerRpm: String(entry.tensioner_rpm ?? "-"),
      tensionerForce: String(entry.tensioner_force ?? "-"),
      nCradlePressure: String(entry.n_cradle_pressure ?? "-"),
      remarks: String(entry.remarks ?? "-"),
      label: 0,
    },
  ];
};

const errorClass = (flag) =>
  flag
    ? " !border-red-500 !bg-[#fff1f2] focus:!border-red-500 focus:!ring-[rgba(239,68,68,0.35)] [box-shadow:0_0_0_1000px_#fff1f2_inset]"
    : "";

const calculateVolumeCm3 = (row = {}) => {
  const d1 = Number(row.baseDiaE);
  const d2 = Number(row.noseDiaE);
  const d3 = Number(row.baseDia);
  const d4 = Number(row.noseDia);
  const b1 = Number(row.coneWeight);
  const b2 = Number(row.coneTrav);

  if (String(row.baseDiaE ?? "").trim() === "") return "";
  if (![d1, d2, d3, d4, b1, b2].every(Number.isFinite)) return "";

  const result =
    ((((d1 + d3) / 4) + ((d2 + d4) / 4)) * ((b1 + b2) / 2) * (((d1 - d3) / 4) + ((d2 - d4) / 4)) * 3.1415926) /
    1000;
  return Number.isFinite(result) ? String(result.toFixed(2)) : "";
};

const calculateDensity = (row = {}) => {
  const weight = Number(row.density);
  const volume = Number(row.volume);

  if (!Number.isFinite(weight) || !Number.isFinite(volume) || volume === 0) return "";

  const result = weight / volume;
  return Number.isFinite(result) ? String(result.toFixed(3)) : "";
};

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

  const allDrumHeaders = useMemo(
    () => [
      "Drum",
      "Base Dia (E) (D1)",
      "Nose Dia (E) (D2)",
      "Base Dia (I) (D3)",
      "Nose Dia (I) (D4)",
      "Slant Height (B1)",
      "Vertical Height (B2)",
      "Cone Weight (Gms)",
      "Volume (Cm3)",
      "Density (Gms / Cm3)",
      "Gms / Litre",
      "W.Speed (m/Min)",
      "cN Tension",
      "Tensioner RPM",
      "Tensioner Force",
      "N Cradle Pressure",
      "Remarks",
    ],
    []
  );

  const drumCardFields = [
    { label: "Base Dia (E) (D1)", field: "baseDiaE", type: "text" },
    { label: "Nose Dia (E) (D2)", field: "noseDiaE", type: "text" },
    { label: "Base Dia (I) (D3)", field: "baseDia", type: "text" },
    { label: "Nose Dia (I) (D4)", field: "noseDia", type: "text" },
    { label: "Slant Height (B1)", field: "coneWeight", type: "text" },
    { label: "Vertical Height (B2)", field: "coneTrav", type: "text" },
    { label: "Cone Weight (Gms)", field: "density", type: "text" },
    { label: "Volume (Cm3)", field: "volume", type: "text" },
    { label: "Density (Gms / Cm3)", field: "gmsPerCm3", type: "text" },
    { label: "Gms / Litre", field: "gmsLitre", type: "text" },
    { label: "W.Speed (m/Min)", field: "windingSpeed", type: "text" },
    { label: "cN Tension", field: "cnTension", type: "text" },
    { label: "Tensioner RPM", field: "tensionerRpm", type: "text" },
    { label: "Tensioner Force", field: "tensionerForce", type: "text" },
    { label: "N Cradle Pressure", field: "nCradlePressure", type: "text", span: 1 },
    { label: "Remarks (optional)", field: "remarks", type: "textarea", span: 4 },
  ];

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
      current.map((row, rowIndex) => {
        if (rowIndex !== index) return row;
        const nextRow = { ...row, [field]: nextValue };
        nextRow.volume = calculateVolumeCm3(nextRow);
        nextRow.gmsPerCm3 = calculateDensity(nextRow);
        nextRow.gmsLitre = calculateGmsPerLitre(nextRow);
        return nextRow;
      })
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
      if (key === "remarks") return;
      if (String(value).trim() === "") nextErrors[key] = true;
    });
    if (!isValidDrumRange(form.drumFrom, form.drumTo)) {
      nextErrors.drumFrom = true;
      nextErrors.drumTo = true;
      nextErrors.drumRange = true;
    }
    if (!readingRows.length) nextErrors.drumRange = true;
    readingRows.forEach((row, index) => {
      ["baseDiaE", "noseDiaE", "baseDia", "noseDia", "coneWeight", "coneTrav", "density", "volume", "gmsPerCm3", "gmsLitre", "windingSpeed", "cnTension", "tensionerRpm", "tensionerForce", "nCradlePressure"].forEach((field) => {
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
      value: `${row.drumNo} | ${row.baseDiaE} | ${row.noseDiaE} | ${row.baseDia} | ${row.noseDia} | ${row.coneWeight} | ${row.coneTrav} | ${row.density} | ${row.volume}`,
    })),
  ];

const calculateDensity = (row = {}) => {
  const weight = Number(row.density);
  const volume = Number(row.volume);
  if (!Number.isFinite(weight) || !Number.isFinite(volume) || volume === 0) return "";
  const result = weight / volume;
  return Number.isFinite(result) ? String(result.toFixed(4)) : "";
};

const calculateGmsPerLitre = (row = {}) => {
  const weight = Number(row.density);
  const volume = Number(row.volume);
  if (!Number.isFinite(weight) || !Number.isFinite(volume) || volume === 0) return "";
  const result = (weight / volume) * 1000;
  if (!Number.isFinite(result)) return "";
  return Number.isInteger(result) ? String(result) : String(Number(result.toFixed(3)));
};

  const buildPayload = () => ({
    entry_id: entryId || undefined,
    entry_date: form.date,
    type: selectedTypeName || form.type,
    auto_coner_no: form.autoConerNo,
    count_name: form.countNameFrom,
    cntcode: form.countCode || undefined,
    cone_tip: form.coneTip,
    drum_from: toNullableNumber(form.drumFrom),
    drum_to: toNullableNumber(form.drumTo),
    remarks: form.remarks || "",
    drums: readingRows.map((row) => ({
      drum_no: toNullableNumber(row.drumNo),
      base_dia_e_d1: toNullableNumber(row.baseDiaE),
      nose_dia_e_d2: toNullableNumber(row.noseDiaE),
      base_dia_i_d3: toNullableNumber(row.baseDia),
      nose_dia_i_d4: toNullableNumber(row.noseDia),
      slant_height_b1: toNullableNumber(row.coneWeight),
      vertical_height_b2: toNullableNumber(row.coneTrav),
      cone_weight_gms: toNullableNumber(row.density),
      volume_cm3: toNullableNumber(row.volume),
      density_gms_cm3: toNullableNumber(row.gmsPerCm3),
      gms_litre: toNullableNumber(row.gmsLitre),
      winding_speed_m_min: toNullableNumber(row.windingSpeed),
      cn_tension: toNullableNumber(row.cnTension),
      tensioner_rpm: toNullableNumber(row.tensionerRpm),
      tensioner_force: toNullableNumber(row.tensionerForce),
      n_cradle_pressure: toNullableNumber(row.nCradlePressure),
      remarks: row.remarks || undefined,
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
      const nextRows = createReadingRows(form.drumFrom, form.drumTo);

      if (!nextRows.length) return [];

      return nextRows.map((nextRow) => {
        const existingRow = current.find((row) => row.drumNo === nextRow.drumNo);
        const mergedRow = existingRow
          ? {
              ...nextRow,
              ...existingRow,
            }
          : nextRow;
        return existingRow
          ? {
              ...mergedRow,
              volume: calculateVolumeCm3(mergedRow),
            }
          : {
              ...mergedRow,
              volume: calculateVolumeCm3(mergedRow),
            };
      });
    });
  }, [form.drumFrom, form.drumTo]);

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
      <div className="mx-auto mb-8 flex max-w-3xl justify-center">
        <div className="bg-transparent p-0 shadow-none">
          <img
            src="/cone-density-diagram.png"
            alt="Cone density diagram"
            className="block h-auto w-full max-w-[300px] object-contain"
          />
        </div>
      </div>

      <div className="flex flex-col gap-5">
        {readingRows.map((row, index) => (
          <div key={`${row.drumNo}-${index}`} className="rounded-[14px] border border-[#cfe2ff] bg-[#f8fbff] px-5 py-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <div className="mb-5 text-[15px] font-semibold text-slate-900">Drum No : {row.drumNo}</div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-7 print:grid-cols-7">
              {drumCardFields.map((item) => {
                const colSpanClass = item.span === 4
                  ? "xl:col-span-4 print:col-span-4"
                  : item.span === 2
                    ? "xl:col-span-2 print:col-span-2"
                    : "xl:col-span-1 print:col-span-1";
                return (
                  <div key={item.field} className={`flex flex-col gap-2 ${colSpanClass}`}>
                    <label className="text-[13px] font-semibold text-slate-500">{item.label}</label>
                    {item.type === "textarea" ? (
                      <textarea
                        rows={2}
                        className={`${topFieldClass} min-h-[56px] resize-y ${errorClass(errors[`row-${index}-${item.field}`])}`}
                        value={row[item.field] || ""}
                        onChange={(event) => handleRowChange(index, item.field, event.target.value)}
                      />
                    ) : (
                      <input
                        type="text"
                        className={`${topFieldClass} ${errorClass(errors[`row-${index}-${item.field}`])}`}
                        value={row[item.field] || ""}
                        readOnly={item.field === "volume" || item.field === "gmsPerCm3" || item.field === "gmsLitre"}
                        onChange={(event) => handleRowChange(index, item.field, event.target.value)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {!readingRows.length ? (
          <div className="rounded-[14px] border border-dashed border-slate-300 bg-white px-5 py-8 text-center text-[13px] text-slate-500">
            Enter a drum range from 1 to 5 to generate 5 containers.
          </div>
        ) : null}
      </div>
    </div>
  );

  const summarySection = (
    <div className="flex flex-col gap-8 pt-6 print:hidden">
      <div className="w-full rounded-[12px] border border-slate-200 bg-white px-6 pb-6 pt-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <h4 className="mb-4 mt-0 text-[18px] font-bold text-slate-900">All Drum Entries</h4>
        <div className="overflow-x-auto">
          <table className="min-w-max border-collapse whitespace-nowrap text-[11px] text-slate-700">
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
                  <td className="px-4 py-4">{entry.slantHeight}</td>
                  <td className="px-4 py-4">{entry.verticalHeight}</td>
                  <td className="px-4 py-4">{entry.coneWeight}</td>
                  <td className="px-4 py-4">{entry.volume}</td>
                  <td className="px-4 py-4">{entry.gmsPerCm3}</td>
                  <td className="px-4 py-4">{entry.gmsPerLitre}</td>
                  <td className="px-4 py-4">{entry.windingSpeed}</td>
                  <td className="px-4 py-4">{entry.cnTension}</td>
                  <td className="px-4 py-4">{entry.tensionerRpm}</td>
                  <td className="px-4 py-4">{entry.tensionerForce}</td>
                  <td className="px-4 py-4">{entry.nCradlePressure}</td>
                  <td className="px-4 py-4 last:pr-0">{entry.remarks}</td>
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
    { label: "Drum From/To", field: "drumRange", type: "pair" },
    { label: "Cone Tip", field: "coneTip", type: "text", placeholder: "Enter cone tip" },
  ];

  return (
    <>
      <div className="grid grid-cols-1 gap-x-4 gap-y-5 md:grid-cols-2 xl:grid-cols-3 print:grid-cols-3">
        {formFields.map(({ label, field, type, options = [], value, placeholder }) => {
          if (type === "pair") {
            return (
              <div key={field} className="flex flex-col gap-2">
                <label className="text-[14px] font-semibold text-slate-500">{label}</label>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="number"
                    min="1"
                    max="100"
                    step="1"
                    inputMode="numeric"
                    placeholder="Enter from"
                    className={`${topFieldClass}${errorClass(errors.drumFrom || errors.drumRange)}`}
                    value={form.drumFrom}
                    onChange={(event) => handleFormChange("drumFrom", event.target.value)}
                  />
                  <input
                    type="number"
                    min="1"
                    max="100"
                    step="1"
                    inputMode="numeric"
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
              <label className="text-[14px] font-semibold text-slate-500">{label}</label>
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
                    const optionValue =
                      typeof option === "string" ? option : String(option?.value ?? option?.name ?? "").trim();
                    const optionLabel =
                      typeof option === "string"
                        ? option
                        : String(option?.label ?? option?.displayName ?? option?.name ?? option?.value ?? "").trim();
                    return (
                      <option key={optionValue} value={optionValue}>
                        {optionLabel || optionValue}
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
