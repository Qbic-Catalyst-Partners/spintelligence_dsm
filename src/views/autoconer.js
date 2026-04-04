import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { MdOutlineEditNote } from "react-icons/md";

import Footer from "@/components/Footer";
import ConePackingAudit from "@/views/autoconer/ConePackingAudit";
import PreviewModal from "@/components/PreviewModal";
import ConeDensity from "@/views/autoconer/ConeDensity";
import RewindingStudy from "@/views/autoconer/RewindingStudy";
import LycraChecking from "@/views/autoconer/LycraChecking";
import CoastWasteCrateRecord from "@/views/autoconer/countwise";
import DrumWiseAppearance from "@/views/autoconer/DrumWiseAppearance";
import SpliceStrength from "@/views/autoconer/SpliceStrength";
import styles from "@/styles/autoconer.module.css";

const autoconerTypes = [
  { id: 1, name: "Rewinding Study", component: RewindingStudy },
  { id: 2, name: "Cone Density", component: ConeDensity },
  { id: 3, name: "Cone Packing Audit", component: ConePackingAudit },
  { id: 4, name: "Lycra Checking", component: LycraChecking },
  { id: 5, name: "Count wise cuts Record", component: CoastWasteCrateRecord },
  { id: 6, name: "Splice Strength", component: SpliceStrength },
  { id: 7, name: "Drum wise Appearance", component: DrumWiseAppearance },
];

export const AUTOCONER_INPUT_SCREEN_COUNT = autoconerTypes.length;

function Autoconer() {
  const router = useRouter();
  const childRef = useRef(null);
  const [checkingType, setCheckingType] = useState(autoconerTypes[0].name);
  const [showPreview, setShowPreview] = useState(false);
  const [previewItems, setPreviewItems] = useState([]);
  const selectedType = useMemo(
    () => autoconerTypes.find((item) => item.name === checkingType)?.name || "",
    [checkingType]
  );
  const SelectedComponent = useMemo(
    () => autoconerTypes.find((item) => item.name === checkingType)?.component || RewindingStudy,
    [checkingType]
  );

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

  const usesLegacyStandaloneLayout =
    selectedType === "Splice Strength" || selectedType === "Drum wise Appearance";

  return (
    <div className={styles.page}>
      <div className={styles.container}>
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

        {usesLegacyStandaloneLayout ? (
          <SelectedComponent
            types={autoconerTypes}
            selectedType={selectedType}
            onTypeChange={setCheckingType}
            onRegisterActions={() => {}}
          />
        ) : (
          <div className={styles.shell}>
            <div className={styles.formBody}>
              <div className={styles.formTitle}>
                <MdOutlineEditNote />
                <h3>Inspection Data Entry</h3>
              </div>

              <SelectedComponent
                ref={childRef}
                selectedTypeName={selectedType}
                selectedType={selectedType}
                onTypeChange={setCheckingType}
                types={autoconerTypes}
                typeOptions={autoconerTypes.map((type) => type.name)}
                tablePortalTargetId="autoconer-table-slot"
              />
            </div>

            <Footer
              onBack={() => router.push("/dashboard")}
              onClear={() => childRef.current?.clear?.()}
              onSave={openPreview}
              saveLabel="Save Record"
            />
          </div>
        )}

        {!usesLegacyStandaloneLayout && <div id="autoconer-table-slot" className={styles.tableSlot} />}
      </div>

      <PreviewModal
        open={showPreview}
        title="Quality Control - Autoconer Notebook"
        subtitle="Preview"
        items={previewItems}
        typeValue={selectedType}
        onCancel={() => setShowPreview(false)}
        onConfirm={confirmSubmit}
        confirmLabel="Submit"
      />
    </div>
  );
}

export default Autoconer;
