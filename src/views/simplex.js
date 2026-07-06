import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { MdOutlineEditNote } from "react-icons/md";
import { useDispatch, useSelector } from "react-redux";

import Footer from "@/components/Footer";
import InputScreenUploadButton from "@/components/InputScreenUploadButton";
import PdfOcrTableEntry from "@/components/PdfOcrTableEntry";
import PreviewModal from "@/components/PreviewModal";
import SuccessModal from "@/components/SuccessModal";
import ProcessParameterDataEntry from "@/views/simplex/processParameterDataEntry";
import SMXCotsChangeDataEntry from "@/views/simplex/SMXCotsChangeDataEntry";
import SMXBreaksStudyReport from "@/views/simplex/SMXBreaksStudyReport";
import WheelChange from "@/views/simplex/WheelChange";
import UPercentDataEntry from "@/views/simplex/u%dataentry";
import {
  clearSimplexState,
  getSimplexCotsChangeEntries,
  getSimplexUqcEntries,
} from "@/store/slices/simplex";
import { filterOptionsByDepartmentAccess } from "@/utils/screenAccess";
import { recordSubmittedNotebook } from "@/utils/submittedNotebookRecorder";
import useDatabaseEntryId from "@/hooks/useDatabaseEntryId";
import { useThemeMode } from "@/utils/useThemeMode";
const simplexTypes = [
  { id: 0, name: "Process Parameter", aliases: ["Process Parameter", "Process Parameter Data Entry"], component: ProcessParameterDataEntry },
  { id: 1, name: "SMXCots Change Data Entry", aliases: ["SMXCots Change Data Entry", "SMX Cots Change Data Entry"], component: SMXCotsChangeDataEntry },
  { id: 2, name: "SMX Breaks Study Report", aliases: ["SMX Breaks Study Report", "Breaks Study Report"], component: SMXBreaksStudyReport },
  { id: 3, name: "U% Data Entry", aliases: ["U% Data Entry", "U Percent Data Entry", "U% Checking"], component: UPercentDataEntry },
  { id: 4, name: "Wheel Change", aliases: ["Wheel Change", "WheelChange"], component: WheelChange },
  { id: 5, name: "Stretch %", aliases: ["Stretch %", "Stretch Percent", "Stretch Percentage"] },
];

export const SIMPLEX_INPUT_SCREEN_COUNT = simplexTypes.length;
const SIMPLEX_ENTRY_ID_CONFIG = {
  "Process Parameter": { prefix: "SPP", width: 4, routePath: "/simplex/process_parameter" },
  "SMXCots Change Data Entry": { prefix: "SCC", width: 4, routePath: "/simplex/SMXCotsChange" },
  "SMX Breaks Study Report": { prefix: "SBS", width: 4, routePath: "/simplex/study" },
  "U% Data Entry": { prefix: "SUP", width: 4, routePath: "/simplex/uqc" },
  "Wheel Change": { prefix: "SWC", width: 4, routePath: "/simplex/wheel-change", fetchPath: "/simplex/notebook" },
  "Stretch %": { prefix: "STP", width: 4, routePath: "/simplex/stretch-percent" },
  "Wrapping Simplex Notebook": { prefix: "WSX" },
};

const getSimplexEntryConfig = (typeName) =>
  SIMPLEX_ENTRY_ID_CONFIG[typeName] || { prefix: "SIM" };
const normalizeTypeName = (value = "") => String(value).trim().toLowerCase();
const formatTimeHM = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
};
const getEntryCreatedTime = (entry = {}) =>
  entry?.created_at ||
  entry?.createdAt ||
  entry?.created_time ||
  entry?.createdTime ||
  entry?.created_on ||
  entry?.createdOn ||
  entry?.updated_at ||
  entry?.updatedAt ||
  Object.entries(entry || {}).find(([key, value]) => {
    if (!value) return false;
    const normalizedKey = String(key || "").toLowerCase();
    if (!/(created|updated|time|date)/.test(normalizedKey)) return false;
    return !Number.isNaN(new Date(value).getTime());
  })?.[1] ||
  "";

function Simplex() {
  const currentDateLabel = new Date().toLocaleDateString("en-IN");
  const router = useRouter();
  const dispatch = useDispatch();
  const childRef = useRef(null);
  const submitInProgressRef = useRef(false);
  const successHandledRef = useRef(false);
  const { isDarkMode } = useThemeMode();
  const user = useSelector((state) => state.auth?.user);
  const accessByDepartment = useSelector((state) => state.auth?.accessByDepartment);
  const requestedType = Array.isArray(router.query.type) ? router.query.type[0] : router.query.type;
  const isProcessParameterRequest = normalizeTypeName(requestedType) === "process parameter";
  const fullTypeOptions = useMemo(
    () =>
      filterOptionsByDepartmentAccess(
        simplexTypes,
        accessByDepartment,
        user,
        "Simplex"
      ),
    [accessByDepartment, user]
  );
  const typeOptions = useMemo(
    () => isProcessParameterRequest
      ? fullTypeOptions
      : fullTypeOptions.filter((item) => item.name !== "Process Parameter"),
    [fullTypeOptions, isProcessParameterRequest]
  );
  const [selectedTypeName, setSelectedTypeName] = useState(typeOptions[0]?.name || "");
  const [showPreview, setShowPreview] = useState(false);
  const [previewItems, setPreviewItems] = useState([]);
  const [showSuccess, setShowSuccess] = useState(false);
  const [validationMessage, setValidationMessage] = useState("");
  const { uqcEntries = [], cotsChangeEntries = [], listLoading } = useSelector(
    (state) => state.simplex ?? {}
  );

  const selectedType = useMemo(
    () => typeOptions.find((item) => item.name === selectedTypeName) || null,
    [selectedTypeName, typeOptions]
  );
  const { entryId, reserveEntryId, loading: entryIdLoading } = useDatabaseEntryId({
    department: "Simplex",
    typeName: selectedTypeName,
    config: getSimplexEntryConfig(selectedTypeName),
  });
  const SelectedComponent = selectedType?.component ?? null;
  const isStretchPercent = selectedTypeName === "Stretch %";
  const isWheelChange = selectedTypeName === "Wheel Change";
  const entryTableTheme = {
    surface: isDarkMode ? "#050505" : "#fff",
    header: isDarkMode ? "#3b3b3b" : "#f4f6f8",
    rowEven: isDarkMode ? "#3b3b3b" : "#fff",
    rowOdd: isDarkMode ? "#333333" : "#fafafa",
    border: isDarkMode ? "#3b3b3b" : "#e0e0e0",
    cellBorder: isDarkMode ? "#3b3b3b" : "#eaeaea",
    title: isDarkMode ? "#ffffff" : "#333",
    headText: isDarkMode ? "#ffffff" : "#444",
    text: isDarkMode ? "#ffffff" : "#555",
    muted: isDarkMode ? "#ffffff" : "#64748b",
    accent: isDarkMode ? "#93c5fd" : "#1976d2",
  };
  useEffect(() => {
    if (!typeOptions.some((item) => item.name === selectedTypeName)) {
      setSelectedTypeName(typeOptions[0]?.name || "");
    }
  }, [selectedTypeName, typeOptions]);

  useEffect(() => {
    if (!requestedType || !typeOptions.length) return;
    const requested = normalizeTypeName(requestedType);
    const matchedType = typeOptions.find((item) =>
      [item.name, ...(item.aliases || [])].map(normalizeTypeName).includes(requested)
    );
    if (matchedType && matchedType.name !== selectedTypeName) {
      setSelectedTypeName(matchedType.name);
    }
  }, [requestedType, selectedTypeName, typeOptions]);

  useEffect(() => {
    if (selectedTypeName === "U% Data Entry") {
      dispatch(getSimplexUqcEntries({ page: 1, limit: 10 }));
    }
    if (selectedTypeName === "SMXCots Change Data Entry") {
      dispatch(getSimplexCotsChangeEntries({ page: 1, limit: 10 }));
    }
  }, [dispatch, selectedTypeName]);

  const openPreview = () => {
    if (entryIdLoading || !entryId) {
      setValidationMessage("Entry ID is still loading. Please wait a moment and try again.");
      return;
    }
    const valid = childRef.current?.validate ? childRef.current.validate() : true;
    if (valid === false) {
      setValidationMessage("Please fill all required fields before saving.");
      return;
    }
    setValidationMessage("");
    const items = childRef.current?.getPreviewData ? childRef.current.getPreviewData() : [];
    setPreviewItems([
      { label: "Type", value: selectedTypeName || "-" },
      { label: "Entry ID", value: entryId || "-" },
      ...items,
    ]);
    setShowPreview(true);
  };

  const confirmSubmit = async () => {
    if (submitInProgressRef.current) return;
    submitInProgressRef.current = true;
    setShowPreview(false);
    try {
      if (entryIdLoading || !entryId) return;
      const ok = await childRef.current?.submit?.();
      if (ok) {
        if (successHandledRef.current) return;
        successHandledRef.current = true;
        await recordSubmittedNotebook({
          department: "Quality Control",
          subDepartment: "Simplex",
          notebookName: selectedTypeName,
          entryId,
          childRef,
          previewItems,
          user,
        });
        await reserveEntryId();
        setShowSuccess(true);
      }
    } finally {
      submitInProgressRef.current = false;
    }
  };

  const handleSuccessClose = () => {
    setShowSuccess(false);
    setValidationMessage("");
    childRef.current?.clear?.();
    dispatch(clearSimplexState());
    successHandledRef.current = false;
    if (selectedTypeName === "U% Data Entry") {
      dispatch(getSimplexUqcEntries({ page: 1, limit: 10 }));
    }
    if (selectedTypeName === "SMXCots Change Data Entry") {
      dispatch(getSimplexCotsChangeEntries({ page: 1, limit: 10 }));
    }
  };

  const showUqcEntries = selectedTypeName === "U% Data Entry";
  const showCotsChangeEntries = selectedTypeName === "SMXCots Change Data Entry";

  return (
    <div className="min-h-screen bg-slate-50 flex justify-center">
      <div className="w-full max-w-7xl pt-8 px-4 pb-8">
        <div className="mb-5">
          <h1 className="text-[24px] font-extrabold text-slate-900 m-0">
            Quality Control - Simplex Notebook
          </h1>
          <div className="mt-2 text-right text-base font-semibold text-slate-600">
            Current Date: {currentDateLabel}
          </div>
          <p className="text-[14px] text-slate-500 mt-1.5 mb-0">
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="p-5">
            {selectedTypeName !== "Process Parameter" && !isWheelChange ? (
              <>
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[#3d539f] text-xl leading-none">
                      <MdOutlineEditNote />
                    </span>
                    <span className="text-[18px] font-bold text-slate-900">Inspection Data Entry</span>
                  </div>
                  {selectedTypeName !== "Stretch %" ? <InputScreenUploadButton /> : null}
                </div>
                <div className="mb-6 h-px bg-slate-100" />
              </>
            ) : null}
   
 






  
            {isStretchPercent ? (
              <PdfOcrTableEntry
                ref={childRef}
                selectedType={selectedTypeName}
                onTypeChange={setSelectedTypeName}
                typeOptions={typeOptions}
                docType="strech"
                tableTitle="Stretch PDF Values"
                entryId={entryId}
                reserveEntryId={reserveEntryId}
              />
            ) : SelectedComponent ? (
              <SelectedComponent
                key={selectedTypeName}
                ref={childRef}
                selectedTypeName={selectedTypeName}
                onTypeChange={setSelectedTypeName}
                typeOptions={typeOptions.map((type) => type.name)}
                entryId={entryId}
                tablePortalTargetId="simplex-report-table-slot"
              />
            ) : (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                No accessible input screens are available for this department.
              </div>
            )}
          </div>

          {validationMessage ? (
            <div className="px-5 pb-4">
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm font-medium text-red-700">
                {validationMessage}
              </div>
            </div>
          ) : null}

          <Footer
            onBack={() => router.push("/departments/quality-control")}
            onClear={() => {
              setValidationMessage("");
              childRef.current?.clear();
            }}
            onSave={openPreview}
            saveLabel="Save Record"
          />
        </div>

        <div id="simplex-report-table-slot" className="mt-8" />

        {showUqcEntries && (
          <div
            style={{
              marginTop: "20px",
              background: entryTableTheme.surface,
              borderRadius: "10px",
              padding: "16px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
              overflowX: "auto",
            }}
          >
            <h3
              style={{
                marginBottom: "12px",
                fontSize: "18px",
                fontWeight: "600",
                color: entryTableTheme.title,
              }}
            >
              Last 10 Entries
            </h3>

            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "14px",
                minWidth: "900px",
              }}
            >
              <thead style={{ backgroundColor: entryTableTheme.header }}>
                <tr>
                {[
                    "Date",
                    "Shift",
                    "Variety",
                    "MC No.",
                    "U%",
                    "CVM",
                    "1mCVM",
                    "3mCVM",
                    "Remarks",
                  ].map((head) => (
                    <th
                      key={head}
                      style={{
                        padding: "12px 10px",
                        textAlign: "left",
                        fontWeight: "600",
                        color: entryTableTheme.headText,
                        borderBottom: `2px solid ${entryTableTheme.border}`,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {listLoading ? (
                  <tr>
                    <td
                      colSpan={9}
                      style={{ padding: "16px", textAlign: "center", color: entryTableTheme.muted }}
                    >
                      Loading entries...
                    </td>
                  </tr>
                ) : uqcEntries.length ? uqcEntries.map((entry, i) => (
                  <tr
                    key={entry.id || i}
                    style={{
                      backgroundColor: i % 2 === 0 ? entryTableTheme.rowEven : entryTableTheme.rowOdd,
                    }}
                  >
                    {[
                      entry.entry_date
                        ? new Date(entry.entry_date).toLocaleDateString("en-GB")
                        : "-",
                      entry.shift || "-",
                      entry.variety || "-",
                      entry.mc_no || "-",
                      entry.u_percent || "-",
                      entry.cvm || "-",
                      entry.cvm_1m || "-",
                      entry.cvm_3m || "-",
                      entry.remarks || "-",
                    ].map((cell, idx) => (
                      <td
                        key={idx}
                        style={{
                          padding: "10px",
                          borderBottom: `1px solid ${entryTableTheme.cellBorder}`,
                          color: idx === 5 ? entryTableTheme.accent : entryTableTheme.text,
                          fontWeight: idx === 5 ? "600" : "400",
                        }}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                )) : (
                  <tr>
                    <td
                      colSpan={9}
                      style={{ padding: "16px", textAlign: "center", color: entryTableTheme.muted }}
                    >
                      No entries found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {showCotsChangeEntries && (
          <div
            style={{
              marginTop: "20px",
              background: entryTableTheme.surface,
              borderRadius: "10px",
              padding: "16px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
              overflowX: "auto",
            }}
          >
            <h3
              style={{
                marginBottom: "12px",
                fontSize: "18px",
                fontWeight: "600",
                color: entryTableTheme.title,
              }}
            >
              Last 10 Entries
            </h3>

            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "14px",
                minWidth: "700px",
              }}
              >
              <thead style={{ backgroundColor: entryTableTheme.header }}>
                <tr>
                  {["Type", "Date", "MC Name", "Created Time"].map((head) => (
                    <th
                      key={head}
                      style={{
                        padding: "12px 10px",
                        textAlign: "left",
                        fontWeight: "600",
                        color: entryTableTheme.headText,
                        borderBottom: `2px solid ${entryTableTheme.border}`,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {listLoading ? (
                  <tr>
                    <td
                      colSpan={4}
                      style={{ padding: "16px", textAlign: "center", color: entryTableTheme.muted }}
                    >
                      Loading entries...
                    </td>
                  </tr>
                ) : cotsChangeEntries.length ? (
                  cotsChangeEntries.map((entry, i) => (
                    <tr
                      key={entry.id || i}
                      style={{
                        backgroundColor: i % 2 === 0 ? entryTableTheme.rowEven : entryTableTheme.rowOdd,
                      }}
                    >
                      {[
                        entry.type || "-",
                        entry.entry_date
                          ? new Date(entry.entry_date).toLocaleDateString("en-GB")
                          : "-",
                        entry.machine_name || "-",
                        formatTimeHM(getEntryCreatedTime(entry)),
                      ].map((cell, idx) => (
                        <td
                          key={idx}
                          style={{
                            padding: "10px",
                            borderBottom: `1px solid ${entryTableTheme.cellBorder}`,
                            color: entryTableTheme.text,
                          }}
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={4}
                      style={{ padding: "16px", textAlign: "center", color: entryTableTheme.muted }}
                    >
                      No entries found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <PreviewModal
        open={showPreview}
        title="Quality Control - Simplex Notebook"
        subtitle="Preview"
        items={previewItems}
        typeValue={selectedTypeName}
        onCancel={() => setShowPreview(false)}
        onConfirm={confirmSubmit}
        confirmLabel="Submit"
      />

      <SuccessModal
        open={showSuccess}
        message="Data Submitted"
        typeValue={selectedTypeName}
        onClose={handleSuccessClose}
        closeLabel="OK"
      />
    </div>
  );
}

export default Simplex;
