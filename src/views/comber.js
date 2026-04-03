import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import { MdEditNote } from "react-icons/md";
import RibbonLapCVDataEntry from "./comber/ribbonLapCVDataEntry";
import NatiDataEntry from "./comber/natiDataEntry";
import UqcEntryForm from "@/components/UqcEntryForm";
import styles from "./comber/ribbonLapCVDataEntry.module.css";
import PreviewModal from "@/components/PreviewModal";
import SuccessModal from "@/components/SuccessModal";
import Footer from "@/components/Footer";
import { useSelector, useDispatch } from "react-redux";
import { clearComberState, submitComberUqcDataEntry } from "@/store/slices/comber";

const comberDepartmentTypes = [
    {
        id: 1,
        name: "Ribbon Lap CV Data Entry",
    },
    {
        id: 2,
        name: "Nati Data Entry",
    },
    {
        id: 3,
        name: "U% Data Entry",
    },
];

function Comber() {
    const router = useRouter();
    const dispatch = useDispatch();
    const { data, isLoading } = useSelector((state) => state.comber ?? {});
    const childRef = useRef(null);
    const [checkingType, setCheckingType] = useState(null);
    const [showSuccess, setShowSuccess] = useState(false);
    const [showPreview, setShowPreview] = useState(false);
    const [previewItems, setPreviewItems] = useState([]);

    const handleTypeChange = (value) => {
        const selectedType = comberDepartmentTypes.find((item) => item.name === value);
        setCheckingType(selectedType?.id ?? null);
    };

    const selectedType = comberDepartmentTypes.find((item) => item.id === checkingType)?.name || "";

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

                    {selectedType === "Nati Data Entry" ? (
                        <>
                            <NatiDataEntry
                                ref={childRef}
                                types={comberDepartmentTypes}
                                selectedType={selectedType}
                                onTypeChange={handleTypeChange}
                                showForm={Boolean(checkingType)}
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
                    ) : selectedType === "U% Data Entry" ? (
                        <>
                            <UqcEntryForm
                                ref={childRef}
                                typeOptions={comberDepartmentTypes}
                                selectedType={selectedType}
                                onTypeChange={handleTypeChange}
                                departmentValue="Comber"
                                submitHandler={(payload) => dispatch(submitComberUqcDataEntry(payload)).unwrap()}
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
                            types={comberDepartmentTypes}
                            selectedType={selectedType}
                            onTypeChange={handleTypeChange}
                            showForm={Boolean(checkingType)}
                            onPreview={openPreview}
                        />
                    )}
                </div>
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
                    dispatch(clearComberState());
                }}
            />
        </div>
    );
}

export default Comber;
