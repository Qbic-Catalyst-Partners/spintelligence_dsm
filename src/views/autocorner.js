import React, { useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { MdOutlineEditNote } from "react-icons/md";

import Footer from "@/components/Footer";
import ConePackingAudit from "@/views/autocorner/ConePackingAudit";
import PreviewModal from "@/components/PreviewModal";
import ConeDensity from "@/views/autocorner/ConeDensity";
import RewindingStudy from "@/views/autocorner/RewindingStudy";
import styles from "@/styles/autocorner.module.css";

const autoconerTypes = [
  { id: 1, name: "Rewinding Study", component: RewindingStudy },
  { id: 2, name: "Cone Density", component: ConeDensity },
  { id: 3, name: "Cone Packing Audit", component: ConePackingAudit },
];

export const AUTOCORNER_INPUT_SCREEN_COUNT = autoconerTypes.length;

function Autocorner() {
  const router = useRouter();
  const childRef = useRef(null);
  const [selectedTypeName, setSelectedTypeName] = useState(autoconerTypes[0].name);
  const [showPreview, setShowPreview] = useState(false);
  const [previewItems, setPreviewItems] = useState([]);

  const selectedType = useMemo(
    () => autoconerTypes.find((item) => item.name === selectedTypeName),
    [selectedTypeName]
  );

  const SelectedComponent = selectedType?.component ?? RewindingStudy;

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
    <div className={styles.page}>
      <main className={styles.container}>
        <div className={styles.breadcrumbs}>
          <button type="button" onClick={() => router.push("/")}>
            Home
          </button>
          <span>&rsaquo;</span>
          <button type="button" onClick={() => router.push("/dashboard")}>
            Dashboard
          </button>
          <span>&rsaquo;</span>
          <button type="button" onClick={() => router.push("/departments/quality-control")}>
            Quality Control
          </button>
          <span>&rsaquo;</span>
          <span className={styles.active}>Autoconer QC</span>
        </div>

        <div className={styles.header}>
          <h1>Quality Control - Autoconer Notebook</h1>
          <p>Record and manage industrial machine quality inspections.</p>
        </div>

        <div className={styles.shell}>
          <div className={styles.formBody}>
            <div className={styles.formTitle}>
              <MdOutlineEditNote />
              <h3>Inspection Data Entry</h3>
            </div>

            <SelectedComponent
              ref={childRef}
              selectedTypeName={selectedTypeName}
              onTypeChange={setSelectedTypeName}
              typeOptions={autoconerTypes.map((type) => type.name)}
              tablePortalTargetId="autocorner-rewinding-table-slot"
            />
          </div>

          <Footer
            onBack={() => router.push("/dashboard")}
            onClear={() => childRef.current?.clear?.()}
            onSave={openPreview}
            saveLabel="Save Record"
          />
        </div>

        <div id="autocorner-rewinding-table-slot" className={styles.tableSlot} />
      </main>

      <PreviewModal
        open={showPreview}
        title="Quality Control - Autoconer Notebook"
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

export default Autocorner;
