import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { MdOutlineEditNote } from "react-icons/md";

import Footer from "@/components/Footer";
import InputScreenUploadButton from "@/components/InputScreenUploadButton";
import ConePackingAudit from "@/views/autoconer/ConePackingAudit";
import PreviewModal from "@/components/PreviewModal";
import SuccessModal from "@/components/SuccessModal";
import ConeDensity from "@/views/autoconer/ConeDensity";
import RewindingStudy from "@/views/autoconer/RewindingStudy";
import ProcessParameter from "@/views/autoconer/ProcessParameter";
import AutoconerQ2 from "@/views/autoconer/AutoconerQ2";
import AutoconerQ3 from "@/views/autoconer/AutoconerQ3";
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
import { recordSubmittedNotebook } from "@/utils/submittedNotebookRecorder";
import useDatabaseEntryId from "@/hooks/useDatabaseEntryId";

const autoconerTypes = [
  { id: 0, name: "Process Parameter", aliases: ["Process Parameter", "Process Parameter Data Entry"], component: ProcessParameter },
  { id: 1, name: "PP - Autoconer Q2", aliases: ["PP - Autoconer Q2", "Autoconer Q2", "Q2"], component: AutoconerQ2 },
  { id: 2, name: "PP - Autoconer Q3", aliases: ["PP - Autoconer Q3", "Autoconer Q3", "Q3"], component: AutoconerQ3 },
  { id: 3, name: "Rewinding Study", aliases: ["Rewinding Study"], component: RewindingStudy },
  { id: 4, name: "Cone Density", aliases: ["Cone Density"], component: ConeDensity },
  { id: 5, name: "Cone Packing Audit", aliases: ["Cone Packing Audit"], component: ConePackingAudit },
  { id: 6, name: "Lycra Checking", aliases: ["Lycra Checking"], component: LycraChecking },
  { id: 7, name: "Count Wise Cuts Record", aliases: ["Count Wise Cuts Record", "Countwise Cuts Record"], component: CoastWasteCrateRecord },
  { id: 8, name: "Splice Strength", aliases: ["Splice Strength"], component: SpliceStrength },
  { id: 9, name: "Drum wise Appearance", aliases: ["Drum wise Appearance", "Drum Wise Appearance"], component: DrumWiseAppearance },
  { id: 10, name: "CSP Parameter Entries", aliases: ["CSP Parameter Entries"], component: CspParameterEntries },
  { id: 11, name: "U% Parameter Entries", aliases: ["U% Parameter Entries", "U Percent Parameter Entries"], component: UPercentParameterEntries },
];

export const AUTOCONER_INPUT_SCREEN_COUNT = autoconerTypes.length;
const AUTOCONER_PROCESS_PARAMETER_TYPES = [
  "Process Parameter",
  "PP - Autoconer Q2",
  "PP - Autoconer Q3",
];
const AUTOCONER_ENTRY_ID_CONFIG = {
  "Process Parameter": {
    prefix: "PP",
    width: 4,
    fetchPath: "/autoconer/process-parameter",
    pagePath: "/autoconer?type=Process%20Parameter",
    scope: "pp-global",
  },
  "PP - Autoconer Q2": {
    prefix: "PP",
    width: 4,
    fetchPath: "/autoconer/q2",
    pagePath: "/autoconer?type=PP%20-%20Autoconer%20Q2",
    scope: "pp-global",
  },
  "PP - Autoconer Q3": {
    prefix: "PP",
    width: 4,
    fetchPath: "/autoconer/q3",
    pagePath: "/autoconer?type=PP%20-%20Autoconer%20Q3",
    scope: "pp-global",
  },
  "Rewinding Study": {
    prefix: "ARW",
    width: 4,
    routePath: "/autoconer/inspection-data-entry",
    pagePath: "/autoconer/inspection-data-entry",
  },
  "Cone Density": { prefix: "ACD", width: 4, routePath: "/autoconer/cone-density", pagePath: "/autoconer/cone-density" },
  "Cone Packing Audit": { prefix: "ACP", width: 4, routePath: "/autoconer/cone-packing-audit", pagePath: "/autoconer/cone-packing-audit" },
  "Lycra Checking": { prefix: "ALC", width: 4, routePath: "/autoconer/lycra-checking", pagePath: "/autoconer/lycra-checking" },
  "Count Wise Cuts Record": { prefix: "ACW", width: 4, routePath: "/autoconer/count-wise-cuts", pagePath: "/autoconer/count-wise-cuts" },
  "Splice Strength": { prefix: "ASS", width: 4, routePath: "/autoconer/splice-strength", pagePath: "/autoconer/splice-strength" },
  "Drum wise Appearance": { prefix: "ADA", width: 4, routePath: "/autoconer/drum-wise-appearance", pagePath: "/autoconer/drum-wise-appearance" },
  "CSP Parameter Entries": { prefix: "ACS", width: 4, routePath: "/autoconer/parameter-entries/pending-csp", pagePath: "/autoconer/parameter-entries/pending-csp" },
  "U% Parameter Entries": { prefix: "AUP", width: 4, routePath: "/autoconer/parameter-entries/pending-quality", pagePath: "/autoconer/parameter-entries/pending-quality" },
};

const getAutoconerEntryConfig = (typeName) =>
  AUTOCONER_ENTRY_ID_CONFIG[typeName] || {
    prefix: "ACR",
  };
const normalizeTypeName = (value = "") => String(value).trim().toLowerCase();
const getTypeName = (value = "") => String(value?.name ?? value ?? "").trim();
const formatTypeValue = (value = "") => getTypeName(value);
const stripTypeOptionsForUi = (options = []) =>
  (Array.isArray(options) ? options : []).map((option) => ({
    id: option?.id,
    name: option?.name || "",
    displayName: option?.displayName || option?.name || "",
    aliases: Array.isArray(option?.aliases) ? option.aliases : [],
  }));
const normalizeTypeOptionsForChildren = (options = []) =>
  (Array.isArray(options) ? options : []).map((option) =>
    String(option?.displayName ?? option?.name ?? option ?? "").trim()
  ).filter(Boolean);
const dedupeOptionsByName = (options = []) => {
  const seen = new Set();

  return (Array.isArray(options) ? options : []).filter((option) => {
    const key = normalizeTypeName(option?.name);
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

function Autoconer() {
  const router = useRouter();
  const dispatch = useDispatch();
  const childRef = useRef(null);
  const user = useSelector((state) => state.auth?.user);
  const accessByDepartment = useSelector((state) => state.auth?.accessByDepartment);
  const requestedType = Array.isArray(router.query.type) ? router.query.type[0] : router.query.type;
  const isProcessParameterRequest = [
    "process parameter",
    "pp - autoconer q2",
    "pp - autoconer q3",
  ].includes(normalizeTypeName(requestedType));
  const fullTypeOptions = useMemo(
    () =>
      filterOptionsByDepartmentAccess(
        autoconerTypes,
        accessByDepartment,
        user,
        "Autoconer"
      ),
    [accessByDepartment, user]
  );
  const typeOptions = useMemo(
    () =>
      dedupeOptionsByName(
        isProcessParameterRequest
        ? fullTypeOptions.filter((item) => AUTOCONER_PROCESS_PARAMETER_TYPES.includes(item.name))
        : fullTypeOptions.filter(
            (item) => !AUTOCONER_PROCESS_PARAMETER_TYPES.includes(item.name)
          ),
    ),
    [fullTypeOptions, isProcessParameterRequest]
  );
  const uiTypeOptions = useMemo(() => stripTypeOptionsForUi(typeOptions), [typeOptions]);
  const childTypeOptions = useMemo(
    () => normalizeTypeOptionsForChildren(typeOptions),
    [typeOptions]
  );
  const [selectedTypeName, setSelectedTypeName] = useState(typeOptions[0]?.name || "");
  const [showPreview, setShowPreview] = useState(false);
  const [previewItems, setPreviewItems] = useState([]);
  const [showSuccess, setShowSuccess] = useState(false);
  const [registeredActions, setRegisteredActions] = useState({});
  const [validationMessage, setValidationMessage] = useState("");
  const [currentDateLabel, setCurrentDateLabel] = useState("");
  const [isMounted, setIsMounted] = useState(false);
  const selectedType = useMemo(() => {
    const current = typeOptions.find((item) =>
      [item.name, ...(item.aliases || [])]
        .map(normalizeTypeName)
        .includes(normalizeTypeName(selectedTypeName))
    );
    return formatTypeValue(current?.name || selectedTypeName);
  }, [selectedTypeName, typeOptions]);
  const useParentEntryId =
      selectedType === "Process Parameter" ||
      selectedType === "Rewinding Study" ||
      selectedType === "Cone Density" ||
      selectedType === "Cone Packing Audit" ||
      selectedType === "Lycra Checking" ||
      selectedType === "Count Wise Cuts Record" ||
      selectedType === "Splice Strength" ||
      selectedType === "Drum wise Appearance" ||
      selectedType === "CSP Parameter Entries" ||
      selectedType === "U% Parameter Entries";
  const selectedOption = useMemo(
    () =>
      typeOptions.find((item) =>
        [item.name, ...(item.aliases || [])]
          .map(normalizeTypeName)
          .includes(normalizeTypeName(selectedTypeName))
      ) || null,
    [selectedTypeName, typeOptions]
  );
  const SelectedComponent = selectedOption?.component || null;
  const { entryId, reserveEntryId } = useDatabaseEntryId({
    department: "Autoconer",
    typeName: useParentEntryId ? selectedType : "",
    config: useParentEntryId ? getAutoconerEntryConfig(selectedType) : {},
  });
  const isFooterHistoryType =
    selectedType === "Process Parameter" ||
    selectedType === "PP - Autoconer Q2" ||
    selectedType === "PP - Autoconer Q3";
  const usesRefFlow =
    selectedType === "Process Parameter" ||
    selectedType === "PP - Autoconer Q2" ||
    selectedType === "PP - Autoconer Q3" ||
    selectedType === "Rewinding Study" ||
    selectedType === "Cone Density" ||
    selectedType === "Cone Packing Audit";

  const openPreview = () => {
    const validationResult = childRef.current?.validate
      ? childRef.current.validate()
      : registeredActions.validate
        ? registeredActions.validate()
        : true;
    if (validationResult === false) {
      setValidationMessage("Please fill all required fields before saving.");
      return;
    }
    if (validationResult && typeof validationResult === "object" && validationResult.valid === false) {
      setValidationMessage(`Missing required field: ${validationResult.missingField || "unknown"}`);
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
      const previewEntryId =
        previewItems.find((item) => ["Entry ID", "Process Parameter ID"].includes(String(item?.label || "").trim()))?.value ||
        "";
      await recordSubmittedNotebook({
        department: "Quality Control",
        subDepartment: "Autoconer",
        notebookName: selectedType,
        entryId: useParentEntryId ? entryId : previewEntryId,
        childRef,
        registeredActions,
        previewItems,
        user,
      });
      if (useParentEntryId) {
        await reserveEntryId();
      }
      setShowSuccess(true);
    }
  };

  const handleTypeChange = (nextType) => {
    const nextTypeName = getTypeName(nextType);
    const matchedType = typeOptions.find((item) =>
      [item.name, ...(item.aliases || [])].map(normalizeTypeName).includes(normalizeTypeName(nextTypeName))
    );
    setSelectedTypeName(matchedType?.name || nextTypeName);
    setRegisteredActions({});
    setPreviewItems([]);
    setShowPreview(false);
    setShowSuccess(false);
  };

  useEffect(() => {
    if (!typeOptions.some((item) => item.name === selectedTypeName)) {
      setSelectedTypeName(typeOptions[0]?.name || "");
    }
  }, [selectedTypeName, typeOptions]);

  useEffect(() => {
    setIsMounted(true);
    setCurrentDateLabel(new Date().toLocaleDateString("en-IN"));
  }, []);

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
  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.header}>
          <h1>Quality Control - Autoconer Notebook</h1>
          <p>Record and manage industrial machine quality inspections.</p>
          <div className="mt-2 text-right text-base font-semibold text-slate-600">
            Current Date: {isMounted ? currentDateLabel : "--"}
          </div>
        </div>
        <div className={styles.shell}>
          <div className={styles.formBody}>
            <div className={styles.formTitle}>
              <MdOutlineEditNote />
              <h3>Inspection Data Entry</h3>
              <InputScreenUploadButton className="ml-auto" />
            </div>

            {SelectedComponent ? (
              <SelectedComponent
                {...(usesRefFlow ? { ref: childRef } : {})}
                selectedTypeName={selectedType}
                selectedType={selectedType}
                onTypeChange={handleTypeChange}
                types={childTypeOptions}
                typeOptions={childTypeOptions}
                entryId={useParentEntryId ? entryId : ""}
                tablePortalTargetId="autoconer-table-slot"
                savedVersionsTargetId={isFooterHistoryType ? "autoconer-post-footer-slot" : ""}
                postFooterPortalTargetId="autoconer-post-footer-slot"
                onRegisterActions={setRegisteredActions}
              />
            ) : (
              <div className={styles.validationMessage}>
                No accessible input screens are available for this department.
              </div>
            )}
          </div>

          <div id="autoconer-table-slot" className={styles.tableSlot} />

          {validationMessage ? (
            <div className={styles.validationMessage}>
              {validationMessage}
            </div>
          ) : null}

          {isFooterHistoryType ? (
            <div className={styles.processFooterWrap}>
              <Footer
                onBack={() => router.push("/departments/quality-control")}
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
          ) : (
            <Footer
              onBack={() => router.push("/departments/quality-control")}
              onClear={() => {
                setValidationMessage("");
                childRef.current?.clear?.();
                registeredActions.onClear?.();
              }}
              onSave={openPreview}
              saveLabel={registeredActions.saveLabel || "Save Record"}
              disabled={registeredActions.disabled}
            />
          )}
        </div>

        <div
          id="autoconer-post-footer-slot"
          className={isFooterHistoryType ? styles.postFooterSlot : styles.tableSlot}
        />
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
        closeLabel="OK"
      />
    </div>
  );
}

export default Autoconer;





