import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { useDispatch, useSelector } from "react-redux";
import { clearComberState, submitComberRibbonLapCV } from "@/store/slices/comber";
import Footer from "@/components/Footer";
import SearchableSelect from "@/components/SearchableSelect";
import { fetchComberMasterVarieties, fetchComberRibbonLapMasterMcNos } from "@/apis/comber";
import { sanitizeNumericInput } from "@/utils/inputValidation";
import styles from "./ribbonLapCVDataEntry.module.css";

const defaultSampleCount = 5;
const STATIC_RIBBON_LAP_MACHINE_OPTIONS = [
    "Lap Former",
    "Ribbon Lap",
    "Blow Room-1",
    "Blow Room-2",
    "Blow Room-3",
];

const createEmptySamples = (count) => Array.from({ length: count }, () => "");

const defaultStats = {
    avg: "",
    min: "",
    max: "",
    sd: "",
    cv: "",
};

const emptyComberState = {
    isLoading: false,
    data: null,
    error: null,
};

const RibbonLapCVDataEntry = forwardRef(function RibbonLapCVDataEntry(
    { types, selectedType, onTypeChange, showForm, onPreview, entryId = "" },
    ref
) {
    const router = useRouter();
    const dispatch = useDispatch();
    const { data, error, isLoading } = useSelector((state) => state.comber ?? emptyComberState);

    const [sampleCount, setSampleCount] = useState(defaultSampleCount);
    const [samples, setSamples] = useState(createEmptySamples(defaultSampleCount));
    const [lapWeight, setLapWeight] = useState("");
    const [machine, setMachine] = useState("");
    const [variety, setVariety] = useState("");
    const [date, setDate] = useState("");
    const [stats, setStats] = useState(defaultStats);
    const [formMessage, setFormMessage] = useState("");
    const [errors, setErrors] = useState({});
    const [machineOptions, setMachineOptions] = useState([]);
    const [varietyOptions, setVarietyOptions] = useState(["Cotton", "Polyester", "PC Blend"]);

    const isCVEntry = selectedType === "Ribbon Lap CV Data Entry";

    useEffect(() => {
        setDate(new Date().toISOString().split("T")[0]);
    }, []);

    useEffect(() => {
        let active = true;
        (async () => {
            try {
                const [varieties, machines] = await Promise.all([
                    fetchComberMasterVarieties(),
                    fetchComberRibbonLapMasterMcNos({ prefix: "CBR%" }),
                ]);
                if (active && varieties.length) setVarietyOptions(varieties);
                if (active && machines.length) {
                    setMachineOptions(STATIC_RIBBON_LAP_MACHINE_OPTIONS);
                } else if (active) {
                    setMachineOptions(STATIC_RIBBON_LAP_MACHINE_OPTIONS);
                }
            } catch (_error) {
                if (active) {
                    setVarietyOptions(["Cotton", "Polyester", "PC Blend"]);
                    setMachineOptions(STATIC_RIBBON_LAP_MACHINE_OPTIONS);
                }
            }
        })();
        return () => {
            active = false;
        };
    }, []);

    useEffect(() => {
        if (data) {
            setFormMessage("");
        }
    }, [data]);

    useEffect(() => {
        if (error) {
            setFormMessage(error);
        }
    }, [error]);

    useEffect(() => {
        return () => {
            dispatch(clearComberState());
        };
    }, [dispatch]);

    const numericSamples = useMemo(
        () => samples.map((value) => parseFloat(value)).filter((value) => !Number.isNaN(value)),
        [samples]
    );

    const resetForm = () => {
        setSampleCount(defaultSampleCount);
        setSamples(createEmptySamples(defaultSampleCount));
        setLapWeight("");
        setMachine("");
        setVariety("");
        setDate(new Date().toISOString().split("T")[0]);
        setStats(defaultStats);
        setFormMessage("");
        setErrors({});
    };

    const handleGenerate = () => {
        const nextCount = Math.max(1, Number(sampleCount) || defaultSampleCount);
        setSampleCount(nextCount);
        setSamples((currentSamples) => {
            const nextSamples = createEmptySamples(nextCount);
            currentSamples.slice(0, nextCount).forEach((value, index) => {
                nextSamples[index] = value;
            });
            return nextSamples;
        });
        setStats(defaultStats);
        setFormMessage("");
        setErrors((prev) => {
            const next = { ...prev };
            delete next.samplesEmpty;
            Object.keys(next).forEach((key) => {
                if (key.startsWith("sample-")) {
                    delete next[key];
                }
            });
            return next;
        });
    };

    const handleSampleChange = (index, value) => {
        const nextSamples = [...samples];
        nextSamples[index] = value;
        setSamples(nextSamples);
        setFormMessage("");
        setErrors((prev) => {
            const next = { ...prev };
            delete next[`sample-${index}`];
            if (nextSamples.some((v) => v !== "")) {
                delete next.samplesEmpty;
            }
            return next;
        });
    };

    const calculateStats = () => {
        if (!numericSamples.length) {
            setStats(defaultStats);
            setErrors((prev) => ({ ...prev, samplesEmpty: true }));
            return false;
        }

        const avg = numericSamples.reduce((sum, value) => sum + value, 0) / numericSamples.length;
        const min = Math.min(...numericSamples);
        const max = Math.max(...numericSamples);
        const variance = numericSamples.reduce((sum, value) => sum + Math.pow(value - avg, 2), 0) / numericSamples.length;
        const sd = Math.sqrt(variance);
        const cv = avg === 0 ? 0 : (sd / avg) * 100;

        setStats({
            avg: avg.toFixed(2),
            min: min.toFixed(2),
            max: max.toFixed(2),
            sd: sd.toFixed(2),
            cv: cv.toFixed(2),
        });
        setFormMessage("");
        return true;
    };

    const buildPayload = () => {
        return {
            entry_id: entryId || "",
            record_date: date,
            machine_name: machine,
            variety,
            type: "Ribbon Lap",
            lap_weight: lapWeight ? Number(lapWeight) : null,
            samples: samples
                .map((value) => parseFloat(value))
                .filter((value) => !Number.isNaN(value)),
            average: stats.avg ? Number(stats.avg) : null,
            minimum: stats.min ? Number(stats.min) : null,
            maximum: stats.max ? Number(stats.max) : null,
            std_deviation: stats.sd ? Number(stats.sd) : null,
            cv_percent: stats.cv ? Number(stats.cv) : null,
        };
    };

    const validate = () => {
        const nextErrors = {};
        if (!machine) nextErrors.machine = true;
        if (!variety) nextErrors.variety = true;
        if (isCVEntry) {
            if (!lapWeight) {
                nextErrors.lapWeight = true;
            }
            if (!stats.avg) {
                nextErrors.stats = true;
            }
        }

        const activeSamples = samples.slice(0, Number(sampleCount) || samples.length);

        if (!activeSamples.some((value) => value !== "")) {
            nextErrors.samplesEmpty = true;
        }

        activeSamples.forEach((value, index) => {
            if (String(value || "").trim() === "") {
                nextErrors[`sample-${index}`] = true;
            }
        });

        setErrors(nextErrors);
        setFormMessage("");
        return Object.keys(nextErrors).length === 0;
    };

    const handleSubmit = async () => {
        const valid = validate();
        if (!valid) return false;

        try {
            await dispatch(submitComberRibbonLapCV(buildPayload())).unwrap();
            setErrors({});
            return true;
        } catch (submitError) {
            setFormMessage(submitError || "Unable to save comber data.");
            return false;
        }
    };

    const getPreviewData = () => {
        const base = [
            { label: "Type", value: selectedType || "Ribbon Lap CV Data Entry" },
            { label: "Entry ID", value: entryId || "-" },
            { label: "Machine Name", value: machine },
            { label: "Variety", value: variety },
        ];

        if (lapWeight) base.push({ label: "Lap Weight", value: lapWeight });

        const sampleItems = samples
            .map((value, index) => ({ label: `Sample ${index + 1}`, value: value || "-" }))
            .filter((item) => item.value !== "-");

        const statsItems = stats.avg
            ? [
                  { label: "Average", value: stats.avg },
                  { label: "Minimum", value: stats.min },
                  { label: "Maximum", value: stats.max },
                  { label: "Standard Deviation", value: stats.sd },
                  { label: "CV %", value: stats.cv },
              ]
            : [];

        return [...base, ...sampleItems, ...statsItems];
    };

    useImperativeHandle(ref, () => ({
        clear: resetForm,
        validate,
        getPreviewData,
        submit: handleSubmit,
        calculateStats,
    }));

    return (
        <>
            <div className={styles["cb-form"]}>
                <div className={styles["cb-row"]}>
                    <div className={styles["cb-form-group"]}>
                        <label>Type</label>
                        <select
                            value={selectedType}
                            onChange={(e) => onTypeChange(e.target.value)}
                        >
                            <option value="">Select Type</option>
                            {types.map((item) => (
                                <option key={item.id} value={item.name}>
                                    {item.displayName ?? item.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    {showForm ? (
                        <>
                            <div className={styles["cb-form-group"]}>
                                <label>Number of Sample Entries</label>
                                <div className={styles["cb-generate"]}>
                                    <input
                                        type="number"
                                        value={sampleCount}
                                        className={errors.samplesEmpty ? styles["input-error"] : ""}
                                        onChange={(e) => {
                                            setSampleCount(e.target.value);
                                            if (errors.samplesEmpty) {
                                                setErrors((prev) => {
                                                    const next = { ...prev };
                                                    delete next.samplesEmpty;
                                                    return next;
                                                });
                                            }
                                        }}
                                        onWheel={(e) => e.currentTarget.blur()}
                                    />
                                    <button type="button" onClick={handleGenerate}>
                                        Generate
                                    </button>
                                </div>
                            </div>

                            <div className={styles["cb-form-group"]}>
                                <label>Entry ID</label>
                                <input
                                    type="text"
                                    value={entryId || ""}
                                    readOnly disabled
                                    readOnly
                                />
                            </div>
                        </>
                    ) : null}
                </div>

                {showForm ? (
                    <>
                        <div className={styles["cb-row"]}>
                            <div className={styles["cb-form-group"]}>
                                <label>Machine Name</label>
                                <SearchableSelect
                                    className={errors.machine ? styles["input-error"] : ""}
                                    value={machine}
                                    onChange={(value) => {
                                        setMachine(value);
                                        setErrors((prev) => {
                                            if (!prev.machine) return prev;
                                            const next = { ...prev };
                                            delete next.machine;
                                            return next;
                                        });
                                    }}
                                    options={machineOptions}
                                    placeholder="Select Machine"
                                    ariaLabel="Machine Name"
                                />
                            </div>

                            <div className={styles["cb-form-group"]}>
                                <label>Variety</label>
                                <SearchableSelect
                                    className={errors.variety ? styles["input-error"] : ""}
                                    value={variety}
                                    onChange={(value) => {
                                        setVariety(value);
                                        setErrors((prev) => {
                                            if (!prev.variety) return prev;
                                            const next = { ...prev };
                                            delete next.variety;
                                            return next;
                                        });
                                    }}
                                    options={varietyOptions}
                                    placeholder="Select Variety"
                                    ariaLabel="Variety"
                                />
                            </div>

                        </div>

                        <div className={styles["cb-row"]}>
                            <div className={styles["cb-form-group"]}>
                                <label>Lap Weight</label>
                                <input
                                    className={errors.lapWeight ? styles["input-error"] : ""}
                                    value={lapWeight}
                                    inputMode="decimal"
                                    onChange={(e) => {
                                        setLapWeight(sanitizeNumericInput(e.target.value, { precision: 10, scale: 2 }));
                                        setErrors((prev) => {
                                            if (!prev.lapWeight) return prev;
                                            const next = { ...prev };
                                            delete next.lapWeight;
                                            return next;
                                        });
                                    }}
                                />
                            </div>
                        </div>

                        <div className={styles["cb-sample-section"]}>
                            <h4>Sample Entries</h4>
                            <div className={styles["cb-sample-grid"]}>
                                {samples.map((value, index) => (
                                    <div key={`sample-${index + 1}`} className={styles["cb-form-group"]}>
                                        <label>Sample {index + 1}</label>
                                        <input
                                            type="number"
                                            placeholder="0.00"
                                            value={value}
                                            className={errors[`sample-${index}`] || (errors.samplesEmpty && value === "") ? styles["input-error"] : ""}
                                            onChange={(e) => handleSampleChange(index, e.target.value)}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </>
                ) : null}
            </div>

            {showForm ? (
                <>
                    {formMessage ? (
                        <div className={`${styles["message-box"]} ${error ? styles["message-error"] : styles["message-success"]}`}>
                            {formMessage}
                        </div>
                    ) : null}

                    <div style={{ margin: "16px -24px 0" }}>
                        <Footer
                            onBack={() => router.push("/departments/quality-control")}
                            onSecondary={calculateStats}
                            secondaryLabel="Calculate Statistics"
                            onSave={onPreview ?? handleSubmit}
                            saveLabel={isLoading ? "Submitting..." : onPreview ? "Save Record" : "Submit"}
                            disabled={isLoading}
                        />
                    </div>

                    <div className={styles["cb-stats"]}>
                        <h4>Calculated Statistics</h4>
                        <div className={styles["cb-stats-grid"]}>
                            <div className={styles["cb-form-group-field"]}>
                                <label>Average</label>
                                <input value={stats.avg} readOnly />
                            </div>
                            <div className={styles["cb-form-group-field"]}>
                                <label>Minimum</label>
                                <input value={stats.min} readOnly />
                            </div>
                            <div className={styles["cb-form-group-field"]}>
                                <label>Maximum</label>
                                <input value={stats.max} readOnly />
                            </div>
                            <div className={styles["cb-form-group-field"]}>
                                <label>Standard Deviation</label>
                                <input value={stats.sd} readOnly />
                            </div>
                            <div className={styles["cb-form-group-field"]}>
                                <label>Coefficient of Variation (CV%)</label>
                                <input value={stats.cv} readOnly />
                            </div>
                        </div>
                    </div>
                </>
            ) : null}
        </>
    );
});

export default RibbonLapCVDataEntry;

