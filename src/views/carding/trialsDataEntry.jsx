import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import PreviewModal from "@/components/PreviewModal";
import { sanitizeIntegerInput, sanitizeNumericInput } from "@/utils/inputValidation";
import styles from "./trialsDataEntry.module.css";

const topCutFields = [
    ["Total Cuts", "totalCuts"],
    ["Neps Cuts", "nepsCuts"],
    ["Short Cuts", "shortCuts"],
    ["Long Cuts", "longCuts"],
    ["Thin Cuts", "thinCuts"],
];

const cutsGridFields = [
    ["cp", "cm", "ccp", "ccm", "jp"],
    ["a1", "a2", "a3", "a4"],
    ["b1", "b2", "b3", "b4"],
    ["c1", "c2", "c3", "c4"],
    ["d1", "d2", "d3", "d4"],
    ["e", "f", "g", "h1", "h2"],
    ["i1", "i2", "cvp"],
];

const requiredFields = [
    "trialId",
    "machine",
    "autoMachine",
    "count",
    "purpose",
    "trialname",
    "trialtype",
    "nature",
    "unit",
    "material",
    "mixing",
    "yarnresults",
    "totalCuts",
    "nepsCuts",
    "shortCuts",
    "longCuts",
    "thinCuts",
    "userId",
    "uPercent",
    "cvm",
    "cvmCvPercent",
    "cvm10mtr",
    "dr15m",
    "thin50",
    "thick50",
    "neps200",
    "thin40",
    "thick35",
    "neps140",
    "thin30",
    "countFinal",
    "csp",
    ...cutsGridFields.flat(),
];

const INTEGER_FIELDS = new Set(["totalCuts", "nepsCuts", "shortCuts", "longCuts", "thinCuts"]);
const DECIMAL_FIELD_CONFIG = {
    cp: { precision: 6, scale: 2 },
    cm: { precision: 6, scale: 2 },
    ccp: { precision: 6, scale: 2 },
    ccm: { precision: 6, scale: 2 },
    jp: { precision: 6, scale: 2 },
    a1: { precision: 6, scale: 2 },
    a2: { precision: 6, scale: 2 },
    a3: { precision: 6, scale: 2 },
    a4: { precision: 6, scale: 2 },
    b1: { precision: 6, scale: 2 },
    b2: { precision: 6, scale: 2 },
    b3: { precision: 6, scale: 2 },
    b4: { precision: 6, scale: 2 },
    c1: { precision: 6, scale: 2 },
    c2: { precision: 6, scale: 2 },
    c3: { precision: 6, scale: 2 },
    c4: { precision: 6, scale: 2 },
    d1: { precision: 6, scale: 2 },
    d2: { precision: 6, scale: 2 },
    d3: { precision: 6, scale: 2 },
    d4: { precision: 6, scale: 2 },
    e: { precision: 6, scale: 2 },
    f: { precision: 6, scale: 2 },
    g: { precision: 6, scale: 2 },
    h1: { precision: 6, scale: 2 },
    h2: { precision: 6, scale: 2 },
    i1: { precision: 6, scale: 2 },
    i2: { precision: 6, scale: 2 },
    cvp: { precision: 6, scale: 2 },
    uPercent: { precision: 6, scale: 2 },
    cvm: { precision: 6, scale: 2 },
    cvmCvPercent: { precision: 6, scale: 2 },
    cvm10mtr: { precision: 6, scale: 2 },
    dr15m: { precision: 6, scale: 2 },
    thin50: { precision: 6, scale: 2 },
    thick50: { precision: 6, scale: 2 },
    neps200: { precision: 6, scale: 2 },
    thin40: { precision: 6, scale: 2 },
    thick35: { precision: 6, scale: 2 },
    neps140: { precision: 6, scale: 2 },
    thin30: { precision: 6, scale: 2 },
    countFinal: { precision: 6, scale: 2 },
    csp: { precision: 8, scale: 2 },
};

function TrialDepartment({ types = [], selectedType = "", onTypeChange = () => {}, showForm = false }) {
    const router = useRouter();
    const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
    const [time, setTime] = useState("");
    const [formData, setFormData] = useState({});
    const [errors, setErrors] = useState({});
    const [showPreview, setShowPreview] = useState(false);
    const [formMessage, setFormMessage] = useState("");
    const [isError, setIsError] = useState(false);

    useEffect(() => {
        const now = new Date();
        setTime(
            [String(now.getHours()).padStart(2, "0"), String(now.getMinutes()).padStart(2, "0"), String(now.getSeconds()).padStart(2, "0")].join(":")
        );
    }, []);

    const refreshStamp = () => {
        const now = new Date();
        setDate(now.toISOString().split("T")[0]);
        setTime(
            [String(now.getHours()).padStart(2, "0"), String(now.getMinutes()).padStart(2, "0"), String(now.getSeconds()).padStart(2, "0")].join(":")
        );
    };

    const handleTypeChange = (value) => {
        onTypeChange(value);
        refreshStamp();
    };

    const handleChange = (event) => {
        const { name, value } = event.target;
        const nextValue = INTEGER_FIELDS.has(name)
            ? sanitizeIntegerInput(value, 9)
            : DECIMAL_FIELD_CONFIG[name]
                ? sanitizeNumericInput(value, DECIMAL_FIELD_CONFIG[name])
                : value;
        setFormData((current) => ({
            ...current,
            [name]: nextValue,
        }));
        setErrors((current) => {
            const next = { ...current };
            delete next[name];
            return next;
        });
    };

    const handleClear = () => {
        setFormData({});
        setErrors({});
        setFormMessage("");
        setIsError(false);
        refreshStamp();
    };

    const validateForm = () => {
        const nextErrors = {};
        if (!selectedType) nextErrors.selectedType = true;
        requiredFields.forEach((field) => {
            if (!String(formData[field] || "").trim()) {
                nextErrors[field] = true;
            }
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

    const handleSave = () => {
        setShowPreview(false);
        setFormMessage("Preview confirmed. API is not connected for Trials yet.");
        setIsError(false);
    };

    const previewItems = [
        { label: "Type", value: selectedType },
        { label: "Date", value: date },
        { label: "Time", value: time },
        ...requiredFields.map((field) => ({
            label: field,
            value: formData[field],
        })),
    ];

    const fieldClass = (name) => (errors[name] ? styles.errorField : "");

    return (
        <div className={styles.cardShell}>
            <div className={styles.cardForm}>
                <div className={styles.cardRow}>
                    <div className={styles.cardFormGroup}>
                        <label>Type</label>
                        <select
                            value={selectedType}
                            onChange={(event) => handleTypeChange(event.target.value)}
                            onWheel={(event) => event.currentTarget.blur()}
                            className={errors.selectedType ? styles.errorField : ""}
                        >
                            <option value="">Select Type</option>
                            {types.map((item) => (
                                <option key={item.id} value={item.name}>
                                    {item.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className={styles.cardFormGroup}>
                        <label>Basic Information</label>
                        <input
                            name="trialId"
                            placeholder="TRL-20260304-001"
                            value={formData.trialId || ""}
                            onChange={handleChange}
                            className={fieldClass("trialId")}
                        />
                    </div>
                </div>

                {showForm && (
                    <>
                        <div className={styles.cardRow}>
                            <div className={styles.cardFormGroup}>
                                <label>Date</label>
                                <input type="date" name="date" value={date} readOnly />
                            </div>

                            <div className={styles.cardFormGroup}>
                                <label>Time</label>
                                <input type="text" value={time} readOnly />
                            </div>
                        </div>

                        <div className={styles.cardRow}>
                            <div className={styles.cardFormGroup}>
                                <label>Spinning Machine Name</label>
                                <select name="machine" value={formData.machine || ""} onChange={handleChange} className={fieldClass("machine")}>
                                    <option value="">Select</option>
                                    <option value="Carding Machine">Carding Machine</option>
                                </select>
                            </div>

                            <div className={styles.cardFormGroup}>
                                <label>Autoconer Machine Name</label>
                                <select name="autoMachine" value={formData.autoMachine || ""} onChange={handleChange} className={fieldClass("autoMachine")}>
                                    <option value="">Select</option>
                                    <option value="Autoconer Machine">Autoconer Machine</option>
                                </select>
                            </div>

                            <div className={styles.cardFormGroup}>
                                <label>Count Name</label>
                                <input name="count" value={formData.count || ""} onChange={handleChange} className={fieldClass("count")} />
                            </div>
                        </div>

                        <div className={styles.cardRow}>
                            <div className={styles.cardFormGroup}>
                                <label>Purpose</label>
                                <input name="purpose" value={formData.purpose || ""} onChange={handleChange} className={fieldClass("purpose")} />
                            </div>

                            <div className={styles.cardFormGroup}>
                                <label>Trial Name / ID</label>
                                <input name="trialname" value={formData.trialname || ""} onChange={handleChange} className={fieldClass("trialname")} />
                            </div>

                            <div className={styles.cardFormGroup}>
                                <label>Type</label>
                                <select name="trialtype" value={formData.trialtype || ""} onChange={handleChange} className={fieldClass("trialtype")}>
                                    <option value="">Select</option>
                                    <option value="Trial">Trial</option>
                                </select>
                            </div>
                        </div>

                        <div className={styles.cardRow}>
                            <div className={styles.cardFormGroup}>
                                <label>Nature</label>
                                <input name="nature" value={formData.nature || ""} onChange={handleChange} className={fieldClass("nature")} />
                            </div>

                            <div className={styles.cardFormGroup}>
                                <label>Unit No.</label>
                                <input name="unit" value={formData.unit || ""} onChange={handleChange} className={fieldClass("unit")} />
                            </div>

                            <div className={styles.cardFormGroup}>
                                <label>Raw Material</label>
                                <input name="material" value={formData.material || ""} onChange={handleChange} className={fieldClass("material")} />
                            </div>
                        </div>

                        <div className={styles.cardRow}>
                            <div className={styles.cardFormGroup}>
                                <label>Mixing</label>
                                <input name="mixing" value={formData.mixing || ""} onChange={handleChange} className={fieldClass("mixing")} />
                            </div>

                            <div className={`${styles.cardFormGroup} ${styles.fullWidth}`}>
                                <label>Yarn Results</label>
                                <textarea name="yarnresults" value={formData.yarnresults || ""} onChange={handleChange} className={fieldClass("yarnresults")} />
                            </div>
                        </div>
                    </>
                )}
            </div>

            {showForm && (
                <>
                    <div className={styles.cutsSection}>
                        <h3 className={styles.cutsTitle}>Cuts and Imperfection Parameters</h3>

                        <div className={styles.cutsTop}>
                            {topCutFields.map(([label, name]) => (
                                <div className={styles.cardFormGroup} key={name}>
                                    <label>{label}</label>
                                    <input type="text" name={name} value={formData[name] || ""} onChange={handleChange} className={fieldClass(name)} />
                                </div>
                            ))}
                        </div>

                        <div className={styles.cutsGrid}>
                            {cutsGridFields.map((row, rowIndex) =>
                                row.map((item, columnIndex) => (
                                    <div
                                        className={styles.gridItem}
                                        key={`${item}-${rowIndex}`}
                                        style={{ gridRow: rowIndex + 1, gridColumn: columnIndex + 1 }}
                                    >
                                        <label>{item.toUpperCase()}</label>
                                        <input type="text" name={item} value={formData[item] || ""} onChange={handleChange} className={fieldClass(item)} />
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    <h3 className={styles.cutsTitle}>User Tester Parameters</h3>
                    <div className={styles.parameterCard}>
                        <div className={styles.cardRow}>
                            {[["User ID", "userId"], ["U%", "uPercent"], ["CVM", "cvm"]].map(([label, name]) => (
                                <div className={styles.cardFormGroupfield} key={name}>
                                    <label>{label}</label>
                                    <input name={name} value={formData[name] || ""} onChange={handleChange} className={fieldClass(name)} />
                                </div>
                            ))}
                        </div>

                        <div className={styles.cardRow}>
                            {[["CVM cv%", "cvmCvPercent"], ["CVM 10 mtr", "cvm10mtr"], ["DR 1.5m", "dr15m"]].map(([label, name]) => (
                                <div className={styles.cardFormGroupfield} key={name}>
                                    <label>{label}</label>
                                    <input name={name} value={formData[name] || ""} onChange={handleChange} className={fieldClass(name)} />
                                </div>
                            ))}
                        </div>
                    </div>

                    <h3 className={styles.cutsTitle}>IPI Parameters</h3>
                    <p className={styles.subTitle}>REGULAR IPI</p>
                    <div className={styles.grid4}>
                        {[["Thin -50%", "thin50"], ["Thick +50%", "thick50"], ["Neps +200%", "neps200"]].map(([label, name]) => (
                            <div className={styles.formGroup} key={name}>
                                <label>{label}</label>
                                <input type="number" name={name} value={formData[name] || ""} onChange={handleChange} className={fieldClass(name)} />
                            </div>
                        ))}
                        <div className={styles.formGroup}>
                            <label>Total (Regular)</label>
                            <input type="number" value="0.00" readOnly />
                        </div>
                    </div>

                    <p className={`${styles.subTitle} ${styles.marginTop}`}>HIGHER SENSITIVE IPI</p>
                    <div className={styles.grid4}>
                        {[["Thin -40%", "thin40"], ["Thick +35%", "thick35"], ["Neps +140%", "neps140"]].map(([label, name]) => (
                            <div className={styles.formGroup} key={name}>
                                <label>{label}</label>
                                <input type="number" name={name} value={formData[name] || ""} onChange={handleChange} className={fieldClass(name)} />
                            </div>
                        ))}
                        <div className={styles.formGroup}>
                            <label>Total (HS)</label>
                            <input type="number" value="0.00" readOnly />
                        </div>
                    </div>

                    <p className={styles.cutsTitle}>Other IPI / Final values</p>
                    <div className={styles.cardBox}>
                        <div className={styles.grid3}>
                            {[["Thin -30%", "thin30"], ["Count", "countFinal"], ["CSP", "csp"]].map(([label, name]) => (
                                <div className={styles.field} key={name}>
                                    <label>{label}</label>
                                    <input type="number" name={name} value={formData[name] || ""} onChange={handleChange} className={fieldClass(name)} />
                                </div>
                            ))}
                        </div>
                    </div>
                </>
            )}

            <div className={styles.cardFooter}>
                <button className={styles.cardBack} onClick={() => router.push("/dashboard")}>
                    Back to Dashboard
                </button>
                <div className={styles.cardRightActions}>
                    <button className={styles.secondaryBtn} onClick={handleClear}>
                        Clear Form
                    </button>
                    <button
                        className={styles.primaryBtn}
                        onClick={() => {
                            if (validateForm()) {
                                setShowPreview(true);
                            }
                        }}
                        disabled={!showForm}
                    >
                        Preview
                    </button>
                </div>
            </div>

            {formMessage ? (
                <div className={`${styles.messageBox} ${isError ? styles.messageError : styles.messageSuccess}`}>
                    {formMessage}
                </div>
            ) : null}

            <PreviewModal
                open={showPreview}
                title="Carding Preview"
                subtitle="Carding Notebook / Trials Data Entry Form"
                items={previewItems}
                typeValue={selectedType}
                onCancel={() => setShowPreview(false)}
                onConfirm={handleSave}
                confirmLabel="Submit"
            />
        </div>
    );
}

export default TrialDepartment;
