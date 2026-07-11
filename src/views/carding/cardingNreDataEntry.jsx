import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useDispatch, useSelector } from "react-redux";

import Footer from "@/components/Footer";
import PreviewModal from "@/components/PreviewModal";
import SuccessModal from "@/components/SuccessModal";
import SearchableSelect from "@/components/SearchableSelect";
import { clearCardingState, submitCardingNre } from "@/store/slices/carding";
import { fetchCardingMasterMachines } from "@/apis/carding";
import styles from "./cardThickPlaceEntry.module.css";

const MACHINE_MODEL_OPTIONS = ["DK803", "DK903", "TC03", "DK800", "TC05", "TC06", "TC10", "TC26I"];

const wireSpecFields = [
    ["Cylinder Wire Specification", "cylinder"],
    ["Doffer Wire Specification", "doffer"],
    ["Flat Wire Specification", "flat"],
    ["Lickerin Wire Specification", "lickerin"],
];

const requiredFields = [
    "machineModel",
    "machine",
    "cylinderSpecs",
    "cylinderTonnage1",
    "cylinderTonnage2",
    "dofferSpecs",
    "dofferTonnage1",
    "dofferTonnage2",
    "flatSpecs",
    "flatTonnage1",
    "flatTonnage2",
    "lickerinSpecs",
    "lickerinTonnage1",
    "lickerinTonnage2",
    "silverHank",
    "deliveryMtrMin",
    "fibreNepGmsCardMat",
    "fibreNepGmsSilver",
    "cardingNrePercent",
];

function CardingNreDataEntry({ types, selectedType, onTypeChange, entryId = "", reserveEntryId }) {
    const router = useRouter();
    const dispatch = useDispatch();
    const { isLoading, nre, error } = useSelector((state) => state.carding ?? {
        isLoading: false,
        nre: null,
        error: null,
    });

    const [formData, setFormData] = useState({});
    const [machineOptions, setMachineOptions] = useState([]);
    const [errors, setErrors] = useState({});
    const [formMessage, setFormMessage] = useState("");
    const [isError, setIsError] = useState(false);
    const [showPreview, setShowPreview] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);

    useEffect(() => {
        const loadMachines = async () => {
            try {
                const options = await fetchCardingMasterMachines({ prefix: "CDG" });
                setMachineOptions(options);
            } catch {
                setMachineOptions([]);
            }
        };
        loadMachines();
    }, []);

    useEffect(() => {
        if (nre) {
            setFormMessage("");
            setIsError(false);
        }
    }, [nre]);

    useEffect(() => {
        if (error) {
            setFormMessage(error);
            setIsError(true);
        }
    }, [error]);

    useEffect(() => {
        return () => {
            dispatch(clearCardingState());
        };
    }, [dispatch]);

    const setFieldValue = (name, value) => {
        setFormData((current) => ({ ...current, [name]: value }));
        setFormMessage("");
        setIsError(false);
        setErrors((current) => {
            const next = { ...current };
            delete next[name];
            return next;
        });
    };

    const handleChange = (event) => {
        const { name, value } = event.target;
        setFieldValue(name, value);
    };

    const resetForm = () => {
        setFormData({});
        setFormMessage("");
        setIsError(false);
        setErrors({});
    };

    const handleClear = () => {
        resetForm();
        setShowSuccess(false);
    };

    const validateForm = () => {
        const nextErrors = {};
        requiredFields.forEach((field) => {
            if (String(formData[field] || "").trim() === "") {
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

    const buildPayload = () => ({
        entry_id: entryId || "",
        machine_model: formData.machineModel || "",
        mc_name: formData.machine || "",
        cylinder_specs: formData.cylinderSpecs || "",
        cylinder_tonnage_1: formData.cylinderTonnage1 || "",
        cylinder_tonnage_2: formData.cylinderTonnage2 || "",
        doffer_specs: formData.dofferSpecs || "",
        doffer_tonnage_1: formData.dofferTonnage1 || "",
        doffer_tonnage_2: formData.dofferTonnage2 || "",
        flat_specs: formData.flatSpecs || "",
        flat_tonnage_1: formData.flatTonnage1 || "",
        flat_tonnage_2: formData.flatTonnage2 || "",
        lickerin_specs: formData.lickerinSpecs || "",
        lickerin_tonnage_1: formData.lickerinTonnage1 || "",
        lickerin_tonnage_2: formData.lickerinTonnage2 || "",
        silver_hank: formData.silverHank || "",
        delivery_mtr_min: formData.deliveryMtrMin || "",
        fibre_nep_gms_card_mat: formData.fibreNepGmsCardMat || "",
        fibre_nep_gms_silver: formData.fibreNepGmsSilver || "",
        carding_nre_percent: formData.cardingNrePercent || "",
    });

    const handleSubmit = async () => {
        try {
            await dispatch(submitCardingNre(buildPayload())).unwrap();
            setFormMessage("");
            setIsError(false);
            setShowPreview(false);
            setShowSuccess(true);
            resetForm();
        } catch (submitError) {
            setFormMessage(submitError || "Error submitting data.");
            setIsError(true);
            await reserveEntryId?.();
        }
    };

    const previewItems = [
        { label: "Type", value: selectedType },
        { label: "Entry ID", value: entryId || "-" },
        { label: "Machine Model", value: formData.machineModel || "-" },
        { label: "Mc Name", value: formData.machine || "-" },
        ...wireSpecFields.flatMap(([label, prefix]) => [
            { label: `${label} - Specs`, value: formData[`${prefix}Specs`] || "-" },
            { label: `${label} - Tonnage in Kgs (1)`, value: formData[`${prefix}Tonnage1`] || "-" },
            { label: `${label} - Tonnage in Kgs (2)`, value: formData[`${prefix}Tonnage2`] || "-" },
        ]),
        { label: "Silver Hank", value: formData.silverHank || "-" },
        { label: "Delivery Mtr / Min", value: formData.deliveryMtrMin || "-" },
        { label: "Fibre Nep / Gms card mat", value: formData.fibreNepGmsCardMat || "-" },
        { label: "Fibre Nep / Gms in Silver", value: formData.fibreNepGmsSilver || "-" },
        { label: "Carding NRE%", value: formData.cardingNrePercent || "-" },
    ];

    const fieldClass = (name) => (errors[name] ? styles["field-error"] : "");

    return (
        <>
            <div className={styles["card-form"]}>
                <div className={styles["card-row"]}>
                    <div className={styles["card-form-group"]}>
                        <label>Type</label>
                        <select
                            value={selectedType}
                            onChange={(e) => onTypeChange(e.target.value)}
                            onWheel={(e) => e.currentTarget.blur()}
                        >
                            <option value="">Select Type</option>
                            {types.map((item) => (
                                <option key={item.id} value={item.name}>
                                    {item.displayName ?? item.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className={styles["card-form-group"]}>
                        <label>Entry ID</label>
                        <input type="text" value={entryId || ""} readOnly />
                    </div>

                    <div className={styles["card-form-group"]}>
                        <label>Machine Model</label>
                        <SearchableSelect
                            value={formData.machineModel || ""}
                            onChange={(value) => setFieldValue("machineModel", value)}
                            options={MACHINE_MODEL_OPTIONS}
                            placeholder="Select Machine Model"
                            ariaLabel="Machine Model"
                            className={fieldClass("machineModel")}
                        />
                    </div>
                </div>

                <div className={styles["card-row"]} style={{ gridTemplateColumns: "360px" }}>
                    <div className={styles["card-form-group"]}>
                        <label>Mc Name</label>
                        <SearchableSelect
                            value={formData.machine || ""}
                            onChange={(value) => setFieldValue("machine", value)}
                            options={machineOptions}
                            placeholder="Select Machine"
                            ariaLabel="Mc Name"
                            className={fieldClass("machine")}
                        />
                    </div>
                </div>

                {wireSpecFields.map(([label, prefix]) => (
                    <div key={prefix}>
                        <h4 className={styles["card-machine-subtitle"]} style={{ color: "#000000", fontWeight: 700 }}>{label}</h4>
                        <div className={styles["card-row"]}>
                            <div className={styles["card-form-group"]}>
                                <label>Specs</label>
                                <input
                                    name={`${prefix}Specs`}
                                    value={formData[`${prefix}Specs`] || ""}
                                    onChange={handleChange}
                                    className={fieldClass(`${prefix}Specs`)}
                                />
                            </div>
                            <div className={styles["card-form-group"]}>
                                <label>Tonnage in Kgs</label>
                                <input
                                    type="number"
                                    name={`${prefix}Tonnage1`}
                                    value={formData[`${prefix}Tonnage1`] || ""}
                                    onChange={handleChange}
                                    onWheel={(e) => e.currentTarget.blur()}
                                    className={fieldClass(`${prefix}Tonnage1`)}
                                />
                            </div>
                            <div className={styles["card-form-group"]}>
                                <label>Tonnage in Kgs</label>
                                <input
                                    type="number"
                                    name={`${prefix}Tonnage2`}
                                    value={formData[`${prefix}Tonnage2`] || ""}
                                    onChange={handleChange}
                                    onWheel={(e) => e.currentTarget.blur()}
                                    className={fieldClass(`${prefix}Tonnage2`)}
                                />
                            </div>
                        </div>
                    </div>
                ))}

                <div className={styles["card-row"]}>
                    <div className={styles["card-form-group"]}>
                        <label>Silver Hank</label>
                        <input
                            type="number"
                            name="silverHank"
                            value={formData.silverHank || ""}
                            onChange={handleChange}
                            onWheel={(e) => e.currentTarget.blur()}
                            className={fieldClass("silverHank")}
                        />
                    </div>
                    <div className={styles["card-form-group"]}>
                        <label>Delivery Mtr / Min</label>
                        <input
                            type="number"
                            name="deliveryMtrMin"
                            value={formData.deliveryMtrMin || ""}
                            onChange={handleChange}
                            onWheel={(e) => e.currentTarget.blur()}
                            className={fieldClass("deliveryMtrMin")}
                        />
                    </div>
                    <div className={styles["card-form-group"]}>
                        <label>Fibre Nep / Gms card mat</label>
                        <input
                            type="number"
                            name="fibreNepGmsCardMat"
                            value={formData.fibreNepGmsCardMat || ""}
                            onChange={handleChange}
                            onWheel={(e) => e.currentTarget.blur()}
                            className={fieldClass("fibreNepGmsCardMat")}
                        />
                    </div>
                </div>

                <div className={styles["card-row"]}>
                    <div className={styles["card-form-group"]}>
                        <label>Fibre Nep / Gms in Silver</label>
                        <input
                            type="number"
                            name="fibreNepGmsSilver"
                            value={formData.fibreNepGmsSilver || ""}
                            onChange={handleChange}
                            onWheel={(e) => e.currentTarget.blur()}
                            className={fieldClass("fibreNepGmsSilver")}
                        />
                    </div>
                    <div className={styles["card-form-group"]}>
                        <label>Carding NRE%</label>
                        <input
                            type="number"
                            name="cardingNrePercent"
                            value={formData.cardingNrePercent || ""}
                            onChange={handleChange}
                            onWheel={(e) => e.currentTarget.blur()}
                            className={fieldClass("cardingNrePercent")}
                        />
                    </div>
                </div>
            </div>

            {formMessage ? (
                <div className={`${styles["message-box"]} ${isError ? styles["message-error"] : styles["message-success"]}`}>
                    {formMessage}
                </div>
            ) : null}

            <div className={styles["card-footer"]}>
                <Footer
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
                subtitle="Carding Notebook / Carding NRE%"
                items={previewItems}
                typeValue={selectedType}
                onCancel={() => setShowPreview(false)}
                onConfirm={handleSubmit}
                confirmLabel={isLoading ? "Submitting..." : "Submit"}
            />

            <SuccessModal open={showSuccess} onClose={() => setShowSuccess(false)} />
        </>
    );
}

export default CardingNreDataEntry;
