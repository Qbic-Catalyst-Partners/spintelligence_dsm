import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { MdEditNote } from "react-icons/md";

import Footer from "@/components/Footer";
import InputScreenUploadButton from "@/components/InputScreenUploadButton";
import PreviewModal from "@/components/PreviewModal";
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
import { fetchCardWasteStudyEntries, submitCardWasteStudyEntry } from "@/apis/carding";
import brWasteStyles from "@/styles/brWasteStudyEntry.module.css";
import { useDispatch, useSelector } from "react-redux";
import { clearCardingState } from "@/store/slices/carding";
import { filterOptionsByDepartmentAccess } from "@/utils/screenAccess";
import { useThemeMode } from "@/utils/useThemeMode";

import styles from "./carding/cardThickPlaceEntry.module.css";

const cardingDepartmentTypes = [
    { id: 0, name: "Process Parameter", aliases: ["Process Parameter", "Process Parameter Data Entry"], component: ProcessParameterDataEntry },
    { id: 1, name: "Between & Within Card Data Entry", aliases: ["Between & Within Card Data Entry", "Between and Within Card Data Entry", "Between Within Card Entry"] },
    { id: 2, name: "Card Thick Place Entry", aliases: ["Card Thick Place Entry", "Card Thick Place Checking"] },
    { id: 3, name: "Trials Data Entry Form", aliases: ["Trials Data Entry Form", "Trials Data Entry", "Trials"] },
    { id: 4, name: "Nati Data Entry", aliases: ["Nati Data Entry"] },
    { id: 5, name: "U% Data Entry", aliases: ["U% Data Entry", "U Percent Data Entry", "U Percentage Data Entry", "U% Checking"] },
    { id: 6, name: "Card DFK Pressure Checking", aliases: ["Card DFK Pressure Checking", "DFK Pressure Checking", "Carding DFK Pressure"] },
    { id: 7, name: "WheelChange", aliases: ["WheelChange", "Wheel Change"], component: CardingWheelChange },
    { id: 8, name: "Card Waste Study", aliases: ["Card Waste Study", "Card Waste Study Entry"] },
];

export const CARDING_INPUT_SCREEN_COUNT = cardingDepartmentTypes.length;
const CARDING_ENTRY_SEQ_KEY = "carding_entry_sequence";
const CARDING_ENTRY_ID_CONFIG = {
    "Process Parameter": { prefix: "CPP", storageKey: "carding_entry_sequence_process_parameter" },
    "Between & Within Card Data Entry": { prefix: "BWC", storageKey: "carding_entry_sequence_between_within" },
    "Card Thick Place Entry": { prefix: "CTP", storageKey: "carding_entry_sequence_card_thick_place" },
    "Trials Data Entry Form": { prefix: "TRI", storageKey: "carding_entry_sequence_trials" },
    "Nati Data Entry": { prefix: "NAT", storageKey: "carding_entry_sequence_nati" },
    "U% Data Entry": { prefix: "CAU", storageKey: "carding_entry_sequence_u_percent" },
    "Card DFK Pressure Checking": { prefix: "DFK", storageKey: "carding_entry_sequence_dfk" },
    WheelChange: { prefix: "WHL", storageKey: "carding_entry_sequence_wheelchange" },
    "Card Waste Study": { prefix: "CWS", storageKey: "carding_entry_sequence_card_waste_study" },
};

const getCardingEntryConfig = (typeName) =>
    CARDING_ENTRY_ID_CONFIG[typeName] || { prefix: "CAR", storageKey: CARDING_ENTRY_SEQ_KEY };

const getCardingEntryId = (seq, typeName) => {
    const { prefix } = getCardingEntryConfig(typeName);
    return `${prefix}-${String(Math.max(1, Number(seq) || 1)).padStart(3, "0")}`;
};

const readCardingEntrySequence = (typeName) => {
    if (typeof window === "undefined") return 1;
    const { storageKey } = getCardingEntryConfig(typeName);
    const stored = Number(window.localStorage.getItem(storageKey) || "1");
    return Number.isFinite(stored) && stored > 0 ? stored : 1;
};

const normalizeTypeName = (value = "") => String(value).trim().toLowerCase();

function Carding() {
  const currentDateLabel = new Date().toLocaleDateString("en-IN");
    const router = useRouter();
    const dispatch = useDispatch();
    const childRef = useRef(null);
    const { isDarkMode } = useThemeMode();
    const { uqcEntries = [], listLoading } = useSelector((state) => state.carding ?? {});
    const user = useSelector((state) => state.auth?.user);
    const accessByDepartment = useSelector((state) => state.auth?.accessByDepartment);
    const typeOptions = filterOptionsByDepartmentAccess(
        cardingDepartmentTypes,
        accessByDepartment,
        user,
        "Carding"
    );
    const [checkingType, setCheckingType] = useState(typeOptions[0]?.id ?? null);
    const [showPreview, setShowPreview] = useState(false);
    const [previewItems, setPreviewItems] = useState([]);
    const [showSuccess, setShowSuccess] = useState(false);
    const [validationMessage, setValidationMessage] = useState("");
    const [bwcInspectionType, setBwcInspectionType] = useState("Within");
    const [entrySeq, setEntrySeq] = useState(1);
    const [lotNo, setLotNo] = useState("");

    useEffect(() => {
        const typeName = typeOptions.find((item) => item.id === checkingType)?.name;
        if (!typeName) return;
        setEntrySeq(readCardingEntrySequence(typeName));
    }, [checkingType, typeOptions]);

    useEffect(() => {
        if (!typeOptions.some((item) => item.id === checkingType)) {
            setCheckingType(typeOptions[0]?.id ?? null);
        }
    }, [checkingType, typeOptions]);

    useEffect(() => {
        const requestedType = typeof router.query.type === "string" ? router.query.type : "";
        if (!requestedType || !typeOptions.length) return;
        const requested = normalizeTypeName(requestedType);
        const matched = typeOptions.find((item) => {
            const names = [item.name, ...(item.aliases || [])].map(normalizeTypeName);
            return names.includes(requested);
        });
        if (matched && matched.id !== checkingType) {
            setCheckingType(matched.id);
        }
    }, [router.query.type, typeOptions, checkingType]);

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
    };

    const selectedType =
        typeOptions.find((item) => item.id === checkingType)?.name || "";
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
    const isCardWasteStudy = selectedType === "Card Waste Study";
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
            incrementEntrySequence();
            setShowSuccess(true);
        }
    };

    return (
        <div className={styles["card-page"]}>
            <div className={styles["card-container"]}>
                <div className={styles["card-header"]}>
                    <h1>Quality Control - Carding Notebook</h1>
          <div className="mt-2 text-right text-base font-semibold text-slate-600">Current Date: {currentDateLabel}</div>
                </div>

                <div className={styles["card-shell"]}>
                    {!isProcessParameter && !isWheelChange ? (
                        <div className={styles["card-form-title"]}>
                            <MdEditNote />
                            <h3>Inspection Data Entry</h3>
                            <InputScreenUploadButton
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
                            entryId={getCardingEntryId(entrySeq, selectedType)}
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
                                        value={getCardingEntryId(entrySeq, selectedType)}
                                        readOnly
                                    />
                                </div>
                                <div className={brWasteStyles["mixx-group"]}>
                                    <label>Lot No</label>
                                    <input
                                        className={brWasteStyles["mixx-input"]}
                                        value={lotNo}
                                        onChange={(e) => setLotNo(e.target.value)}
                                        placeholder="Enter Lot Number"
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
                                entryTypeLabel="Card Waste Study"
                                useBlowroomRedux={false}
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
                            entryId={getCardingEntryId(entrySeq, selectedType)}
                        />
                    )}

                    {selectedType === "Trials Data Entry Form" && (
                        <TrialDepartment
                            types={typeOptions}
                            selectedType={selectedType}
                            onTypeChange={handleTypeChange}
                            showForm
                            entryId={getCardingEntryId(entrySeq, selectedType)}
                        />
                    )}

                    {selectedType === "Nati Data Entry" && (
                        <NatiDataEntry
                            types={typeOptions}
                            selectedType={selectedType}
                            onTypeChange={handleTypeChange}
                            showForm
                            entryId={getCardingEntryId(entrySeq, selectedType)}
                        />
                    )}

                    {selectedType === "Card Thick Place Entry" || !selectedType ? (
                        <CardThickPlaceEntry
                            types={typeOptions}
                            selectedType={selectedType}
                            onTypeChange={handleTypeChange}
                            showForm={selectedType === "Card Thick Place Entry"}
                            entryId={getCardingEntryId(entrySeq, selectedType)}
                        />
                    ) : null}

                    {selectedType === "U% Data Entry" && (
                        <UPercentDataEntry
                            types={typeOptions}
                            selectedType={selectedType}
                            onTypeChange={handleTypeChange}
                            entryId={getCardingEntryId(entrySeq, selectedType)}
                        />
                    )}

                    {selectedType === "Card DFK Pressure Checking" && (
                        <CardingDfk
                            types={typeOptions}
                            selectedType={selectedType}
                            onTypeChange={handleTypeChange}
                            entryId={getCardingEntryId(entrySeq, selectedType)}
                        />
                    )}

                    {isProcessParameter && validationMessage ? (
                        <div className={styles["message-box"]}>
                            {validationMessage}
                        </div>
                    ) : null}

                    {isWheelChange && SelectedComponent ? (
                        <SelectedComponent
                            entryId={getCardingEntryId(entrySeq, selectedType)}
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
                                        <td colSpan={10} style={{ padding: "14px", color: entryTableTheme.muted }}>
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
                                        <td colSpan={10} style={{ padding: "14px", color: entryTableTheme.muted }}>
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
                    onClose={() => {
                        setShowSuccess(false);
                        setValidationMessage("");
                        childRef.current?.clear?.();
                        dispatch(clearCardingState());
                    }}
            />
        </div>
    );
}

export default Carding;




