import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useDispatch, useSelector } from "react-redux";

import Footer from "@/components/Footer";
import PreviewModal from "@/components/PreviewModal";
import SuccessModal from "@/components/SuccessModal";
import { clearCardingState, submitCardingCardThickPlace } from "@/store/slices/carding";
import { fetchCardingMasterMachines } from "@/apis/carding";
import styles from "./cardThickPlaceEntry.module.css";

const defaultMachines = Array.from({ length: 25 }, (_, index) => `CDG-${String(index + 1).padStart(2, "0")}`);

const createMachineValues = (machines) =>
    machines.reduce((accumulator, machine) => {
        accumulator[machine] = { cv1: "", cv2: "" };
        return accumulator;
    }, {});

function CardThickPlaceEntry({
    types,
    selectedType,
    onTypeChange,
    entryId = "",
    showForm,
    hideTypeField = false,
}) {
    const router = useRouter();
    const dispatch = useDispatch();
    const { isLoading, data, error } = useSelector((state) => state.carding ?? {
        isLoading: false,
        data: null,
        error: null,
    });

    const [idNo, setIdNo] = useState("3");
    const [date, setDate] = useState("");
    const [time, setTime] = useState("");
    const [machines, setMachines] = useState(defaultMachines);
    const [machineValues, setMachineValues] = useState(() => createMachineValues(defaultMachines));
    const [formMessage, setFormMessage] = useState("");
    const [isError, setIsError] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const [errors, setErrors] = useState({});
    const [showPreview, setShowPreview] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);

    const stampNow = () => {
        const now = new Date();
        setDate(now.toISOString().split("T")[0]);
        setTime(
            [
                String(now.getHours()).padStart(2, "0"),
                String(now.getMinutes()).padStart(2, "0"),
                String(now.getSeconds()).padStart(2, "0"),
            ].join(":")
        );
    };

    useEffect(() => {
        stampNow();
    }, []);

    useEffect(() => {
        const loadMachines = async () => {
            try {
                const options = await fetchCardingMasterMachines({ prefix: "CDG" });
                if (options.length) {
                    setMachines(options);
                    setMachineValues((current) => {
                        const next = createMachineValues(options);
                        options.forEach((machine) => {
                            if (current[machine]) next[machine] = current[machine];
                        });
                        return next;
                    });
                }
            } catch {
                setMachines(defaultMachines);
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
        if (data?.message) {
            setFormMessage("");
            setIsError(false);
        }
    }, [data]);

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

    const resetFormFields = () => {
        setIdNo("3");
        stampNow();
        setMachineValues(createMachineValues(machines));
        setFormMessage("");
        setIsError(false);
    };

    const handleChange = (machine, field, value) => {
        setMachineValues((currentValues) => ({
            ...currentValues,
            [machine]: {
                ...currentValues[machine],
                [field]: value,
            },
        }));
        setFormMessage("");
        setIsError(false);
        setErrors((current) => {
            const next = { ...current };
            delete next[`${machine}-${field}`];
            return next;
        });
    };

    const handleClear = () => {
        resetFormFields();
        setShowSuccess(false);
    };

    const handleTypeSelect = (value) => {
        onTypeChange(value);
        if (value === "Card Thick Place Entry") {
            stampNow();
            setFormMessage("");
            setIsError(false);
        } else {
            resetFormFields();
        }
    };

    const validateForm = () => {
        const nextErrors = {};

        if (!selectedType) nextErrors.selectedType = true;
        if (!String(idNo || "").trim()) nextErrors.idNo = true;
        machines.forEach((machine) => {
            if (String(machineValues[machine]?.cv1 || "").trim() === "") {
                nextErrors[`${machine}-cv1`] = true;
            }
            if (String(machineValues[machine]?.cv2 || "").trim() === "") {
                nextErrors[`${machine}-cv2`] = true;
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

    const handleSubmit = async () => {
        const entries = machines
            .filter((machine) =>
                String(machineValues[machine]?.cv1 || "").trim() !== "" ||
                String(machineValues[machine]?.cv2 || "").trim() !== ""
            )
            .map((machine) => ({
                machine,
                cv_value: parseFloat(machineValues[machine]?.cv1),
                cv_5m: parseFloat(machineValues[machine]?.cv2),
            }));

        try {
            await dispatch(
                submitCardingCardThickPlace({
                    entry_id: entryId || idNo,
                    entry_date: date,
                    entry_time: time,
                    entries,
                })
            ).unwrap();

            setFormMessage("");
            setIsError(false);
            setShowPreview(false);
            setShowSuccess(true);
            resetFormFields();
        } catch (submitError) {
            setFormMessage(submitError || "Error submitting data.");
            setIsError(true);
        }
    };

    const previewItems = [
        { label: "Type", value: selectedType },
        { label: "ID No.", value: idNo },
        { label: "Entry ID", value: entryId || "-" },
        { label: "Time", value: time },
        ...machines.flatMap((machine) => ([
            { label: `${machine} (5m CV 1)`, value: machineValues[machine]?.cv1 || "-" },
            { label: `${machine} (5m CV 2)`, value: machineValues[machine]?.cv2 || "-" },
        ])),
    ];

    return (
        <>
            <div className={styles["card-form"]}>
                {!hideTypeField && (
                    <div className={styles["card-row"]}>
                        <div className={styles["card-form-group"]}>
                            <label>Type</label>
                            <select
                                value={selectedType}
                                onChange={(e) => handleTypeSelect(e.target.value)}
                                onWheel={(e) => e.currentTarget.blur()}
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
                            <div className={styles["card-form-group"]}>
                                <label>ID No.</label>
                                <input
                                    value={idNo}
                                    onChange={(e) => {
                                        setIdNo(e.target.value);
                                        setErrors((current) => {
                                            const next = { ...current };
                                            delete next.idNo;
                                            return next;
                                        });
                                    }}
                                    onWheel={(e) => e.currentTarget.blur()}
                                    className={errors.idNo ? styles["field-error"] : ""}
                                />
                            </div>
                        )}
                    </div>
                )}

                {showForm && (
                    <>
                        <div className={styles["card-row"]}>
                            <div className={styles["card-form-group"]}>
                                <label>Entry ID</label>
                                <input type="text" value={entryId || ""} readOnly />
                            </div>

                            <div className={styles["card-form-group"]}>
                                <label>Time</label>
                                <input type="text" value={time} readOnly />
                            </div>
                        </div>

                        <div className={styles["card-machine-section"]}>
                            <div className={styles["card-machine-header"]}>
                                <h4>Enter value for each machine</h4>
                                {/* <button
                                    type="button"
                                    className={styles["card-secondary"]}
                                    onClick={handleClear}
                                >
                                    + New Entry
                                </button> */}
                            </div>

                            <p className={styles["card-machine-subtitle"]}>Card Thick Place Values</p>

                            <div className={styles["card-machine-grid"]}>
                                {machines.map((machine) => (
                                    <div key={machine} className={styles["card-machine-box"]}>
                                        <label>{machine}</label>
                                        <input
                                            type="number"
                                            step="any"
                                            value={machineValues[machine]?.cv1 || ""}
                                            onChange={(e) => handleChange(machine, "cv1", e.target.value)}
                                            onWheel={(e) => e.currentTarget.blur()}
                                            placeholder="Card Thick Place Value"
                                            className={errors[`${machine}-cv1`] ? styles["field-error"] : ""}
                                        />
                                        <input
                                            type="number"
                                            step="any"
                                            value={machineValues[machine]?.cv2 || ""}
                                            onChange={(e) => handleChange(machine, "cv2", e.target.value)}
                                            onWheel={(e) => e.currentTarget.blur()}
                                            placeholder="5m CV"
                                            className={errors[`${machine}-cv2`] ? styles["field-error"] : ""}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </>
                )}
            </div>

            {showForm ? (
                <>
                    {formMessage ? (
                        <div
                            className={`${styles["message-box"]} ${
                                isError ? styles["message-error"] : styles["message-success"]
                            }`}
                        >
                            {formMessage}
                        </div>
                    ) : null}

                    <div className={styles["card-footer"]}>
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
                        subtitle="Carding Notebook / Card Thick Place Entry"
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
            ) : null}
        </>
    );
}

export default CardThickPlaceEntry;

