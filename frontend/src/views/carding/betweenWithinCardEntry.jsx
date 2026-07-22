import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { useDispatch, useSelector } from "react-redux";
import Footer from "@/components/Footer";
import { clearCardingState, submitCardingBetweenWithin } from "@/store/slices/carding";
import PreviewModal from "@/components/PreviewModal";
import SearchableSelect from "@/components/SearchableSelect";
import SuccessModal from "@/components/SuccessModal";
import NotebookCustomFields from "@/components/NotebookCustomFields";
import { sanitizeNumericInput } from "@/utils/inputValidation";
import { fetchCardingMasterMachines } from "@/apis/carding";
import { recordSubmittedNotebook } from "@/utils/submittedNotebookRecorder";
import { saveNotebookCustomFieldValuesApi } from "@/apis/notebookCustomFieldsApi";

const MAX_ENTRY_COUNT = 100;
const defaultMachineOptions = Array.from({ length: 25 }, (_, index) => `CDG-${String(index + 1).padStart(2, "0")}`);

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

const clampEntryCount = (count) => Math.min(Math.max(1, Number(count) || 1), MAX_ENTRY_COUNT);

const normalizeNumericValue = (value) => {
    const cleaned = String(value ?? "")
        .replace(/,/g, "")
        .match(/-?\d+(?:\.\d+)?/)?.[0] || "";
    return sanitizeNumericInput(cleaned, { precision: 10, scale: 3 });
};

const normalizeHankValue = (value) => {
    const cleaned = String(value ?? "")
        .replace(/,/g, "")
        .match(/-?\d+(?:\.\d+)?/)?.[0] || "";
    return sanitizeNumericInput(cleaned, { precision: 10, scale: 4 });
};

const padHankDecimal = (value) => {
    const normalized = normalizeHankValue(value);
    if (!normalized) return "";
    const [intPart, decPart = ""] = normalized.split(".");
    return `${intPart || "0"}.${decPart.padEnd(4, "0")}`;
};

const normalizeDateForInput = (value) => {
    const text = String(value ?? "").trim();
    if (!text) return "";

    const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

    const dmyMatch = text.match(/^(\d{2})-(\d{2})-(\d{4})/);
    if (dmyMatch) return `${dmyMatch[3]}-${dmyMatch[2]}-${dmyMatch[1]}`;

    const date = new Date(text);
    if (Number.isNaN(date.getTime())) return "";

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
};

const toNumber = (value) => Number(normalizeNumericValue(value));
const toHankNumber = (value) => Number(normalizeHankValue(value));

const isValidNumericValue = (value) => {
    const normalized = normalizeNumericValue(value);
    return normalized !== "" && Number.isFinite(Number(normalized));
};

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

const calculateHankStats = (values) => {
    if (!values.length) return emptyStats;
    const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / values.length;
    const sd = Math.sqrt(variance);
    const cv = avg === 0 ? 0 : (sd / avg) * 100;
    return {
        avg: avg.toFixed(4),
        max: max.toFixed(4),
        min: min.toFixed(4),
        range: range.toFixed(4),
        sd: sd.toFixed(4),
        cv: cv.toFixed(4),
    };
};

function BetweenWithinCardEntry({ types, selectedType, onTypeChange, onInspectionTypeChange, showForm, hideTypeField = false, entryId = "", reserveEntryId, user }) {
    const router = useRouter();
    const dispatch = useDispatch();
    const { isLoading, data, error } = useSelector((state) => state.carding ?? {
        isLoading: false,
        data: null,
        error: null,
    });

    const [inspectionDate, setInspectionDate] = useState("");
    const [inspectionTime, setInspectionTime] = useState("");
    const [testId, setTestId] = useState("");
    const [mcName, setMcName] = useState("");
    const [machineOptions, setMachineOptions] = useState(defaultMachineOptions);
    const [inspectionType, setInspectionType] = useState("Within");
    const [entryCount, setEntryCount] = useState(5);
    const [rows, setRows] = useState(createRows(5));
    const [sampleWeightStats, setSampleWeightStats] = useState(emptyStats);
    const [hankStats, setHankStats] = useState(emptyStats);
    const [formMessage, setFormMessage] = useState("");
    const [isError, setIsError] = useState(false);
    const [errors, setErrors] = useState({});
    const [showPreview, setShowPreview] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [submittedEntryId, setSubmittedEntryId] = useState("");
    const [isMobile, setIsMobile] = useState(false);
    const [customFieldValues, setCustomFieldValues] = useState({});
    const [customFieldDefs, setCustomFieldDefs] = useState([]);

    const handleCustomFieldChange = (fieldId, value) => {
        setCustomFieldValues((prev) => ({ ...prev, [fieldId]: value }));
    };

    useEffect(() => {
        const now = new Date();
        setInspectionTime(
            [String(now.getHours()).padStart(2, "0"), String(now.getMinutes()).padStart(2, "0"), String(now.getSeconds()).padStart(2, "0")].join(":")
        );
    }, []);

    useEffect(() => {
        if (typeof onInspectionTypeChange === "function") {
            onInspectionTypeChange(inspectionType);
        }
    }, [inspectionType, onInspectionTypeChange]);

    useEffect(() => {
        if (error) {
            setFormMessage(error);
            setIsError(true);
        }
    }, [error]);

    useEffect(() => () => dispatch(clearCardingState()), [dispatch]);

    useEffect(() => {
        const loadMachines = async () => {
            try {
                const options = await fetchCardingMasterMachines({ prefix: "CDG" });
                if (options.length) {
                    setMachineOptions(options);
                    setMcName((current) => (options.includes(current) ? current : ""));
                }
            } catch {
                setMachineOptions(defaultMachineOptions);
            }
        };
        loadMachines();
    }, []);

    useEffect(() => {
        const checkScreen = () => setIsMobile(window.innerWidth <= 767);
        checkScreen();
        window.addEventListener("resize", checkScreen);
        return () => window.removeEventListener("resize", checkScreen);
    }, []);

    useEffect(() => {
        const raw = typeof window !== "undefined" ? window.localStorage.getItem("ocr_prefill") : "";
        if (!raw) return;
        try {
            const payload = JSON.parse(raw);
            const screen = String(payload?.screen || "").toLowerCase();
            const isCardingPrefill =
                payload?.docType === "bwc" &&
                (screen.includes("carding") || screen.includes("quality-control/wrapping") || screen.includes("wrapping"));
            if (!isCardingPrefill) return;

            const sourceRow = {
                ...(payload?.result?.json_output?.[0] || {}),
                ...(payload?.values || {}),
            };
            const normalize = (v) => String(v || "").toLowerCase().replace(/[^a-z0-9]/g, "");
            const sourceEntries = Object.entries(sourceRow || {});
            const pick = (...keys) => {
                for (const key of keys) {
                    const direct = sourceRow?.[key];
                    if (direct !== undefined && direct !== null && String(direct).trim() !== "") return String(direct);
                }
                const normalizedTargets = keys.map(normalize);
                for (const [k, v] of sourceEntries) {
                    if (!normalizedTargets.includes(normalize(k))) continue;
                    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v);
                }
                return "";
            };

            const detectedEntryCount = clampEntryCount(
                pick("num_entries", "no_of_entries", "Number of Entries", "Number of Entries (N)") || 5
            );

            const nextRows = createRows(detectedEntryCount).map((row, index) => ({
                ...row,
                sampleWeight: normalizeNumericValue(pick(
                    `Sample Weight ${index + 1}`,
                    `SampleWeight${index + 1}`,
                    `Sample_Weight_${index + 1}`,
                    `sample_weight_${index + 1}`
                )),
                hank: padHankDecimal(pick(`Hank ${index + 1}`, `hank_${index + 1}`)),
            }));

            const nextMachine = pick("Machine Name", "MC Name", "mc_name", "machine_name", "machine");
            const nextInspectionType = pick("Inspection Type", "inspection_type");
            const nextInspectionDate = normalizeDateForInput(
                pick("Inspection Date", "inspection_date", "Date", "date")
            );
            const nextTestId = pick("Test ID", "test_id", "testId");

            if (nextMachine) setMcName(nextMachine);
            if (nextInspectionType) setInspectionType(nextInspectionType);
            if (nextInspectionDate) setInspectionDate(nextInspectionDate);
            if (nextTestId) setTestId(nextTestId);
            setEntryCount(detectedEntryCount);
            setRows(nextRows);
            if (typeof window !== "undefined") {
                window.localStorage.removeItem("ocr_prefill");
            }
        } catch {}
    }, []);

    const sampleWeights = useMemo(
        () => rows.map((row) => toNumber(row.sampleWeight)).filter(Number.isFinite),
        [rows]
    );
    const hanks = useMemo(
        () => rows.map((row) => toHankNumber(row.hank)).filter(Number.isFinite),
        [rows]
    );

    useEffect(() => {
        setSampleWeightStats(sampleWeights.length ? calculateStats(sampleWeights) : emptyStats);
        setHankStats(hanks.length ? calculateHankStats(hanks) : emptyStats);
    }, [sampleWeights, hanks]);

    const handleGenerate = () => {
        const nextCount = clampEntryCount(entryCount);
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
        const nextValue = field === "hank"
            ? normalizeHankValue(value)
            : sanitizeNumericInput(value, { precision: 10, scale: 3 });
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
            if (!isValidNumericValue(row.sampleWeight)) nextErrors[`row-${index}-sampleWeight`] = true;
            if (!isValidNumericValue(row.hank)) nextErrors[`row-${index}-hank`] = true;
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
            entry_id: entryId || "",
            type_category: selectedType,
            inspection_type: inspectionType,
            mc_name: mcName,
            inspection_date: inspectionDate,
            inspection_time: inspectionTime,
            test_id: testId,
            sample_weights: activeRows.map((row) => toNumber(row.sampleWeight)),
            hanks: activeRows.map((row) => toHankNumber(row.hank)),
        };

        setFormMessage("");
        setIsError(false);

        try {
            const saved = await dispatch(submitCardingBetweenWithin(payload)).unwrap();
            const nextEntryId = saved?.entry_id || saved?.inspection_id || "";
            setSubmittedEntryId(nextEntryId);
            setShowPreview(false);
            setFormMessage(nextEntryId ? `Data submitted. Entry ID: ${nextEntryId}` : "");
            setIsError(false);
            setShowSuccess(true);

            try {
                await recordSubmittedNotebook({
                    department: "Quality Control",
                    subDepartment: "Carding",
                    notebookName: selectedType,
                    entryId: nextEntryId || entryId,
                    previewItems,
                    user,
                });
            } catch (recordError) {
                console.warn("Carding submitted notebook record failed:", recordError?.response?.data || recordError?.message || recordError);
            }

            const customFieldEntries = Object.entries(customFieldValues).filter(([, v]) => String(v ?? '').trim() !== '');
            if (nextEntryId && customFieldEntries.length) {
                try {
                    await saveNotebookCustomFieldValuesApi(
                        nextEntryId,
                        customFieldEntries.map(([customFieldId, value]) => ({ custom_field_id: customFieldId, value }))
                    );
                } catch (customFieldError) {
                    console.error("Failed to save custom field values:", customFieldError);
                }
            }

            await reserveEntryId?.();
        } catch (submitError) {
            setFormMessage(submitError || "Save failed");
            setIsError(true);
            await reserveEntryId?.();
        }
    };

    const displayEntryId = submittedEntryId || entryId || "-";

    const previewItems = [
        { label: "Type", value: selectedType },
        { label: "Entry ID", value: displayEntryId },
        { label: "Date", value: inspectionDate },
        { label: "Test ID", value: testId },
        { label: "MC Name", value: mcName },
        { label: "Inspection Type", value: inspectionType },
        { label: "Number of Entries", value: entryCount },
        ...rows.slice(0, Number(entryCount) || rows.length).flatMap((row, index) => ([
            { label: `Row ${index + 1} Sample Weight`, value: row.sampleWeight },
            { label: `Row ${index + 1} Hank`, value: normalizeHankValue(row.hank) },
        ])),
        ...customFieldDefs.map((field) => ({
            label: field.field_label,
            value: customFieldValues[field.id],
        })),
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
                        <label>Entry ID</label>
                        <div className="bwc-input-icon-wrap">
                            <input type="text" value={displayEntryId} readOnly disabled />
                        </div>
                    </div>

                    <div className="bwc-form-group">
                        <label>Date</label>
                        <div className="bwc-input-icon-wrap">
                            <input
                                type="date"
                                value={inspectionDate}
                                onChange={(e) => {
                                    setInspectionDate(e.target.value);
                                    setErrors((current) => {
                                        const next = { ...current };
                                        delete next.inspectionDate;
                                        return next;
                                    });
                                }}
                                className={errors.inspectionDate ? "bwc-error-field" : ""}
                            />
                        </div>
                    </div>

                    <div className="bwc-form-group">
                        <label>Test ID</label>
                        <div className="bwc-input-icon-wrap">
                            <input
                                type="text"
                                value={testId}
                                onChange={(e) => {
                                    setTestId(e.target.value);
                                }}
                                placeholder="Enter Test ID"
                            />
                        </div>
                    </div>

                    <div className="bwc-form-group">
                        <label>MC Name</label>
                        <SearchableSelect
                            value={mcName}
                            onChange={(value) => {
                                setMcName(value);
                                setErrors((current) => {
                                    const next = { ...current };
                                    delete next.mcName;
                                    return next;
                                });
                            }}
                            options={machineOptions}
                            placeholder="Select MC Name"
                            className={errors.mcName ? "bwc-error-field" : ""}
                            ariaLabel="MC Name"
                        />
                    </div>

                    <div className="bwc-form-group">
                        <label>Inspection Type</label>
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
                </div>

                <div className="bwc-row">
                    <div className="bwc-form-group">
                        <label>Number of Entries (N) (Max {MAX_ENTRY_COUNT})</label>
                        <div className="bwc-inline-control">
                            <input
                                type="number"
                                min="1"
                                max={MAX_ENTRY_COUNT}
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
                                    step="0.0001"
                                    value={normalizeHankValue(row.hank)}
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
                    onBack={() => router.push("/departments/quality-control")}
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

            <NotebookCustomFields
                department="Quality Control"
                subDepartment="Carding"
                notebook="Between & Within Card Data Entry"
                entryId={entryId}
                values={customFieldValues}
                onChange={handleCustomFieldChange}
                onFieldsLoaded={setCustomFieldDefs}
            />

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

            <SuccessModal
                open={showSuccess}
                onClose={() => setShowSuccess(false)}
            />
        </>
    );
}

export default BetweenWithinCardEntry;

