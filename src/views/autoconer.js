import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { MdOutlineEditNote } from "react-icons/md";

import Footer from "@/components/Footer";
import ConePackingAudit from "@/views/autoconer/ConePackingAudit";
import PreviewModal from "@/components/PreviewModal";
import SuccessModal from "@/components/SuccessModal";
import ConeDensity from "@/views/autoconer/ConeDensity";
import RewindingStudy from "@/views/autoconer/RewindingStudy";
import LycraChecking from "@/views/autoconer/LycraChecking";
import CspParameterEntries from "@/views/autoconer/CspParameterEntries";
import UPercentParameterEntries from "@/views/autoconer/UPercentParameterEntries";
import CoastWasteCrateRecord from "@/views/autoconer/countwise";
import DrumWiseAppearance from "@/views/autoconer/DrumWiseAppearance";
import SpliceStrength from "@/views/autoconer/SpliceStrength";
import styles from "@/styles/autoconer.module.css";
import { useDispatch, useSelector } from "react-redux";
import { clearAutoconerState } from "@/store/slices/autoconer";
import { filterOptionsByDepartmentAccess } from "@/utils/screenAccess";

const autoconerTypes = [
  { id: 1, name: "Rewinding Study", aliases: ["Rewinding Study"], component: RewindingStudy },
  { id: 2, name: "Cone Density", aliases: ["Cone Density"], component: ConeDensity },
  { id: 3, name: "Cone Packing Audit", aliases: ["Cone Packing Audit"], component: ConePackingAudit },
  { id: 4, name: "Lycra Checking", aliases: ["Lycra Checking"], component: LycraChecking },
  { id: 5, name: "Count Wise Cuts Record", aliases: ["Count Wise Cuts Record", "Countwise Cuts Record"], component: CoastWasteCrateRecord },
  { id: 6, name: "Splice Strength", aliases: ["Splice Strength"], component: SpliceStrength },
  { id: 7, name: "Drum wise Appearance", aliases: ["Drum wise Appearance", "Drum Wise Appearance"], component: DrumWiseAppearance },
  { id: 8, name: "CSP Parameter Entries", aliases: ["CSP Parameter Entries"], component: CspParameterEntries },
  { id: 9, name: "U% Parameter Entries", aliases: ["U% Parameter Entries", "U Percent Parameter Entries"], component: UPercentParameterEntries },
];

export const AUTOCONER_INPUT_SCREEN_COUNT = autoconerTypes.length;

function Autoconer() {
  const router = useRouter();
  const dispatch = useDispatch();
  const childRef = useRef(null);
  const user = useSelector((state) => state.auth?.user);
  const accessByDepartment = useSelector((state) => state.auth?.accessByDepartment);
  const typeOptions = useMemo(
    () =>
      filterOptionsByDepartmentAccess(
        autoconerTypes,
        accessByDepartment,
        user,
        "Autoconer"
      ),
    [accessByDepartment, user]
  );
  const [checkingType, setCheckingType] = useState(typeOptions[0]?.name || "");
  const [showPreview, setShowPreview] = useState(false);
  const [previewItems, setPreviewItems] = useState([]);
  const [showSuccess, setShowSuccess] = useState(false);
  const [registeredActions, setRegisteredActions] = useState({});
  const [validationMessage, setValidationMessage] = useState("");
  const selectedType = useMemo(
    () => typeOptions.find((item) => item.name === checkingType)?.name || "",
    [checkingType, typeOptions]
  );
  const SelectedComponent = useMemo(
    () => typeOptions.find((item) => item.name === checkingType)?.component || null,
    [checkingType, typeOptions]
  );
  const usesRefFlow =
    selectedType === "Rewinding Study" ||
    selectedType === "Cone Density" ||
    selectedType === "Cone Packing Audit";

  const openPreview = () => {
    const valid = childRef.current?.validate
      ? childRef.current.validate()
      : registeredActions.validate
        ? registeredActions.validate()
        : true;
    if (valid === false) {
      setValidationMessage("Please fill all required fields before saving.");
      return;
    }
    setValidationMessage("");
    const items = childRef.current?.getPreviewData
      ? childRef.current.getPreviewData()
      : registeredActions.getPreviewData
        ? registeredActions.getPreviewData()
        : [];
    setPreviewItems(items);
    setShowPreview(true);
  };

  const confirmSubmit = async () => {
    setShowPreview(false);
    const ok = childRef.current?.submit
      ? await childRef.current.submit()
      : registeredActions.submit
        ? await registeredActions.submit()
        : false;
    if (ok) {
      setShowSuccess(true);
    }
  };

  const handleTypeChange = (nextType) => {
    setCheckingType(nextType);
    setRegisteredActions({});
    setPreviewItems([]);
    setShowPreview(false);
    setShowSuccess(false);
  };

  useEffect(() => {
    if (!typeOptions.some((item) => item.name === checkingType)) {
      setCheckingType(typeOptions[0]?.name || "");
    }
  }, [checkingType, typeOptions]);

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

        <div className={styles.shell}>
          <div className={styles.formBody}>
            <div className={styles.formTitle}>
              <MdOutlineEditNote />
              <h3>Inspection Data Entry</h3>
            </div>

            {SelectedComponent ? (
              <SelectedComponent
                {...(usesRefFlow ? { ref: childRef } : {})}
                selectedTypeName={selectedType}
                selectedType={selectedType}
                onTypeChange={handleTypeChange}
                types={typeOptions}
                typeOptions={typeOptions.map((type) => type.name)}
                tablePortalTargetId="autoconer-table-slot"
                onRegisterActions={setRegisteredActions}
              />
            ) : (
              <div className={styles.validationMessage}>
                No accessible input screens are available for this department.
              </div>
            )}
          </div>

          {validationMessage ? (
            <div className={styles.validationMessage}>
              {validationMessage}
            </div>
          ) : null}

          <Footer
            onBack={() => router.push("/dashboard")}
            onClear={() => {
              setValidationMessage("");
              childRef.current?.clear?.();
              registeredActions.onClear?.();
            }}
            onSave={openPreview}
            saveLabel={registeredActions.saveLabel || "Save Record"}
            disabled={registeredActions.disabled}
          />
        </div>

        <div id="autoconer-table-slot" className={styles.tableSlot} />
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

      <SuccessModal
        open={showSuccess}
        message="Data Submitted"
        typeValue={selectedType}
        onClose={() => {
          setShowSuccess(false);
          setValidationMessage("");
          childRef.current?.clear?.();
          registeredActions.onClear?.();
          dispatch(clearAutoconerState());
        }}
      />
    </div>
  );
}

export default Autoconer;
