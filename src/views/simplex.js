import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { MdOutlineEditNote } from "react-icons/md";
import { useDispatch, useSelector } from "react-redux";

import Footer from "@/components/Footer";
import PreviewModal from "@/components/PreviewModal";
import SuccessModal from "@/components/SuccessModal";
import ProcessParameterDataEntry from "@/views/simplex/processParameterDataEntry";
import SMXCotsChangeDataEntry from "@/views/simplex/SMXCotsChangeDataEntry";
import SMXBreaksStudyReport from "@/views/simplex/SMXBreaksStudyReport";
import UPercentDataEntry from "@/views/simplex/u%dataentry";
import {
  clearSimplexState,
  getSimplexCotsChangeEntries,
  getSimplexUqcEntries,
} from "@/store/slices/simplex";
import { filterOptionsByDepartmentAccess } from "@/utils/screenAccess";
const simplexTypes = [
  { id: 0, name: "Process Parameter", aliases: ["Process Parameter", "Process Parameter Data Entry"], component: ProcessParameterDataEntry },
  { id: 1, name: "SMXCots Change Data Entry", aliases: ["SMXCots Change Data Entry", "SMX Cots Change Data Entry"], component: SMXCotsChangeDataEntry },
  { id: 2, name: "SMX Breaks Study Report", aliases: ["SMX Breaks Study Report", "Breaks Study Report"], component: SMXBreaksStudyReport },
   { id: 3, name: "U% Data Entry", aliases: ["U% Data Entry", "U Percent Data Entry", "U% Checking"], component: UPercentDataEntry },
];

export const SIMPLEX_INPUT_SCREEN_COUNT = simplexTypes.length;

function Simplex() {
  const router = useRouter();
  const dispatch = useDispatch();
  const childRef = useRef(null);
  const user = useSelector((state) => state.auth?.user);
  const accessByDepartment = useSelector((state) => state.auth?.accessByDepartment);
  const typeOptions = useMemo(
    () =>
      filterOptionsByDepartmentAccess(
        simplexTypes,
        accessByDepartment,
        user,
        "Simplex"
      ),
    [accessByDepartment, user]
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
  const SelectedComponent = selectedType?.component ?? null;

  useEffect(() => {
    if (!typeOptions.some((item) => item.name === selectedTypeName)) {
      setSelectedTypeName(typeOptions[0]?.name || "");
    }
  }, [selectedTypeName, typeOptions]);

  useEffect(() => {
    if (selectedTypeName === "U% Data Entry") {
      dispatch(getSimplexUqcEntries({ page: 1, limit: 10 }));
    }
    if (selectedTypeName === "SMXCots Change Data Entry") {
      dispatch(getSimplexCotsChangeEntries({ page: 1, limit: 10 }));
    }
  }, [dispatch, selectedTypeName]);

  const openPreview = () => {
    const valid = childRef.current?.validate ? childRef.current.validate() : true;
    if (valid === false) {
      setValidationMessage("Please fill all required fields before saving.");
      return;
    }
    setValidationMessage("");
    const items = childRef.current?.getPreviewData ? childRef.current.getPreviewData() : [];
    setPreviewItems(items);
    setShowPreview(true);
  };

  const confirmSubmit = async () => {
    setShowPreview(false);
    const ok = await childRef.current?.submit?.();
    if (ok) {
      setShowSuccess(true);
    }
  };

  const showUqcEntries = selectedTypeName === "U% Data Entry";
  const showCotsChangeEntries = selectedTypeName === "SMXCots Change Data Entry";

  return (
    <div className="min-h-screen bg-slate-50 flex justify-center">
      <div className="w-full max-w-7xl pt-8 px-4 pb-8">
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-3">
          <button type="button" className="transition-colors hover:text-[#3d539f]" onClick={() => router.push("/")}>
            Home
          </button>
          <span>&rsaquo;</span>
          <button
            type="button"
            className="transition-colors hover:text-[#3d539f]"
            onClick={() => router.push("/departments")}
          >
            Dashboard
          </button>
          <span>&rsaquo;</span>
          <button
            type="button"
            className="transition-colors hover:text-[#3d539f]"
            onClick={() => router.push("/departments/quality-control")}
          >
            Quality Control
          </button>
          <span>&rsaquo;</span>
          <span className="text-slate-900 font-semibold">Simplex Notebook QC</span>
        </div>

        <div className="mb-5">
          <h1 className="text-[24px] font-extrabold text-slate-900 m-0">
            Quality Control - Simplex Notebook
          </h1>
          <p className="text-[14px] text-slate-500 mt-1.5 mb-0">
            Record and manage industrial machine quality inspections.
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="p-5">
            {selectedTypeName !== "Process Parameter" ? (
              <>
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-[#3d539f] text-xl leading-none">
                    <MdOutlineEditNote />
                  </span>
                  <span className="text-[18px] font-bold text-slate-900">Inspection Data Entry</span>
                </div>
                <div className="mb-6 h-px bg-slate-100" />
              </>
            ) : null}
   
 






  
            {SelectedComponent ? (
              <SelectedComponent
                key={selectedTypeName}
                ref={childRef}
                selectedTypeName={selectedTypeName}
                onTypeChange={setSelectedTypeName}
                typeOptions={typeOptions.map((type) => type.name)}
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
              background: "#fff",
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
                color: "#333",
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
              <thead style={{ backgroundColor: "#f4f6f8" }}>
                <tr>
                  {[
                    "Date",
                    "Shift",
                    "Variety",
                    "Department",
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
                        color: "#444",
                        borderBottom: "2px solid #e0e0e0",
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
                      colSpan={10}
                      style={{ padding: "16px", textAlign: "center", color: "#64748b" }}
                    >
                      Loading entries...
                    </td>
                  </tr>
                ) : uqcEntries.length ? uqcEntries.map((entry, i) => (
                  <tr
                    key={entry.id || i}
                    style={{
                      backgroundColor: i % 2 === 0 ? "#fff" : "#fafafa",
                    }}
                  >
                    {[
                      entry.entry_date
                        ? new Date(entry.entry_date).toLocaleDateString("en-GB")
                        : "-",
                      entry.shift || "-",
                      entry.variety || "-",
                      entry.department || "-",
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
                          borderBottom: "1px solid #eaeaea",
                          color: idx === 5 ? "#1976d2" : "#555",
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
                      colSpan={10}
                      style={{ padding: "16px", textAlign: "center", color: "#64748b" }}
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
              background: "#fff",
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
                color: "#333",
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
              <thead style={{ backgroundColor: "#f4f6f8" }}>
                <tr>
                  {["Type", "S. No.", "Date", "MC Name", "Created At"].map((head) => (
                    <th
                      key={head}
                      style={{
                        padding: "12px 10px",
                        textAlign: "left",
                        fontWeight: "600",
                        color: "#444",
                        borderBottom: "2px solid #e0e0e0",
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
                      colSpan={5}
                      style={{ padding: "16px", textAlign: "center", color: "#64748b" }}
                    >
                      Loading entries...
                    </td>
                  </tr>
                ) : cotsChangeEntries.length ? (
                  cotsChangeEntries.map((entry, i) => (
                    <tr
                      key={entry.id || i}
                      style={{
                        backgroundColor: i % 2 === 0 ? "#fff" : "#fafafa",
                      }}
                    >
                      {[
                        entry.type || "-",
                        entry.s_no || "-",
                        entry.entry_date
                          ? new Date(entry.entry_date).toLocaleDateString("en-GB")
                          : "-",
                        entry.machine_name || "-",
                        entry.created_at
                          ? new Date(entry.created_at).toLocaleString("en-GB")
                          : "-",
                      ].map((cell, idx) => (
                        <td
                          key={idx}
                          style={{
                            padding: "10px",
                            borderBottom: "1px solid #eaeaea",
                            color: "#555",
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
                      colSpan={5}
                      style={{ padding: "16px", textAlign: "center", color: "#64748b" }}
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
        onClose={() => {
          setShowSuccess(false);
          setValidationMessage("");
          childRef.current?.clear?.();
          dispatch(clearSimplexState());
          if (selectedTypeName === "U% Data Entry") {
            dispatch(getSimplexUqcEntries({ page: 1, limit: 10 }));
          }
          if (selectedTypeName === "SMXCots Change Data Entry") {
            dispatch(getSimplexCotsChangeEntries({ page: 1, limit: 10 }));
          }
        }}
      />
    </div>
  );
}

export default Simplex;
