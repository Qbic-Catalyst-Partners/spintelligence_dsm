import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { MdOutlineEditNote } from "react-icons/md";
import { useDispatch, useSelector } from "react-redux";

import Footer from "@/components/Footer";
import PreviewModal from "@/components/PreviewModal";
import SMXCotsChangeDataEntry from "@/views/simplex/SMXCotsChangeDataEntry";
import SMXBreaksStudyReport from "@/views/simplex/SMXBreaksStudyReport";
import UPercentDataEntry from "@/views/simplex/u%dataentry";
import { getSimplexUqcEntries } from "@/store/slices/simplex";
const simplexTypes = [
  { id: 1, name: "SMXCots Change Data Entry", component: SMXCotsChangeDataEntry },
  { id: 2, name: "SMX Breaks Study Report", component: SMXBreaksStudyReport },
   { id: 3, name: "U% Data Entry", component: UPercentDataEntry },
];

function Simplex() {
  const router = useRouter();
  const dispatch = useDispatch();
  const childRef = useRef(null);
  const [selectedTypeName, setSelectedTypeName] = useState("SMXCots Change Data Entry");
  const [showPreview, setShowPreview] = useState(false);
  const [previewItems, setPreviewItems] = useState([]);
  const { uqcEntries = [], listLoading } = useSelector((state) => state.simplex ?? {});

  const selectedType = useMemo(
    () => simplexTypes.find((item) => item.name === selectedTypeName),
    [selectedTypeName]
  );
  const SelectedComponent = selectedType?.component ?? SMXCotsChangeDataEntry;

  useEffect(() => {
    if (selectedTypeName === "U% Data Entry") {
      dispatch(getSimplexUqcEntries({ page: 1, limit: 10 }));
    }
  }, [dispatch, selectedTypeName]);

  const openPreview = () => {
    const valid = childRef.current?.validate ? childRef.current.validate() : true;
    if (valid === false) return;
    const items = childRef.current?.getPreviewData ? childRef.current.getPreviewData() : [];
    setPreviewItems(items);
    setShowPreview(true);
  };

  const confirmSubmit = async () => {
    setShowPreview(false);
    await childRef.current?.submit?.();
  };

  const showLastTenEntries = selectedTypeName === "U% Data Entry";

  return (
    <div className="min-h-screen bg-slate-50 flex justify-center">
      <div className="w-full max-w-5xl pt-8 px-4 pb-8">
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-3">
          <button type="button" className="transition-colors hover:text-[#3d539f]" onClick={() => router.push("/")}>
            Home
          </button>
          <span>&rsaquo;</span>
          <button
            type="button"
            className="transition-colors hover:text-[#3d539f]"
            onClick={() => router.push("/dashboard")}
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
            <div className="flex items-center gap-2 mb-4">
              <span className="text-[#3d539f] text-xl leading-none">
                <MdOutlineEditNote />
              </span>
              <span className="text-[18px] font-bold text-slate-900">Inspection Data Entry</span>
            </div>
   
   <div className="mb-4">
  <label className="block text-sm font-medium text-slate-700 mb-1">
    Type
  </label>

  <select
    value={selectedTypeName}
    onChange={(e) => setSelectedTypeName(e.target.value)}
    className="w-full h-[38px] px-3 py-2 border border-slate-200 rounded-lg bg-slate-100 text-[14px] focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-colors"
  >
    {simplexTypes.map((type) => (
      <option key={type.id} value={type.name}>
        {type.name}
      </option>
    ))}
  </select>
</div>

















  
           <SelectedComponent
  key={selectedTypeName}
  ref={childRef}
  selectedTypeName={selectedTypeName}
  onTypeChange={setSelectedTypeName}
  typeOptions={simplexTypes.map((type) => type.name)}
/>
          </div>

          <Footer
            onBack={() => router.push("/dashboard")}
            onClear={() => childRef.current?.clear()}
            onSave={openPreview}
            saveLabel="Save Record"
          />
        </div>

        {showLastTenEntries && (
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
    </div>
  );
}

export default Simplex;
