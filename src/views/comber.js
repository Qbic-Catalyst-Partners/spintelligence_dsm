import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import { MdEditNote } from "react-icons/md";
import RibbonLapCVDataEntry from "./comber/ribbonLapCVDataEntry";
import NatiDataEntry from "./comber/natiDataEntry";
import UPercentDataEntry from "./comber/u%dataentry";
import styles from "./comber/ribbonLapCVDataEntry.module.css";
import PreviewModal from "@/components/PreviewModal";
import SuccessModal from "@/components/SuccessModal";
import Footer from "@/components/Footer";
import { useSelector, useDispatch } from "react-redux";
import { clearComberState, submitComberUqc } from "@/store/slices/comber";
import { filterOptionsByDepartmentAccess } from "@/utils/screenAccess";

const comberDepartmentTypes = [
    {
        id: 1,
        name: "Ribbon Lap CV Data Entry",
        aliases: ["Ribbon Lap CV Data Entry", "Ribbon Lap CV"],
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
];

export const COMBER_INPUT_SCREEN_COUNT = comberDepartmentTypes.length;
function Comber() {
    const router = useRouter();
    const dispatch = useDispatch();
    const { data, isLoading, listLoading, uqcEntries = [] } = useSelector((state) => state.comber ?? {});
    const user = useSelector((state) => state.auth?.user);
    const accessByDepartment = useSelector((state) => state.auth?.accessByDepartment);
    const typeOptions = filterOptionsByDepartmentAccess(
        comberDepartmentTypes,
        accessByDepartment,
        user,
        "Comber"
    );
    const childRef = useRef(null);
    const [checkingType, setCheckingType] = useState(typeOptions[0]?.id ?? null);
    const [showSuccess, setShowSuccess] = useState(false);
    const [showPreview, setShowPreview] = useState(false);
    const [previewItems, setPreviewItems] = useState([]);

    const handleTypeChange = (value) => {
        const selectedType = typeOptions.find((item) => item.name === value);
        setCheckingType(selectedType?.id ?? null);
    };

    const selectedType = typeOptions.find((item) => item.id === checkingType)?.name || "";

    useEffect(() => {
        if (!typeOptions.some((item) => item.id === checkingType)) {
            setCheckingType(typeOptions[0]?.id ?? null);
        }
    }, [checkingType, typeOptions]);

    useEffect(() => {
        if (data) setShowSuccess(true);
    }, [data]);

    const handleSubmit = useCallback(async () => {
        try {
            const ok = await childRef.current?.submit?.();
            if (ok) setShowSuccess(true);
        } catch (e) {
            // child handles its own errors
        }
    }, []);

    const handleCalculate = useCallback(() => {
        childRef.current?.calculateStats?.();
    }, []);

    const handleClear = useCallback(() => {
        childRef.current?.clear?.();
    }, []);

    const openPreview = useCallback(() => {
        const valid = childRef.current?.validate ? childRef.current.validate() : true;
        if (valid === false) return;

        const items = childRef.current?.getPreviewData ? childRef.current.getPreviewData() : [];
        const headerItems = [
            { label: "Type", value: selectedType || "Select Type" },
        ];
        setPreviewItems([...headerItems, ...items]);
        setShowPreview(true);
    }, [selectedType]);

    const confirmSubmit = useCallback(async () => {
        setShowPreview(false);
        try {
            const ok = await childRef.current?.submit?.();
            if (ok) setShowSuccess(true);
        } catch (e) {
            // child handles errors
        }
    }, []);

    return (
        <div className={styles["cb-page"]}>
            <div className={styles["cb-container"]} id="car-container">
                <div className={styles["mobile-navbar"]}>
                    <div className={styles["hamburger"]}></div>
                    <img src="/logo.png" alt="Company Logo" />
                </div>

                <div className={styles["cb-breadcrumbs"]}>
                    <button
                        type="button"
                        className={styles["cb-breadcrumb-link"]}
                        onClick={() => router.push("/")}
                    >
                        Home
                    </button>
                    <span>&rsaquo;</span>
                    <button
                        type="button"
                        className={styles["cb-breadcrumb-link"]}
                        onClick={() => router.push("/dashboard")}
                    >
                        Dashboard
                    </button>
                    <span>&rsaquo;</span>
                    <button
                        type="button"
                        className={styles["cb-breadcrumb-link"]}
                        onClick={() => router.push("/departments/quality-control")}
                    >
                        Quality Control
                    </button>
                    <span>&rsaquo;</span>
                    <span className={styles["cb-breadcrumb-active"]}>Comber Notebook QC</span>
                </div>

                <div className={styles["cb-header"]}>
                    <h1>Quality Control - Comber Notebook</h1>
                    <p>Record and manage industrial machine quality inspections.</p>
                </div>

                <div className={styles["cb-card"]}>
                    <div className={styles["cb-form-title"]}>
                        <MdEditNote id="car-title-icon" />
                        <h3>Inspection Data Entry</h3>
                    </div>

                    {!typeOptions.length ? (
                        <div className={styles["cb-message-box"]}>
                            No accessible input screens are available for this department.
                        </div>
                    ) : selectedType === "Nati Data Entry" ? (
                        <>
                            <NatiDataEntry
                                ref={childRef}
                                types={typeOptions}
                                selectedType={selectedType}
                                onTypeChange={handleTypeChange}
                                showForm={Boolean(checkingType)}
                            />

                            <div style={{ margin: "0 -24px -20px -24px" }}>
                                <Footer
                                    onBack={() => router.push("/dashboard")}
                                    onClear={handleClear}
                                    onSave={openPreview}
                                    saveLabel={isLoading ? "Submitting..." : "Save Record"}
                                    disabled={isLoading}
                                />
                            </div>
                        </>
                    ) : selectedType === "U% Data Entry" ? (
                        <>
                            <UPercentDataEntry
                                ref={childRef}
                                types={typeOptions}
                                selectedType={selectedType}
                                onTypeChange={handleTypeChange}
                            />

                            <div style={{ margin: "0 -24px -20px -24px" }}>
                                <Footer
                                    onBack={() => router.push("/dashboard")}
                                    onClear={handleClear}
                                    onSave={openPreview}
                                    saveLabel={isLoading ? "Submitting..." : "Save Record"}
                                    disabled={isLoading}
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
                                    onBack={() => router.push("/dashboard")}
                                    onClear={handleClear}
                                    onSave={openPreview}
                                    saveLabel={isLoading ? "Submitting..." : "Save Record"}
                                    disabled={isLoading}
                                />
                            </div>
                        </>
                    ) : (
                        <RibbonLapCVDataEntry
                            ref={childRef}
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
        style={{
            marginTop: "20px",
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
                title="Quality Control - Comber Notebook"
                subtitle="Preview"
                items={previewItems}
                typeValue={selectedType || "Select Type"}
                onCancel={() => setShowPreview(false)}
                onConfirm={confirmSubmit}
                confirmLabel="Submit"
            />

            <SuccessModal
                open={showSuccess}
                message="Data Submitted"
                typeValue={selectedType || "Comber"}
                onClose={() => {
                    setShowSuccess(false);
                    childRef.current?.clear?.();
                    dispatch(clearComberState());
                }}
            />
        </div>
    );
}

export default Comber;
