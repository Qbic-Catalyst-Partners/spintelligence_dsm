import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { MdEditNote } from "react-icons/md";

import Footer from "@/components/Footer";
import InputScreenUploadButton from "@/components/InputScreenUploadButton";
import PreviewModal from "@/components/PreviewModal";
import SearchableSelect from "@/components/SearchableSelect";
import useBlowroomMasterVarieties from "@/hooks/useBlowroomMasterVarieties";
import ProcessParameterDataEntry from "./carding/processParameterDataEntry";
import SuccessModal from "@/components/SuccessModal";
import BetweenWithinCardEntry from "./carding/betweenWithinCardEntry";
import CardingDfk from "./carding/cardingdfk";
import CardThickPlaceEntry from "./carding/cardThickPlaceEntry";
import TrialDepartment from "./carding/trialsDataEntry";
import NatiDataEntry from "./carding/natiDataEntry";
import UPercentDataEntry from "./carding/u%dataentry";
import CardingWheelChange from "./carding/WheelChange";
import BrWasteStudyEntry from "./mixing/brWasteStudyEntry";
import { fetchCardWasteStudyEntries, fetchCardingMasterMachines, fetchCardingMasterWasteTypes, submitCardWasteStudyEntry } from "@/apis/carding";
import brWasteStyles from "@/styles/brWasteStudyEntry.module.css";
import { useDispatch, useSelector } from "react-redux";
import { clearCardingState } from "@/store/slices/carding";
import { filterOptionsByDepartmentAccess } from "@/utils/screenAccess";
import { recordSubmittedNotebook } from "@/utils/submittedNotebookRecorder";
import useDatabaseEntryId from "@/hooks/useDatabaseEntryId";
import { useThemeMode } from "@/utils/useThemeMode";

import styles from "./carding/cardThickPlaceEntry.module.css";

const cardingDepartmentTypes = [
    { id: 0, name: "Process Parameter", aliases: ["Process Parameter", "Process Parameter Data Entry"], component: ProcessParameterDataEntry },
    { id: 1, name: "Between & Within Card Data Entry", aliases: ["Between & Within Card Data Entry", "Between and Within Card Data Entry", "Between Within Card Entry"] },
    { id: 2, name: "Thick place & CV", aliases: ["Thick place & CV", "Card Thick Place Entry", "Card Thick Place Checking"] },
    { id: 3, name: "Individual Card performance Data", aliases: ["Individual Card performance Data", "Trials Data Entry Form", "Trials Data Entry", "Trials"] },
    { id: 4, name: "Nati Data Entry", aliases: ["Nati Data Entry"] },
    { id: 5, name: "U% Data Entry", aliases: ["U% Data Entry", "U Percent Data Entry", "U Percentage Data Entry", "U% Checking"] },
    { id: 6, name: "Card DFK Data", aliases: ["Card DFK Data", "Card DFK Pressure Checking", "DFK Pressure Checking", "Carding DFK Pressure"] },
    { id: 7, name: "WheelChange", aliases: ["WheelChange", "Wheel Change"], component: CardingWheelChange },
    { id: 8, name: "Individual Card Waste Study", aliases: ["Individual Card Waste Study", "Card Waste Study", "Card Waste Study Entry"] },
];

export const CARDING_INPUT_SCREEN_COUNT = cardingDepartmentTypes.length;
const CARDING_ENTRY_ID_CONFIG = {
    "Process Parameter": { prefix: "CPP", width: 4, routePath: "/carding/qc-header" },
    "Between & Within Card Data Entry": { prefix: "BWC", width: 4, routePath: "/carding/between-within-card" },
    "Thick place & CV": { prefix: "CTP", width: 4, routePath: "/carding/card-thick-place" },
    "Individual Card performance Data": { prefix: "TRI", width: 4, routePath: "/carding/trials" },
    "Nati Data Entry": { prefix: "NAT", width: 4, routePath: "/carding/nati-data-entry" },
    "U% Data Entry": { prefix: "CAU", width: 4, routePath: "/carding/uqc" },
    "Card DFK Data": { prefix: "DFK", width: 4, routePath: "/carding/dfk-pressure" },
    WheelChange: { prefix: "WHL", width: 4, routePath: "/carding/change-control" },
    "Individual Card Waste Study": { prefix: "CWS", width: 4, routePath: "/carding/card-waste-study" },
};

const getCardingEntryConfig = (typeName) =>
    CARDING_ENTRY_ID_CONFIG[typeName] || { prefix: "CAR" };
const DEFAULT_CARDING_STATE = { uqcEntries: [], listLoading: false };
const PROCESS_PARAMETER_CREATED_IDS_KEY = "mixing-process-parameter-created-ids";

const normalizeTypeName = (value = "") => String(value).trim().toLowerCase();

function Carding() {
    const router = useRouter();
    const dispatch = useDispatch();
    const childRef = useRef(null);
    const appliedRequestedTypeRef = useRef(null);
    const { isDarkMode } = useThemeMode();
    const { uqcEntries = [], listLoading } = useSelector(
        (state) => state.carding ?? DEFAULT_CARDING_STATE
    );
    const user = useSelector((state) => state.auth?.user);
    const accessByDepartment = useSelector((state) => state.auth?.accessByDepartment);
    const currentDateLabel = new Date().toLocaleDateString("en-IN");
    const requestedType = typeof router.query.type === "string" ? router.query.type : "";
    const isProcessParameterRequest = normalizeTypeName(requestedType) === "process parameter";
    const fullTypeOptions = filterOptionsByDepartmentAccess(
        cardingDepartmentTypes,
        accessByDepartment,
        user,
        "Carding"
    );
    const typeOptions = isProcessParameterRequest
        ? fullTypeOptions
        : fullTypeOptions.filter((item) => item.name !== "Process Parameter");
    const [checkingType, setCheckingType] = useState(typeOptions[0]?.id ?? null);
    const [showPreview, setShowPreview] = useState(false);
    const [previewItems, setPreviewItems] = useState([]);
  const [showSuccess, setShowSuccess] = useState(false);
  const [validationMessage, setValidationMessage] = useState("");
  const [bwcInspectionType, setBwcInspectionType] = useState("Within");    const [lotNo, setLotNo] = useState("");
  const [cardWasteVariety, setCardWasteVariety] = useState("");
  const { varietyOptions: cardWasteVarietyOptions, varietyOptionsError: cardWasteVarietyOptionsError, loadingVarietyOptions: loadingCardWasteVarietyOptions } = useBlowroomMasterVarieties();
    useEffect(() => {
        if (!typeOptions.some((item) => item.id === checkingType)) {
            setCheckingType(typeOptions[0]?.id ?? null);
        }
    }, [checkingType, typeOptions]);

    useEffect(() => {
        if (!requestedType || !typeOptions.length) return;
        if (appliedRequestedTypeRef.current === requestedType) return;
        const requested = normalizeTypeName(requestedType);
        const matched = typeOptions.find((item) => {
            const names = [item.name, ...(item.aliases || [])].map(normalizeTypeName);
            return names.includes(requested);
        });
        if (matched) {
            appliedRequestedTypeRef.current = requestedType;
            setCheckingType(matched.id);
        }
    }, [requestedType, typeOptions]);

    const handleTypeChange = (value) => {
        const selected = typeOptions.find(
            (item) => item.name === value
        );
        setCheckingType(selected?.id ?? null);
        setLotNo("");
        setValidationMessage("");
        setPreviewItems([]);
        setShowPreview(false);
        setShowSuccess(false);

        // Keep the selection in place without forcing a route change.
    };

    const selectedType =
        typeOptions.find((item) => item.id === checkingType)?.name || "";
    const { entryId, reserveEntryId } = useDatabaseEntryId({
        department: "Carding",
        typeName: selectedType,
        config: getCardingEntryConfig(selectedType),
    });
    const selectedOption = typeOptions.find((item) => item.id === checkingType) || null;
    const SelectedComponent = selectedOption?.component ?? null;
    const ocrDocType =
        selectedType === "Between & Within Card Data Entry"
            ? "bwc"
            : selectedType === "U% Data Entry"
              ? "hvi"
              : "hvi";
    const isProcessParameter = selectedType === "Process Parameter";
    const isWheelChange = selectedType === "WheelChange";
    const isCardWasteStudy = selectedType === "Individual Card Waste Study";
    const showParentFooter = isProcessParameter || isCardWasteStudy;
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
        muted: isDarkMode ? "#ffffff" : "#666",
        accent: isDarkMode ? "#93c5fd" : "#1976d2",
    };

    const storeCreatedProcessParameterId = (response) => {
        const createdId = String(
            response?.param_id ||
                response?.entry_id ||
                response?.process_parameter_id ||
                response?.qc_id ||
                response?.id ||
                ""
        ).trim();

        if (!createdId || typeof window === "undefined") return;

        try {
            const raw = window.localStorage.getItem(PROCESS_PARAMETER_CREATED_IDS_KEY);
            const parsed = raw ? JSON.parse(raw) : [];
            const existing = Array.isArray(parsed)
                ? parsed.map((value) => String(value || "").trim()).filter(Boolean)
                : [];
            window.localStorage.setItem(
                PROCESS_PARAMETER_CREATED_IDS_KEY,
                JSON.stringify(Array.from(new Set([createdId, ...existing])))
            );
        } catch {}
    };

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
        try {
            const ok = await childRef.current?.submit?.();
            if (ok) {
                storeCreatedProcessParameterId(ok);
                await recordSubmittedNotebook({
                    department: "Quality Control",
                    subDepartment: "Carding",
                    notebookName: selectedType,
                    entryId,
                    lotNo,
                    childRef,
                    previewItems,
                    user,
                });
                await reserveEntryId();
                setShowSuccess(true);
            }
        } catch (e) {
            // submission error is shown via the global error modal; refresh the
            // reserved entry ID so a duplicate-ID rejection doesn't repeat on retry
            await reserveEntryId();
        }
    };

    const handleSuccessClose = () => {
        setShowSuccess(false);
        setValidationMessage("");
        childRef.current?.clear?.();
        dispatch(clearCardingState());
        window.location.reload();
    };

    return (
        <div className={styles["card-page"]}>
            <div className={styles["card-container"]}>
                <div className={styles["card-header"]}>
                    <h1>Quality Control - Carding Notebook</h1>
          <div className="mt-2 text-right text-base font-bold text-slate-800 dark:text-white">Current Date: {currentDateLabel}</div>
                </div>

                <div className={styles["card-shell"]}>
                    {!isProcessParameter && !isWheelChange ? (
                        <div className={styles["card-form-title"]}>
                            <MdEditNote />
                            <h3>Inspection Data Entry</h3>
                            <InputScreenUploadButton
                                visible={selectedType === "Between & Within Card Data Entry"}
                                className="ml-auto"
                                docType={ocrDocType}
                                inspectionType={selectedType === "Between & Within Card Data Entry" ? bwcInspectionType : ""}
                                returnTo={selectedType === "Between & Within Card Data Entry" ? "/carding?type=Between%20%26%20Within%20Card%20Data%20Entry" : "/carding"}
                            />
                        </div>
                    ) : null}

                    {!typeOptions.length ? (
                        <div className={styles["message-box"]}>
                            No accessible input screens are available for this department.
                        </div>
                    ) : null}

                    {isProcessParameter && SelectedComponent ? (
                        <SelectedComponent
                            ref={childRef}
                            entryId={entryId}
                            types={typeOptions}
                            selectedType={selectedType}
                            onTypeChange={handleTypeChange}
                            savedVersionsTargetId="carding-process-parameter-saved-versions"
                        />
                    ) : null}

                    {isCardWasteStudy ? (
                        <>
                            <div className={brWasteStyles["mixx-row"]}>
                                <div className={brWasteStyles["mixx-group"]}>
                                    <label>Type</label>
                                    <select
                                        className={brWasteStyles["mixx-input"]}
                                        value={selectedType}
                                        onChange={(e) => handleTypeChange(e.target.value)}
                                    >
                                        {typeOptions.map((item) => (
                                            <option key={item.id} value={item.name}>
                                                {item.displayName ?? item.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className={brWasteStyles["mixx-group"]}>
                                    <label>Entry ID</label>
                                    <input
                                        className={brWasteStyles["mixx-input"]}
                                        value={entryId}
                                        readOnly
                                    />
                                </div>
                                <div className={brWasteStyles["mixx-group"]}>
                                    <label>Variety</label>
                                    <SearchableSelect
                                        className={brWasteStyles["mixx-input"]}
                                        value={cardWasteVariety}
                                        onChange={setCardWasteVariety}
                                        options={cardWasteVarietyOptions}
                                        placeholder={
                                            loadingCardWasteVarietyOptions
                                                ? "Loading varieties..."
                                                : cardWasteVarietyOptionsError
                                                    ? "Type variety"
                                                    : "Select Variety"
                                        }
                                        ariaLabel="Variety"
                                    />
                                </div>
                            </div>
                            <BrWasteStudyEntry
                                ref={childRef}
                                date={new Date().toISOString().split("T")[0]}
                                lotNo={lotNo}
                                onLotNoChange={setLotNo}
                                saveEntryApi={submitCardWasteStudyEntry}
                                fetchEntriesApi={fetchCardWasteStudyEntries}
                                fetchMachineOptionsApi={fetchCardingMasterMachines}
                                fetchWasteTypesApi={fetchCardingMasterWasteTypes}
                                saveWasteTypeApi={async () => {}}
                                entryTypeLabel="Individual Card Waste Study"
                                useBlowroomRedux={false}
                                showEntryId={false}
                                variety={cardWasteVariety}
                                onVarietyChange={setCardWasteVariety}
                                hideVarietyField
                            />
                        </>
                    ) : null}

                    {selectedType === "Between & Within Card Data Entry" && (
                        <BetweenWithinCardEntry
                            types={typeOptions}
                            selectedType={selectedType}
                            onTypeChange={handleTypeChange}
                            onInspectionTypeChange={setBwcInspectionType}
                            showForm
                            entryId={entryId}
                        />
                    )}

                    {selectedType === "Individual Card performance Data" && (
                        <TrialDepartment
                            types={typeOptions}
                            selectedType={selectedType}
                            onTypeChange={handleTypeChange}
                            showForm
                            entryId={entryId}
                        />
                    )}

                    {selectedType === "Nati Data Entry" && (
                        <NatiDataEntry
                            types={typeOptions}
                            selectedType={selectedType}
                            onTypeChange={handleTypeChange}
                            showForm
                            entryId={entryId}
                        />
                    )}

    {selectedType === "Thick place & CV" || !selectedType ? (
                        <CardThickPlaceEntry
                            types={typeOptions}
                            selectedType={selectedType}
                            onTypeChange={handleTypeChange}
      showForm={selectedType === "Thick place & CV"}
                            entryId={entryId}
                            reserveEntryId={reserveEntryId}
                        />
                    ) : null}

                    {selectedType === "U% Data Entry" && (
                        <UPercentDataEntry
                            types={typeOptions}
                            selectedType={selectedType}
                            onTypeChange={handleTypeChange}
                            entryId={entryId}
                        />
                    )}

                    {selectedType === "Card DFK Data" && (
                        <CardingDfk
                            types={typeOptions}
                            selectedType={selectedType}
                            onTypeChange={handleTypeChange}
                            entryId={entryId}
                        />
                    )}

                    {isProcessParameter && validationMessage ? (
                        <div className={styles["message-box"]}>
                            {validationMessage}
                        </div>
                    ) : null}

                    {isWheelChange && SelectedComponent ? (
                        <SelectedComponent
                            entryId={entryId}
                            types={typeOptions}
                            selectedType={selectedType}
                            onTypeChange={handleTypeChange}
                        />
                    ) : null}

                    {showParentFooter ? (
                        <Footer
                            onBack={() => router.push("/departments/quality-control")}
                            onClear={() => {
                                setValidationMessage("");
                                setLotNo("");
                                childRef.current?.clear?.();
                            }}
                            onSave={openPreview}
                            saveLabel="Save Record"
                        />
                    ) : null}
                </div>

                {isProcessParameter && SelectedComponent ? (
                    <div id="carding-process-parameter-saved-versions" className="mt-5 mx-auto max-w-[1120px]" />
                ) : null}

                
                {/* ✅ TABLE BELOW CARD (ONLY FOR U%) */}
                {selectedType === "U% Data Entry" && (
                    <div
                        className="print:hidden"
                        style={{
                            margin: "20px auto 0",
                            maxWidth: "1120px",
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
                                        <td colSpan={9} style={{ padding: "14px", color: entryTableTheme.muted }}>
                                            Loading...
                                        </td>
                                    </tr>
                                ) : uqcEntries.length ? uqcEntries.map((entry, i) => (
                                    <tr
                                        key={entry.id}
                                        style={{
                                            backgroundColor: i % 2 === 0 ? entryTableTheme.rowEven : entryTableTheme.rowOdd,
                                        }}
                                    >
                                        {[
                                            entry.entry_date ? new Date(entry.entry_date).toLocaleDateString("en-GB") : "-",
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
                                        <td colSpan={9} style={{ padding: "14px", color: entryTableTheme.muted }}>
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
                title="Quality Control - Carding Notebook"
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
        onClose={handleSuccessClose}
        closeLabel="OK"
      />
        </div>
    );
}

export default Carding;




