import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { useDispatch, useSelector } from "react-redux";
import Footer from "@/components/Footer";
import { clearCardingState, submitCardingBetweenWithin } from "@/store/slices/carding";
import PreviewModal from "@/components/PreviewModal";
import { sanitizeNumericInput } from "@/utils/inputValidation";

const machineOptions = Array.from({ length: 25 }, (_, index) => `CDG-${String(index + 1).padStart(2, "0")}`);

const statFields = [
    { key: "avg", label: "Avg" },
    { key: "max", label: "Max" },
    { key: "min", label: "Min" },
    { key: "range", label: "Range" },
    { key: "sd", label: "SD" },
    { key: "cv", label: "CV" },
];

const emptyStats = {
    avg: "",
    max: "",
    min: "",
    range: "",
    sd: "",
    cv: "",
};

const createRows = (count) =>
    Array.from({ length: count }, () => ({
        sampleWeight: "",
        hank: "",
    }));

const calculateStats = (values) => {
    if (!values.length) return emptyStats;
    const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / values.length;
    const sd = Math.sqrt(variance);
    const cv = avg === 0 ? 0 : (sd / avg) * 100;
    return {
        avg: avg.toFixed(2),
        max: max.toFixed(2),
        min: min.toFixed(2),
        range: range.toFixed(2),
        sd: sd.toFixed(2),
        cv: cv.toFixed(2),
    };
};

function BetweenWithinCardEntry({ types, selectedType, onTypeChange, showForm, hideTypeField = false }) {
    const router = useRouter();
    const dispatch = useDispatch();
    const { isLoading, data, error } = useSelector((state) => state.carding ?? {
        isLoading: false,
        data: null,
        error: null,
    });

    const [entryId, setEntryId] = useState("");
    const [inspectionDate, setInspectionDate] = useState("");
    const [inspectionTime, setInspectionTime] = useState("");
    const [mcName, setMcName] = useState("CDG-05");
    const [inspectionType, setInspectionType] = useState("Within");
    const [entryCount, setEntryCount] = useState(5);
    const [rows, setRows] = useState(createRows(5));
    const [sampleWeightStats, setSampleWeightStats] = useState(emptyStats);
    const [hankStats, setHankStats] = useState(emptyStats);
    const [formMessage, setFormMessage] = useState("");
    const [isError, setIsError] = useState(false);
    const [errors, setErrors] = useState({});
    const [showPreview, setShowPreview] = useState(false);
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const today = new Date();
        setInspectionDate(today.toISOString().split("T")[0]);
        const now = new Date();
        setInspectionTime(
            [String(now.getHours()).padStart(2, "0"), String(now.getMinutes()).padStart(2, "0"), String(now.getSeconds()).padStart(2, "0")].join(":")
        );
        setEntryId(`BW-${Date.now()}`);
    }, []);

    useEffect(() => {
        if (data?.inspection_id) setEntryId(data.inspection_id);
        if (data?.message) {
            setSampleWeightStats(calculateStats(sampleWeights));
            setHankStats(calculateStats(hanks));
            setFormMessage(data.message);
            setIsError(false);
        }
    }, [data]);

    useEffect(() => {
        if (error) {
            setFormMessage(error);
            setIsError(true);
        }
    }, [error]);

    useEffect(() => () => dispatch(clearCardingState()), [dispatch]);

    useEffect(() => {
        const checkScreen = () => setIsMobile(window.innerWidth <= 767);
        checkScreen();
        window.addEventListener("resize", checkScreen);
        return () => window.removeEventListener("resize", checkScreen);
    }, []);

    const sampleWeights = useMemo(
        () => rows.map((row) => parseFloat(row.sampleWeight)).filter((value) => !Number.isNaN(value)),
        [rows]
    );
    const hanks = useMemo(
        () => rows.map((row) => parseFloat(row.hank)).filter((value) => !Number.isNaN(value)),
        [rows]
    );

    useEffect(() => {
        setSampleWeightStats(sampleWeights.length ? calculateStats(sampleWeights) : emptyStats);
        setHankStats(hanks.length ? calculateStats(hanks) : emptyStats);
    }, [sampleWeights, hanks]);

    const handleGenerate = () => {
        const nextCount = Math.min(Math.max(1, Number(entryCount) || 1), 10);
        setEntryCount(nextCount);
        setRows((current) => {
            const next = createRows(nextCount);
            current.slice(0, nextCount).forEach((row, idx) => (next[idx] = row));
            return next;
        });
        setFormMessage("");
        setIsError(false);
        setErrors((current) => {
            const next = { ...current };
            delete next.entryCount;
            return next;
        });
    };

    const handleRowChange = (index, field, value) => {
        const nextValue = sanitizeNumericInput(value, { precision: 10, scale: 3 });
        setRows((currentRows) => {
            const next = [...currentRows];
            next[index] = { ...next[index], [field]: nextValue };
            return next;
        });
        setFormMessage("");
        setIsError(false);
        setErrors((current) => {
            const next = { ...current };
            delete next[`row-${index}-${field}`];
            return next;
        });
    };

    const handleCalculateAll = () => {
        if (!sampleWeights.length || !hanks.length) {
            setFormMessage("Please enter sample weight and hank values before calculating.");
            setIsError(true);
            return;
        }
        setSampleWeightStats(calculateStats(sampleWeights));
        setHankStats(calculateStats(hanks));
        setFormMessage("");
        setIsError(false);
    };

    const validateForm = () => {
        const activeRows = rows.slice(0, Number(entryCount) || rows.length);
        const nextErrors = {};

        if (!selectedType) nextErrors.selectedType = true;
        if (!inspectionDate) nextErrors.inspectionDate = true;
        if (!mcName) nextErrors.mcName = true;
        if (!inspectionType) nextErrors.inspectionType = true;
        if (!String(entryCount || "").trim()) nextErrors.entryCount = true;

        activeRows.forEach((row, index) => {
            if (String(row.sampleWeight || "").trim() === "") nextErrors[`row-${index}-sampleWeight`] = true;
            if (String(row.hank || "").trim() === "") nextErrors[`row-${index}-hank`] = true;
        });

        setErrors(nextErrors);

        if (Object.keys(nextErrors).length) {
            setFormMessage("Please fill all required fields before preview.");
            setIsError(true);
            return false;
        }

        setFormMessage("");
        setIsError(false);
        return true;
    };

    const handleSubmit = async () => {
        const activeRows = rows.slice(0, Number(entryCount) || rows.length);

        const payload = {
            type_category: selectedType,
            inspection_type: inspectionType,
            mc_name: mcName,
            inspection_date: inspectionDate,
            inspection_time: inspectionTime,
            sample_weights: activeRows.map((row) => Number(row.sampleWeight)),
            hanks: activeRows.map((row) => Number(row.hank)),
        };

        setFormMessage("");
        setIsError(false);

        try {
            await dispatch(submitCardingBetweenWithin(payload)).unwrap();
            setShowPreview(false);
        } catch (submitError) {
            setFormMessage(submitError || "Save failed");
            setIsError(true);
        }
    };

    const previewItems = [
        { label: "Type", value: selectedType },
        { label: "ID", value: entryId },
        { label: "Inspection Date", value: inspectionDate },
        { label: "MC Name", value: mcName },
        { label: "Inspection Type", value: inspectionType },
        { label: "Number of Entries", value: entryCount },
        ...rows.slice(0, Number(entryCount) || rows.length).flatMap((row, index) => ([
            { label: `Row ${index + 1} Sample Weight`, value: row.sampleWeight },
            { label: `Row ${index + 1} Hank`, value: row.hank },
        ])),
    ];

    if (!showForm) return null;

    return (
        <>
            <div className="bwc-form">
                <div className="bwc-row">
                    {!hideTypeField && (
                        <div className="bwc-form-group">
                            <label>Type</label>
                            <select
                                value={selectedType}
                                onChange={(e) => onTypeChange(e.target.value)}
                                className={errors.selectedType ? "bwc-error-field" : ""}
                            >
                                <option value="">Select Type</option>
                                {types.map((item) => (
                                    <option key={item.id} value={item.name}>
                                        {item.displayName ?? item.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    <div className="bwc-form-group">
                        <label>ID</label>
                        <input value={entryId} readOnly />
                    </div>

                    <div className="bwc-form-group">
                        <label>Date</label>
                        <div className="bwc-input-icon-wrap">
                            <input type="date" value={inspectionDate} readOnly className={errors.inspectionDate ? "bwc-error-field" : ""} />
                        </div>
                    </div>
                </div>

                <div className="bwc-row">
                    <div className="bwc-form-group">
                        <label>MC Name</label>
                        <select
                            value={mcName}
                            onChange={(e) => {
                                setMcName(e.target.value);
                                setErrors((current) => {
                                    const next = { ...current };
                                    delete next.mcName;
                                    return next;
                                });
                            }}
                            className={errors.mcName ? "bwc-error-field" : ""}
                        >
                            {machineOptions.map((machine) => (
                                <option key={machine} value={machine}>
                                    {machine}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="bwc-form-group">
                        <label>Type</label>
                        <select
                            value={inspectionType}
                            onChange={(e) => {
                                setInspectionType(e.target.value);
                                setErrors((current) => {
                                    const next = { ...current };
                                    delete next.inspectionType;
                                    return next;
                                });
                            }}
                            className={errors.inspectionType ? "bwc-error-field" : ""}
                        >
                            <option value="Within">Within</option>
                            <option value="Between">Between</option>
                        </select>
                    </div>

                    <div className="bwc-form-group">
                        <label>Number of Entries (N)</label>
                        <div className="bwc-inline-control">
                            <input
                                type="number"
                                min="1"
                                max="10"
                                value={entryCount}
                                onChange={(e) => setEntryCount(e.target.value)}
                                onWheel={(e) => e.currentTarget.blur()}
                                className={errors.entryCount ? "bwc-error-field" : ""}
                            />
                            <button type="button" className="bwc-generate" onClick={handleGenerate}>
                                Generate
                            </button>
                        </div>
                    </div>
                </div>

                <div className="bwc-entry-panel">
                    {rows.map((row, index) => (
                        <div key={`bwc-row-${index + 1}`} className="bwc-entry-row">
                            <div className="bwc-entry-index">{index + 1}</div>
                            <div className="bwc-entry-field-white">
                                <label>Sample Weight</label>
                                <input
                                    type="number"
                                    step="0.001"
                                    value={row.sampleWeight}
                                    onChange={(e) => handleRowChange(index, "sampleWeight", e.target.value)}
                                    onWheel={(e) => e.currentTarget.blur()}
                                    className={errors[`row-${index}-sampleWeight`] ? "bwc-error-field" : ""}
                                />
                            </div>
                            <div className="bwc-entry-field-white">
                                <label>Hank</label>
                                <input
                                    type="number"
                                    step="0.001"
                                    value={row.hank}
                                    onChange={(e) => handleRowChange(index, "hank", e.target.value)}
                                    onWheel={(e) => e.currentTarget.blur()}
                                    className={errors[`row-${index}-hank`] ? "bwc-error-field" : ""}
                                />
                            </div>
                        </div>
                    ))}
                </div>

                <div className="bwc-calculation-section">
                    <h4>Sample Weight Calculations</h4>
                    <div className="bwc-calculation-grid">
                        {statFields.map((field) => (
                            <div key={`sw-${field.key}`} className="bwc-calculation-field">
                                <label>{field.label}</label>
                                <input value={sampleWeightStats[field.key]} readOnly />
                            </div>
                        ))}
                    </div>
                </div>

                <div className="bwc-calculation-section">
                    <h4>Hank Calculations</h4>
                    <div className="bwc-calculation-grid">
                        {statFields.map((field) => (
                            <div key={`hk-${field.key}`} className="bwc-calculation-field">
                                <label>{field.label}</label>
                                <input value={hankStats[field.key]} readOnly />
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {formMessage && (
                <div className={`bwc-message-box ${isError ? "bwc-message-error" : "bwc-message-success"}`}>
                    {formMessage}
                </div>
            )}

            <div className="bwc-footer">
                <Footer
                    isMobile={isMobile}
                    onBack={() => router.push("/dashboard")}
                    onSecondary={handleCalculateAll}
                    onSave={() => {
                        if (validateForm()) {
                            setShowPreview(true);
                        }
                    }}
                    secondaryLabel="Calculate All"
                    saveLabel={isLoading ? "Saving..." : "Save Record"}
                    disabled={isLoading}
                />
            </div>

            <PreviewModal
                open={showPreview}
                title="Carding Preview"
                subtitle="Carding Notebook / Between & Within Card Data Entry"
                items={previewItems}
                typeValue={selectedType}
                onCancel={() => setShowPreview(false)}
                onConfirm={handleSubmit}
                confirmLabel={isLoading ? "Saving..." : "Submit"}
            />
        </>
    );
}

export default BetweenWithinCardEntry;
