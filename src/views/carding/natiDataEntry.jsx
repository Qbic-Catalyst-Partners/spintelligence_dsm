import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useDispatch, useSelector } from "react-redux";
import Footer from "@/components/Footer";
import PreviewModal from "@/components/PreviewModal";
import SuccessModal from "@/components/SuccessModal";
import SearchableSelect from "@/components/SearchableSelect";
import { sanitizeNumericInput } from "@/utils/inputValidation";
import { clearCardingState, submitCardingNati } from "@/store/slices/carding";
import { fetchCardingMasterMachines, fetchCardingMasterVarieties } from "@/apis/carding";
import styles from "./natiDataEntry.module.css";

const emptyCardingState = {
    isLoading: false,
    nati: null,
    error: null,
};

const createEmptyEntries = (count) =>
    Array.from({ length: count }, () => ({
        mc_no: "",
        ratio_size_1: "",
        ratio_size_07: "",
        ratio_size_05: "",
    }));

function NatiDataEntry({ types, selectedType, onTypeChange, showForm, entryId = "" }) {
    const router = useRouter();
    const dispatch = useDispatch();
    const { isLoading, nati, error } = useSelector((state) => state.carding ?? emptyCardingState);

    const [entryDate, setEntryDate] = useState("");
    const [variety, setVariety] = useState("");
    const [entryCount, setEntryCount] = useState(1);
    const [entries, setEntries] = useState(createEmptyEntries(1));
    const [formMessage, setFormMessage] = useState("");
    const [errors, setErrors] = useState({});
    const [showPreview, setShowPreview] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const [varietyOptions, setVarietyOptions] = useState([]);
    const [mcNoOptions, setMcNoOptions] = useState([]);

    useEffect(() => {
        setEntryDate(new Date().toISOString().split("T")[0]);
    }, []);

    useEffect(() => {
        let active = true;
        (async () => {
            try {
                const [varietyList, mcNos] = await Promise.all([
                    fetchCardingMasterVarieties(),
                    fetchCardingMasterMachines({ prefix: "CDG" }),
                ]);
                if (active) {
                    setVarietyOptions(Array.isArray(varietyList) ? varietyList : []);
                    setMcNoOptions(Array.isArray(mcNos) ? mcNos : []);
                }
            } catch (_err) {
                if (active) {
                    setVarietyOptions([]);
                    setMcNoOptions([]);
                }
            }
        })();
        return () => {
            active = false;
        };
    }, []);

    useEffect(() => {
        if (nati) {
            setFormMessage("");
        }
    }, [nati]);

    useEffect(() => {
        if (error) {
            setFormMessage(error);
        }
    }, [error]);

    useEffect(() => {
        return () => {
            dispatch(clearCardingState());
        };
    }, [dispatch]);

    useEffect(() => {
        const checkScreen = () => setIsMobile(window.innerWidth <= 767);
        checkScreen();
        window.addEventListener("resize", checkScreen);
        return () => window.removeEventListener("resize", checkScreen);
    }, []);

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
        setErrors((current) => {
            const next = { ...current };
            delete next.entryCount;
            return next;
        });
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
        setErrors((current) => {
            const next = { ...current };
            delete next[`${index}-${field}`];
            return next;
        });
    };

    const handleClear = () => {
        setEntryDate(new Date().toISOString().split("T")[0]);
        setVariety("");
        setEntryCount(1);
        setEntries(createEmptyEntries(1));
        setFormMessage("");
        setErrors({});
        setShowPreview(false);
        setShowSuccess(false);
    };

    const buildPayload = () => ({
        entry_id: entryId || "",
        type: selectedType,
        entry_date: entryDate,
        variety,
        entries: entries
            .filter((entry) => entry.mc_no !== "")
            .map((entry) => ({
                mc_no: Number(entry.mc_no),
                ratio_size_1: entry.ratio_size_1 === "" ? null : Number(entry.ratio_size_1),
                ratio_size_07: entry.ratio_size_07 === "" ? null : Number(entry.ratio_size_07),
                ratio_size_05: entry.ratio_size_05 === "" ? null : Number(entry.ratio_size_05),
            })),
    });

    const validateForm = () => {
        const nextErrors = {};

        if (!selectedType) nextErrors.selectedType = true;
        if (!entryDate) nextErrors.entryDate = true;
        if (!String(variety || "").trim()) nextErrors.variety = true;
        if (!String(entryCount || "").trim()) nextErrors.entryCount = true;

        entries.forEach((entry, index) => {
            if (!String(entry.mc_no || "").trim()) nextErrors[`${index}-mc_no`] = true;
            if (!String(entry.ratio_size_1 || "").trim()) nextErrors[`${index}-ratio_size_1`] = true;
            if (!String(entry.ratio_size_07 || "").trim()) nextErrors[`${index}-ratio_size_07`] = true;
            if (!String(entry.ratio_size_05 || "").trim()) nextErrors[`${index}-ratio_size_05`] = true;
        });

        setErrors(nextErrors);

        if (Object.keys(nextErrors).length) {
            setFormMessage("Please fill all required fields before preview.");
            return false;
        }

        setFormMessage("");
        return true;
    };

    const handleSubmit = async () => {
        try {
            await dispatch(submitCardingNati(buildPayload())).unwrap();
            setShowPreview(false);
            setFormMessage("");
            setShowSuccess(true);
        } catch (submitError) {
            setFormMessage(submitError || "Unable to save nati data.");
        }
    };

    const previewItems = [
        { label: "Type", value: selectedType },
        { label: "Entry ID", value: entryId || "-" },
        { label: "Variety", value: variety },
        { label: "Entry Count", value: entryCount },
        ...entries.flatMap((entry, index) => ([
            { label: `Row ${index + 1} MC No`, value: entry.mc_no },
            { label: `Row ${index + 1} Ratio 1.0`, value: entry.ratio_size_1 },
            { label: `Row ${index + 1} Ratio 0.7`, value: entry.ratio_size_07 },
            { label: `Row ${index + 1} Ratio 0.5`, value: entry.ratio_size_05 },
        ])),
    ];

    return (
        <div className={styles["cb-card"]}>
            <div className={styles["cb-body"]}>
                <div className={styles["cb-form"]}>
                    <div className={styles["cb-row"]}>
                        <div className={styles["cb-form-group"]}>
                            <label>Type</label>
                            <select
                                value={selectedType}
                                onChange={(e) => onTypeChange(e.target.value)}
                                className={errors.selectedType ? styles["field-error"] : ""}
                            >
                                <option value="">Select Type</option>
                                {types.map((item) => (
                                    <option key={item.id} value={item.name}>
                                        {item.displayName ?? item.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {showForm && (
                            <>
                                <div className={styles["cb-form-group"]}>
                                    <label>Entry ID</label>
                                    <input
                                        type="text"
                                        value={entryId || ""}
                                        readOnly
                                        disabled
                                        className={errors.entryDate ? styles["field-error"] : ""}
                                    />
                                </div>
                            </>
                        )}
                    </div>

                    {showForm && (
                        <>
                            <div className={styles["cb-row"]}>
                                <div className={styles["cb-form-group"]}>
                                    <label>Variety</label>
                                    <SearchableSelect
                                        value={variety}
                                        onChange={(value) => {
                                            setVariety(value);
                                            setErrors((current) => {
                                                const next = { ...current };
                                                delete next.variety;
                                                return next;
                                            });
                                        }}
                                        className={errors.variety ? styles["field-error"] : ""}
                                        options={varietyOptions}
                                        placeholder="-- Select Variety --"
                                    />
                                </div>
                            </div>

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
                                            className={errors.entryCount ? styles["field-error"] : ""}
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
                                                <div className={styles["cb-form-group"]}>
                                                    <label>MC No</label>
                                                    <SearchableSelect
                                                        value={entry.mc_no}
                                                        onChange={(value) => handleEntryChange(index, "mc_no", value)}
                                                        options={mcNoOptions}
                                                        placeholder="Select CDG No"
                                                        ariaLabel={`CDG No Row ${index + 1}`}
                                                        className={errors[`${index}-mc_no`] ? styles["field-error"] : ""}
                                                    />
                                                </div>
                                                <div className={styles["cb-form-group"]}>
                                                    <label>Ratio into size-1.0</label>
                                                    <input
                                                        value={entry.ratio_size_1}
                                                        onChange={(e) => handleEntryChange(index, "ratio_size_1", e.target.value)}
                                                        className={errors[`${index}-ratio_size_1`] ? styles["field-error"] : ""}
                                                    />
                                                </div>
                                                <div className={styles["cb-form-group"]}>
                                                    <label>Ratio into size-0.7</label>
                                                    <input
                                                        value={entry.ratio_size_07}
                                                        onChange={(e) => handleEntryChange(index, "ratio_size_07", e.target.value)}
                                                        className={errors[`${index}-ratio_size_07`] ? styles["field-error"] : ""}
                                                    />
                                                </div>
                                                <div className={styles["cb-form-group"]}>
                                                    <label>Ratio into size-0.5</label>
                                                    <input
                                                        value={entry.ratio_size_05}
                                                        onChange={(e) => handleEntryChange(index, "ratio_size_05", e.target.value)}
                                                        className={errors[`${index}-ratio_size_05`] ? styles["field-error"] : ""}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {showForm && (
                <>
                    {formMessage ? (
                        <div className={`${styles["message-box"]} ${error ? styles["message-error"] : styles["message-success"]}`}>
                            {formMessage}
                        </div>
                    ) : null}
                    <div className={styles["cb-footer"]}>
                        <Footer
                            isMobile={isMobile}
                            onBack={() => router.push("/departments/quality-control")}
                            onClear={handleClear}
                            onSave={() => {
                                if (validateForm()) {
                                    setShowPreview(true);
                                }
                            }}
                            saveLabel={isLoading ? "Submitting..." : "Save Record"}
                            disabled={isLoading}
                        />
                    </div>

                    <PreviewModal
                        open={showPreview}
                        title="Carding Preview"
                        subtitle="Carding Notebook / Nati Data Entry"
                        items={previewItems}
                        typeValue={selectedType}
                        onCancel={() => setShowPreview(false)}
                        onConfirm={handleSubmit}
                        confirmLabel={isLoading ? "Submitting..." : "Submit"}
                    />

                    <SuccessModal
                        open={showSuccess}
                        onClose={() => setShowSuccess(false)}
                    />
                </>
            )}
        </div>
    );
}

export default NatiDataEntry;

