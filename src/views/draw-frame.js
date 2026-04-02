import { useMemo, useState } from "react";
import { useRouter } from "next/router";
import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { MdOutlineEditNote } from "react-icons/md";

import Footer from "@/components/Footer";
import { clearDrawFrameState, submitDrawFrameInspection } from "@/store/slices/draw-frame";
import styles from "@/styles/draw-frame.module.css";

const today = new Date().toISOString().split("T")[0];

const machineOptions = [
    "DF-01",
    "DF-02",
    "DF-03",
    "DF-04",
];

const formatMetric = (value) => (Number.isFinite(value) ? value.toFixed(2) : "");

const emptyMetric = () => ({
    avg: "",
    hank: "",
    sd: "",
    cv: "",
});

function DrawFrame() {
    const router = useRouter();
    const dispatch = useDispatch();
    const { actionLoading, actionSuccess, error } = useSelector((state) => state.drawFrame);

    const [form, setForm] = useState({
        type: "Yarn CV% Calculation Form",
        serialNumber: "",
        date: today,
        machineNumber: "",
        remarks: "",
        readingCount: 5,
    });
    const [oneYardReadings, setOneYardReadings] = useState([]);
    const [halfYardReadings, setHalfYardReadings] = useState([]);
    const [oneYardMetrics, setOneYardMetrics] = useState([]);
    const [halfYardMetrics, setHalfYardMetrics] = useState([]);
    const [hasCalculated, setHasCalculated] = useState(false);

    const handleFormChange = (field, value) => {
        setForm((current) => ({
            ...current,
            [field]: field === "readingCount" ? Number(value) || 0 : value,
        }));
    };

    const handleGenerate = () => {
        const count = Math.max(Number(form.readingCount) || 0, 0);
        setOneYardReadings(Array.from({ length: count }, () => ""));
        setHalfYardReadings(Array.from({ length: count }, () => ""));
        setOneYardMetrics(Array.from({ length: count }, () => emptyMetric()));
        setHalfYardMetrics(Array.from({ length: count }, () => emptyMetric()));
        setHasCalculated(false);
    };

    const handleCalculate = () => {
        const calculateMetricSet = (metrics) =>
            metrics.map((metric) => {
                const avg = Number(metric.avg);
                const sd = Number(metric.sd);
                const cv = avg > 0 && !Number.isNaN(sd) ? formatMetric((sd / avg) * 100) : "";

                return {
                    ...metric,
                    cv,
                };
            });

        setOneYardMetrics((current) => calculateMetricSet(current));
        setHalfYardMetrics((current) => calculateMetricSet(current));
        setHasCalculated(true);
    };

    const handleClear = () => {
        setForm({
            type: "Yarn CV% Calculation Form",
            serialNumber: "",
            date: today,
            machineNumber: "",
            remarks: "",
            readingCount: 5,
        });
        setOneYardReadings([]);
        setHalfYardReadings([]);
        setOneYardMetrics([]);
        setHalfYardMetrics([]);
        setHasCalculated(false);
        dispatch(clearDrawFrameState());
    };

    const readingResultCards = useMemo(
        () =>
            Array.from({ length: Math.max(oneYardMetrics.length, halfYardMetrics.length) }, (_, index) => ({
                key: `reading-result-${index}`,
                label: `Reading - ${index + 1}`,
                oneYard: oneYardMetrics[index] || emptyMetric(),
                halfYard: halfYardMetrics[index] || emptyMetric(),
            })),
        [oneYardMetrics, halfYardMetrics]
    );

    const handleSubmit = () => {
        // Take first reading (or compute average if needed)
        const firstOneYard = oneYardMetrics[0] || {};
        const firstHalfYard = halfYardMetrics[0] || {};

        const payload = {
            type: form.type,
            s_no: form.serialNumber,
            entry_date: form.date,
            machine_number: form.machineNumber,
            remarks: form.remarks,
            num_readings: Number(form.readingCount),

            results: {
                avg_1yd: Number(firstOneYard.avg) || 0,
                hank_1yd: Number(firstOneYard.hank) || 0,
                sd_1yd: Number(firstOneYard.sd) || 0,
                cv_1yd: Number(firstOneYard.cv) || 0,

                avg_half: Number(firstHalfYard.avg) || 0,
                hank_half: Number(firstHalfYard.hank) || 0,
                sd_half: Number(firstHalfYard.sd) || 0,
                cv_half: Number(firstHalfYard.cv) || 0,
            },
        };

        console.log("FINAL PAYLOAD:", payload); // 👈 DEBUG

        dispatch(submitDrawFrameInspection(payload));
    };

    const handleMetricChange = (setter, index, field, value) => {
        setter((current) =>
            current.map((item, itemIndex) =>
                itemIndex === index
                    ? {
                        ...item,
                        [field]: value,
                        ...(field !== "cv" ? { cv: "" } : {}),
                    }
                    : item
            )
        );
        setHasCalculated(false);
    };
    useEffect(() => {
        if (actionSuccess) {
            alert("Data submitted successfully");
            handleClear();
        }
    }, [actionSuccess]);

    const renderMetricInput = (label, value, onChange, readOnly = false) => (
        <div className={styles.field}>
            <label className={styles.label}>{label}</label>
            <input
                readOnly={readOnly}
                value={value}
                onChange={onChange}
                className={styles.metricInput}
            />
        </div>
    );

    return (
        <div className={styles.page}>
            <div className={styles.container}>
                <div className={styles.breadcrumbs}>
                    <button type="button" className={styles.breadcrumbButton} onClick={() => router.push("/")}>
                        Home
                    </button>
                    <span>&rsaquo;</span>
                    <button type="button" className={styles.breadcrumbButton} onClick={() => router.push("/dashboard")}>
                        Dashboard
                    </button>
                    <span>&rsaquo;</span>
                    <button
                        type="button"
                        className={styles.breadcrumbButton}
                        onClick={() => router.push("/departments/quality-control")}
                    >
                        Quality Control
                    </button>
                    <span>&rsaquo;</span>
                    <span className={styles.breadcrumbCurrent}>Draw Frame Notebook QC</span>
                </div>

                <div className={styles.header}>
                    <h1 className={styles.title}>Quality Control - Draw Frame Notebook</h1>
                    <p className={styles.description}>Record and manage industrial machine quality inspections.</p>
                </div>

                <div className={styles.card}>
                    <div className={styles.cardBody}>
                        <div className={styles.sectionHeader}>
                            <MdOutlineEditNote className={styles.sectionIcon} />
                            <h2 className={styles.sectionTitle}>Inspection Data Entry</h2>
                        </div>

                        <div className={styles.formGrid}>
                            <div className={styles.field}>
                                <label className={styles.label}>Type</label>
                                <select
                                    value={form.type}
                                    onChange={(e) => handleFormChange("type", e.target.value)}
                                    className={styles.select}
                                >
                                    <option value="Yarn CV% Calculation Form">Yarn CV% Calculation Form</option>
                                </select>
                            </div>

                            <div className={styles.field}>
                                <label className={styles.label}>S. No.</label>
                                <input
                                    value={form.serialNumber}
                                    onChange={(e) => handleFormChange("serialNumber", e.target.value)}
                                    className={styles.input}
                                />
                            </div>

                            <div className={styles.field}>
                                <label className={styles.label}>Date</label>
                                <input
                                    type="date"
                                    value={form.date}
                                    onChange={(e) => handleFormChange("date", e.target.value)}
                                    className={styles.input}
                                />
                            </div>

                            <div className={styles.field}>
                                <label className={styles.label}>Machine Number</label>
                                <select
                                    value={form.machineNumber}
                                    onChange={(e) => handleFormChange("machineNumber", e.target.value)}
                                    className={styles.select}
                                >
                                    <option value="">Select Machine Number</option>
                                    {machineOptions.map((machine) => (
                                        <option key={machine} value={machine}>
                                            {machine}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className={`${styles.field} ${styles.fieldWide}`}>
                                <label className={styles.label}>Remarks</label>
                                <textarea
                                    rows={4}
                                    value={form.remarks}
                                    onChange={(e) => handleFormChange("remarks", e.target.value)}
                                    className={styles.textarea}
                                />
                            </div>

                            <div className={styles.fieldActions}>
                                <div className={`${styles.field} ${styles.fieldGrow}`}>
                                    <label className={styles.label}>Number of Readings (N)</label>
                                    <input
                                        type="number"
                                        min="1"
                                        value={form.readingCount}
                                        onChange={(e) => handleFormChange("readingCount", e.target.value)}
                                        className={styles.input}
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={handleGenerate}
                                    className={`${styles.button} ${styles.generateButton}`}
                                >
                                    Generate
                                </button>
                            </div>
                        </div>

                        <div className={styles.calculateWrap}>
                            <button
                                type="button"
                                onClick={handleCalculate}
                                className={`${styles.button} ${styles.calculateButton}`}
                            >
                                Calculate CV%
                            </button>
                        </div>

                        <div className={styles.resultsWrap}>
                            {readingResultCards.length ? (
                                readingResultCards.map((item, index) => (
                                    <div key={item.key} className={styles.readingBlock}>
                                        <h3 className={styles.readingTitle}>{item.label}</h3>

                                        <div className={styles.resultCard}>
                                            <div className={styles.resultSection}>
                                                <h4 className={styles.resultTitle}>Calculation Results - 1 yard Readings</h4>
                                                <div className={styles.metricsGrid}>
                                                    {renderMetricInput(
                                                        "AVG (1 Yard)",
                                                        item.oneYard.avg,
                                                        (e) =>
                                                            handleMetricChange(
                                                                setOneYardMetrics,
                                                                index,
                                                                "avg",
                                                                e.target.value
                                                            )
                                                    )}
                                                    {renderMetricInput(
                                                        "HANK (1 Yard)",
                                                        item.oneYard.hank,
                                                        (e) =>
                                                            handleMetricChange(
                                                                setOneYardMetrics,
                                                                index,
                                                                "hank",
                                                                e.target.value
                                                            )
                                                    )}
                                                    {renderMetricInput(
                                                        "SD (1 Yard)",
                                                        item.oneYard.sd,
                                                        (e) =>
                                                            handleMetricChange(
                                                                setOneYardMetrics,
                                                                index,
                                                                "sd",
                                                                e.target.value
                                                            )
                                                    )}
                                                </div>
                                                <div className={styles.metricCompact}>
                                                    {renderMetricInput("CV% (1 Yard)", hasCalculated ? item.oneYard.cv : "", undefined, true)}
                                                </div>
                                            </div>

                                            <div className={styles.resultSection}>
                                                <h4 className={styles.resultTitle}>Calculation Results - 1/2 yard Readings</h4>
                                                <div className={styles.metricsGrid}>
                                                    {renderMetricInput(
                                                        "AVG (1/2 Yard)",
                                                        item.halfYard.avg,
                                                        (e) =>
                                                            handleMetricChange(
                                                                setHalfYardMetrics,
                                                                index,
                                                                "avg",
                                                                e.target.value
                                                            )
                                                    )}
                                                    {renderMetricInput(
                                                        "HANK (1/2 Yard)",
                                                        item.halfYard.hank,
                                                        (e) =>
                                                            handleMetricChange(
                                                                setHalfYardMetrics,
                                                                index,
                                                                "hank",
                                                                e.target.value
                                                            )
                                                    )}
                                                    {renderMetricInput(
                                                        "SD (1/2 Yard)",
                                                        item.halfYard.sd,
                                                        (e) =>
                                                            handleMetricChange(
                                                                setHalfYardMetrics,
                                                                index,
                                                                "sd",
                                                                e.target.value
                                                            )
                                                    )}
                                                </div>
                                                <div className={styles.metricCompact}>
                                                    {renderMetricInput(
                                                        "CV% (1/2 Yard)",
                                                        hasCalculated ? item.halfYard.cv : "",
                                                        undefined,
                                                        true
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className={styles.resultCard}>
                                    <div className={styles.resultSection}>
                                        <h4 className={styles.resultTitle}>Calculation Results - 1 yard Readings</h4>
                                        <div className={styles.metricsGrid}>
                                            {renderMetricInput("AVG (1 Yard)", "")}
                                            {renderMetricInput("HANK (1 Yard)", "")}
                                            {renderMetricInput("SD (1 Yard)", "")}
                                        </div>
                                        <div className={styles.metricCompact}>
                                            {renderMetricInput("CV% (1 Yard)", "")}
                                        </div>
                                    </div>

                                    <div className={styles.resultSection}>
                                        <h4 className={styles.resultTitle}>Calculation Results - 1/2 yard Readings</h4>
                                        <div className={styles.metricsGrid}>
                                            {renderMetricInput("AVG (1/2 Yard)", "")}
                                            {renderMetricInput("HANK (1/2 Yard)", "")}
                                            {renderMetricInput("SD (1/2 Yard)", "")}
                                        </div>
                                        <div className={styles.metricCompact}>
                                            {renderMetricInput("CV% (1/2 Yard)", "")}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {actionSuccess && (
                            <p className={styles.messageSuccess}>Draw Frame inspection saved successfully.</p>
                        )}
                        {error && <p className={styles.messageError}>{error}</p>}
                    </div>

                    <Footer
                        onBack={() => router.push("/dashboard")}
                        onClear={handleClear}
                        onSave={handleSubmit}
                        saveLabel={actionLoading ? "Submitting..." : "Submit"}
                        disabled={actionLoading}
                    />
                </div>
            </div>
        </div>
    );
}

export default DrawFrame;

