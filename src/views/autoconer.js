import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { MdEditNote } from "react-icons/md";

import Footer from "@/components/Footer";
import LycraChecking from "@/views/autoconer/LycraChecking";
import CoastWasteCrateRecord from "@/views/autoconer/countwise";
import DrumWiseAppearance from "@/views/autoconer/DrumWiseAppearance";
import SpliceStrength from "@/views/autoconer/SpliceStrength";
import styles from "@/styles/autoconer.module.css";

const autoconerTypes = [
  { id: 1, name: "Lycra Checking", component: LycraChecking },
  { id: 2, name: "Count wise cuts Record", component: CoastWasteCrateRecord },
  { id: 3, name: "Splice Strength", component: SpliceStrength },
  { id: 4, name: "Drum wise Appearance", component: DrumWiseAppearance },
];

function Autoconer() {
  const router = useRouter();
  const [checkingType, setCheckingType] = useState(autoconerTypes[0].name);
  const [footerActions, setFooterActions] = useState({
    onSave: () => {},
    onClear: () => {},
    saveLabel: "Save Record",
    disabled: false,
  });
  const selectedType = useMemo(
    () => autoconerTypes.find((item) => item.name === checkingType)?.name || "",
    [checkingType]
  );
  const SelectedComponent = useMemo(
    () => autoconerTypes.find((item) => item.name === checkingType)?.component || LycraChecking,
    [checkingType]
  );

  useEffect(() => {
    setFooterActions({
      onSave: () => {},
      onClear: () => {},
      saveLabel: "Save Record",
      disabled: false,
    });
  }, [selectedType]);

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
          <span className={styles.active}>{selectedType || "Autoconer QC"}</span>
        </div>

        <div className={styles.header}>
          <h1>Quality Control - Autoconer Notebook</h1>
          <p>Record and manage industrial machine quality inspections.</p>
        </div>

        {selectedType === "Splice Strength" || selectedType === "Drum wise Appearance" ? (
          <SelectedComponent
            types={autoconerTypes}
            selectedType={selectedType}
            onTypeChange={setCheckingType}
            onRegisterActions={setFooterActions}
          />
        ) : (
          <div className={styles.shell}>
            <div className={styles.formTitle}>
              <MdEditNote />
              <h3>Inspection Data Entry</h3>
            </div>

            <SelectedComponent
              types={autoconerTypes}
              selectedType={selectedType}
              onTypeChange={setCheckingType}
              onRegisterActions={setFooterActions}
            />
          </div>
        )}

        {selectedType !== "Splice Strength" && selectedType !== "Drum wise Appearance" && (
          <Footer
            onBack={() => router.push("/dashboard")}
            onClear={footerActions.onClear}
            onSave={footerActions.onSave}
            saveLabel={footerActions.saveLabel}
            disabled={footerActions.disabled}
          />
        )}
      </div>
    </div>
  );
}

export default Autoconer;
