import React, { forwardRef, useImperativeHandle, useMemo, useState } from "react";

const today = new Date().toISOString().split("T")[0];
const typeOptions = ["SMXCots Change Data Entry", "SMX Breaks Study Report"];
const simplexOptions = ["SX-01", "SX-02", "SX-03", "SX-04", "SX-05", "SX-06"];
const reportTypeOptions = ["", "Regular", "Trial", "Special"];

const qualityParameterRows = [
  ["CP", "CM", "CCP", "CCM", "JP"],
  ["A1", "A2", "A3", "A4"],
  ["B1", "B2", "B3", "B4"],
  ["C1", "C2", "C3", "C4"],
  ["D1", "D2", "D3", "D4"],
  ["E", "F", "G", "H1", "H2"],
  ["I1", "I2", "CVP"],
];

const topFieldClass =
  "w-full h-[38px] px-3 py-2 border border-slate-200 rounded-lg bg-slate-100 text-[14px] focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-colors";
const whiteFieldClass =
  "w-full h-[38px] px-3 py-2 border border-slate-200 rounded-lg bg-white text-[14px] focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-colors";

const createInitialForm = () => ({
  type: "SMX Breaks Study Report",
  simplexNo: "",
  tpi: "",
  becomode: "75/25",
  date: today,
  countName: "",
  time: "",
  trialName: "",
  reportType: "",
  nature: "",
  unitNo: "",
  rawMaterial: "",
  mixing: "",
  yarnResults: "",
  totalCuts: "",
  nepsCuts: "",
  shortCuts: "",
  longCuts: "",
  thinCuts: "",
  usterId: "",
  uPercent: "",
  cvm: "",
  cvmCvPercent: "",
  cvmTenMtr: "",
  drOnePointFive: "",
  thinMinus50: "",
  thickPlus50: "",
  nepsPlus200: "",
  thinMinus40: "",
  thickPlus35: "",
  nepsPlus140: "",
  thinMinus30: "",
  count: "",
  csp: "",
});

const createInitialQualityParameters = () =>
  qualityParameterRows.flat().reduce((accumulator, key) => {
    accumulator[key] = "";
    return accumulator;
  }, {});

const parseNumber = (value) => {
  if (value === "") return 0;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const formatTotal = (value) => parseNumber(value).toFixed(2);

const SMXBreaksStudyReport = forwardRef(function SMXBreaksStudyReport(
  { selectedTypeName, onTypeChange },
  ref
) {
  const [form, setForm] = useState(createInitialForm);
  const [qualityParameters, setQualityParameters] = useState(createInitialQualityParameters);
  const [errors, setErrors] = useState({ form: {}, qp: {} });

  const regularTotal = useMemo(
    () =>
      formatTotal(
        parseNumber(form.thinMinus50) +
          parseNumber(form.thickPlus50) +
          parseNumber(form.nepsPlus200)
      ),
    [form.nepsPlus200, form.thickPlus50, form.thinMinus50]
  );

  const higherSensitiveTotal = useMemo(
    () =>
      formatTotal(
        parseNumber(form.thinMinus40) +
          parseNumber(form.thickPlus35) +
          parseNumber(form.nepsPlus140)
      ),
    [form.nepsPlus140, form.thickPlus35, form.thinMinus40]
  );

const errorClass = (flag) =>
    flag ? " border-red-500 focus:ring-red-400 focus:border-red-500" : "";
const errorStyle = (flag) =>
    flag ? { borderColor: "#ef4444", backgroundColor: "#fff1f2" } : undefined;

  const handleFormChange = (field, value) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
    setErrors((prev) => {
      if (!prev.form?.[field]) return prev;
      const nextForm = { ...(prev.form || {}) };
      delete nextForm[field];
      return { ...prev, form: nextForm };
    });
  };

  const handleQualityParameterChange = (field, value) => {
    setQualityParameters((current) => ({
      ...current,
      [field]: value,
    }));
    setErrors((prev) => {
      if (!prev.qp?.[field]) return prev;
      const nextQp = { ...(prev.qp || {}) };
      delete nextQp[field];
      return { ...prev, qp: nextQp };
    });
  };

  const clear = () => {
    setForm(createInitialForm());
    setQualityParameters(createInitialQualityParameters());
    setErrors({ form: {}, qp: {} });
  };

  const validate = () => {
    const nextErrors = { form: {}, qp: {} };
    Object.entries(form).forEach(([key, value]) => {
      if (String(value).trim() === "") nextErrors.form[key] = true;
    });
    Object.entries(qualityParameters).forEach(([key, value]) => {
      if (String(value).trim() === "") nextErrors.qp[key] = true;
    });
    setErrors(nextErrors);
    return Object.keys(nextErrors.form).length === 0 && Object.keys(nextErrors.qp).length === 0;
  };

  const submit = () => {
    if (!validate()) return false;
    return true;
  };

  const getPreviewData = () => {
    const items = Object.entries(form).map(([key, value]) => ({
      label: key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase()),
      value,
    }));
    Object.entries(qualityParameters).forEach(([key, value]) => {
      items.push({ label: `QP - ${key}`, value: value || "-" });
    });
    return items;
  };

  useImperativeHandle(ref, () => ({
    clear,
    validate,
    getPreviewData,
    submit,
  }));

  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-3 gap-[18px]">
        <div className="flex flex-col gap-1.5 min-w-0">
          <label className="text-[14px] font-semibold text-slate-700">Type</label>
          <select
            className={`${topFieldClass}${errorClass(errors.form?.type)}`}
            style={errorStyle(errors.form?.type)}
            value={selectedTypeName}
            onChange={(e) => {
              handleFormChange("type", e.target.value);
              onTypeChange?.(e.target.value);
            }}
          >
            {typeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5 min-w-0">
          <label className="text-[14px] font-semibold text-slate-700">Simplex No.</label>
          <select
            className={`${topFieldClass}${errorClass(errors.form?.simplexNo)}`}
            style={errorStyle(errors.form?.simplexNo)}
            value={form.simplexNo}
            onChange={(e) => handleFormChange("simplexNo", e.target.value)}
          >
            <option value="">Select</option>
            {simplexOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5 min-w-0">
          <label className="text-[14px] font-semibold text-slate-700">TPI</label>
          <input
            type="text"
            className={`${topFieldClass}${errorClass(errors.form?.tpi)}`}
            style={errorStyle(errors.form?.tpi)}
            value={form.tpi}
            onChange={(e) => handleFormChange("tpi", e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5 min-w-0">
          <label className="text-[14px] font-semibold text-slate-700">B.ECOMODE THERMOLITE / PSF</label>
          <input
            type="text"
            className={`${topFieldClass}${errorClass(errors.form?.becomode)}`}
            style={errorStyle(errors.form?.becomode)}
            value={form.becomode}
            onChange={(e) => handleFormChange("becomode", e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5 min-w-0">
          <label className="text-[14px] font-semibold text-slate-700">Date</label>
          <input
            type="date"
            className={`${topFieldClass}${errorClass(errors.form?.date)}`}
            style={errorStyle(errors.form?.date)}
            value={form.date}
            onChange={(e) => handleFormChange("date", e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5 min-w-0">
          <label className="text-[14px] font-semibold text-slate-700">Count Name</label>
          <input
            type="text"
            className={`${topFieldClass}${errorClass(errors.form?.countName)}`}
            style={errorStyle(errors.form?.countName)}
            value={form.countName}
            onChange={(e) => handleFormChange("countName", e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5 min-w-0">
          <label className="text-[14px] font-semibold text-slate-700">Time</label>
          <input
            type="time"
            step="1"
            className={`${topFieldClass}${errorClass(errors.form?.time)}`}
            style={errorStyle(errors.form?.time)}
            value={form.time}
            onChange={(e) => handleFormChange("time", e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5 min-w-0">
          <label className="text-[14px] font-semibold text-slate-700">Trial Name / ID</label>
          <input
            type="text"
            className={`${topFieldClass}${errorClass(errors.form?.trialName)}`}
            style={errorStyle(errors.form?.trialName)}
            value={form.trialName}
            onChange={(e) => handleFormChange("trialName", e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5 min-w-0">
          <label className="text-[14px] font-semibold text-slate-700">Type</label>
          <select
            className={`${topFieldClass}${errorClass(errors.form?.reportType)}`}
            style={errorStyle(errors.form?.reportType)}
            value={form.reportType}
            onChange={(e) => handleFormChange("reportType", e.target.value)}
          >
            <option value="">Select</option>
            {reportTypeOptions
              .filter((option) => option)
              .map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5 min-w-0">
          <label className="text-[14px] font-semibold text-slate-700">Nature</label>
          <input
            type="text"
            className={`${topFieldClass}${errorClass(errors.form?.nature)}`}
            style={errorStyle(errors.form?.nature)}
            value={form.nature}
            onChange={(e) => handleFormChange("nature", e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5 min-w-0">
          <label className="text-[14px] font-semibold text-slate-700">Unit No.</label>
          <input
            type="text"
            className={`${topFieldClass}${errorClass(errors.form?.unitNo)}`}
            style={errorStyle(errors.form?.unitNo)}
            value={form.unitNo}
            onChange={(e) => handleFormChange("unitNo", e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5 min-w-0">
          <label className="text-[14px] font-semibold text-slate-700">Raw Material</label>
          <input
            type="text"
            className={`${topFieldClass}${errorClass(errors.form?.rawMaterial)}`}
            style={errorStyle(errors.form?.rawMaterial)}
            value={form.rawMaterial}
            onChange={(e) => handleFormChange("rawMaterial", e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5 min-w-0">
          <label className="text-[14px] font-semibold text-slate-700">Mixing</label>
          <input
            type="text"
            className={`${topFieldClass}${errorClass(errors.form?.mixing)}`}
            style={errorStyle(errors.form?.mixing)}
            value={form.mixing}
            onChange={(e) => handleFormChange("mixing", e.target.value)}
          />
        </div>

        <div className="col-span-2 flex flex-col gap-1.5 min-w-0">
          <label className="text-[14px] font-semibold text-slate-700">Yarn Results</label>
          <textarea
            className={`w-full min-h-[58px] px-3 py-2 border border-slate-200 rounded-lg bg-slate-100 text-[14px] focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-colors resize-none${errorClass(errors.form?.yarnResults)}`}
            style={errorStyle(errors.form?.yarnResults)}
            value={form.yarnResults}
            onChange={(e) => handleFormChange("yarnResults", e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <h3 className="m-0 text-[14px] font-bold text-slate-900">Cuts and Imperfection Parameters</h3>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
          <div className="grid grid-cols-3 gap-[18px]">
            {[
              ["Total Cuts", "totalCuts"],
              ["Neps Cuts", "nepsCuts"],
              ["Short Cuts", "shortCuts"],
              ["Long Cuts", "longCuts"],
              ["Thin Cuts", "thinCuts"],
            ].map(([label, field]) => (
              <div key={field} className="flex flex-col gap-1.5">
                <label className="text-[14px] font-semibold text-slate-700">{label}</label>
                <input
                  type="text"
                  className={`${whiteFieldClass}${errorClass(errors.form?.[field])}`}
                  style={errorStyle(errors.form?.[field])}
                  value={form[field]}
                  onChange={(e) => handleFormChange(field, e.target.value)}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-5">
        {qualityParameterRows.map((row, rowIndex) => (
          <div
            key={row.join("-")}
            className={`grid gap-[18px] ${row.length === 5 ? "grid-cols-5" : row.length === 4 ? "grid-cols-4" : "grid-cols-3"}`}
          >
            {row.map((label) => (
              <div key={label} className="flex flex-col gap-1.5 min-w-0">
                <label className="text-[14px] font-semibold text-slate-700">{label}</label>
                <input
                  type="text"
                  className={`${topFieldClass}${errorClass(errors.qp?.[label])}`}
                  style={errorStyle(errors.qp?.[label])}
                  value={qualityParameters[label]}
                  onChange={(e) => handleQualityParameterChange(label, e.target.value)}
                />
              </div>
            ))}
            {rowIndex === qualityParameterRows.length - 1 && row.length === 3 ? null : null}
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-4">
        <h3 className="m-0 text-[14px] font-bold text-slate-900">Uster Tester Parameters</h3>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
          <div className="grid grid-cols-3 gap-[18px]">
            {[
              ["uster ID", "usterId"],
              ["U%", "uPercent"],
              ["CVM", "cvm"],
              ["CVM cv%", "cvmCvPercent"],
              ["CVM 10 mtr", "cvmTenMtr"],
              ["DR 1.5m", "drOnePointFive"],
            ].map(([label, field]) => (
              <div key={field} className="flex flex-col gap-1.5">
                <label className="text-[14px] font-semibold text-slate-700">{label}</label>
                <input
                  type="text"
                  className={`${whiteFieldClass}${errorClass(errors.form?.[field])}`}
                  style={errorStyle(errors.form?.[field])}
                  value={form[field]}
                  onChange={(e) => handleFormChange(field, e.target.value)}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-5">
        <h3 className="m-0 text-[14px] font-bold text-slate-900">IPI Parameters</h3>

        <div className="flex flex-col gap-3">
          <div className="text-[14px] font-bold text-slate-600">REGULAR IPI</div>
          <div className="grid grid-cols-4 gap-[18px]">
            {[
              ["Thin -50%", "thinMinus50"],
              ["Thick +50%", "thickPlus50"],
              ["Neps +200%", "nepsPlus200"],
            ].map(([label, field]) => (
              <div key={field} className="flex flex-col gap-1.5">
                <label className="text-[14px] font-semibold text-slate-700">{label}</label>
                <input
                  type="text"
                  className={`${topFieldClass}${errorClass(errors.form?.[field])}`}
                  style={errorStyle(errors.form?.[field])}
                  value={form[field]}
                  onChange={(e) => handleFormChange(field, e.target.value)}
                />
              </div>
            ))}
            <div className="flex flex-col gap-1.5">
              <label className="text-[14px] font-semibold text-slate-700">Total (Regular)</label>
              <input type="text" className={topFieldClass} value={regularTotal} readOnly />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="text-[14px] font-bold text-slate-600">HIGHER SENSITIVE IPI</div>
          <div className="grid grid-cols-4 gap-[18px]">
            {[
              ["Thin -40%", "thinMinus40"],
              ["Thick +35%", "thickPlus35"],
              ["Neps +140%", "nepsPlus140"],
            ].map(([label, field]) => (
              <div key={field} className="flex flex-col gap-1.5">
                <label className="text-[14px] font-semibold text-slate-700">{label}</label>
                <input
                  type="text"
                  className={`${topFieldClass}${errorClass(errors.form?.[field])}`}
                  style={errorStyle(errors.form?.[field])}
                  value={form[field]}
                  onChange={(e) => handleFormChange(field, e.target.value)}
                />
              </div>
            ))}
            <div className="flex flex-col gap-1.5">
              <label className="text-[14px] font-semibold text-slate-700">Total (HS)</label>
              <input type="text" className={topFieldClass} value={higherSensitiveTotal} readOnly />
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <h3 className="m-0 text-[14px] font-bold text-slate-900">Other IPI / Final values</h3>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
          <div className="grid grid-cols-3 gap-[18px]">
            {[
              ["Thin -30%", "thinMinus30"],
              ["Count", "count"],
              ["CSP", "csp"],
            ].map(([label, field]) => (
              <div key={field} className="flex flex-col gap-1.5">
                <label className="text-[14px] font-semibold text-slate-700">{label}</label>
                <input
                  type="text"
                  className={`${whiteFieldClass}${errorClass(errors.form?.[field])}`}
                  style={errorStyle(errors.form?.[field])}
                  value={form[field]}
                  onChange={(e) => handleFormChange(field, e.target.value)}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
});

export default SMXBreaksStudyReport;
