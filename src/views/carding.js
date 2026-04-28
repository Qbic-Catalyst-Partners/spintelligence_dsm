import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { MdEditNote } from "react-icons/md";

import Footer from "@/components/Footer";
import PreviewModal from "@/components/PreviewModal";
import ProcessParameterDataEntry from "./carding/processParameterDataEntry";
import SuccessModal from "@/components/SuccessModal";
import BetweenWithinCardEntry from "./carding/betweenWithinCardEntry";
import CardingDfk from "./carding/cardingdfk";
import CardThickPlaceEntry from "./carding/cardThickPlaceEntry";
import TrialDepartment from "./carding/trialsDataEntry";
import NatiDataEntry from "./carding/natiDataEntry";
import UPercentDataEntry from "./carding/u%dataentry";
import { useDispatch, useSelector } from "react-redux";
import { clearCardingState } from "@/store/slices/carding";
import { filterOptionsByDepartmentAccess } from "@/utils/screenAccess";

import styles from "./carding/cardThickPlaceEntry.module.css";

const cardingDepartmentTypes = [
    { id: 0, name: "Process Parameter", aliases: ["Process Parameter", "Process Parameter Data Entry"], component: ProcessParameterDataEntry },
    { id: 1, name: "Between & Within Card Data Entry", aliases: ["Between & Within Card Data Entry", "Between and Within Card Data Entry", "Between Within Card Entry"] },
    { id: 2, name: "Card Thick Place Entry", aliases: ["Card Thick Place Entry", "Card Thick Place Checking"] },
    { id: 3, name: "Trials Data Entry Form", aliases: ["Trials Data Entry Form", "Trials Data Entry", "Trials"] },
    { id: 4, name: "Nati Data Entry", aliases: ["Nati Data Entry"] },
    { id: 5, name: "U% Data Entry", aliases: ["U% Data Entry", "U Percent Data Entry", "U Percentage Data Entry", "U% Checking"] },
    { id: 6, name: "Card DFK Pressure Checking", aliases: ["Card DFK Pressure Checking", "DFK Pressure Checking", "Carding DFK Pressure"] },
];

export const CARDING_INPUT_SCREEN_COUNT = cardingDepartmentTypes.length;

function Carding() {
    const router = useRouter();
    const dispatch = useDispatch();
    const childRef = useRef(null);
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

    useEffect(() => {
        if (!typeOptions.some((item) => item.id === checkingType)) {
            setCheckingType(typeOptions[0]?.id ?? null);
        }
    }, [checkingType, typeOptions]);

    const handleTypeChange = (value) => {
        const selected = typeOptions.find(
            (item) => item.name === value
        );
        setCheckingType(selected?.id ?? null);
        setValidationMessage("");
        setPreviewItems([]);
        setShowPreview(false);
        setShowSuccess(false);
    };

    const selectedType =
        typeOptions.find((item) => item.id === checkingType)?.name || "";
    const selectedOption = typeOptions.find((item) => item.id === checkingType) || null;
    const SelectedComponent = selectedOption?.component ?? null;
    const isProcessParameter = selectedType === "Process Parameter";

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

    return (
        <div className={styles["card-page"]}>
            <div className={styles["card-container"]}>
                <div className={styles["card-breadcrumbs"]}>
                    <button
                        type="button"
                        className={styles["card-breadcrumb-link"]}
                        onClick={() => router.push("/")}
                    >
                        Home
                    </button>
                    <span>&rsaquo;</span>
                    <button
                        type="button"
                        className={styles["card-breadcrumb-link"]}
                        onClick={() => router.push("/dashboard")}
                    >
                        Dashboard
                    </button>
                    <span>&rsaquo;</span>
                    <button
                        type="button"
                        className={styles["card-breadcrumb-link"]}
                        onClick={() => router.push("/departments/quality-control")}
                    >
                        Quality Control
                    </button>
                    <span>&rsaquo;</span>
                    <span className={styles["card-breadcrumb-active"]}>
                        {selectedType || "Carding Notebook QC"}
                    </span>
                </div>

                <div className={styles["card-header"]}>
                    <h1>Quality Control - Carding Notebook</h1>
                    <p>Record and manage industrial machine quality inspections.</p>
                </div>

                <div className={styles["card-shell"]}>
                    {!isProcessParameter ? (
                        <div className={styles["card-form-title"]}>
                            <MdEditNote />
                            <h3>Inspection Data Entry</h3>
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
                            types={typeOptions}
                            selectedType={selectedType}
                            onTypeChange={handleTypeChange}
                            savedVersionsTargetId="carding-process-parameter-saved-versions"
                        />
                    ) : null}

                    {selectedType === "Between & Within Card Data Entry" && (
                        <BetweenWithinCardEntry
                            types={typeOptions}
                            selectedType={selectedType}
                            onTypeChange={handleTypeChange}
                            showForm
                        />
                    )}

                    {selectedType === "Trials Data Entry Form" && (
                        <TrialDepartment
                            types={typeOptions}
                            selectedType={selectedType}
                            onTypeChange={handleTypeChange}
                            showForm
                        />
                    )}

                    {selectedType === "Nati Data Entry" && (
                        <NatiDataEntry
                            types={typeOptions}
                            selectedType={selectedType}
                            onTypeChange={handleTypeChange}
                            showForm
                        />
                    )}

                    {selectedType === "Card Thick Place Entry" || !selectedType ? (
                        <CardThickPlaceEntry
                            types={typeOptions}
                            selectedType={selectedType}
                            onTypeChange={handleTypeChange}
                            showForm={selectedType === "Card Thick Place Entry"}
                        />
                    ) : null}

                    {selectedType === "U% Data Entry" && (
                        <UPercentDataEntry
                            types={typeOptions}
                            selectedType={selectedType}
                            onTypeChange={handleTypeChange}
                        />
                    )}

                    {selectedType === "Card DFK Pressure Checking" && (
                        <CardingDfk
                            types={typeOptions}
                            selectedType={selectedType}
                            onTypeChange={handleTypeChange}
                        />
                    )}

                    {isProcessParameter && validationMessage ? (
                        <div className={styles["message-box"]}>
                            {validationMessage}
                        </div>
                    ) : null}

                    {isProcessParameter ? (
                        <Footer
                            onBack={() => router.push("/dashboard")}
                            onClear={() => {
                                setValidationMessage("");
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
                                        <td colSpan={10} style={{ padding: "14px", color: "#666" }}>
                                            Loading...
                                        </td>
                                    </tr>
                                ) : uqcEntries.length ? uqcEntries.map((entry, i) => (
                                    <tr
                                        key={entry.id}
                                        style={{
                                            backgroundColor: i % 2 === 0 ? "#fff" : "#fafafa",
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
                                        <td colSpan={10} style={{ padding: "14px", color: "#666" }}>
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
