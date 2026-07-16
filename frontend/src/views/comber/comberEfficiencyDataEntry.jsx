import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { useDispatch } from "react-redux";
import SearchableSelect from "@/components/SearchableSelect";
import { submitComberEfficiency } from "@/store/slices/comber";
import { fetchComberRibbonLapMasterMcNos } from "@/apis/comber";
import { sanitizeNumericInput } from "@/utils/inputValidation";
import styles from "./ribbonLapCVDataEntry.module.css";

const initialForm = () => ({
    mc_name: "",
    span_length_50_lap: "",
    span_length_50_sliver: "",
    combining_efficiency_formula: "",
});

const FIELDS = [
    { key: "mc_name", label: "Mc Name" },
    { key: "span_length_50_lap", label: "50% span length in LAP" },
    { key: "span_length_50_sliver", label: "50% span length in Sliver" },
    { key: "combining_efficiency_formula", label: "Combing Efficiency" },
];

const NUMERIC_FIELDS = ["span_length_50_lap", "span_length_50_sliver"];

const ComberEfficiencyDataEntry = forwardRef(function ComberEfficiencyDataEntry(
    { types, selectedType, onTypeChange, entryId = "" },
    ref
) {
    const dispatch = useDispatch();

    const [form, setForm] = useState(initialForm());
    const [errors, setErrors] = useState({});
    const [formMessage, setFormMessage] = useState("");
    const [mcNameOptions, setMcNameOptions] = useState([]);

    // Same machine source (dbo.MCMASTER scoped to the Comber department) every
    // other Comber screen's MC No./Mc Name dropdown uses.
    useEffect(() => {
        let active = true;
        fetchComberRibbonLapMasterMcNos({ screen: "master" })
            .then((machines) => {
                if (!active) return;
                setMcNameOptions(
                    (machines || [])
                        .map((row) => ({
                            value: String(row?.mc_name || row?.mc_no || "").trim(),
                            label: String(row?.mc_name || row?.mc_no || "").trim(),
                        }))
                        .filter((row) => row.value)
                );
            })
            .catch((error) => {
                console.warn("Unable to fetch Comber machine options:", error?.message || error);
            });
        return () => {
            active = false;
        };
    }, []);

    const handleChange = (field, value) => {
        const nextValue = NUMERIC_FIELDS.includes(field)
            ? sanitizeNumericInput(value, { precision: 10, scale: 2 })
            : value;
        setForm((current) => ({
            ...current,
            [field]: nextValue,
        }));
        setErrors((prev) => {
            if (!prev[field]) return prev;
            const next = { ...prev };
            delete next[field];
            return next;
        });
        setFormMessage("");
    };

    const resetForm = () => {
        setForm(initialForm());
        setErrors({});
        setFormMessage("");
    };

    const validate = () => {
        const nextErrors = {};
        FIELDS.forEach(({ key }) => {
            if (!String(form[key] || "").trim()) nextErrors[key] = true;
        });

        setErrors(nextErrors);
        setFormMessage(Object.keys(nextErrors).length ? "Please fill all required fields before saving." : "");
        return Object.keys(nextErrors).length === 0;
    };

    const buildPayload = () => ({
        entry_id: entryId || "",
        type: selectedType,
        mc_name: form.mc_name,
        span_length_50_lap: form.span_length_50_lap === "" ? null : Number(form.span_length_50_lap),
        span_length_50_sliver: form.span_length_50_sliver === "" ? null : Number(form.span_length_50_sliver),
        combining_efficiency_formula: form.combining_efficiency_formula,
    });

    const handleSubmit = async () => {
        const valid = validate();
        if (!valid) return false;

        try {
            await dispatch(submitComberEfficiency(buildPayload())).unwrap();
            setErrors({});
            return true;
        } catch (submitError) {
            setFormMessage(submitError || "Unable to save Comber Efficiency data.");
            return false;
        }
    };

    const getPreviewData = () =>
        FIELDS.map(({ key, label }) => ({ label, value: form[key] || "-" }));

    useImperativeHandle(ref, () => ({
        clear: resetForm,
        validate,
        getPreviewData,
        submit: handleSubmit,
    }));

    return (
        <>
            <div className={styles["cb-form"]}>
                <div className={styles["cb-row"]} style={{ marginBottom: "16px" }}>
                    <div className={styles["cb-form-group"]}>
                        <label>Type</label>
                        <select value={selectedType} onChange={(e) => onTypeChange(e.target.value)}>
                            <option value="">Select Type</option>
                            {types.map((item) => (
                                <option key={item.id} value={item.name}>
                                    {item.displayName ?? item.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className={styles["cb-form-group"]}>
                        <label>Entry ID</label>
                        <input type="text" value={entryId || ""} readOnly disabled />
                    </div>

                    <div className={styles["cb-form-group"]}>
                        <label>Mc Name</label>
                        <SearchableSelect
                            className={errors.mc_name ? styles["input-error"] : ""}
                            value={form.mc_name}
                            onChange={(value) => handleChange("mc_name", value)}
                            options={mcNameOptions}
                            placeholder="Select Mc Name"
                            ariaLabel="Mc Name"
                        />
                    </div>
                </div>

                <div className={styles["cb-row"]}>
                    <div className={styles["cb-form-group"]}>
                        <label>50% span length in LAP</label>
                        <input
                            className={errors.span_length_50_lap ? styles["input-error"] : ""}
                            value={form.span_length_50_lap}
                            inputMode="decimal"
                            onChange={(e) => handleChange("span_length_50_lap", e.target.value)}
                        />
                    </div>

                    <div className={styles["cb-form-group"]}>
                        <label>50% span length in Sliver</label>
                        <input
                            className={errors.span_length_50_sliver ? styles["input-error"] : ""}
                            value={form.span_length_50_sliver}
                            inputMode="decimal"
                            onChange={(e) => handleChange("span_length_50_sliver", e.target.value)}
                        />
                    </div>

                    <div className={styles["cb-form-group"]}>
                        <label>Combing Efficiency</label>
                        <input
                            className={errors.combining_efficiency_formula ? styles["input-error"] : ""}
                            value={form.combining_efficiency_formula}
                            onChange={(e) => handleChange("combining_efficiency_formula", e.target.value)}
                        />
                    </div>
                </div>
            </div>

            {formMessage ? (
                <div className={`${styles["message-box"]} ${styles["message-error"]}`}>
                    {formMessage}
                </div>
            ) : null}
        </>
    );
});

export default ComberEfficiencyDataEntry;
