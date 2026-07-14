import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useDispatch } from "react-redux";
import { saveBlowroomBetweenLapCv } from "@/store/slices/blowroomSlice";
import SearchableSelect from "@/components/SearchableSelect";
import { sanitizeNumericInput } from "@/utils/inputValidation";
import useBlowroomMasterVarieties from "@/hooks/useBlowroomMasterVarieties";
import { fetchBlowroomLapCvMasterMcNos } from "@/apis/blowroom";
import styles from "./lapCVDataEntry.module.css";

const defaultSampleCount = 5;

const createEmptySamples = (count) => Array.from({ length: count }, () => "");

const defaultStats = {
    avg: "",
    min: "",
    max: "",
    sd: "",
    cv: "",
};

const BetweenLapCVDataEntry = forwardRef(function BetweenLapCVDataEntry(
    { date, entryId, sampleCount = defaultSampleCount, postFooterPortalTargetId },
    ref
) {
    const dispatch = useDispatch();

    const [samples, setSamples] = useState(createEmptySamples(defaultSampleCount));
    const [lapWeight, setLapWeight] = useState("");
    const [lapLength, setLapLength] = useState("");
    const [machine, setMachine] = useState("");
    const [variety, setVariety] = useState("");
    const [stats, setStats] = useState(defaultStats);
    const [errors, setErrors] = useState({});
    const [machineOptions, setMachineOptions] = useState([]);
    const [portalReady, setPortalReady] = useState(false);
    const { varietyOptions } = useBlowroomMasterVarieties();

    useEffect(() => {
        setPortalReady(true);
    }, []);

    useEffect(() => {
        let active = true;
        (async () => {
            try {
                const machines = await fetchBlowroomLapCvMasterMcNos({ prefix: "BR", screen: "between-lap-cv" });
                if (active) setMachineOptions(machines);
            } catch (_error) {
                if (active) setMachineOptions([]);
            }
        })();
        return () => {
            active = false;
        };
    }, []);

    const numericSamples = useMemo(
        () => samples.map((value) => parseFloat(value)).filter((value) => !Number.isNaN(value)),
        [samples]
    );

    const gramsPerMeter = useMemo(() => {
        const weightKg = parseFloat(lapWeight);
        const lengthM = parseFloat(lapLength);
        if (!weightKg || !lengthM) return "";
        return ((weightKg * 1000) / lengthM).toFixed(2);
    }, [lapWeight, lapLength]);

    const resetForm = () => {
        setSamples(createEmptySamples(Number(sampleCount) || defaultSampleCount));
        setLapWeight("");
        setLapLength("");
        setMachine("");
        setVariety("");
        setStats(defaultStats);
        setErrors({});
    };

    useEffect(() => {
        const nextCount = Math.max(1, Number(sampleCount) || defaultSampleCount);
        setSamples((currentSamples) => {
            if (currentSamples.length === nextCount) return currentSamples;
            const nextSamples = createEmptySamples(nextCount);
            currentSamples.slice(0, nextCount).forEach((value, index) => {
                nextSamples[index] = value;
            });
            return nextSamples;
        });
        setStats(defaultStats);
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sampleCount]);

    const handleSampleChange = (index, value) => {
        const nextSamples = [...samples];
        nextSamples[index] = value;
        setSamples(nextSamples);
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
        return true;
    };

    const buildPayload = () => ({
        entry_id: entryId || "",
        record_date: date,
        machine_name: machine,
        variety,
        type: "Between Lap",
        lap_weight: lapWeight ? Number(lapWeight) : null,
        lap_length: lapLength ? Number(lapLength) : null,
        grams_per_meter: gramsPerMeter ? Number(gramsPerMeter) : null,
        samples: samples
            .map((value) => parseFloat(value))
            .filter((value) => !Number.isNaN(value)),
        average: stats.avg ? Number(stats.avg) : null,
        minimum: stats.min ? Number(stats.min) : null,
        maximum: stats.max ? Number(stats.max) : null,
        std_deviation: stats.sd ? Number(stats.sd) : null,
        cv_percent: stats.cv ? Number(stats.cv) : null,
    });

    const validate = () => {
        const nextErrors = {};
        if (!machine) nextErrors.machine = true;
        if (!variety) nextErrors.variety = true;
        if (!lapWeight) nextErrors.lapWeight = true;
        if (!lapLength) nextErrors.lapLength = true;
        if (!stats.avg) nextErrors.stats = true;

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
        return Object.keys(nextErrors).length === 0;
    };

    const handleSubmit = async () => {
        await dispatch(saveBlowroomBetweenLapCv(buildPayload())).unwrap();
    };

    const getPreviewData = () => {
        const base = [
            { label: "Machine Name", value: machine },
            { label: "Variety", value: variety },
        ];

        if (lapWeight) base.push({ label: "Lap Weight (KGs)", value: lapWeight });
        if (lapLength) base.push({ label: "Lap Length (Mts)", value: lapLength });
        if (gramsPerMeter) base.push({ label: "Grams / Meter", value: gramsPerMeter });

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

    const formContent = (
        <div className={styles["br-form"]}>
            <div className={styles["br-row"]}>
                <div className={styles["br-form-group"]}>
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

                <div className={styles["br-form-group"]}>
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

            <div className={styles["br-row"]}>
                <div className={styles["br-form-group"]}>
                    <label>Lap Weight (KGs)</label>
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

                <div className={styles["br-form-group"]}>
                    <label>Lap Length (Mts)</label>
                    <input
                        className={errors.lapLength ? styles["input-error"] : ""}
                        value={lapLength}
                        inputMode="decimal"
                        onChange={(e) => {
                            setLapLength(sanitizeNumericInput(e.target.value, { precision: 10, scale: 2 }));
                            setErrors((prev) => {
                                if (!prev.lapLength) return prev;
                                const next = { ...prev };
                                delete next.lapLength;
                                return next;
                            });
                        }}
                    />
                </div>

                <div className={styles["br-form-group"]}>
                    <label>Grams / Meter</label>
                    <input value={gramsPerMeter} readOnly />
                </div>
            </div>

            <div className={styles["br-sample-section"]}>
                <h4>Sample Entries</h4>
                <div className={styles["br-sample-grid"]}>
                    {samples.map((value, index) => (
                        <div key={`sample-${index + 1}`} className={styles["br-form-group"]}>
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
        </div>
    );

    const statsSection = (
        <div className={styles["br-stats"]}>
            <h4>Calculated Statistics</h4>
            <div className={styles["br-stats-grid"]}>
                <div className={styles["br-form-group-field"]}>
                    <label>Average</label>
                    <input value={stats.avg} readOnly />
                </div>
                <div className={styles["br-form-group-field"]}>
                    <label>Minimum</label>
                    <input value={stats.min} readOnly />
                </div>
                <div className={styles["br-form-group-field"]}>
                    <label>Maximum</label>
                    <input value={stats.max} readOnly />
                </div>
                <div className={styles["br-form-group-field"]}>
                    <label>Standard Deviation</label>
                    <input value={stats.sd} readOnly />
                </div>
                <div className={styles["br-form-group-field"]}>
                    <label>Coefficient of Variation (CV%)</label>
                    <input value={stats.cv} readOnly />
                </div>
            </div>
        </div>
    );

    const portalTarget =
        portalReady && postFooterPortalTargetId && typeof document !== "undefined"
            ? document.getElementById(postFooterPortalTargetId)
            : null;

    return (
        <>
            {formContent}
            {portalTarget ? createPortal(statsSection, portalTarget) : statsSection}
        </>
    );
});

export default BetweenLapCVDataEntry;
