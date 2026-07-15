import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import { MdEditNote } from "react-icons/md";
import RibbonLapCVDataEntry from "./comber/ribbonLapCVDataEntry";
import NatiDataEntry from "./comber/natiDataEntry";
import UPercentDataEntry from "./comber/u%dataentry";
import ComberNreDataEntry from "./comber/comberNreDataEntry";
import ComberEfficiencyDataEntry from "./comber/comberEfficiencyDataEntry";
import styles from "./comber/ribbonLapCVDataEntry.module.css";
import PreviewModal from "@/components/PreviewModal";
import InputScreenUploadButton from "@/components/InputScreenUploadButton";
import PdfOcrTableEntry from "@/components/PdfOcrTableEntry";
import Footer from "@/components/Footer";
import { useSelector, useDispatch } from "react-redux";
import { clearComberState, submitComberUqc } from "@/store/slices/comber";
import { filterOptionsByDepartmentAccess } from "@/utils/screenAccess";
import { recordSubmittedNotebook } from "@/utils/submittedNotebookRecorder";
import useDatabaseEntryId from "@/hooks/useDatabaseEntryId";
import { useThemeMode } from "@/utils/useThemeMode";

const comberDepartmentTypes = [
    {
        id: 1,
        name: "Ribbon Lap CV1M Data Entry",
        aliases: ["Ribbon Lap CV1M Data Entry", "Ribbon Lap CV Data Entry", "Ribbon Lap CV", "Comber Lap 1mCV Data Entry"],
    },
    {
        id: 2,
        name: "Nati Data Entry",
        aliases: ["Nati Data Entry"],
    },
    {
        id: 3,
        name: "U% Data Entry",
        aliases: ["U% Data Entry", "U Percent Data Entry", "U% Checking"],
    },
    {
        id: 4,
        name: "Comber Nolis %",
        aliases: ["Comber Nolis %", "Comber Nolis Percent", "Nolis %", "Nolis Percent"],
    },
    {
        id: 5,
        name: "Comber NRE%",
        aliases: ["Comber NRE%", "Comber NRE Percent", "NRE%", "NRE Percent"],
    },
    {
        id: 6,
        name: "Comber Efficiency",
        aliases: ["Comber Efficiency", "Comber Efficiency Data Entry"],
    },
];

export const COMBER_INPUT_SCREEN_COUNT = comberDepartmentTypes.length;
const COMBER_ENTRY_ID_CONFIG = {
    "Ribbon Lap CV1M Data Entry": { prefix: "RLC", width: 4, routePath: "/comber/lap-cv" },
    "Nati Data Entry": { prefix: "NAT", width: 4, routePath: "/comber/nati-data-entry" },
    "U% Data Entry": { prefix: "COU", width: 4, routePath: "/comber/uqc" },
    "Comber Nolis %": { prefix: "CNP", width: 4, routePath: "/drawframe/comber-noil-percent" },
    "Comber NRE%": { prefix: "CNRE", width: 4, routePath: "/comber/nre" },
    "Comber Efficiency": { prefix: "CEFF", width: 4, routePath: "/comber/efficiency" },
};

const getComberEntryConfig = (typeName) =>
    COMBER_ENTRY_ID_CONFIG[typeName] || { prefix: "COM" };

function Comber() {
  const [currentDateLabel, setCurrentDateLabel] = useState("");
  useEffect(() => {
    setCurrentDateLabel(new Date().toLocaleDateString("en-IN"));
  }, []);
    const router = useRouter();
    const dispatch = useDispatch();
    const { data, isLoading, listLoading, uqcEntries = [] } = useSelector((state) => state.comber ?? {});
    const { isDarkMode } = useThemeMode();
    const user = useSelector((state) => state.auth?.user);
    const accessByDepartment = useSelector((state) => state.auth?.accessByDepartment);
    const typeOptions = filterOptionsByDepartmentAccess(
        comberDepartmentTypes,
        accessByDepartment,
        user,
        "Comber"
    );

    const entryTableTheme = {
        surface: isDarkMode ? "#050505" : "#ffffff",
        header: isDarkMode ? "#1f2937" : "#f4f6f8",
        rowEven: isDarkMode ? "#111827" : "#ffffff",
        rowOdd: isDarkMode ? "#0f172a" : "#fafafa",
        border: isDarkMode ? "#374151" : "#e0e0e0",
        cellBorder: isDarkMode ? "#374151" : "#eaeaea",
        title: isDarkMode ? "#f8fafc" : "#333333",
        headText: isDarkMode ? "#f8fafc" : "#444444",
        text: isDarkMode ? "#f8fafc" : "#555555",
        muted: isDarkMode ? "#9ca3af" : "#666666",
        accent: isDarkMode ? "#60a5fa" : "#1976d2",
    };


    const childRef = useRef(null);
    const [checkingType, setCheckingType] = useState(typeOptions[0]?.id ?? null);
    const [showPreview, setShowPreview] = useState(false);
    const [previewItems, setPreviewItems] = useState([]);
    const selectedType = typeOptions.find((item) => item.id === checkingType)?.name || "";
    const { entryId, reserveEntryId, loading: entryIdLoading } = useDatabaseEntryId({
        department: "Comber",
        typeName: selectedType,
        config: getComberEntryConfig(selectedType),
    });

    const handleTypeChange = (value) => {
        const selectedType = typeOptions.find((item) => item.name === value);
        setCheckingType(selectedType?.id ?? null);
    };

    useEffect(() => {
        if (!typeOptions.some((item) => item.id === checkingType)) {
            setCheckingType(typeOptions[0]?.id ?? null);
        }
    }, [checkingType, typeOptions]);

    useEffect(() => {
        if (data) {
            childRef.current?.clear?.();
            dispatch(clearComberState());
        }
    }, [data, dispatch]);
    const handleSubmit = useCallback(async () => {
        if (entryIdLoading || !entryId) {
            return;
        }
        try {
            const ok = await childRef.current?.submit?.();
            if (ok) {
                await recordSubmittedNotebook({
                    department: "Quality Control",
                    subDepartment: "Comber",
                    notebookName: selectedType,
                    entryId,
                    childRef,
                    previewItems,
                    user,
                });
                await reserveEntryId();
            }
        } catch (e) {
            // child handles its own errors
        }
    }, [entryId, entryIdLoading, previewItems, reserveEntryId, selectedType, user]);

    const handleCalculate = useCallback(() => {
        childRef.current?.calculateStats?.();
    }, []);

    const handleClear = useCallback(() => {
        childRef.current?.clear?.();
    }, []);

    const openPreview = useCallback(() => {
        if (entryIdLoading || !entryId) return;
        const valid = childRef.current?.validate ? childRef.current.validate() : true;
        if (valid === false) return;

        const items = childRef.current?.getPreviewData ? childRef.current.getPreviewData() : [];
        const headerItems = [
            { label: "Type", value: selectedType || "Select Type" },
            { label: "Entry ID", value: entryId || "-" },
        ];
        setPreviewItems([...headerItems, ...items]);
        setShowPreview(true);
    }, [entryId, entryIdLoading, selectedType]);

    const confirmSubmit = useCallback(async () => {
        setShowPreview(false);
        if (entryIdLoading || !entryId) return;
        try {
            const ok = await childRef.current?.submit?.();
            if (ok) {
                await recordSubmittedNotebook({
                    department: "Quality Control",
                    subDepartment: "Comber",
                    notebookName: selectedType,
                    entryId,
                    childRef,
                    previewItems,
                    user,
                });
                await reserveEntryId();
            }
        } catch (e) {
            // child handles errors
        }
    }, [entryId, entryIdLoading, previewItems, reserveEntryId, selectedType, user]);

    return (
        <div className={styles["cb-page"]}>
            <div className={styles["cb-container"]} id="car-container">
                <div className={styles["mobile-navbar"]}>
                    <div className={styles["hamburger"]}></div>
                    <img src="/logo.png" alt="Company Logo" />
                </div>

                <div className={styles["cb-header"]}>
                    <h1>Quality Control - Comber Notebook</h1>
          <div className="mt-2 text-right text-base font-semibold text-slate-600">Current Date: {currentDateLabel}</div>
                </div>

                <div className={styles["cb-card"]}>
                    <div className={styles["cb-form-title"]}>
                        <MdEditNote id="car-title-icon" />
                        <h3>Inspection Data Entry</h3>
                        {selectedType !== "Comber Nolis %" ? (
                            <InputScreenUploadButton className="ml-auto" />
                        ) : null}
                    </div>

                    {!typeOptions.length ? (
                        <div className={styles["cb-message-box"]}>
                            No accessible input screens are available for this department.
                        </div>
                    ) : selectedType === "Nati Data Entry" ? (
                        <>
                            <NatiDataEntry
                                ref={childRef}
                                entryId={entryId}
                                types={typeOptions}
                                selectedType={selectedType}
                                onTypeChange={handleTypeChange}
                                showForm={Boolean(checkingType)}
                            />

                            <div style={{ margin: "0 -24px -20px -24px" }}>
                                    <Footer
                                        onBack={() => router.push("/departments/quality-control")}
                                        onClear={handleClear}
                                        onSave={openPreview}
                                        saveLabel={isLoading ? "Submitting..." : "Save Record"}
                                        disabled={isLoading || entryIdLoading}
                                    />
                            </div>
                        </>
                    ) : selectedType === "U% Data Entry" ? (
                        <>
                            <UPercentDataEntry
                                ref={childRef}
                                entryId={entryId}
                                types={typeOptions}
                                selectedType={selectedType}
                                onTypeChange={handleTypeChange}
                            />

                            <div style={{ margin: "0 -24px -20px -24px" }}>
                                    <Footer
                                        onBack={() => router.push("/departments/quality-control")}
                                        onClear={handleClear}
                                        onSave={openPreview}
                                        saveLabel={isLoading ? "Submitting..." : "Save Record"}
                                        disabled={isLoading || entryIdLoading}
                                    />
                            </div>
                        </>
                    ) : selectedType === "Comber NRE%" ? (
                        <>
                            <ComberNreDataEntry
                                ref={childRef}
                                entryId={entryId}
                                types={typeOptions}
                                selectedType={selectedType}
                                onTypeChange={handleTypeChange}
                            />

                            <div style={{ margin: "24px -24px -20px -24px" }}>
                                    <Footer
                                        onBack={() => router.push("/departments/quality-control")}
                                        onClear={handleClear}
                                        onSave={openPreview}
                                        saveLabel={isLoading ? "Submitting..." : "Save Record"}
                                        disabled={isLoading || entryIdLoading}
                                    />
                            </div>
                        </>
                    ) : selectedType === "Comber Efficiency" ? (
                        <>
                            <ComberEfficiencyDataEntry
                                ref={childRef}
                                entryId={entryId}
                                types={typeOptions}
                                selectedType={selectedType}
                                onTypeChange={handleTypeChange}
                            />

                            <div style={{ margin: "24px -24px -20px -24px" }}>
                                    <Footer
                                        onBack={() => router.push("/departments/quality-control")}
                                        onClear={handleClear}
                                        onSave={openPreview}
                                        saveLabel={isLoading ? "Submitting..." : "Save Record"}
                                        disabled={isLoading || entryIdLoading}
                                    />
                            </div>
                        </>
                    ) : selectedType === "Comber Nolis %" ? (
                        <>
                            <PdfOcrTableEntry
                                ref={childRef}
                                selectedType={selectedType}
                                onTypeChange={handleTypeChange}
                                typeOptions={typeOptions}
                                docType="noils"
                                entryId={entryId}
                                reserveEntryId={reserveEntryId}
                            />

                            <div style={{ margin: "0 -24px -20px -24px" }}>
                                    <Footer
                                        onBack={() => router.push("/departments/quality-control")}
                                        onClear={handleClear}
                                        onSave={openPreview}
                                        saveLabel={isLoading ? "Submitting..." : "Save Record"}
                                        disabled={isLoading || entryIdLoading}
                                    />
                            </div>
                        </>
                    ) : selectedType === "U% Data Entry" ? (
                        <>
                            <UqcEntryForm
                                ref={childRef}
                                typeOptions={typeOptions}
                                selectedType={selectedType}
                                onTypeChange={handleTypeChange}
                                departmentValue="Comber"
                                submitHandler={(payload) => dispatch(submitComberUqc(payload)).unwrap()}
                            />

                            <div style={{ margin: "16px -24px 0 -24px" }}>
                                    <Footer
                                        onBack={() => router.push("/departments/quality-control")}
                                        onClear={handleClear}
                                        onSave={openPreview}
                                        saveLabel={isLoading ? "Submitting..." : "Save Record"}
                                        disabled={isLoading || entryIdLoading}
                                    />
                            </div>
                        </>
                    ) : (
                        <RibbonLapCVDataEntry
                            ref={childRef}
                            entryId={entryId}
                            types={typeOptions}
                            selectedType={selectedType}
                            onTypeChange={handleTypeChange}
                            showForm={Boolean(checkingType)}
                            onPreview={openPreview}
                        />
                    )}
                </div>
                    {selectedType === "U% Data Entry" && (
    <div
        className="print:hidden"
        style={{
            marginTop: "20px",
            background: entryTableTheme.surface,
            borderRadius: "10px",
            padding: "16px",
            boxShadow: isDarkMode ? "0 0 0 rgba(0,0,0,0)" : "0 2px 8px rgba(0,0,0,0.06)",
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
                        key={`${entry.id ?? "row"}-${i}`}
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
                title="Quality Control - Comber Notebook"
                subtitle="Preview"
                items={previewItems}
                typeValue={selectedType || "Select Type"}
                onCancel={() => setShowPreview(false)}
                onConfirm={confirmSubmit}
                confirmLabel="Submit"
            />

        </div>
    );
}

export default Comber;




