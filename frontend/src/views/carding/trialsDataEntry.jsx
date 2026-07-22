import { useEffect, useState } from "react";
import { useRouter } from "next/router";

import Footer from "@/components/Footer";
import PreviewModal from "@/components/PreviewModal";
import SearchableSelect from "@/components/SearchableSelect";
import SuccessModal from "@/components/SuccessModal";
import NotebookCustomFields from "@/components/NotebookCustomFields";
import { sanitizeIntegerInput, sanitizeNumericInput } from "@/utils/inputValidation";
import {
    fetchCardingMasterMachines,
    fetchTrialsAutoconerMachines,
    fetchTrialsSpinningMachines,
    submitTrialsDataEntry,
} from "@/apis/carding";
import { saveNotebookCustomFieldValuesApi } from "@/apis/notebookCustomFieldsApi";
import useCardingCountOptions from "@/hooks/useCardingCountOptions";
import useEmployeeOptions from "@/hooks/useEmployeeOptions";
import styles from "./trialsDataEntry.module.css";

const topCutFields = [
    ["Total Cuts", "totalCuts"],
    ["Neps Cuts", "nepsCuts"],
    ["Short Cuts", "shortCuts"],
    ["Long Cuts", "longCuts"],
    ["Thin Cuts", "thinCuts"],
];

const cutsGridFields = [
    ["cp", "cm", "ccp", "ccm", "jp", "jm"],
    ["a1", "a2", "a3", "a4"],
    ["b1", "b2", "b3", "b4"],
    ["c1", "c2", "c3", "c4"],
    ["d1", "d2", "d3", "d4"],
    ["e", "f", "g", "h1", "h2"],
    ["i1", "i2", "cvb", "flCut", "fdCut"],
];

const cutsGridLabelOverrides = {
    flCut: "FL CUT",
    fdCut: "FD CUT",
};

const requiredFields = [
    "cardingMachine",
    "machine",
    "autoMachine",
    "count",
    "product",
    "trialtype",
    "nature",
    "materialMixing",
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
    jm: { precision: 6, scale: 2 },
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
    cvb: { precision: 6, scale: 2 },
    flCut: { precision: 6, scale: 2 },
    fdCut: { precision: 6, scale: 2 },
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

function TrialDepartment({ types = [], selectedType = "", onTypeChange = () => {}, showForm = false, entryId = "", reserveEntryId }) {
    const router = useRouter();
    const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
    const [time, setTime] = useState("");
    const [formData, setFormData] = useState({});
    const [errors, setErrors] = useState({});
    const [showPreview, setShowPreview] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [formMessage, setFormMessage] = useState("");
    const [isError, setIsError] = useState(false);
    const [spinningMachineOptions, setSpinningMachineOptions] = useState([]);
    const [autoconerMachineOptions, setAutoconerMachineOptions] = useState([]);
    const [cardingMachineOptions, setCardingMachineOptions] = useState([]);
    const [machinesLoading, setMachinesLoading] = useState(false);
    const [machinesError, setMachinesError] = useState("");
    const [customFieldValues, setCustomFieldValues] = useState({});
    const [customFieldDefs, setCustomFieldDefs] = useState([]);

    const handleCustomFieldChange = (fieldId, value) => {
        setCustomFieldValues((prev) => ({ ...prev, [fieldId]: value }));
    };
    const { countOptions, countOptionsError, loadingCountOptions } = useCardingCountOptions("trials");
    const { employeeOptions, employeeOptionsError, loadingEmployeeOptions } = useEmployeeOptions("trials");
    const countNameOptions = countOptions.map((option) => option.count_name || option.label || option.value).filter(Boolean);

    useEffect(() => {
        const now = new Date();
        setTime(
            [String(now.getHours()).padStart(2, "0"), String(now.getMinutes()).padStart(2, "0"), String(now.getSeconds()).padStart(2, "0")].join(":")
        );
    }, []);

    useEffect(() => {
        let cancelled = false;
        const loadMachineOptions = async () => {
            setMachinesLoading(true);
            setMachinesError("");
            try {
                const [spinningOptions, autoconerOptions, cardingOptions] = await Promise.all([
                    fetchTrialsSpinningMachines({ prefix: "" }),
                    fetchTrialsAutoconerMachines({ prefix: "" }),
                    fetchCardingMasterMachines({ prefix: "CDG" }),
                ]);

                if (cancelled) return;
                setSpinningMachineOptions(spinningOptions);
                setAutoconerMachineOptions(autoconerOptions);
                setCardingMachineOptions(cardingOptions);
            } catch (error) {
                if (cancelled) return;
                setSpinningMachineOptions([]);
                setAutoconerMachineOptions([]);
                setCardingMachineOptions([]);
                setMachinesError(error.message || "Unable to load machine dropdown options.");
            } finally {
                if (!cancelled) {
                    setMachinesLoading(false);
                }
            }
        };

        loadMachineOptions();
        return () => {
            cancelled = true;
        };
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
        setFieldValue(name, value);
    };

    const setFieldValue = (name, value) => {
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
        setShowPreview(false);
        setShowSuccess(false);
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

    const computeTotalRegular = (data) =>
        (Number.parseFloat(data.thin50) || 0) +
        (Number.parseFloat(data.thick50) || 0) +
        (Number.parseFloat(data.neps200) || 0);

    const computeTotalHs = (data) =>
        (Number.parseFloat(data.thin40) || 0) +
        (Number.parseFloat(data.thick35) || 0) +
        (Number.parseFloat(data.neps140) || 0);

    const totalRegularValue = computeTotalRegular(formData);
    const totalHsValue = computeTotalHs(formData);

    const buildTrialsPayload = () => {
        const totalRegular = totalRegularValue;
        const totalHs = totalHsValue;

        const payload = {
            entry_id: entryId || "",
            date,
            time,
            type: selectedType,
            entry_date: date,
            entry_time: time,
            entry_type: selectedType,
            mc_no: formData.cardingMachine || "",
            spinning_machine: formData.machine || "",
            autoconer_machine: formData.autoMachine || "",
            count_name: formData.count || "",
            product: formData.product || "",
            trial_type: formData.trialtype || "",
            nature: formData.nature || "",
            raw_material_mixing: formData.materialMixing || "",
            yarn_results: formData.yarnresults || "",
            yarn_remarks: formData.yarnremarks || "",
            user_id: formData.userId || "",
            u_percent: formData.uPercent || "",
            cvm: formData.cvm || "",
            cvm_cv_percent: formData.cvmCvPercent || "",
            cvm_10mtr: formData.cvm10mtr || "",
            dr_1_5m: formData.dr15m || "",
            thin_minus_50: formData.thin50 || "",
            thick_plus_50: formData.thick50 || "",
            neps_plus_200: formData.neps200 || "",
            total_regular: totalRegular ? String(totalRegular) : "",
            thin_minus_40: formData.thin40 || "",
            thick_plus_35: formData.thick35 || "",
            neps_plus_140: formData.neps140 || "",
            total_hs: totalHs ? String(totalHs) : "",
            thin_minus_30: formData.thin30 || "",
            yarn_count: formData.countFinal || "",
            csp: formData.csp || "",
            total_cuts: formData.totalCuts || "",
            neps_cuts: formData.nepsCuts || "",
            shorts_cuts: formData.shortCuts || "",
            long_cuts: formData.longCuts || "",
            thin_cuts: formData.thinCuts || "",
            cp: formData.cp || "",
            cm: formData.cm || "",
            ccp: formData.ccp || "",
            ccm: formData.ccm || "",
            jp: formData.jp || "",
            jm: formData.jm || "",
            a1: formData.a1 || "",
            a2: formData.a2 || "",
            a3: formData.a3 || "",
            a4: formData.a4 || "",
            b1: formData.b1 || "",
            b2: formData.b2 || "",
            b3: formData.b3 || "",
            b4: formData.b4 || "",
            c1: formData.c1 || "",
            c2: formData.c2 || "",
            c3: formData.c3 || "",
            c4: formData.c4 || "",
            d1: formData.d1 || "",
            d2: formData.d2 || "",
            d3: formData.d3 || "",
            d4: formData.d4 || "",
            e: formData.e || "",
            f: formData.f || "",
            g: formData.g || "",
            h1: formData.h1 || "",
            h2: formData.h2 || "",
            l1: formData.i1 || "",
            l2: formData.i2 || "",
            cvb: formData.cvb || "",
            fl_cut: formData.flCut || "",
            fd_cut: formData.fdCut || "",
            df_drg_mc_no: formData.dfDrgMcNo || "",
            df_finish_u_percent: formData.dfFinishU || "",
            df_cvim: formData.dfCvim || "",
            df_cvb: formData.dfCvb || "",
            smx_no: formData.smxNo || "",
            spl_no: formData.splNo || "",
            roving_percent: formData.rovingPercent || "",
            smx_cvim: formData.smxCvim || "",
        };

        return payload;
    };

    const handleSave = async () => {
        setShowPreview(false);
        try {
            const payload = buildTrialsPayload();
            await submitTrialsDataEntry(payload);

            const customFieldEntries = Object.entries(customFieldValues).filter(([, v]) => String(v ?? '').trim() !== '');
            if (entryId && customFieldEntries.length) {
                try {
                    await saveNotebookCustomFieldValuesApi(
                        entryId,
                        customFieldEntries.map(([customFieldId, value]) => ({ custom_field_id: customFieldId, value }))
                    );
                } catch (customFieldError) {
                    console.error("Failed to save custom field values:", customFieldError);
                }
            }

            setFormMessage("");
            setIsError(false);
            setShowSuccess(true);
            await reserveEntryId?.();
        } catch (error) {
            setFormMessage(error.message || "Failed to submit trials data.");
            setIsError(true);
            await reserveEntryId?.();
        }
    };

    const previewItems = [
        { label: "Type", value: selectedType },
        { label: "Entry ID", value: entryId || "-" },
        { label: "Time", value: time },
        ...requiredFields.map((field) => ({
            label: field,
            value: formData[field],
        })),
        ...customFieldDefs.map((field) => ({
            label: field.field_label,
            value: customFieldValues[field.id],
        })),
    ];

    const fieldClass = (name) => (errors[name] ? styles.errorField : "");
    const trialTypeOptions = ["Trials", "Sample"];

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
                                    {item.displayName ?? item.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className={styles.cardFormGroup}>
                        <label>Carding Machine No.</label>
                        <SearchableSelect
                            value={formData.cardingMachine || ""}
                            onChange={(value) => setFieldValue("cardingMachine", value)}
                            options={cardingMachineOptions}
                            placeholder={machinesLoading ? "Loading machines..." : "Select"}
                            className={fieldClass("cardingMachine")}
                            ariaLabel="Carding Machine No."
                        />
                    </div>
                </div>

                {showForm && (
                    <>
                        <div className={styles.cardRow}>
                            <div className={styles.cardFormGroup}>
                                <label>Entry ID</label>
                                <input type="text" name="date" value={entryId || ""} readOnly />
                            </div>

                            <div className={styles.cardFormGroup}>
                                <label>Raw Material / Mixing</label>
                                <input name="materialMixing" value={formData.materialMixing || ""} onChange={handleChange} className={fieldClass("materialMixing")} />
                            </div>
                        </div>

                        <div className={styles.cardRow}>
                            <div className={styles.cardFormGroup}>
                                <label>Count Name</label>
                                <SearchableSelect
                                    value={formData.count || ""}
                                    onChange={(value) => setFieldValue("count", value)}
                                    options={countNameOptions}
                                    placeholder={
                                        loadingCountOptions
                                            ? "Loading count names..."
                                            : countOptionsError
                                                ? "Type count name"
                                                : "Select Count Name"
                                    }
                                    className={fieldClass("count")}
                                    ariaLabel="Count Name"
                                />
                            </div>

                            <div className={styles.cardFormGroup}>
                                <label>Spinning Machine Name</label>
                                <SearchableSelect
                                    value={formData.machine || ""}
                                    onChange={(value) => setFieldValue("machine", value)}
                                    options={spinningMachineOptions}
                                    placeholder={machinesLoading ? "Loading machines..." : "Select"}
                                    className={fieldClass("machine")}
                                    ariaLabel="Spinning Machine Name"
                                />
                            </div>

                            <div className={styles.cardFormGroup}>
                                <label>Autoconer Machine Name</label>
                                <SearchableSelect
                                    value={formData.autoMachine || ""}
                                    onChange={(value) => setFieldValue("autoMachine", value)}
                                    options={autoconerMachineOptions}
                                    placeholder={machinesLoading ? "Loading machines..." : "Select"}
                                    className={fieldClass("autoMachine")}
                                    ariaLabel="Autoconer Machine Name"
                                />
                            </div>
                        </div>

                        {machinesLoading ? <p>Loading machine options...</p> : null}
                        {machinesError ? <p className={`${styles.messageBox} ${styles.messageError}`}>{machinesError}</p> : null}

                        <div className={styles.cardRow}>
                            <div className={styles.cardFormGroup}>
                                <label>Product</label>
                                <input
                                    name="product"
                                    value={formData.product || ""}
                                    onChange={handleChange}
                                    className={fieldClass("product")}
                                />
                            </div>

                            <div className={styles.cardFormGroup}>
                                <label>Type</label>
                                <select
                                    name="trialtype"
                                    value={formData.trialtype || ""}
                                    onChange={handleChange}
                                    className={fieldClass("trialtype")}
                                >
                                    <option value="">Select</option>
                                    {trialTypeOptions.map((name) => (
                                        <option key={name} value={name}>
                                            {name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className={styles.cardFormGroup}>
                                <label>Nature of Trials/Sample</label>
                                <input name="nature" value={formData.nature || ""} onChange={handleChange} className={fieldClass("nature")} />
                            </div>
                        </div>

                        <div className={styles.cardRow}>
                            <div className={`${styles.cardFormGroup} ${styles.fullWidth}`}>
                                <label>Yarn Results (optional)</label>
                                <textarea name="yarnresults" value={formData.yarnresults || ""} onChange={handleChange} className={fieldClass("yarnresults")} />
                            </div>
                        </div>

                        <h3 className={`${styles.cutsTitle} ${styles.noGapTitle}`}>Draw Frame</h3>
                        <div className={styles.cardRow}>
                            {[["Drg Mc. No.", "dfDrgMcNo"], ["Finish U%", "dfFinishU"], ["CVIM", "dfCvim"], ["CVB", "dfCvb"]].map(([label, name]) => (
                                <div className={styles.cardFormGroup} key={name}>
                                    <label>{label}</label>
                                    <input name={name} value={formData[name] || ""} onChange={handleChange} className={fieldClass(name)} />
                                </div>
                            ))}
                        </div>

                        <h3 className={`${styles.cutsTitle} ${styles.noGapTitle}`}>Simplex</h3>
                        <div className={styles.cardRow}>
                            {[["SMX No.", "smxNo"], ["SPL No.", "splNo"], ["Roving%", "rovingPercent"], ["CVIM", "smxCvim"]].map(([label, name]) => (
                                <div className={styles.cardFormGroup} key={name}>
                                    <label>{label}</label>
                                    <input name={name} value={formData[name] || ""} onChange={handleChange} className={fieldClass(name)} />
                                </div>
                            ))}
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
                                        <label>{cutsGridLabelOverrides[item] || item.toUpperCase()}</label>
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
                                    {name === "userId" ? (
                                        <SearchableSelect
                                            className={fieldClass(name)}
                                            value={formData[name] || ""}
                                            onChange={(value) => setFieldValue(name, value)}
                                            options={employeeOptions}
                                            placeholder={
                                                loadingEmployeeOptions
                                                    ? "Loading employees..."
                                                    : employeeOptionsError
                                                        ? "Type employee name"
                                                        : "Select Employee"
                                            }
                                            ariaLabel={label}
                                        />
                                    ) : (
                                        <input name={name} value={formData[name] || ""} onChange={handleChange} className={fieldClass(name)} />
                                    )}
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
                            <input
                                type="number"
                                value={totalRegularValue ? totalRegularValue.toFixed(2) : "0.00"}
                                readOnly
                            />
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
                            <input
                                type="number"
                                value={totalHsValue ? totalHsValue.toFixed(2) : "0.00"}
                                readOnly
                            />
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

                    <div className={styles.cardRow}>
                        <div className={`${styles.cardFormGroup} ${styles.fullWidth}`}>
                            <label>Yarn Remarks (optional)</label>
                            <textarea name="yarnremarks" value={formData.yarnremarks || ""} onChange={handleChange} className={fieldClass("yarnremarks")} />
                        </div>
                    </div>
                </>
            )}

            <NotebookCustomFields
                department="Quality Control"
                subDepartment="Individual Card Performance"
                notebook="Individual Card Performance Data"
                entryId={entryId}
                values={customFieldValues}
                onChange={handleCustomFieldChange}
                onFieldsLoaded={setCustomFieldDefs}
            />

            {formMessage ? (
                <div className={`${styles.messageBox} ${isError ? styles.messageError : styles.messageSuccess}`}>
                    {formMessage}
                </div>
            ) : null}

            <Footer
                onBack={() => router.push("/departments/quality-control")}
                onClear={handleClear}
                onSave={() => {
                    if (validateForm()) {
                        setShowPreview(true);
                    }
                }}
                saveLabel="Save Record"
                disabled={!showForm}
            />

            <PreviewModal
                open={showPreview}
                title="Carding Preview"
                subtitle="Individual Card Performance Notebook / Individual Card performance Data"
                items={previewItems}
                typeValue={selectedType}
                onCancel={() => setShowPreview(false)}
                onConfirm={handleSave}
                confirmLabel="Submit"
            />

            <SuccessModal
                open={showSuccess}
                onClose={handleClear}
            />
        </div>
    );
}

export default TrialDepartment;

