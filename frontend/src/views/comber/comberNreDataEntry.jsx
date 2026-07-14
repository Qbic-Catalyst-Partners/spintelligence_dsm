import { forwardRef, useImperativeHandle, useState } from "react";
import { useDispatch } from "react-redux";
import { submitComberNre } from "@/store/slices/comber";
import { sanitizeNumericInput } from "@/utils/inputValidation";
import styles from "./ribbonLapCVDataEntry.module.css";

const initialForm = () => ({
    silver_hank: "",
    delivery_mtr_min: "",
    comber_neps_min: "",
    feed_mm_per_nep: "",
    fiber_nep_in_comber_lap_gms: "",
    fiber_nep_gms_in_silver: "",
    comber_nre_percent: "",
});

const FIELDS = [
    { key: "silver_hank", label: "Silver Hank" },
    { key: "delivery_mtr_min", label: "Delivery Mtr / Min" },
    { key: "comber_neps_min", label: "Comber Neps / Min" },
    { key: "feed_mm_per_nep", label: "Feed in mm / Nep" },
    { key: "fiber_nep_in_comber_lap_gms", label: "Fiber Nep in Comber Lap / Gms" },
    { key: "fiber_nep_gms_in_silver", label: "Fiber Nep / Gms in Silver" },
    { key: "comber_nre_percent", label: "Comber NRE%" },
];

const ComberNreDataEntry = forwardRef(function ComberNreDataEntry(
    { types, selectedType, onTypeChange, entryId = "" },
    ref
) {
    const dispatch = useDispatch();

    const [form, setForm] = useState(initialForm());
    const [errors, setErrors] = useState({});
    const [formMessage, setFormMessage] = useState("");

    const handleChange = (field, value) => {
        setForm((current) => ({
            ...current,
            [field]: sanitizeNumericInput(value, { precision: 10, scale: 2 }),
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
        ...Object.fromEntries(
            FIELDS.map(({ key }) => [key, form[key] === "" ? null : Number(form[key])])
        ),
    });

    const handleSubmit = async () => {
        const valid = validate();
        if (!valid) return false;

        try {
            await dispatch(submitComberNre(buildPayload())).unwrap();
            setErrors({});
            return true;
        } catch (submitError) {
            setFormMessage(submitError || "Unable to save Comber NRE% data.");
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
                        <label>Silver Hank</label>
                        <input
                            className={errors.silver_hank ? styles["input-error"] : ""}
                            value={form.silver_hank}
                            inputMode="decimal"
                            onChange={(e) => handleChange("silver_hank", e.target.value)}
                        />
                    </div>
                </div>

                <div className={styles["cb-row"]} style={{ marginBottom: "16px" }}>
                    <div className={styles["cb-form-group"]}>
                        <label>Delivery Mtr / Min</label>
                        <input
                            className={errors.delivery_mtr_min ? styles["input-error"] : ""}
                            value={form.delivery_mtr_min}
                            inputMode="decimal"
                            onChange={(e) => handleChange("delivery_mtr_min", e.target.value)}
                        />
                    </div>

                    <div className={styles["cb-form-group"]}>
                        <label>Comber Neps / Min</label>
                        <input
                            className={errors.comber_neps_min ? styles["input-error"] : ""}
                            value={form.comber_neps_min}
                            inputMode="decimal"
                            onChange={(e) => handleChange("comber_neps_min", e.target.value)}
                        />
                    </div>

                    <div className={styles["cb-form-group"]}>
                        <label>Feed in mm / Nep</label>
                        <input
                            className={errors.feed_mm_per_nep ? styles["input-error"] : ""}
                            value={form.feed_mm_per_nep}
                            inputMode="decimal"
                            onChange={(e) => handleChange("feed_mm_per_nep", e.target.value)}
                        />
                    </div>
                </div>

                <div className={styles["cb-row"]}>
                    <div className={styles["cb-form-group"]}>
                        <label>Fiber Nep in Comber Lap / Gms</label>
                        <input
                            className={errors.fiber_nep_in_comber_lap_gms ? styles["input-error"] : ""}
                            value={form.fiber_nep_in_comber_lap_gms}
                            inputMode="decimal"
                            onChange={(e) => handleChange("fiber_nep_in_comber_lap_gms", e.target.value)}
                        />
                    </div>

                    <div className={styles["cb-form-group"]}>
                        <label>Fiber Nep / Gms in Silver</label>
                        <input
                            className={errors.fiber_nep_gms_in_silver ? styles["input-error"] : ""}
                            value={form.fiber_nep_gms_in_silver}
                            inputMode="decimal"
                            onChange={(e) => handleChange("fiber_nep_gms_in_silver", e.target.value)}
                        />
                    </div>

                    <div className={styles["cb-form-group"]}>
                        <label>Comber NRE%</label>
                        <input
                            className={errors.comber_nre_percent ? styles["input-error"] : ""}
                            value={form.comber_nre_percent}
                            inputMode="decimal"
                            onChange={(e) => handleChange("comber_nre_percent", e.target.value)}
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

export default ComberNreDataEntry;
