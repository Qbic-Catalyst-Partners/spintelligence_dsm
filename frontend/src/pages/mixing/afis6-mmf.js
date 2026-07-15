import { useCallback, useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { FiChevronRight, FiEdit, FiUpload, FiArrowLeft, FiSave, FiBell, FiMoon } from "react-icons/fi";

import { fetchMixingAfis6MmfEntries } from "@/apis/mixing";
import { submitAfis6Mmf, clearMixingState } from "@/store/slices/mixing";
import useDatabaseEntryId from "@/hooks/useDatabaseEntryId";
import { sanitizeNumericInput } from "@/utils/inputValidation";

const NUMERIC_FIELDS = [
  { key: "total_nep_count_g", label: "Total Nep Count / g" },
  { key: "total_nep_mean_size_um", label: "Total Nep Mean Size µm" },
  { key: "cut_length_n_mm", label: "Cut Length (n) mm" },
  { key: "l_n_cv_percent", label: "L(n) CV %" },
  { key: "sfc_n_percent", label: "SFC(n) <12.70 mm %" },
  { key: "five_pct_l_n_mm", label: "5% L(n) mm" },
  { key: "fineness_den", label: "Fineness den" },
  { key: "fineness_cv_percent", label: "Fineness CV %" },
  { key: "long_fiber_gt_46_80_percent", label: "Long Fiber >46.80 mm %" },
  { key: "long_fiber_count_gt_46_80", label: "Long Fiber Count > 46.80 mm" },
];

const MATERIAL_CLASS_OPTIONS = ["Polyester", "Viscose", "Nylon", "Acrylic", "Blend"];

const EMPTY_FORM = NUMERIC_FIELDS.reduce(
  (acc, field) => ({ ...acc, [field.key]: "" }),
  { machine_name: "", material_class: "", comment: "" }
);

export default function Afis6MmfPage() {
  const dispatch = useDispatch();
  const { actionLoading } = useSelector((state) => state.mixing);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [records, setRecords] = useState([]);
  const [error, setError] = useState("");
  const [savedMessage, setSavedMessage] = useState("");

  const { entryId, reserveEntryId } = useDatabaseEntryId({
    department: "Mixing",
    typeName: "AFIS-6 MMF Data Entry",
    config: {
      prefix: "AFIM",
      width: 4,
      routePath: "/mixing/afis6-mmf",
      fetchPath: "/mixing/afis6-mmf",
    },
  });

  const loadRecords = useCallback(async () => {
    setError("");
    try {
      const response = await fetchMixingAfis6MmfEntries({ limit: 10 });
      const rows = Array.isArray(response?.data)
        ? response.data
        : Array.isArray(response?.records)
          ? response.records
          : Array.isArray(response)
            ? response
            : [];
      setRecords(rows);
    } catch (err) {
      setError(err?.message || "Failed to load submitted records.");
      setRecords([]);
    }
  }, []);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  const handleChange = (key, value) => {
    const nextValue = NUMERIC_FIELDS.some((field) => field.key === key)
      ? sanitizeNumericInput(value, { precision: 12, scale: 3 })
      : value;
    setForm((prev) => ({ ...prev, [key]: nextValue }));
  };

  const buildPayload = () => ({
    inspection_date: new Date().toISOString().split("T")[0],
    material_class: String(form.material_class || "").trim(),
    comment: String(form.comment || "").trim(),
    total_nep_count_g: form.total_nep_count_g === "" ? "" : Number(form.total_nep_count_g),
    total_nep_mean_size_um: form.total_nep_mean_size_um === "" ? "" : Number(form.total_nep_mean_size_um),
    cut_length_n_mm: form.cut_length_n_mm === "" ? "" : Number(form.cut_length_n_mm),
    l_n_cv_percent: form.l_n_cv_percent === "" ? "" : Number(form.l_n_cv_percent),
    sfc_n_percent: form.sfc_n_percent === "" ? "" : Number(form.sfc_n_percent),
    five_pct_l_n_mm: form.five_pct_l_n_mm === "" ? "" : Number(form.five_pct_l_n_mm),
    fineness_den: form.fineness_den === "" ? "" : Number(form.fineness_den),
    fineness_cv_percent: form.fineness_cv_percent === "" ? "" : Number(form.fineness_cv_percent),
    long_fiber_gt_46_80_percent: form.long_fiber_gt_46_80_percent === "" ? "" : Number(form.long_fiber_gt_46_80_percent),
    long_fiber_count_gt_46_80: form.long_fiber_count_gt_46_80 === "" ? "" : Number(form.long_fiber_count_gt_46_80),
    machine_name: String(form.machine_name || "").trim(),
    department: "Mixing",
    sub_department: "Quality Control",
    user_name: "Sneha",
  });

  const handleClear = () => {
    setForm(EMPTY_FORM);
    setError("");
    setSavedMessage("");
    dispatch(clearMixingState());
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setSavedMessage("");
    try {
      const res = await dispatch(submitAfis6Mmf(buildPayload())).unwrap();
      await reserveEntryId();
      await loadRecords();
      setSavedMessage(`Saved as ${res?.data?.entry_id || res?.entry_id || "record"}`);
      setForm(EMPTY_FORM);
    } catch (err) {
      setError(err || "Failed to save record");
    } finally {
      setSaving(false);
    }
  };

  const isBusy = saving || actionLoading;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-blue-500 text-white">
            <FiEdit className="h-4 w-4" />
          </div>
          <span className="text-base font-semibold text-indigo-600">Spintelligence™</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative">
            <FiBell className="h-5 w-5 text-slate-500" />
            <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
              4
            </span>
          </div>
          <FiMoon className="h-5 w-5 text-slate-500" />
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-xs font-semibold text-white">
            HB
          </div>
          <span className="text-lg font-bold tracking-tight text-slate-800">DSM</span>
        </div>
      </div>

      <div className="px-6 py-6">
        <div className="mb-3 flex items-center gap-1.5 text-sm text-slate-400">
          <span>Home</span>
          <FiChevronRight className="h-3.5 w-3.5" />
          <span>Dashboard</span>
          <FiChevronRight className="h-3.5 w-3.5" />
          <span className="text-slate-600">Mixing Notebook QC</span>
        </div>

        <h1 className="text-2xl font-bold text-slate-900">Quality Control - Mixing Notebook</h1>
        <p className="mt-1 text-sm text-slate-500">Record and manage industrial machine quality inspections.</p>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
            <div className="flex items-center gap-2">
              <FiEdit className="h-5 w-5 text-indigo-500" />
              <h2 className="text-[15px] font-semibold text-slate-900">Inspection Data Entry</h2>
            </div>
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
            >
              <FiUpload className="h-4 w-4" />
              Upload
            </button>
          </div>

          <div className="px-6 py-6">
            <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Type">
                <select disabled className="w-full cursor-not-allowed rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700" value="AFIS-6 MMF Data Entry">
                  <option>AFIS-6 MMF Data Entry</option>
                </select>
              </Field>

              <Field label="Entry ID">
                <input readOnly value={entryId} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700" />
              </Field>

              <Field label="Machine (Optional)">
                <input
                  placeholder="Enter Machine"
                  value={form.machine_name}
                  onChange={(e) => handleChange("machine_name", e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                />
              </Field>

              <Field label="Material Class">
                <select
                  value={form.material_class}
                  onChange={(e) => handleChange("material_class", e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                >
                  <option value="">Enter Material Class</option>
                  {MATERIAL_CLASS_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Comment">
                <input
                  placeholder="Enter Comment"
                  value={form.comment}
                  onChange={(e) => handleChange("comment", e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                />
              </Field>

              {NUMERIC_FIELDS.map((field) => (
                <Field key={field.key} label={field.label}>
                  <input
                    type="number"
                    step="any"
                    placeholder="Enter"
                    value={form[field.key]}
                    onChange={(e) => handleChange(field.key, e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  />
                </Field>
              ))}
            </div>

            {(error || savedMessage) && (
              <div
                className={`mt-5 rounded-lg px-3 py-2 text-sm ${
                  error ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"
                }`}
              >
                {error || savedMessage}
              </div>
            )}

            <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">Submitted Records</h3>
                {saving ? <span className="text-sm text-slate-500">Saving...</span> : null}
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-[12px] text-slate-700">
                  <thead>
                    <tr className="border-b border-slate-200 text-left uppercase tracking-wide text-slate-500">
                      <th className="px-2 py-2 font-semibold">Inspection Date</th>
                      <th className="px-2 py-2 font-semibold">Material Class</th>
                      <th className="px-2 py-2 font-semibold">Comment</th>
                      <th className="px-2 py-2 font-semibold">Entry ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.length ? records.map((record, index) => (
                      <tr key={`${record.entry_id || record.id || index}`} className="border-b border-slate-100 last:border-b-0">
                        <td className="px-2 py-2">{record.inspection_date || record.inspectionDate || "-"}</td>
                        <td className="px-2 py-2">{record.material_class || record.materialClass || "-"}</td>
                        <td className="px-2 py-2">{record.comment || "-"}</td>
                        <td className="px-2 py-2">{record.entry_id || record.entryId || record.id || "-"}</td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={4} className="px-2 py-4 text-center text-slate-400">
                          No AFIS-6 MMF records available.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4">
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3.5 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              <FiArrowLeft className="h-4 w-4" />
              Back to Dashboard
            </button>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleClear}
                className="rounded-lg px-3.5 py-2 text-sm text-slate-500 hover:bg-slate-50"
              >
                Clear Form
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isBusy}
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                <FiSave className="h-4 w-4" />
                {isBusy ? "Saving..." : "Save Record"}
              </button>
            </div>
          </div>
        </div>

        <p className="mt-8 text-center text-xs text-slate-400">
          © 2024 Industrial Quality Management System. Spinning Department v4.2.0
        </p>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-slate-700">{label}</label>
      {children}
    </div>
  );
}
