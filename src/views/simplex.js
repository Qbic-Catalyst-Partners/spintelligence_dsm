import React, { useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { MdOutlineEditNote } from "react-icons/md";

import Footer from "@/components/Footer";
import PreviewModal from "@/components/PreviewModal";
import SMXCotsChangeDataEntry from "@/views/simplex/SMXCotsChangeDataEntry";
import SMXBreaksStudyReport from "@/views/simplex/SMXBreaksStudyReport";

const simplexTypes = [
  { id: 1, name: "SMXCots Change Data Entry", component: SMXCotsChangeDataEntry },
  { id: 2, name: "SMX Breaks Study Report", component: SMXBreaksStudyReport },
];

function Simplex() {
  const router = useRouter();
  const childRef = useRef(null);
  const [selectedTypeName, setSelectedTypeName] = useState("SMXCots Change Data Entry");
  const [showPreview, setShowPreview] = useState(false);
  const [previewItems, setPreviewItems] = useState([]);

  const selectedType = useMemo(
    () => simplexTypes.find((item) => item.name === selectedTypeName),
    [selectedTypeName]
  );
  const SelectedComponent = selectedType?.component ?? SMXCotsChangeDataEntry;

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

            <SelectedComponent
              ref={childRef}
              selectedTypeName={selectedTypeName}
              onTypeChange={setSelectedTypeName}
            />
          </div>

          <Footer
            onBack={() => router.push("/dashboard")}
            onClear={() => childRef.current?.clear()}
            onSave={openPreview}
            saveLabel="Save Record"
          />
        </div>
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
