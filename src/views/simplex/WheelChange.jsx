import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { MdEditNote } from "react-icons/md";
import InputScreenUploadButton from "@/components/InputScreenUploadButton";
import SearchableSelect from "@/components/SearchableSelect";
import { createSmxMachineOptions } from "@/views/simplex/smxMachineNames";
import {
  fetchSimplexUqcMasterDropdown,
  fetchSimplexWheelChangeNotebookEntries,
  submitSimplexWheelChangeNotebookEntry,
} from "@/apis/simplex";

const today = new Date().toISOString().split("T")[0];

const rowGroups = {
  "Type 1 (LRSB)": [
    { key: "mixing", label: "Mixing / Process", select: true },
    { key: "blendPercent", label: "Blend" },
    { key: "feedHank", label: "Feed-Hank" },
    { key: "delHank", label: "Delivery-Hank" },
    { key: "cp", label: "CP", select: true },
    { key: "breakDraft", label: "Break Draft (CP)", select: true },
    { key: "totalDraft", label: "Total Draft", dark: true },
    { key: "breakDraftValue", label: "Break Draft", dark: true },
    { key: "md1", label: "Front Roller Dia", select: true },
    { key: "md2", label: "TW", select: true },
    { key: "tw0", label: "TCW (0)", select: true },
    { key: "tw1", label: "TCW (1)", select: true },
    { key: "tf", label: "TF", dark: true },
    { key: "tm", label: "TM", dark: true },
    { key: "lm", label: "LM", select: true },
    { key: "lcw0", label: "LCW (1)", select: true },
    { key: "lcw1", label: "LCW (0)", select: true },
    { key: "bottomRollerSetting", label: "Bottom Roller Setting", dark: true },      
    { key: "topArmSetting", label: "Top Arm Setting", dark: true },
    { key: "topArmLoad", label: "Top Arm Load", dark: true },
    { key: "floatingCondensor", label: "Floating Condenser", dark: true },
    { key: "spacer", label: "Spacer", dark: true },
    { key: "tension", label: "Tension", select: true },
    { key: "creelDraftChange", label: "Creel Draft Change (WE)", select: true },
    { key: "creelDraft", label: "Creel Draft", dark: true },
    { key: "bobbinColour", label: "Bobbin Colour", dark: true },
  ],
};

const createEmptyRows = () =>
  rowGroups["Type 1 (LRSB)"].map((row) => ({
    key: row.key,
    existing: "",
    proposed: "",
  }));

const normalizeRows = (rows = []) => {
  const sourceRows = Array.isArray(rows)
    ? rows
    : rows && typeof rows === "object"
      ? Object.entries(rows).map(([key, value]) => ({
          key,
          ...((value && typeof value === "object") ? value : { existing: value }),
        }))
      : [];

  return rowGroups["Type 1 (LRSB)"].map((row) => {
    const saved = sourceRows.find(
      (item) =>
        String(item?.key ?? item?.label ?? "").trim() === row.key ||
        String(item?.label ?? "").trim() === row.label
    );

    return {
      key: row.key,
      existing: String(saved?.existing ?? saved?.proposed ?? saved?.value ?? saved?.[row.key] ?? ""),
      proposed: "",
    };
  });
};

const extractLatestNotebookEntry = (payload) => {
  const rows = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.rows)
      ? payload.rows
      : Array.isArray(payload)
        ? payload
        : [];
  return rows[0] || payload?.data?.[0] || payload?.latest || null;
};

const createInitialForm = () => ({
  type: "Wheel Change",
  entryId: "",
  date: today,
  smxNo: "",
  smxNoProposed: "",
});

const normalizeMachineOptions = (rows = []) =>
  (Array.isArray(rows) ? rows : [])
    .map((row) => {
      if (typeof row === "string") {
        const value = row.trim();
        if (!value) return null;
        const label = value.toUpperCase().replace(/\s+/g, "-");
        return { value: label, label };
      }

      const value = String(row?.value ?? row?.mc_no ?? row?.machine_no ?? row?.machine_number ?? "").trim();
      const labelSource = String(row?.label ?? row?.mc_name ?? row?.machine_name ?? value).trim();
      const label = labelSource ? labelSource.toUpperCase().replace(/\s+/g, "-") : value.toUpperCase().replace(/\s+/g, "-");
      const normalizedValue = label || value;
      return normalizedValue ? { value: normalizedValue, label: normalizedValue } : null;
    })
    .filter(Boolean);

const getOptionText = (option) => {
  if (option === null || option === undefined) return "";
  if (typeof option === "string" || typeof option === "number") return String(option).trim();
  return String(option?.label ?? option?.value ?? option?.name ?? option?.text ?? "").trim();
};

const mergeMachineOptions = (apiOptions = []) => {
  const merged = [
    ...createSmxMachineOptions(),
    ...(Array.isArray(apiOptions) ? apiOptions : [])
      .map((option) => {
        if (!option) return null;
        if (typeof option === "string") {
          const value = option.trim();
          return value ? { value, label: value } : null;
        }

        const value = String(option?.value ?? option?.mc_no ?? option?.machine_no ?? option?.mcName ?? "").trim();
        const label = String(option?.label ?? option?.mc_name ?? option?.machine_name ?? value ?? "").trim();
        return value ? { value, label: label || value } : null;
      })
      .filter(Boolean),
  ];

  const seen = new Set();
  return merged.filter((item) => {
    if (!item?.value || seen.has(item.value)) return false;
    seen.add(item.value);
    return true;
  });
};

const WheelChange = forwardRef(function WheelChange(
  { selectedTypeName = "Wheel Change", onTypeChange, typeOptions = [], entryId = "" },
  ref
) {
  const [form, setForm] = useState(createInitialForm);
  const [rows, setRows] = useState(createEmptyRows);
  const [machineOptions, setMachineOptions] = useState([]);
  const [mixingOptions, setMixingOptions] = useState([]);
  const [submitError, setSubmitError] = useState("");

  const findLatestEntryForMixing = (entries = [], mixing = "") => {
    const normalizedMixing = String(mixing || "").trim().toLowerCase();
    if (!normalizedMixing) return entries[0] || null;
    return (
      entries.find((entry) =>
        String(entry?.mixing ?? entry?.mixing_name ?? entry?.prep_variety_name ?? entry?.variety ?? "").trim().toLowerCase() === normalizedMixing
      ) ||
      entries[0] ||
      null
    );
  };

  useEffect(() => {
    setForm((current) => ({ ...current, entryId }));
  }, [entryId]);

  useEffect(() => {
    let cancelled = false;

    const loadMachineOptions = async () => {
      try {
        const dropdown = await fetchSimplexUqcMasterDropdown();
        if (cancelled) return;
        const options = normalizeMachineOptions(dropdown?.mcNos || []);
        setMachineOptions(mergeMachineOptions(options));
      } catch {
        if (!cancelled) setMachineOptions(createSmxMachineOptions());
      }
    };

    const loadMixingOptions = async () => {
      try {
        const dropdown = await fetchSimplexUqcMasterDropdown();
        if (cancelled) return;
        setMixingOptions(Array.isArray(dropdown?.varietyNames) ? dropdown.varietyNames : []);
      } catch {
        if (!cancelled) setMixingOptions([]);
      }
    };

    const loadLatest = async (requestedMixing = "") => {
      try {
        const payload = await fetchSimplexWheelChangeNotebookEntries({ page: 1, limit: 100 });
        if (cancelled) return;
        const rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.rows) ? payload.rows : Array.isArray(payload) ? payload : [];
        const latest = findLatestEntryForMixing(rows, requestedMixing);
        if (!latest) return;

        setForm((current) => ({
          ...current,
          entryId: String(latest.entry_id || latest.entryId || entryId || current.entryId || ""),
          date:
            String(latest.entry_date || latest.date || current.date || today)
              .slice(0, 10)
              .replace(/-/g, "-"),
          smxNo: String(latest.sap_no || latest.smx_no || latest.smxNo || current.smxNo || ""),
          smxNoProposed: String(
            latest.proposed_sap_no || latest.proposedSapNo || latest.smx_no_proposed || current.smxNoProposed || ""
          ),
        }));

        const savedRows = Array.isArray(latest.parameter_rows)
          ? latest.parameter_rows
          : Array.isArray(latest.parameters)
            ? latest.parameters
            : Array.isArray(latest.rows)
              ? latest.rows
              : latest.rows && typeof latest.rows === "object"
                ? latest.rows
                : [];
        setRows(normalizeRows(savedRows));
      } catch {
        if (!cancelled) setRows(createEmptyRows());
      }
    };

    loadMachineOptions();
    loadMixingOptions();
    loadLatest();
    return () => {
      cancelled = true;
    };
  }, [entryId]);

  const clear = () => {
    setForm(createInitialForm());
    setRows(createEmptyRows());
    setSubmitError("");
  };

  const validate = () => Boolean(selectedTypeName && form.date && form.smxNo && form.smxNoProposed);

  const getPreviewData = () => [
    { label: "Type", value: selectedTypeName || "-" },
    { label: "Entry ID", value: entryId || "-" },
    { label: "Date", value: form.date || "-" },
    { label: "SMX No.", value: form.smxNo || "-" },
    { label: "SMX No. (Proposed)", value: form.smxNoProposed || "-" },
    ...selectedRows.map((row) => ({
      label: `${row.label} - Proposed`,
      value: rows.find((item) => item.key === row.key)?.proposed || "-",
    })),
  ];

  const submit = async () => {
    setSubmitError("");
    const payload = {
      entry_id: entryId || form.entryId || undefined,
      notebook_type: "Wheel Change",
      entry_date: form.date,
      sap_no: form.smxNo,
      proposed_sap_no: form.smxNoProposed,
      parameter_rows: selectedRows.map((row) => {
        const current = rows.find((item) => item.key === row.key) || {};
        return {
          key: row.key,
          label: row.label,
          existing: current.existing || "",
          proposed: current.proposed || "",
        };
      }),
      notes: {
        type: selectedTypeName,
      },
    };

    try {
      await submitSimplexWheelChangeNotebookEntry(payload);
      setRows((current) =>
        current.map((item) => ({
          ...item,
          existing: item.proposed || item.existing || "",
          proposed: "",
        }))
      );
      return true;
    } catch (error) {
      setSubmitError(error?.message || "Unable to submit simplex notebook entry.");
      return false;
    }
  };

  useImperativeHandle(ref, () => ({
    clear,
    validate,
    getPreviewData,
    submit,
  }));

  const selectedRows = useMemo(
    () => rowGroups[form.smxNoProposed] || rowGroups["Type 1 (LRSB)"],
    [form.smxNoProposed]
  );

  const selectedMixing = useMemo(() => {
    const row = rows.find((item) => item.key === "mixing");
    return String(row?.proposed || row?.existing || "").trim();
  }, [rows]);

  useEffect(() => {
    let cancelled = false;

    const refreshByMixing = async () => {
      if (!selectedMixing) return;
      try {
        const payload = await fetchSimplexWheelChangeNotebookEntries({ page: 1, limit: 100 });
        if (cancelled) return;
        const list = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.rows) ? payload.rows : Array.isArray(payload) ? payload : [];
        const latest = findLatestEntryForMixing(list, selectedMixing);
        if (!latest) return;
        const savedRows = Array.isArray(latest.parameter_rows)
          ? latest.parameter_rows
          : Array.isArray(latest.parameters)
            ? latest.parameters
            : Array.isArray(latest.rows)
              ? latest.rows
              : latest.rows && typeof latest.rows === "object"
                ? latest.rows
                : [];
        setRows(normalizeRows(savedRows));
      } catch {
        // Keep current values when a mixing-specific history row isn't available.
      }
    };

    refreshByMixing();
    return () => {
      cancelled = true;
    };
  }, [selectedMixing]);

  const renderField = (row, valueKey) => {
    const value = rows.find((item) => item.key === row.key)?.[valueKey] || "";
    const className = `w-full h-[38px] rounded-[8px] border border-slate-200 bg-[#F8FAFC] px-3 text-[14px] text-slate-700 ${row.dark ? "bg-[#e3e9f0]" : ""}`;
    const options = row.key === "mixing" ? mixingOptions : machineOptions;

    if (row.select) {
      if (row.key === "mixing") {
        return (
          <SearchableSelect
            className={className}
            value={value}
            onChange={(nextValue) =>
              setRows((current) =>
                current.map((item) => (item.key === row.key ? { ...item, [valueKey]: nextValue } : item))
              )
            }
            options={options}
            placeholder="Select"
            ariaLabel={row.label}
          />
        );
      }

      return (
        <select
          className={className}
          value={value}
          onChange={(e) =>
            setRows((current) =>
              current.map((item) => (item.key === row.key ? { ...item, [valueKey]: e.target.value } : item))
            )
          }
        >
          <option value="">Select</option>
          {options.map((option) => {
            const optionText = getOptionText(option);
            return (
              <option key={optionText} value={optionText}>
                {optionText}
              </option>
            );
          })}
        </select>
      );
    }

    return (
      <input
        className={className}
        value={value}
        onChange={(e) =>
          setRows((current) =>
            current.map((item) => (item.key === row.key ? { ...item, [valueKey]: e.target.value } : item))
          )
        }
      />
    );
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="p-5">
        <div className="flex items-center gap-2 min-w-0 mb-4">
          <MdEditNote className="text-[#3d539f] text-[22px]" />
          <span className="text-[18px] font-bold text-slate-900">Inspection Data Entry</span>
          <InputScreenUploadButton className="ml-auto" />
        </div>

        <div className="grid grid-cols-1 gap-x-4 gap-y-5 md:grid-cols-2 xl:grid-cols-3">
          <div className="flex min-w-0 flex-col gap-2">
            <label className="text-[14px] font-semibold text-slate-700">Type</label>
            <select
              className="w-full h-[42px] rounded-[10px] border border-slate-200 bg-[#F1F5F9] px-3 text-[14px] text-slate-700"
              value={selectedTypeName}
              onChange={(e) => onTypeChange?.(e.target.value)}
            >
              <option value="">Select checking type</option>
              {typeOptions.map((item, idx) => {
                const optionText = getOptionText(item);
                return optionText ? (
                  <option key={optionText || idx} value={optionText}>
                    {optionText}
                  </option>
                ) : null;
              })}
            </select>
          </div>

          <div className="flex min-w-0 flex-col gap-2">
            <label className="text-[14px] font-semibold text-slate-700">Entry ID</label>
            <input
              className="w-full h-[42px] rounded-[10px] border border-slate-200 bg-[#F1F5F9] px-3 text-[14px] text-slate-700"
              value={entryId || "SWC-0001"}
              readOnly
              disabled
            />
          </div>

          <div className="flex min-w-0 flex-col gap-2">
            <label className="text-[14px] font-semibold text-slate-700">Date</label>
            <input
              type="text"
              className="w-full h-[42px] rounded-[10px] border border-slate-200 bg-[#F1F5F9] px-3 text-[14px] text-slate-700"
              value={form.date.split("-").reverse().join("/")}
              readOnly
            />
          </div>

          <div className="flex min-w-0 flex-col gap-2">
            <label className="text-[14px] font-semibold text-slate-700">SMX No.</label>
            <SearchableSelect
              className="w-full h-[42px] rounded-[10px] border border-slate-200 bg-[#F1F5F9] px-3 text-[14px] text-slate-700"
              value={form.smxNo}
              onChange={(value) => setForm((current) => ({ ...current, smxNo: value }))}
              options={machineOptions}
              placeholder="Select"
              ariaLabel="SMX No."
            />
          </div>

          <div className="flex min-w-0 flex-col gap-2">
            <label className="text-[14px] font-semibold text-slate-700">SMX No. (Proposed)</label>
            <SearchableSelect
              className="w-full h-[42px] rounded-[10px] border border-slate-200 bg-[#F1F5F9] px-3 text-[14px] text-slate-700"
              value={form.smxNoProposed}
              onChange={(value) => setForm((current) => ({ ...current, smxNoProposed: value }))}
              options={machineOptions}
              placeholder="Select"
              ariaLabel="SMX No. Proposed"
            />
          </div>
        </div>

        <div className="mt-8 overflow-x-auto">
          <table className="min-w-full border-collapse text-[14px] text-slate-700">
            <thead>
              <tr className="border-b border-slate-300 text-left uppercase text-slate-500">
                <th className="px-0 py-3 pr-6 font-semibold">PARAMETER</th>
                <th className="px-0 py-3 pr-6 font-semibold">EXISTING</th>
                <th className="px-0 py-3 font-semibold">PROPOSED</th>
              </tr>
            </thead>
            <tbody>
              {selectedRows.map((row) => (
                <tr key={row.key} className="border-b border-slate-200">
                  <td className="px-0 py-4 pr-6 font-semibold text-slate-700">{row.label}</td>
                  <td className="px-0 py-4 pr-6">{renderField(row, "existing")}</td>
                  <td className="px-0 py-4">{renderField(row, "proposed")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {submitError ? <p className="mt-3 text-[14px] text-red-600">{submitError}</p> : null}
      </div>
    </div>
  );
});

export default WheelChange;
