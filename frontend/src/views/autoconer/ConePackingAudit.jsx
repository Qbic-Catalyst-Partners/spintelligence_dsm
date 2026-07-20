import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useDispatch, useSelector } from "react-redux";
import SearchableSelect from "@/components/SearchableSelect";
import {
  getAutoconerConePackingAudit,
  saveAutoconerConePackingAudit,
} from "@/store/slices/autoconer";
import { fetchAutoconerConePackingAuditMasterData, toNullableNumber } from "@/apis/autoconer";
import { sanitizeNumericInput } from "@/utils/inputValidation";

const today = new Date().toISOString().split("T")[0];

const topFieldClass =
  "autoconer-input w-full h-[42px] rounded-[10px] border border-slate-200 bg-[#F1F5F9] px-3 text-[14px] text-slate-700 outline-none transition focus:border-[#3d539f] focus:ring-2 focus:ring-[#d7def5]";

const countNameOptions = [
  "10 COTTON POLY LINEN 60/20/20...",
  "20 COTTON POLY LINEN 60/20/20...",
];
const centerPadOptions = ["1", "2", "3", "4"];

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
});

const formFieldSanitizers = {
  grossWtStd: (value) => sanitizeNumericInput(value, { precision: 6, scale: 2 }),
  grossWtAct: (value) => sanitizeNumericInput(value, { precision: 6, scale: 2 }),
  netWeight: (value) => sanitizeNumericInput(value, { precision: 10, scale: 2 }),
  tareWeight: (value) => sanitizeNumericInput(value, { precision: 6, scale: 2 }),
};

const yesNo = (value) => {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "true" || normalized === "yes") return "Yes";
  if (normalized === "false" || normalized === "no") return "No";
  return value || "-";
};

const mapConePackingEntryToRow = (entry = {}) => ({
  entryId: String(entry.entry_id ?? entry.entryId ?? "-"),
  countName: String(entry.count_name ?? entry.countName ?? "-"),
  grossWtStd: String(entry.gross_weight_std ?? entry.grossWtStd ?? "-"),
  grossWtAct: String(entry.gross_weight_actual ?? entry.grossWtAct ?? "-"),
  boxColour: String(entry.box_colour ?? entry.boxColour ?? "-"),
  coneColour: String(entry.cone_colour ?? entry.coneColour ?? "-"),
  gumTapeColour: String(entry.gum_tape_colour ?? entry.gumTapeColour ?? "-"),
  countLabel: yesNo(entry.count_label ?? entry.countLabel),
  coneDamage: yesNo(entry.cone_damage ?? entry.coneDamage),
  coverMissing: yesNo(entry.cover_missing ?? entry.coverMissing),
  coneHardness: yesNo(entry.cone_hardness ?? entry.coneHardness),
  stapCone: yesNo(entry.stap_cone ?? entry.stapCone),
  disk: yesNo(entry.disk),
  barcode: yesNo(entry.barcode),
  centerPad: String(entry.center_pad ?? entry.centerPad ?? "-"),
  netWeight: String(entry.net_weight ?? entry.netWeight ?? "-"),
  tareWeight: String(entry.tare_weight ?? entry.tareWeight ?? "-"),
  strapColour: String(entry.strap_colour ?? entry.strapColour ?? "-"),
});

const errorClass = (flag) =>
  flag
    ? " !border-red-500 !bg-[#fff1f2] focus:!border-red-500 focus:!ring-[rgba(239,68,68,0.35)] [box-shadow:0_0_0_1000px_#fff1f2_inset]"
    : "";

const ConePackingAudit = forwardRef(function ConePackingAudit(
  {
    selectedTypeName = "Cone Packing Audit",
    onTypeChange,
    typeOptions = [],
    tablePortalTargetId,
    postFooterPortalTargetId,
    entryId = "",
  },
  ref
) {
  const dispatch = useDispatch();
  const { isLoading, isFetching, conePackingAudit = [] } = useSelector((state) => state.autoconer ?? {});
  const [form, setForm] = useState(createInitialForm);
  const [countCode, setCountCode] = useState("");
  const [countDropdownOptions, setCountDropdownOptions] = useState(
    countNameOptions.map((option) => ({ value: option, label: option, code: "" }))
  );
  const [errors, setErrors] = useState({});
  const [portalReady, setPortalReady] = useState(false);
  const auditRows = useMemo(() => {
    const grossWeight = toNullableNumber(form.grossWtAct);
    const average = toNullableNumber(String(form.netWeight).replace(/,/g, ""));
    const percentYarn =
      grossWeight && average
        ? Number(((average / grossWeight) * 100).toFixed(2))
        : null;

    return [
      {
        drumNo: 1,
        readingNumber: 1,
        grossWeight,
        average,
        percentYarn,
      },
    ];
  }, [form.grossWtAct, form.netWeight]);

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
    ...Object.entries(form)
      .filter(([label]) => label !== "packedDate")
      .map(([label, value]) => ({
        label: label === "date" ? "Entry ID" : label,
        value: label === "date" ? entryId || "-" : value || "-",
      })),
  ];

  const buildPayload = () => ({
    entry_id: entryId || undefined,
    inspection_date: form.date,
    packed_date: form.packedDate,
    count_name: form.countName,
    cntcode: countCode || undefined,
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
    drum_entries: auditRows.map((row) => ({
      drum_no: row.drumNo,
      gross_weight: row.grossWeight,
      average: row.average,
    })),
    cone_readings: auditRows.map((row) => ({
      reading_number: row.readingNumber,
      percent_yarn: row.percentYarn,
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

  useEffect(() => {
    let isCancelled = false;
    const loadMasterData = async () => {
      const response = await fetchAutoconerConePackingAuditMasterData();
      if (isCancelled) return;
      const fromObjects = Array.isArray(response?.count_options)
        ? response.count_options
            .map((item) => {
              const code = String(item?.cntcode ?? "").trim();
              const label = String(item?.cntname ?? "").trim();
              return label ? { value: code || label, label, code: code || "" } : null;
            })
            .filter(Boolean)
        : [];
      const fromLegacy = Array.isArray(response?.count_names)
        ? response.count_names.map((item) => String(item || "").trim()).filter(Boolean).map((label) => ({ value: label, label, code: "" }))
        : [];
      const unique = Array.from(new Map([...fromObjects, ...fromLegacy].map((item) => [item.value, item])).values());
      if (unique.length) {
        setCountDropdownOptions(unique);
        setForm((current) => ({
          ...current,
          countName: unique.some((item) => item.label === current.countName) ? current.countName : "",
        }));
      }
    };
    loadMasterData();
    return () => {
      isCancelled = true;
    };
  }, []);

  const lastEntries = useMemo(
    () => conePackingAudit.map((entry) => mapConePackingEntryToRow(entry)).slice(0, 10),
    [conePackingAudit]
  );

  const portalTarget =
    portalReady && postFooterPortalTargetId && typeof document !== "undefined"
      ? document.getElementById(postFooterPortalTargetId)
      : null;

  const lastEntriesHeaders = [
    "Entry ID",
    "Count Name",
    "Gross Wt. (Std)",
    "Gross Wt. (Act)",
    "Box Colour",
    "Cone Colour",
    "Gum Tape Colour",
    "Count Label",
    "Cone Damage",
    "Cover Missing",
    "Cone Hardness",
    "Stap Cone",
    "Disk",
    "Barcode",
    "Center Pad",
    "Net Weight",
    "Tare Weight",
    "Strap Colour",
  ];

  const lowerSection = (
    <div className="pt-6 print:hidden">
      <div className="w-full rounded-[12px] border border-slate-200 bg-white px-6 pb-6 pt-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <h4 className="mb-4 mt-0 text-[18px] font-bold text-slate-900">Last 10 Entries</h4>
        <div className="overflow-x-auto">
          <table className="min-w-max border-collapse whitespace-nowrap text-[11px] text-slate-700">
            <thead>
              <tr className="border-b border-slate-300 text-left uppercase text-slate-500">
                {lastEntriesHeaders.map((header) => (
                  <th key={header} className="px-4 py-3 font-semibold first:pl-0 last:pr-0">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lastEntries.map((entry, index) => (
                <tr key={`${entry.entryId}-${index}`} className="border-b border-slate-200 last:border-b-0">
                  <td className="px-4 py-4 first:pl-0">{entry.entryId}</td>
                  <td className="px-4 py-4">{entry.countName}</td>
                  <td className="px-4 py-4">{entry.grossWtStd}</td>
                  <td className="px-4 py-4">{entry.grossWtAct}</td>
                  <td className="px-4 py-4">{entry.boxColour}</td>
                  <td className="px-4 py-4">{entry.coneColour}</td>
                  <td className="px-4 py-4">{entry.gumTapeColour}</td>
                  <td className="px-4 py-4">{entry.countLabel}</td>
                  <td className="px-4 py-4">{entry.coneDamage}</td>
                  <td className="px-4 py-4">{entry.coverMissing}</td>
                  <td className="px-4 py-4">{entry.coneHardness}</td>
                  <td className="px-4 py-4">{entry.stapCone}</td>
                  <td className="px-4 py-4">{entry.disk}</td>
                  <td className="px-4 py-4">{entry.barcode}</td>
                  <td className="px-4 py-4">{entry.centerPad}</td>
                  <td className="px-4 py-4">{entry.netWeight}</td>
                  <td className="px-4 py-4">{entry.tareWeight}</td>
                  <td className="px-4 py-4 last:pr-0">{entry.strapColour}</td>
                </tr>
              ))}
              {!lastEntries.length ? (
                <tr>
                  <td colSpan={lastEntriesHeaders.length} className="px-4 py-5 text-center text-[12px] text-slate-400">
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
    { label: "Entry ID", field: "date", type: "text", value: entryId, placeholder: "Entry ID" },
    { label: "Count Name", field: "countName", type: "select", options: countDropdownOptions, placeholder: "Select count name" },
  ];

  const detailFields = [
    { label: "Gross Wt. (Std)", field: "grossWtStd", type: "text", placeholder: "Enter gross std" },
    { label: "Gross Wt. (Act)", field: "grossWtAct", type: "text", placeholder: "Enter gross act" },
    { label: "Box Colour", field: "boxColour", type: "text", placeholder: "Enter box colour" },
    { label: "Cone Colour", field: "coneColour", type: "text", placeholder: "Enter cone colour" },
    { label: "Gum Tape Colour", field: "gumTapeColour", type: "text", placeholder: "Enter gum tape colour" },
    { label: "Count Label", field: "countLabel", type: "radio", options: ["Yes", "No"] },
    { label: "Cone Damage", field: "coneDamage", type: "radio", options: ["Yes", "No"] },
    { label: "Cover Missing", field: "coverMissing", type: "radio", options: ["Yes", "No"] },
    { label: "Cone Hardness", field: "coneHardness", type: "radio", options: ["Yes", "No"] },
    { label: "Stap Cone", field: "stapCone", type: "radio", options: ["Yes", "No"] },
    { label: "Disk", field: "disk", type: "radio", options: ["Yes", "No"] },
    { label: "Barcode", field: "barcode", type: "radio", options: ["Yes", "No"] },
    { label: "Center Pad", field: "centerPad", type: "select", options: centerPadOptions, placeholder: "Select center pad" },
    { label: "Net Weight", field: "netWeight", type: "text", placeholder: "Enter net weight" },
    { label: "Tare Weight", field: "tareWeight", type: "text", placeholder: "Enter tare weight" },
    { label: "Strap Colour", field: "strapColour", type: "text", placeholder: "Enter strap colour" },
  ];

  const renderField = ({ label, field, type, options = [], value, placeholder }) => {
    const fieldValue = value ?? form[field] ?? "";

    return (
      <div key={field} className="flex flex-col gap-2">
        <label className="text-[14px] font-semibold text-slate-700">{label}</label>
        {type === "select" && field === "countName" ? (
          <SearchableSelect
            className={`${topFieldClass}${errorClass(errors[field])}`}
            value={fieldValue}
            onChange={(nextValue) => {
              if (field === "countName") {
                const selected = options.find((option) => {
                  if (!option || typeof option !== "object") return option === nextValue;
                  return String(option.value) === nextValue || String(option.label) === nextValue;
                });
                if (selected && typeof selected === "object") {
                  handleFormChange("countName", selected.label || "");
                  setCountCode(selected.code || "");
                } else {
                  handleFormChange("countName", nextValue);
                  setCountCode("");
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
        ) : type === "radio" ? (
          <div className="flex gap-4">
            {options.map((option) => (
              <label key={option} className="flex items-center gap-2">
                <input
                  type="radio"
                  name={field}
                  value={option}
                  checked={fieldValue === option}
                  onChange={(event) => handleFormChange(field, event.target.value)}
                  className="w-4 h-4 text-slate-700 cursor-pointer"
                />
                <span className="text-[14px] text-slate-700">{option}</span>
              </label>
            ))}
          </div>
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
  };;

  return (
    <>
      <div className="flex flex-col gap-10">
        <div className="grid grid-cols-1 gap-x-8 gap-y-5 md:grid-cols-2 xl:grid-cols-3 print:grid-cols-3">
          {formFields.map(renderField)}
        </div>

        <div className="grid grid-cols-1 gap-x-8 gap-y-5 md:grid-cols-2 xl:grid-cols-4 print:grid-cols-4">
          {detailFields.map(renderField)}
        </div>
      </div>
      {portalTarget ? createPortal(lowerSection, portalTarget) : null}
      {isLoading ? <p className="mt-3 text-[14px] text-[#3d539f]">Saving cone packing audit...</p> : null}
    </>
  );
});

export default ConePackingAudit;
