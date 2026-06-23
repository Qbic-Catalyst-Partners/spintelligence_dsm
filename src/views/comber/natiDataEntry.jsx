import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { useRouter } from "next/router";
import { useDispatch, useSelector } from "react-redux";
import { fetchComberMasterVarieties, fetchComberNatiMasterMcNos } from "@/apis/comber";
import SearchableSelect from "@/components/SearchableSelect";
import { clearComberState, submitComberNatiDataEntry } from "@/store/slices/comber";
import { sanitizeNumericInput } from "@/utils/inputValidation";
import styles from "./natiDataEntry.module.css";

const emptyComberState = {
    isLoading: false,
    data: null,
    error: null,
};

const createEmptyEntries = (count) =>
    Array.from({ length: count }, () => ({
        mc_no: "",
        ratio_size_1: "",
        ratio_size_07: "",
        ratio_size_05: "",
    }));

const NatiDataEntry = forwardRef(function NatiDataEntry(
    { types, selectedType, onTypeChange, showForm, entryId = "" },
    ref
) {
    const router = useRouter();
    const dispatch = useDispatch();
    const { data, error, isLoading } = useSelector((state) => state.comber ?? emptyComberState);

    const [entryDate, setEntryDate] = useState("");
    const [variety, setVariety] = useState("");
    const [entryCount, setEntryCount] = useState(1);
    const [entries, setEntries] = useState(createEmptyEntries(1));
    const [formMessage, setFormMessage] = useState("");
    const [errors, setErrors] = useState({});
    const [varietyOptions, setVarietyOptions] = useState([]);
    const [mcNoOptions, setMcNoOptions] = useState([]);

    useEffect(() => {
        setEntryDate(new Date().toISOString().split("T")[0]);
    }, []);

    useEffect(() => {
        let active = true;
        (async () => {
            try {
                const [varieties, mcNos] = await Promise.all([
                    fetchComberMasterVarieties(),
                    fetchComberNatiMasterMcNos(),
                ]);
                if (!active) return;
                setVarietyOptions(Array.isArray(varieties) ? varieties : []);
                setMcNoOptions(
                    Array.isArray(mcNos)
                        ? mcNos
                            .map((item) => ({
                                value: String(item?.mc_no ?? "").trim(),
                                label: String(item?.mc_name ?? item?.mc_no ?? "").trim(),
                            }))
                            .filter((item) => item.value)
                        : []
                );
            } catch (_err) {
                if (!active) return;
                setVarietyOptions([]);
                setMcNoOptions([]);
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

    const resetForm = () => {
        setEntryDate(new Date().toISOString().split("T")[0]);
        setVariety("");
        setEntryCount(1);
        setEntries(createEmptyEntries(1));
        setFormMessage("");
        setErrors({});
    };

    const handleGenerate = () => {
        const nextCount = Math.min(Math.max(1, Number(entryCount) || 1), 10);
        setEntryCount(nextCount);
        setEntries((currentEntries) => {
            const nextEntries = createEmptyEntries(nextCount);
            currentEntries.slice(0, nextCount).forEach((entry, index) => {
                nextEntries[index] = entry;
            });
            return nextEntries;
        });
        setFormMessage("");
        setErrors((prev) => ({ ...prev, entries: false }));
    };

    const handleEntryChange = (index, field, value) => {
        const nextValue = ["ratio_size_1", "ratio_size_07", "ratio_size_05"].includes(field)
            ? sanitizeNumericInput(value, { precision: 10, scale: 2 })
            : value;
        setEntries((currentEntries) => {
            const nextEntries = [...currentEntries];
            nextEntries[index] = {
                ...nextEntries[index],
                [field]: nextValue,
            };
            return nextEntries;
        });
        setFormMessage("");
        setErrors((prev) => {
            if (!prev.entries) return prev;
            const next = { ...prev };
            delete next.entries;
            return next;
        });
    };

    const buildPayload = () => ({
        entry_id: entryId || "",
        type: selectedType,
        entry_date: entryDate,
        variety,
        entries: entries
            .filter((entry) => entry.mc_no !== "")
            .map((entry) => ({
                mc_no: entry.mc_no,
                ratio_size_1: entry.ratio_size_1 === "" ? null : Number(entry.ratio_size_1),
                ratio_size_07: entry.ratio_size_07 === "" ? null : Number(entry.ratio_size_07),
                ratio_size_05: entry.ratio_size_05 === "" ? null : Number(entry.ratio_size_05),
            })),
    });

    const validate = () => {
        const nextErrors = {};
        if (!variety) nextErrors.variety = true;
        if (!entries.some((entry) => entry.mc_no !== "")) nextErrors.entries = true;

        setErrors(nextErrors);
        setFormMessage(Object.keys(nextErrors).length ? "Please fill all required fields before saving." : "");
        return Object.keys(nextErrors).length === 0;
    };

    const handleSubmit = async () => {
        const valid = validate();
        if (!valid) return false;

        try {
            await dispatch(submitComberNatiDataEntry(buildPayload())).unwrap();
            setErrors({});
            return true;
        } catch (submitError) {
            setFormMessage(submitError || "Unable to save nati data.");
            return false;
        }
    };

    const getPreviewData = () => {
        const base = [
            { label: "Type", value: selectedType || "Nati Data Entry" },
            { label: "Entry ID", value: entryId || "-" },
            { label: "Variety", value: variety },
        ];

        const entryItems = entries
            .filter((entry) => entry.mc_no !== "")
            .flatMap((entry, index) => [
                { label: `Row ${index + 1} - MC No`, value: entry.mc_no },
                { label: `Row ${index + 1} - Ratio size-1.0`, value: entry.ratio_size_1 || "-" },
                { label: `Row ${index + 1} - Ratio size-0.7`, value: entry.ratio_size_07 || "-" },
                { label: `Row ${index + 1} - Ratio size-0.5`, value: entry.ratio_size_05 || "-" },
            ]);

        return [...base, ...entryItems];
    };

    useImperativeHandle(ref, () => ({
        clear: resetForm,
        validate,
        getPreviewData,
        submit: handleSubmit,
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
                        <div className={styles["cb-form-group"]}>
                            <label>Entry ID</label>
                            <input
                                type="text"
                                value={entryId || ""}
                                readOnly disabled
                                readOnly
                            />
                        </div>
                    ) : null}

                    {showForm ? (
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
                                placeholder="-- Select Variety --"
                            />
                        </div>
                    ) : null}
                </div>

                {showForm ? (
                    <>
                        <div className={styles["cb-sample-section"]}>
                            <h4>Neps Details</h4>
                            <div className={styles["cb-form-group"]}>
                                <label>Number of Neps Entries (Max 10)</label>
                                <div className={styles["cb-generate"]}>
                                    <input
                                        type="number"
                                        min="1"
                                        max="10"
                                        value={entryCount}
                                        onChange={(e) => setEntryCount(e.target.value)}
                                        onWheel={(e) => e.currentTarget.blur()}
                                    />
                                    <button type="button" onClick={handleGenerate}>
                                        Generate
                                    </button>
                                </div>
                            </div>

                            <div className={styles["cb-neps-stack"]}>
                                {entries.map((entry, index) => (
                                    <div key={`neps-entry-${index + 1}`} className={styles["cb-neps-card"]}>
                                        <div className={styles["cb-neps-index"]}>{index + 1}</div>
                                        <div className={styles["cb-neps-grid"]}>
                                            <div className={styles["cb-form-group-field"]}>
                                                <label>MC No</label>
                                                <SearchableSelect
                                                    className={errors.entries ? styles["input-error"] : ""}
                                                    value={entry.mc_no}
                                                    onChange={(value) => handleEntryChange(index, "mc_no", value)}
                                                    options={mcNoOptions}
                                                    placeholder="Select MC No"
                                                    ariaLabel={`MC No Row ${index + 1}`}
                                                />
                                            </div>
                                            <div className={styles["cb-form-group-field"]}>
                                                <label>Ratio into size-1.0</label>
                                                    <input
                                                        className={errors.entries ? styles["input-error"] : ""}
                                                        value={entry.ratio_size_1}
                                                        onChange={(e) => handleEntryChange(index, "ratio_size_1", e.target.value)}
                                                    />
                                            </div>
                                            <div className={styles["cb-form-group-field"]}>
                                                <label>Ratio into size-0.7</label>
                                                    <input
                                                        className={errors.entries ? styles["input-error"] : ""}
                                                        value={entry.ratio_size_07}
                                                        onChange={(e) => handleEntryChange(index, "ratio_size_07", e.target.value)}
                                                    />
                                            </div>
                                            <div className={styles["cb-form-group-field"]}>
                                                <label>Ratio into size-0.5</label>
                                                    <input
                                                        className={errors.entries ? styles["input-error"] : ""}
                                                        value={entry.ratio_size_05}
                                                        onChange={(e) => handleEntryChange(index, "ratio_size_05", e.target.value)}
                                                    />
                                            </div>
                                        </div>
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
                </>
            ) : null}
        </>
    );
});

export default NatiDataEntry;

