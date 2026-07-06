import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useRouter } from "next/router";
import { useDispatch, useSelector } from "react-redux";
import { AiOutlineAudio } from "react-icons/ai";
import Image from "next/image";

import Footer from "../components/Footer";
import InputScreenUploadButton from "@/components/InputScreenUploadButton";
import PreviewModal from "@/components/PreviewModal";
import SearchableSelect from "@/components/SearchableSelect";
import SuccessModal from "@/components/SuccessModal";
import ProcessParameterDataEntry from "./spinning/processParameterDataEntry";
import WheelChange from "./spinning/WheelChange";
import { submitSpinningRecord, resetSpinningState } from "../store/slices/spinSlice";
import {
    fetchSpinningCountChangeDropdown,
    fetchSpinningCountChangeRfNos,
    fetchSpinningMachineNumberOptions,
    fetchSpinningRingFrameShifts,
} from "@/apis/spinning";
import { fetchEmployeeOptions, normalizeEmployeeOptions } from "@/apis/employeeMaster";
import { sanitizeIntegerInput, sanitizeNumericInput } from "@/utils/inputValidation";
import { filterOptionsByDepartmentAccess } from "@/utils/screenAccess";
import { recordSubmittedNotebook } from "@/utils/submittedNotebookRecorder";
import useDatabaseEntryId from "@/hooks/useDatabaseEntryId";
import styles from "../styles/spinning.module.css";

const COUNT_CHANGE_BASE_ROWS = [
    { reading_value: "5", count: "10.23", cv_percent: "11.46", strength: "250", mean: "279.67", cv_percent_2: "13.42", csp: "2861.02" },
    { reading_value: "6", count: "10.23", cv_percent: "11.46", strength: "250", mean: "279.67", cv_percent_2: "13.42", csp: "2861.02" },
    { reading_value: "6.6", count: "10.23", cv_percent: "11.46", strength: "268", mean: "279.67", cv_percent_2: "13.42", csp: "2861.02" },
    { reading_value: "6.7", count: "10.23", cv_percent: "11.46", strength: "270", mean: "279.67", cv_percent_2: "13.42", csp: "2861.02" },
    { reading_value: "6.8", count: "10.23", cv_percent: "11.46", strength: "290", mean: "279.67", cv_percent_2: "13.42", csp: "2861.02" },
    { reading_value: "6.9", count: "10.23", cv_percent: "11.46", strength: "350", mean: "279.67", cv_percent_2: "13.42", csp: "2861.02" },
];

const createCountChangeRows = (readingCount) => {
    const total = Math.max(Number.parseInt(readingCount, 10) || 0, 0);
    return Array.from({ length: total }, (_, index) => ({
        reading_no: index + 1,
        reading_value: "",
        strength: "",
    }));
};

const SHIFT_OPTIONS = ["Select Shift" , "Shift 1", "Shift 2", "Shift 3"];
const RING_FRAME_CHECKERS = [];
const SPINNING_CHECKING_OPTIONS = [
    { id: 0, name: "Process Parameter", aliases: ["Process Parameter", "Process Parameter Data Entry"], component: ProcessParameterDataEntry },
    { id: 1, name: "COTS Checking", aliases: ["COTS Checking", "COTS - CHECKING"] },
    { id: 2, name: "Count Change", aliases: ["Count Change", "COUNT CHANGE"] },
    { id: 3, name: "Ring Frame Log Book", aliases: ["Ring Frame Log Book", "RING FRAME LOG BOOK"] },
    { id: 4, name: "Speed Checking", aliases: ["Speed Checking", "SPEED CHECKING"] },
    { id: 6, name: "Bottom Apron Checking", aliases: ["Bottom Apron Checking", "BOTTOM APRON CHECKING"] },
    { id: 7, name: "Lycra out of Centering", aliases: ["Lycra Centering", "LYCRA CENTERING"] },
    { id: 8, name: "RSM & Lycrasensor Checking Online", aliases: ["RSM & Lycrasensor Checking Online", "RSM AND LYCRASENSOR CHECKING ONLINE"] },
    { id: 9, name: "RSM & Lycrasensor Checking Offline", aliases: ["RSM & Lycrasensor Checking Offline", "RSM AND LYCRASENSOR CHECKING OFFLINE"] },
    { id: 10, name: "Wheel Change", aliases: ["Wheel Change", "WHEEL CHANGE"], component: WheelChange },
];

const COUNT_CHANGE_RF_NO_OPTIONS = [
    "1",
    "2",
    "3",
    "8",
    "9",
    "10",
    "11",
    "12",
    "13",
    "14",
    "15",
    "16",
    "17",
    "20",
    "24",
];

export const SPINNING_INPUT_SCREEN_COUNT = SPINNING_CHECKING_OPTIONS.length;
const DECIMAL_10_2_CONFIG = { precision: 10, scale: 2 };
const DECIMAL_5_2_CONFIG = { precision: 5, scale: 2 };
const RING_FRAME_RF_TOTAL = 24;
const COTS_SIDE_MAX = 650;
const RING_FRAME_TOTAL_FIELDS = [
    "position_1",
    "position_2",
    "position_3",
    "position_4",
    "position_5",
    "position_6",
];
const SPINNING_ENTRY_ID_CONFIG = {
    "Process Parameter": { prefix: "SNP", width: 4, routePath: "/spinning/qc" },
    "COTS Checking": { prefix: "SCT", width: 4, routePath: "/spinning/cots-checking" },
    "Count Change": { prefix: "SCG", width: 4, routePath: "/spinning/count-change" },
    "Ring Frame Log Book": { prefix: "SRF", width: 4, routePath: "/spinning/ring-frame" },
    "Speed Checking": { prefix: "SSD", width: 4, routePath: "/spinning/speed-checking" },
    "Lycra Missing": { prefix: "SLM", width: 4, routePath: "/spinning/lycra-missing" },
    "Bottom Apron Checking": { prefix: "SBA", width: 4, routePath: "/spinning/bottom-apron-checking" },
    "Lycra Centering": { prefix: "SLC", width: 4, routePath: "/spinning/lycra-centering" },
    "RSM & Lycrasensor Checking Online": { prefix: "SRO", width: 4, routePath: "/spinning/rsm-lycra-online" },
    "RSM & Lycrasensor Checking Offline": { prefix: "SFO", width: 4, routePath: "/spinning/rsm-lycra-offline" },
    "Wheel Change": { prefix: "SWC", width: 4, routePath: "/spinning/wheel-change" },
};

const getSpinningEntryConfig = (typeName) =>
    SPINNING_ENTRY_ID_CONFIG[typeName] || { prefix: "SPN" };
const normalizeTypeName = (value = "") => String(value).trim().toLowerCase();

const getMachineText = (value) => {
    if (value === undefined || value === null) return "";
    if (typeof value !== "object") return String(value).trim();
    return String(
        value.value ??
        value.label ??
        value.mc_no ??
        value.machine_no ??
        value.machine_number ??
        value.machineno ??
        value.rf_no ??
        value.rf_name ??
        value.checker_name ??
        value.employee_name ??
        value.empname ??
        value.emp_name ??
        value.user_name ??
        value.operator_name ??
        value.employee_code ??
        value.employee_name ??
        value.shift_name ??
        value.shift_code ??
        value.text ??
        value.mc_name ??
        value.machine_name ??
        value.name ??
        ""
    ).trim();
};

const normalizeMachineOptions = (payload) => {
    const rows = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.data)
            ? payload.data
            : Array.isArray(payload?.machines)
                ? payload.machines
                : Array.isArray(payload?.machineOptions)
                    ? payload.machineOptions
                    : Array.isArray(payload?.options)
                        ? payload.options
                        : Array.isArray(payload?.values)
                            ? payload.values
                            : Array.isArray(payload?.machine_numbers)
                                ? payload.machine_numbers
                                : Array.isArray(payload?.rf_nos)
                                    ? payload.rf_nos
                                    : Array.isArray(payload?.names)
                                        ? payload.names
                                        : Array.isArray(payload?.employee_names)
                                            ? payload.employee_names
                                            : Array.isArray(payload?.checker_names)
                                            ? payload.checker_names
                                            : Array.isArray(payload?.user_names)
                                                    ? payload.user_names
                                                    : Array.isArray(payload?.operator_names)
                                                        ? payload.operator_names
                                                        : Array.isArray(payload?.check_names)
                                                            ? payload.check_names
                                                            : Array.isArray(payload?.shift_names)
                                                                ? payload.shift_names
                                                                : Array.isArray(payload?.shift_codes)
                                                                    ? payload.shift_codes
                                                                    : [];

    const seen = new Set();

    return rows
        .map((row) => {
            const rawValue =
                row?.value ??
                row?.mc_no ??
                row?.machine_no ??
                row?.machine_number ??
                row?.machineno ??
                row?.rf_no ??
                row?.checker_name ??
                row?.employee_name ??
                row?.empname ??
                row?.emp_name ??
                row?.user_name ??
                row?.operator_name ??
                row?.employee_code ??
                row?.employee_name ??
                row?.shift_code ??
                row?.shift_name ??
                row?.text ??
                row?.rf_name ??
                row?.id ??
                row;
            const rawLabel =
                row?.label ??
                row?.text ??
                row?.checker_name ??
                row?.employee_name ??
                row?.empname ??
                row?.emp_name ??
                row?.user_name ??
                row?.operator_name ??
                row?.employee_name ??
                row?.shift_name ??
                row?.shift_code ??
                row?.mc_name ??
                row?.machine_name ??
                row?.varname ??
                row?.machine_number ??
                row?.rf_name ??
                row?.name ??
                rawValue;
            const value = getMachineText(rawValue);
            const label = getMachineText(rawLabel) || value;
            return value ? { value, label: label || value } : null;
        })
        .filter(Boolean)
        .filter((option) => {
            if (seen.has(option.value)) return false;
            seen.add(option.value);
            return true;
        });
};

const normalizeCotsSideValue = (value) => {
    const digits = sanitizeIntegerInput(value, 3);
    if (digits === "") return "";
    return String(Math.min(COTS_SIDE_MAX, Number(digits)));
};

const createRingFrameRows = () =>
    Array.from({ length: RING_FRAME_RF_TOTAL }, (_, index) => ({
        machine_no: String(index + 1),
        lycra: "",
        bobbin_color: "",
        position_1: "",
        position_2: "",
        position_3: "",
        position_4: "",
        position_5: "",
        position_6: "",
        guide_roll_lapping: "",
        lycra_missing: "",
        others: "",
    }));

const InspectionEntryIcon = () => (
    <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        width="18"
        height="18"
        className={styles["title-icon"]}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
    >
        <path d="M3 5.5H10.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M3 9.5H8.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M3 13.5H6.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M12.3 6.2L15.8 9.7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path
            d="M11.4 13.9L10.9 16L13 15.5L17 11.5C17.6 10.9 17.6 9.95 17 9.35L16.15 8.5C15.55 7.9 14.6 7.9 14 8.5L11.4 11.1V13.9Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
        />
    </svg>
);

function SpinningDepartment() {
    const currentDateLabel = new Date().toLocaleDateString("en-IN");
    const router = useRouter();
    const dispatch = useDispatch();
    const childRef = useRef(null);
    const { success, error } = useSelector((state) => state.spinning);
    const user = useSelector((state) => state.auth?.user);
    const accessByDepartment = useSelector((state) => state.auth?.accessByDepartment);
    const queryType = Array.isArray(router.query.type) ? router.query.type[0] : router.query.type;
    const isProcessParameterRequest = normalizeTypeName(queryType) === "process parameter";
    const fullCheckingOptions = useMemo(
        () =>
            filterOptionsByDepartmentAccess(
                SPINNING_CHECKING_OPTIONS,
                accessByDepartment,
                user,
                "Spinning"
            ),
        [accessByDepartment, user]
    );
    const checkingOptions = useMemo(
        () =>
            isProcessParameterRequest
                ? fullCheckingOptions
                : fullCheckingOptions.filter((item) => item.name !== "Process Parameter"),
        [fullCheckingOptions, isProcessParameterRequest]
    );
    const findCheckingOption = (value) =>
        checkingOptions.find((item) => item.name === value || item.displayName === value) || null;

    const [checkingType, setCheckingType] = useState(findCheckingOption(queryType)?.name || checkingOptions[0]?.name || "");
    const [selectedMachine, setSelectedMachine] = useState("");
    const [displaySpeed, setDisplaySpeed] = useState("");
    const [spindleSpeed, setSpindleSpeed] = useState("");
    const [countChangeMode, setCountChangeMode] = useState("");
    const [rfNo, setRfNo] = useState("");
    const [lycraDraft, setLycraDraft] = useState("");
    const [countNameFrom, setCountNameFrom] = useState("");
    const [countNameTo, setCountNameTo] = useState("");
    const [countReadingCount, setCountReadingCount] = useState("");
    const [countChangeRows, setCountChangeRows] = useState([]);
    const [countChangeEditingRow, setCountChangeEditingRow] = useState(null);
    const [shift, setShift] = useState("");
    const [ringFrameRows, setRingFrameRows] = useState(createRingFrameRows);
    const [outOfCenterAc, setOutOfCenterAc] = useState("");
    const [comments, setComments] = useState("");
    const [faultCopsAc, setFaultCopsAc] = useState("");
    const [faultCopsRf, setFaultCopsRf] = useState("");
    const [date, setDate] = useState("");
    const [lhsValue, setLhsValue] = useState("");
    const [lhsRemarks, setLhsRemarks] = useState("");
    const [rhsValue, setRhsValue] = useState("");
    const [rhsRemarks, setRhsRemarks] = useState("");
    const [isMobile, setIsMobile] = useState(false);
    const [errors, setErrors] = useState({});
    const [showPreview, setShowPreview] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [previewItems, setPreviewItems] = useState([]);
    const [validationMessage, setValidationMessage] = useState("");
    const [cotsMachineOptions, setCotsMachineOptions] = useState([]);
    const [spinningMachineOptions, setSpinningMachineOptions] = useState([]);
    const [countChangeRfOptions, setCountChangeRfOptions] = useState([]);
    const [countChangeCountNameFromOptions, setCountChangeCountNameFromOptions] = useState(
        []
    );
    const [countChangeCountNameToOptions, setCountChangeCountNameToOptions] = useState(
        []
    );
    const [ringFrameCheckerOptions, setRingFrameCheckerOptions] = useState([]);
    const [ringFrameShiftOptions, setRingFrameShiftOptions] = useState(SHIFT_OPTIONS);
    const [checkerName, setCheckerName] = useState("");
    const successHandledRef = useRef(false);

    const MAX_CHARS = 500;
    const fallbackMachineOptions = ["MC-01", "MC-02", "MC-03", "MC-04"].map((value) => ({ value, label: value }));
    const selectedCheckingOption = checkingOptions.find((item) => item.name === checkingType) || null;
    const SelectedComponent = selectedCheckingOption?.component ?? null;
    const isProcessParameter = checkingType === "Process Parameter";
    const isCotsChecking = checkingType === "COTS Checking";
    const isCountChange = checkingType === "Count Change";
    const isRingFrame = checkingType === "Ring Frame Log Book";
    const isWheelChange = checkingType === "Wheel Change";
    const isRsmChecking =
        checkingType === "RSM & Lycrasensor Checking Online" ||
        checkingType === "RSM & Lycrasensor Checking Offline";
    const countHeadingValue = (() => {
        const selectedReadingsCount = Number.parseInt(countReadingCount, 10);
        if (!Number.isFinite(selectedReadingsCount) || selectedReadingsCount <= 0) return "";
        return (64.8 / selectedReadingsCount).toFixed(2);
    })();
    const { entryId, reserveEntryId } = useDatabaseEntryId({
        department: "Spinning",
        typeName: checkingType,
        config: getSpinningEntryConfig(checkingType),
    });
    const machineOptions = isCotsChecking && cotsMachineOptions.length
        ? cotsMachineOptions
        : spinningMachineOptions.length
            ? spinningMachineOptions
            : fallbackMachineOptions;
    const machineSelectOptions = machineOptions;
    const countChangeRfSelectOptions = countChangeRfOptions;
    const countChangeCountNameFromSelectOptions = countChangeCountNameFromOptions;
    const countChangeCountNameToSelectOptions = countChangeCountNameToOptions;
    const ringFrameCheckerSelectOptions = ringFrameCheckerOptions;
    const ringFrameShiftSelectOptions = ringFrameShiftOptions;
    const machineFieldLabel = isCotsChecking ? "Machine No." : "Machine";
    const machineFieldPlaceholder = isCotsChecking ? "Select Machine No." : "Select Machine";
    const showSuccessOnce = () => {
        if (successHandledRef.current) return;
        successHandledRef.current = true;
        setShowSuccess(true);
    };

    const clearFormValues = useCallback(() => {
        childRef.current?.clear?.();
        setSelectedMachine("");
        setEmployeeSearch("");
        setShowEmployeeList(false);
        setDisplaySpeed("");
        setSpindleSpeed("");
        setCountChangeMode("");
        setRfNo("");
        setLycraDraft("");
        setCountNameFrom("");
        setCountNameTo("");
        setCountReadingCount("");
        setCountChangeRows([]);
        setCountChangeEditingRow(null);
        setShift("");
        setRingFrameRows(createRingFrameRows());
        setOutOfCenterAc("");
        setComments("");
        setFaultCopsAc("");
        setFaultCopsRf("");
        setLhsValue("");
        setLhsRemarks("");
        setRhsValue("");
        setRhsRemarks("");
        setDate("");
        setCheckerName("");
        setErrors({});
        setValidationMessage("");
        setShowPreview(false);
        setPreviewItems([]);
    }, []);

    useEffect(() => {
        const checkScreen = () => setIsMobile(window.innerWidth <= 767);
        checkScreen();
        window.addEventListener("resize", checkScreen);
        return () => window.removeEventListener("resize", checkScreen);
    }, []);

    useEffect(() => {
        const nextType = findCheckingOption(queryType)?.name || checkingOptions[0]?.name || "";
        setCheckingType(nextType);
        if (nextType) {
            setDate(getTodayDate());
        } else {
            setDate("");
        }
    }, [checkingOptions, queryType]);

    const typeChangeRef = useRef(false);

    useEffect(() => {
        if (!typeChangeRef.current) {
            typeChangeRef.current = true;
            return;
        }
        clearFormValues();
    }, [checkingType, clearFormValues]);

    useEffect(() => {
        const handleRouteChangeStart = () => {
            clearFormValues();
        };
        router.events.on("routeChangeStart", handleRouteChangeStart);
        return () => {
            router.events.off("routeChangeStart", handleRouteChangeStart);
        };
    }, [router.events, clearFormValues]);

    useEffect(() => {
        if (!isCotsChecking) return;

        let isMounted = true;
        fetchSpinningCountChangeRfNos()
            .then((payload) => {
                if (!isMounted) return;
                setCotsMachineOptions(normalizeMachineOptions(payload));
            })
            .catch(() => {
                if (isMounted) setCotsMachineOptions([]);
            });

        return () => {
            isMounted = false;
        };
    }, [isCotsChecking]);

    useEffect(() => {
        if (isCotsChecking || isCountChange || isRingFrame || isProcessParameter || isWheelChange) {
            setSpinningMachineOptions([]);
            return;
        }

        const screenMap = {
            "Lycra Missing": "lycra-missing",
            "Lycra Centering": "lycra-centering",
            "RSM & Lycrasensor Checking Online": "rsm-lycra-online",
            "RSM & Lycrasensor Checking Offline": "rsm-lycra-offline",
        };
        let isMounted = true;

        fetchSpinningMachineNumberOptions({ screen: screenMap[checkingType] || "master" })
            .then((payload) => {
                if (!isMounted) return;
                const options = normalizeMachineOptions(payload).filter((option) => option.value);
                setSpinningMachineOptions(options);
            })
            .catch(() => {
                if (isMounted) setSpinningMachineOptions([]);
            });

        return () => {
            isMounted = false;
        };
    }, [checkingType, isCotsChecking, isCountChange, isProcessParameter, isRingFrame, isWheelChange]);

    useEffect(() => {
        if (!isCountChange) return;

        let isMounted = true;
        Promise.allSettled([
            fetchSpinningCountChangeRfNos(),
            fetchSpinningCountChangeDropdown(),
        ]).then(([rfResult, countNameResult]) => {
            if (!isMounted) return;

            if (rfResult.status === "fulfilled") {
                const normalized = normalizeMachineOptions(rfResult.value);
                const fallbackOptions = COUNT_CHANGE_RF_NO_OPTIONS.map((value) => ({ value, label: value }));
                setCountChangeRfOptions(
                    Array.from(
                        new Map(
                            [...normalized, ...fallbackOptions].map((option) => [option.value, option])
                        ).values()
                    )
                );
            } else {
                setCountChangeRfOptions(COUNT_CHANGE_RF_NO_OPTIONS.map((value) => ({ value, label: value })));
            }

            if (countNameResult.status === "fulfilled") {
                const options = countNameResult.value?.countNameOptions || [];
                const fromOptions = countNameResult.value?.countNameFromOptions || [];
                const toOptions = countNameResult.value?.countNameToOptions || [];
                setCountChangeCountNameFromOptions(fromOptions.length ? fromOptions : options);
                setCountChangeCountNameToOptions(toOptions.length ? toOptions : options);
            } else {
                setCountChangeCountNameFromOptions([]);
                setCountChangeCountNameToOptions([]);
            }
        });

        return () => {
            isMounted = false;
        };
    }, [isCountChange]);

    useEffect(() => {
        if (!isRingFrame) return;

        let isMounted = true;
        Promise.allSettled([
            fetchEmployeeOptions({ module: "spinning" }),
            fetchSpinningRingFrameShifts(),
        ]).then(([checkerResult, shiftResult]) => {
            if (!isMounted) return;

            if (checkerResult.status === "fulfilled") {
                const options = normalizeEmployeeOptions({ data: checkerResult.value }).filter((option) => option.value);
                setRingFrameCheckerOptions(options);
            } else {
                setRingFrameCheckerOptions([]);
            }

            setRingFrameShiftOptions(SHIFT_OPTIONS);
        });

        return () => {
            isMounted = false;
        };
    }, [isRingFrame]);

    useEffect(() => {
        if (success) {
            reserveEntryId();
            setShowPreview(false);
            showSuccessOnce();
            clearFormValues();
            dispatch(resetSpinningState());
        }
        if (error) dispatch(resetSpinningState());
    }, [success, error, dispatch, clearFormValues]);

    const getTodayDate = () => new Date().toISOString().split("T")[0];
    const parseNumericInput = (value) => (value === "" ? null : Number.isNaN(Number.parseFloat(value)) ? null : Number.parseFloat(value));
    const parseDecimalPayloadValue = (value) => {
        const parsedValue = parseNumericInput(value);
        return parsedValue === null ? null : Number(parsedValue.toFixed(2));
    };
    const roundTo = (value, decimals) => Number(Number(value).toFixed(decimals));
    const sumDecimalValues = (...values) =>
        Number(values.reduce((total, value) => total + (parseNumericInput(value) ?? 0), 0).toFixed(2));
    const outOfCenterRf = Number(
        ringFrameRows.reduce(
            (rowTotal, row) =>
                rowTotal + RING_FRAME_TOTAL_FIELDS.reduce((fieldTotal, field) => fieldTotal + (parseNumericInput(row[field]) ?? 0), 0),
            0
        ).toFixed(2)
    );
    const guideRollTotal = Number(
        ringFrameRows.reduce((total, row) => total + (parseNumericInput(row.guide_roll_lapping) ?? 0), 0).toFixed(2)
    );
    const lycraMissingTotal = Number(
        ringFrameRows.reduce((total, row) => total + (parseNumericInput(row.lycra_missing) ?? 0), 0).toFixed(2)
    );
    const othersTotal = Number(
        ringFrameRows.reduce((total, row) => total + (parseNumericInput(row.others) ?? 0), 0).toFixed(2)
    );
    const totalCopsAc = sumDecimalValues(outOfCenterAc, faultCopsAc);
    const totalCopsRf = sumDecimalValues(outOfCenterRf, faultCopsRf);
    const totalCopsGrandTotal = sumDecimalValues(totalCopsAc, totalCopsRf);
    const hasTextValue = (value) => String(value ?? "").trim() !== "";
    const handleDecimalInputChange = (setter, field) => (event) => {
        setter(sanitizeNumericInput(event.target.value, DECIMAL_10_2_CONFIG));
        clearFieldError(field);
    };
    const handleCustomDecimalInputChange = (setter, field, config) => (event) => {
        setter(sanitizeNumericInput(event.target.value, config));
        clearFieldError(field);
    };
    const handleIntegerInputChange = (setter, field, maxDigits = null) => (event) => {
        setter(sanitizeIntegerInput(event.target.value, maxDigits));
        clearFieldError(field);
    };
    const handleCotsSideInputChange = (setter, field) => (event) => {
        setter(normalizeCotsSideValue(event.target.value));
        clearFieldError(field);
    };
    const clearFieldError = (field) => {
        setErrors((prev) => {
            if (!prev[field]) return prev;
            const next = { ...prev };
            delete next[field];
            return next;
        });
    };
    const clearRingFrameRowError = (machineNo, field) => {
        setErrors((prev) => {
            const rowErrors = prev.ringFrameRows?.[machineNo];
            if (!rowErrors?.[field]) return prev;
            const next = { ...prev };
            const nextRingFrameRows = { ...(next.ringFrameRows || {}) };
            const nextRow = { ...nextRingFrameRows[machineNo] };
            delete nextRow[field];
            if (Object.keys(nextRow).length) nextRingFrameRows[machineNo] = nextRow;
            else delete nextRingFrameRows[machineNo];
            if (Object.keys(nextRingFrameRows).length) next.ringFrameRows = nextRingFrameRows;
            else delete next.ringFrameRows;
            return next;
        });
    };
    const displaySpeedValue = parseNumericInput(displaySpeed);
    const spindleSpeedValue = parseNumericInput(spindleSpeed);
    const calculatedDifferenceValue = displaySpeedValue !== null && spindleSpeedValue !== null ? Number((displaySpeedValue - spindleSpeedValue).toFixed(2)) : null;
    const calculatedDifference = calculatedDifferenceValue !== null ? calculatedDifferenceValue.toFixed(2) : "";
    const isCountMode = countChangeMode === "Count";
    const isCspMode = countChangeMode === "CSP";
    const countChangeReadingValues = countChangeRows
        .map((row) => parseNumericInput(row.reading_value))
        .filter((value) => value !== null);
    const countModeReadingMean = countChangeReadingValues.length
        ? roundTo(countChangeReadingValues.reduce((total, value) => total + value, 0) / countChangeReadingValues.length, 5)
        : null;
    const countModeVariance = (() => {
        if (!countChangeReadingValues.length || countChangeReadingValues.length < 2 || countModeReadingMean === null) return null;
        const sumOfSquares = countChangeReadingValues.reduce((total, value) => {
            const deviation = roundTo(value - countModeReadingMean, 5);
            const square = roundTo(deviation * deviation, 8);
            return total + square;
        }, 0);
        return roundTo(sumOfSquares / (countChangeReadingValues.length - 1), 6);
    })();
    const countModeStandardDeviation = countModeVariance === null ? null : roundTo(Math.sqrt(countModeVariance), 5);
    const countModeCvPercent = countModeStandardDeviation === null || countModeReadingMean === null || countModeReadingMean === 0
        ? ""
        : roundTo((countModeStandardDeviation / countModeReadingMean) * 100, 3).toFixed(3);
    const getCalculatedCountValue = (readingValue) => {
        const numericReading = parseNumericInput(readingValue);
        if (numericReading === null || numericReading <= 0) return "";
        return roundTo(64.8 / numericReading, 2).toFixed(2);
    };
    const calculateCspValue = (strengthValue, countValue) => {
        const numericStrength = parseNumericInput(strengthValue);
        const numericCount = parseNumericInput(countValue);
        if (numericStrength === null || numericCount === null) return "";
        const cspValue = numericStrength * numericCount;
        return Number.isFinite(cspValue) ? roundTo(cspValue, 2).toFixed(2) : "";
    };
    const csvStrengthValues = countChangeRows
        .map((row) => parseNumericInput(row.strength))
        .filter((value) => value !== null);
    const csvMeanStrength = csvStrengthValues.length
        ? roundTo(csvStrengthValues.reduce((total, value) => total + value, 0) / csvStrengthValues.length, 5)
        : null;
    const csvStrengthVariance = (() => {
        if (!csvStrengthValues.length || csvStrengthValues.length < 2 || csvMeanStrength === null) return null;
        const sumOfSquares = csvStrengthValues.reduce((total, value) => {
            const deviation = roundTo(value - csvMeanStrength, 5);
            const square = roundTo(deviation * deviation, 8);
            return total + square;
        }, 0);
        return roundTo(sumOfSquares / (csvStrengthValues.length - 1), 6);
    })();
    const csvStrengthStandardDeviation = csvStrengthVariance === null ? null : roundTo(Math.sqrt(csvStrengthVariance), 5);
    const csvStrengthCvPercent = csvStrengthStandardDeviation === null || csvMeanStrength === null || csvMeanStrength === 0
        ? ""
        : roundTo((csvStrengthStandardDeviation / csvMeanStrength) * 100, 3).toFixed(3);
    const countModeDisplayedMean = countModeReadingMean === null ? "" : countModeReadingMean.toFixed(2);
    const csvModeDisplayedMean = csvMeanStrength === null ? "" : csvMeanStrength.toFixed(2);
    const overallAverageCsp = (() => {
        const cspValues = countChangeRows
            .map((row) => parseNumericInput(calculateCspValue(row.strength, getCalculatedCountValue(row.reading_value))))
            .filter((value) => value !== null);
        if (!cspValues.length) return "";
        const avg = cspValues.reduce((total, value) => total + value, 0) / cspValues.length;
        return roundTo(avg, 2).toFixed(2);
    })();
    const deriveCountChangeRow = (row = {}, rowIndex = 0) => {
        return {
            ...row,
            reading_no: row.reading_no || rowIndex + 1,
            reading_value: row.reading_value,
            count: getCalculatedCountValue(row.reading_value),
            cv_percent: countModeCvPercent,
            mean: csvModeDisplayedMean,
            strength: row.strength || "",
            cv_percent_2: csvStrengthCvPercent,
            csp: calculateCspValue(row.strength, getCalculatedCountValue(row.reading_value)),
        };
    };
    const displayedCountChangeRows = countChangeRows.map((row, rowIndex) => deriveCountChangeRow(row, rowIndex));
    const averageReadingValue = (() => {
        const values = displayedCountChangeRows
            .map((row) => parseNumericInput(row.reading_value))
            .filter((value) => value !== null);
        if (!values.length) return "";
        return roundTo(values.reduce((total, value) => total + value, 0) / values.length, 2).toFixed(2);
    })();
    const averageCountValue = (() => {
        const values = displayedCountChangeRows
            .map((row) => parseNumericInput(row.count))
            .filter((value) => value !== null);
        if (!values.length) return "";
        return roundTo(values.reduce((total, value) => total + value, 0) / values.length, 2).toFixed(2);
    })();
        const averageStrengthValue = (() => {
            const values = displayedCountChangeRows
                .map((row) => parseNumericInput(row.strength))
                .filter((value) => value !== null);
            if (!values.length) return "";
            return roundTo(values.reduce((total, value) => total + value, 0) / values.length, 2).toFixed(2);
        })();
    const renderCountChangeCell = (value, fallback = "-") => {
        const text = String(value ?? "").trim();
        return text ? text : fallback;
    };

    const handleTypeChange = (eventOrValue) => {
        const selectedType =
            typeof eventOrValue === "string"
                ? eventOrValue
                : eventOrValue?.target?.value || "";
        setCheckingType(selectedType);
        clearFieldError("checkingType");
        if (selectedType) {
            setDate(getTodayDate());
        } else {
            setDate("");
        }
    };

    const handleClearForm = () => {
        if (isProcessParameter || isWheelChange) {
            childRef.current?.clear?.();
            setErrors({});
            setValidationMessage("");
            return;
        }
        clearFormValues();
        setCheckingType("");
        setSelectedMachine("");
        setDate("");
        setDisplaySpeed("");
        setSpindleSpeed("");
        setCountChangeMode("");
        setRfNo("");
        setLycraDraft("");
        setCountNameFrom("");
        setCountNameTo("");
        setCountReadingCount("");
        setCountChangeRows([]);
        setCheckerName("");
        setShift("");
        setRingFrameRows(createRingFrameRows());
        setOutOfCenterAc("");
        setComments("");
        setFaultCopsAc("");
        setFaultCopsRf("");
        setLhsValue("");
        setLhsRemarks("");
        setRhsValue("");
        setRhsRemarks("");
        setErrors({});
        setValidationMessage("");
        router.push("/spinning", undefined, { shallow: true });
    };

    const validate = () => {
        const nextErrors = {};
        const missingFields = [];

        if (!checkingType) {
            nextErrors.checkingType = true;
            missingFields.push("Checking Type");
        }
        if (!date) {
            nextErrors.date = true;
            missingFields.push("Date");
        }
        if (isCountChange) {
            if (!rfNo.trim()) {
                nextErrors.rfNo = true;
                missingFields.push("RF No.");
            }
            if (!lycraDraft.trim()) {
                nextErrors.lycraDraft = true;
                missingFields.push("Lycra Draft");
            }
            if (!countNameFrom.trim()) {
                nextErrors.countNameFrom = true;
                missingFields.push("Count Name (From)");
            }
            if (!countNameTo.trim()) {
                nextErrors.countNameTo = true;
                missingFields.push("Count Name (To)");
            }
            if (!countReadingCount.trim() || Number(countReadingCount) <= 0) {
                nextErrors.countReadingCount = true;
                missingFields.push("No. of Readings");
            }
            if (!countChangeMode) {
                nextErrors.countChangeMode = true;
                missingFields.push("Count Change Type");
            }
        } else if (isRingFrame) {
            if (!checkerName.trim()) {
                nextErrors.checkerName = true;
                missingFields.push("Checker Name");
            }
            if (!shift.trim()) {
                nextErrors.shift = true;
                missingFields.push("Shift");
            }
            if (!outOfCenterAc.trim()) {
                nextErrors.outOfCenterAc = true;
                missingFields.push("Out of Center AC");
            }
            if (!comments.trim()) {
                nextErrors.comments = true;
                missingFields.push("Comments");
            }
            if (!faultCopsAc.trim()) {
                nextErrors.faultCopsAc = true;
                missingFields.push("Fault Cops AC");
            }
            if (!faultCopsRf.trim()) {
                nextErrors.faultCopsRf = true;
                missingFields.push("Fault Cops RF");
            }

            const ringFrameRowErrors = {};
            ringFrameRows.forEach((row, index) => {
                const rowErrors = {};
                if (!hasTextValue(row.machine_no)) rowErrors.machine_no = true;
                if (!hasTextValue(row.lycra)) rowErrors.lycra = true;
                if (!hasTextValue(row.bobbin_color)) rowErrors.bobbin_color = true;
                if (!hasTextValue(row.position_1)) rowErrors.position_1 = true;
                if (!hasTextValue(row.position_2)) rowErrors.position_2 = true;
                if (!hasTextValue(row.position_3)) rowErrors.position_3 = true;
                if (!hasTextValue(row.position_4)) rowErrors.position_4 = true;
                if (!hasTextValue(row.position_5)) rowErrors.position_5 = true;
                if (!hasTextValue(row.position_6)) rowErrors.position_6 = true;
                if (!hasTextValue(row.guide_roll_lapping)) rowErrors.guide_roll_lapping = true;
                if (!hasTextValue(row.lycra_missing)) rowErrors.lycra_missing = true;
                if (!hasTextValue(row.others)) rowErrors.others = true;
                if (Object.keys(rowErrors).length > 0) ringFrameRowErrors[index] = rowErrors;
            });

            if (Object.keys(ringFrameRowErrors).length > 0) nextErrors.ringFrameRows = ringFrameRowErrors;
        } else {
            if (!selectedMachine) {
                nextErrors.selectedMachine = true;
                missingFields.push(machineFieldLabel);
            }
            if (!lhsValue.trim()) {
                nextErrors.lhsValue = true;
                missingFields.push("Spindle Number Value");
            }
            if (!rhsValue.trim()) {
                nextErrors.rhsValue = true;
                missingFields.push("Spindle Number Value");
            }
            if (isCotsChecking) {
                const lhsNumber = Number(lhsValue);
                const rhsNumber = Number(rhsValue);
                if (!Number.isInteger(lhsNumber) || lhsNumber < 0 || lhsNumber > COTS_SIDE_MAX) {
                    nextErrors.lhsValue = true;
                }
                if (!Number.isInteger(rhsNumber) || rhsNumber < 0 || rhsNumber > COTS_SIDE_MAX) {
                    nextErrors.rhsValue = true;
                }
            }
        }
        if (checkingType === "Speed Checking") {
            if (displaySpeedValue === null) {
                nextErrors.displaySpeed = true;
                missingFields.push("Display Speed");
            }
            if (spindleSpeedValue === null) {
                nextErrors.spindleSpeed = true;
                missingFields.push("Spindle Speed");
            }
        }
        setErrors(nextErrors);

        if (missingFields.length > 0) {
            setValidationMessage(`Please fill required fields: ${missingFields.slice(0, 4).join(", ")}${missingFields.length > 4 ? ", ..." : ""}`);
            return false;
        }

        setValidationMessage("");
        return true;
    };

    const buildPayload = () => {
        if (isCountChange) {
            return {
                entry_id: entryId,
                type: checkingType,
                entry_date: date || getTodayDate(),
                rf_no: rfNo,
                lycra_draft: parseDecimalPayloadValue(lycraDraft) ?? 0,
                count_name_from: countNameFrom,
                count_name_to: countNameTo,
                readings: displayedCountChangeRows.map((row, index) => ({
                    reading_no: row.reading_no || index + 1,
                    reading_value: parseDecimalPayloadValue(row.reading_value) ?? 0,
                    count: parseDecimalPayloadValue(row.count) ?? 0,
                    cv_percent: parseDecimalPayloadValue(row.cv_percent) ?? 0,
                    strength: parseDecimalPayloadValue(row.strength) ?? 0,
                    mean: parseDecimalPayloadValue(row.mean) ?? 0,
                    cv_percent_2: parseDecimalPayloadValue(row.cv_percent_2) ?? 0,
                    csp: parseDecimalPayloadValue(row.csp) ?? 0,
                })),
            };
        }
        if (isRingFrame) {
            return {
                entry_id: entryId,
                inspection_type: "Ring Frame",
                entry_date: date || getTodayDate(),
                checker_name: checkerName.trim(),
                shift,
                rows: ringFrameRows.map((row) => ({
                    mc_no: String(row.machine_no ?? "").trim(),
                    lycra: String(row.lycra ?? "").trim(),
                    bobbin_color: String(row.bobbin_color ?? "").trim(),
                    spindle_1: String(row.position_1 ?? "").trim(),
                    spindle_2: String(row.position_2 ?? "").trim(),
                    spindle_3: String(row.position_3 ?? "").trim(),
                    spindle_4: String(row.position_4 ?? "").trim(),
                    spindle_5: String(row.position_5 ?? "").trim(),
                    spindle_6: String(row.position_6 ?? "").trim(),
                    guide_roll_lapping: String(row.guide_roll_lapping ?? "").trim(),
                    lycra_missing: String(row.lycra_missing ?? "").trim(),
                    others: String(row.others ?? "").trim(),
                    total: String(getRingFrameRowTotal(row)),
                })),
                summary: {
                    out_of_center_ac: parseDecimalPayloadValue(outOfCenterAc) ?? 0,
                    out_of_center_rf: parseDecimalPayloadValue(outOfCenterRf) ?? 0,
                    out_of_center: sumDecimalValues(outOfCenterAc, outOfCenterRf),
                    fault_cops_ac: parseDecimalPayloadValue(faultCopsAc) ?? 0,
                    fault_cops_rf: parseDecimalPayloadValue(faultCopsRf) ?? 0,
                    fault_cops: sumDecimalValues(faultCopsAc, faultCopsRf),
                    total_cops_ac: totalCopsAc,
                    total_cops_rf: totalCopsRf,
                    total_cops: totalCopsGrandTotal,
                    comments: comments.trim(),
                },
            };
        }
        if (isWheelChange) {
            return childRef.current?.getPayload?.() || {};
        }
        const machineNo = Number.parseInt(String(selectedMachine).replace(/\D/g, ""), 10) || 0;
        const payload = {
            entry_id: entryId,
            inspectiondate: new Date(date || getTodayDate()).toISOString(),
            machineno: machineNo,
            machine_no: isCotsChecking ? selectedMachine : undefined,
            lhs_value: isCotsChecking ? Number(lhsValue) : parseDecimalPayloadValue(lhsValue) ?? 0,
            rhs_value: isCotsChecking ? Number(rhsValue) : parseDecimalPayloadValue(rhsValue) ?? 0,
            lhs_textremarks: lhsRemarks.trim(),
            rhs_textremarks: rhsRemarks.trim(),
            lhs_audio: "",
            rhs_audio: "",
            checking_type: checkingType,
        };
        if (checkingType === "Speed Checking") {
            payload.display_speed = parseDecimalPayloadValue(displaySpeed);
            payload.spindle_speed = parseDecimalPayloadValue(spindleSpeed);
            payload.difference = calculatedDifferenceValue === null ? null : Number(calculatedDifferenceValue.toFixed(2));
            payload.displaySpeed = parseDecimalPayloadValue(displaySpeed);
            payload.spindleSpeed = parseDecimalPayloadValue(spindleSpeed);
        }
        return payload;
    };

    const confirmSubmit = async () => {
        if (isProcessParameter) {
            setShowPreview(false);
            const ok = await childRef.current?.submit?.();
            if (ok === false) return;
            await recordSubmittedNotebook({
                department: "Quality Control",
                subDepartment: "Spinning",
                notebookName: checkingType,
                entryId,
                childRef,
                previewItems,
                user,
            });
            return;
        }
        const payload = buildPayload();
        setShowPreview(false);
        const result = await dispatch(submitSpinningRecord({ type: checkingType, payload }));
        if (submitSpinningRecord.fulfilled.match(result)) {
            await recordSubmittedNotebook({
                department: "Quality Control",
                subDepartment: "Spinning",
                notebookName: checkingType,
                entryId,
                previewItems,
                user,
                extra: {
                    submitted_fields: payload,
                },
            });
        }
    };

    const handleGenerateCountChangeRows = () => {
        const nextCount = Math.max(1, Number.parseInt(countReadingCount, 10) || 1);
        setCountReadingCount(String(nextCount));
        setCountChangeRows(createCountChangeRows(nextCount));
        setErrors((prev) => ({ ...prev, countReadingCount: false }));
    };

    const handleCountChangeRowChange = (rowIndex, field, value) => {
        const nextCountValue =
            field === "reading_value"
                ? (() => {
                    const numericReading = Number.parseFloat(value);
                    if (!Number.isFinite(numericReading) || numericReading <= 0) return "";
                    const calculatedCount = 64.8 / numericReading;
                    return Number.isFinite(calculatedCount) ? calculatedCount.toFixed(2) : "";
                })()
                : null;
        setCountChangeRows((currentRows) =>
            currentRows.map((row, index) =>
                index === rowIndex
                    ? {
                        ...row,
                        [field]: value,
                        ...(nextCountValue !== null ? { count: nextCountValue } : {}),
                    }
                    : row
            )
        );
    };

    const handleCountChangeRowFocus = (rowIndex) => {
        setCountChangeEditingRow(rowIndex);
    };

    const handleCountChangeRowBlur = () => {
        setCountChangeEditingRow(null);
    };

    const handleRingFrameChange = (rowIndex, field, value) => {
        setRingFrameRows((currentRows) =>
            currentRows.map((row, index) =>
                index === rowIndex
                    ? {
                        ...row,
                        [field]: value,
                    }
                    : row
            )
        );
        clearRingFrameRowError(rowIndex, field);
    };
    const handleRingFrameTextChange = (rowIndex, field) => (event) => {
        handleRingFrameChange(rowIndex, field, event.target.value);
    };
    const handleRingFrameMachineNoChange = (rowIndex) => (event) => {
        handleRingFrameChange(rowIndex, "machine_no", sanitizeIntegerInput(event.target.value).slice(0, 2));
    };

    const getRingFrameRowTotal = (row) => {
        return RING_FRAME_TOTAL_FIELDS.reduce((total, field) => total + (parseNumericInput(row[field]) ?? 0), 0);
    };

    const handleSaveRecord = () => {
        if (isProcessParameter || isWheelChange) {
            const childValid = childRef.current?.validate ? childRef.current.validate() : true;
            if (childValid === false) {
                setValidationMessage("Please fill all required fields before saving.");
                return;
            }

            setValidationMessage("");
            setPreviewItems(childRef.current?.getPreviewData?.() || []);
            setShowPreview(true);
            return;
        }

        if (!validate()) {
            return;
        }
        setValidationMessage("");

        const headerItems = isCountChange
            ? [
                { label: "Checking Type", value: checkingType || "-" },
                { label: "Entry ID", value: entryId },
                { label: "RF No.", value: rfNo || "-" },
                { label: "Lycra Draft", value: lycraDraft || "-" },
            ]
            : [
                { label: "Checking Type", value: checkingType || "-" },
                { label: "Entry ID", value: entryId },
                { label: machineFieldLabel, value: selectedMachine || "-" },
            ];
        const bodyItems = isCountChange
            ? [
                { label: "Count Change Type", value: countChangeMode || "-" },
                { label: "Count Name (From)", value: countNameFrom || "-" },
                { label: "Count Name (To)", value: countNameTo || "-" },
                { label: "No. of Readings", value: countReadingCount || "-" },
                { label: "Generated Rows", value: countChangeRows.length },
            ]
            : isRingFrame
                ? [
                    { label: "Shift", value: shift || "-" },
                    { label: "Checker Name", value: checkerName || "-" },
                    { label: "Rows", value: ringFrameRows.length },
                    { label: "Out of Center AC", value: outOfCenterAc || "-" },
                    { label: "Out of Center RF", value: outOfCenterRf || "-" },
                    { label: "Fault Cops AC", value: faultCopsAc || "-" },
                    { label: "Fault Cops RF", value: faultCopsRf || "-" },
                    { label: "Guide Roll", value: String(guideRollTotal) },
                    { label: "Lycra Missing", value: String(lycraMissingTotal) },
                    { label: "Others", value: String(othersTotal) },
                    { label: "Total Cops AC", value: String(totalCopsAc) },
                    { label: "Total Cops RF", value: String(totalCopsRf) },
                    { label: "Grand Total", value: String(totalCopsGrandTotal) },
                    { label: "Comments", value: comments || "-" },
                    ...ringFrameRows.flatMap((row) => ([
                        { label: `MC ${row.machine_no} - Lycra`, value: String(row.lycra ?? "") || "-" },
                        { label: `MC ${row.machine_no} - Bobbin Color`, value: String(row.bobbin_color ?? "") || "-" },
                        { label: `MC ${row.machine_no} - 1`, value: String(row.position_1 ?? "") || "-" },
                        { label: `MC ${row.machine_no} - 2`, value: String(row.position_2 ?? "") || "-" },
                        { label: `MC ${row.machine_no} - 3`, value: String(row.position_3 ?? "") || "-" },
                        { label: `MC ${row.machine_no} - 4`, value: String(row.position_4 ?? "") || "-" },
                        { label: `MC ${row.machine_no} - 5`, value: String(row.position_5 ?? "") || "-" },
                        { label: `MC ${row.machine_no} - 6`, value: String(row.position_6 ?? "") || "-" },
                        { label: `MC ${row.machine_no} - Guide Roll Lapping`, value: String(row.guide_roll_lapping ?? "") || "-" },
                        { label: `MC ${row.machine_no} - Others`, value: String(row.others ?? "") || "-" },
                        { label: `MC ${row.machine_no} - Total`, value: String(getRingFrameRowTotal(row)) || "0" },
                    ]))
                ]
            : [
                { label: "Spindle Number Value", value: lhsValue || "-" },
                { label: "Spindle Number Value", value: rhsValue || "-" },
                { label: "Spindle Number Remarks", value: lhsRemarks || "-" },
                { label: "Spindle Number Remarks", value: rhsRemarks || "-" },
            ];

        if (checkingType === "Speed Checking") {
            bodyItems.push(
                { label: "Display Speed", value: displaySpeed || "-" },
                { label: "Spindle Speed", value: spindleSpeed || "-" },
                { label: "Difference", value: calculatedDifference || "-" }
            );
        }

        setPreviewItems([...headerItems, ...bodyItems]);
        setShowPreview(true);
    };

    return (
        <div className={styles["sp-page"]}>
            <div className={styles["mobile-navbar"]}>
                <div className={styles.hamburger}>☰</div>
                <img src="/logo.png" alt="logo" className={styles["mobile-logo"]} />
            </div>

            <div className={styles.container}>
                <h1 className={styles["sp-page-title"]}>Quality Control - Spinning Notebook</h1>
                <div className="mt-2 text-right text-base font-semibold text-slate-600">Current Date: {currentDateLabel}</div>

                <div className={styles["sp-card"]}>
                    {(isProcessParameter || isWheelChange) && SelectedComponent ? (
                        <SelectedComponent
                            ref={childRef}
                            selectedTypeName={checkingType}
                            typeOptions={checkingOptions}
                            entryId={entryId}
                            onTypeChange={(value) => handleTypeChange({ target: { value } })}
                            onSubmitSuccess={showSuccessOnce}
                            standaloneSection={isProcessParameter}
                            savedVersionsTargetId={isProcessParameter ? "spinning-process-parameter-saved-versions" : ""}
                        />
                    ) : (
                        <>
                    <div className={styles["title-row"]}>
                        <InspectionEntryIcon />
                        <h3 className={styles.sectiontitle}>Inspection Data Entry</h3>
                        <InputScreenUploadButton className="ml-auto" />
                    </div>

                    <div className={styles["sp-form"]}>
                        {isCountChange ? (
                            <>
                                <div className={styles.row}>
                                    <div className={styles["sp-form-group"]}>
                                        <label>Type</label>
                                        <select className={`${styles["highlight-input"]} ${errors.checkingType ? styles["input-error"] : ""}`} value={checkingType} onChange={handleTypeChange}>
                                            <option value="">Select checking type</option>
                                            {checkingOptions.map((item) => <option key={item.id} value={item.name}>{item.displayName ?? item.name}</option>)}
                                        </select>
                                    </div>
                                    <div className={styles["sp-form-group"]}>
                                        <label>Entry ID</label>
                                        <input type="text" className={styles["highlight-input"]} value={entryId} readOnly disabled />
                                    </div>
                                    <div className={styles["sp-form-group"]}>
                                        <label>RF No.</label>
                                        <SearchableSelect
                                            className={`${styles["highlight-input"]} ${errors.rfNo ? styles["input-error"] : ""}`}
                                            value={rfNo}
                                            onChange={(value) => {
                                                setRfNo(value);
                                                clearFieldError("rfNo");
                                            }}
                                            options={countChangeRfSelectOptions}
                                            placeholder="Select RF No."
                                            ariaLabel="RF No."
                                        />
                                    </div>
                                </div>

                                <div className={styles.row}>
                                    <div className={styles["sp-form-group"]}>
                                        <label>Lycra Draft</label>
                                        <input type="text" inputMode="decimal" placeholder="Enter lycra draft" className={`${styles["highlight-input"]} ${errors.lycraDraft ? styles["input-error"] : ""}`} value={lycraDraft} onChange={handleCustomDecimalInputChange(setLycraDraft, "lycraDraft", DECIMAL_5_2_CONFIG)} />
                                    </div>
                                    <div className={styles["sp-form-group"]}>
                                        <label className={styles.countTypeSpacer}>&nbsp;</label>
                                        <div className={`${styles.segmentedControl} ${styles.countChangeSegmented} ${errors.countChangeMode ? styles["segmented-error"] : ""}`} role="group" aria-label="Count change type">
                                            {["Count", "CSP"].map((mode) => (
                                                <button key={mode} type="button" className={`${styles.segmentButton} ${countChangeMode === mode ? styles.segmentButtonActive : ""}`} onClick={() => { setCountChangeMode(mode); clearFieldError("countChangeMode"); }}>
                                                    {mode}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                <div className={styles.row}>
                                    <div className={styles["sp-form-group"]}>
                                        <label>Count Name (From)</label>
                                        <SearchableSelect
                                            className={`${styles["highlight-input"]} ${errors.countNameFrom ? styles["input-error"] : ""}`}
                                            value={countNameFrom}
                                            onChange={(value) => {
                                                setCountNameFrom(value);
                                                clearFieldError("countNameFrom");
                                            }}
                                            options={countChangeCountNameFromSelectOptions}
                                            placeholder="Select count name"
                                            ariaLabel="Count Name From"
                                        />
                                    </div>
                                    <div className={styles["sp-form-group"]}>
                                        <label>Count Name (To)</label>
                                        <SearchableSelect
                                            className={`${styles["highlight-input"]} ${errors.countNameTo ? styles["input-error"] : ""}`}
                                            value={countNameTo}
                                            onChange={(value) => {
                                                setCountNameTo(value);
                                                clearFieldError("countNameTo");
                                            }}
                                            options={countChangeCountNameToSelectOptions}
                                            placeholder="Select count name"
                                            ariaLabel="Count Name To"
                                        />
                                    </div>
                                </div>

                                <div className={styles.countChangeActionsRow}>
                                    <div className={styles.countReadingGroup}>
                                        <label>No. of Readings</label>
                                        <div className={styles.countReadingControls}>
                                            <input type="text" inputMode="numeric" placeholder="Enter readings count" className={`${styles["highlight-input"]} ${errors.countReadingCount ? styles["input-error"] : ""}`} value={countReadingCount} onChange={handleIntegerInputChange(setCountReadingCount, "countReadingCount")} />
                                            <button type="button" className={styles.generateButton} onClick={handleGenerateCountChangeRows}>Generate</button>
                                        </div>
                                    </div>
                                </div>

                                <div className={styles.countChangeTableWrap}>
                                    <table className={styles.countChangeTable}>
                                        <thead>
                                            <tr>
                                                <th>READING NO.</th>
                                                <th>READINGS</th>
                                                <th>COUNT</th>
                                                <th>STRENGTH</th>
                                                <th>CSP</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {displayedCountChangeRows.length > 0 ? displayedCountChangeRows.map((row, rowIndex) => (
                                                <tr key={row.reading_no}>
                                                    <td className={styles.countChangeReadingNoCell}>{row.reading_no}</td>
                                                    <td>
                                                        {isCountMode ? (
                                                            countChangeEditingRow === rowIndex || !row.reading_value ? (
                                                                <input
                                                                    type="text"
                                                                    inputMode="decimal"
                                                                    value={String(row.reading_value ?? "")}
                                                                    onFocus={() => handleCountChangeRowFocus(rowIndex)}
                                                                    onBlur={handleCountChangeRowBlur}
                                                                    onChange={(event) => handleCountChangeRowChange(rowIndex, "reading_value", event.target.value)}
                                                                    className={styles.countChangeInput}
                                                                />
                                                            ) : (
                                                                <span className={styles.countChangeCellText}>{String(row.reading_value ?? "")}</span>
                                                            )
                                                        ) : (
                                                            <span className={styles.countChangeCellText}>{renderCountChangeCell(row.reading_value, "")}</span>
                                                        )}
                                                    </td>
                                                    <td>
                                                        <span className={styles.countChangeCellText}>{renderCountChangeCell(row.count, "")}</span>
                                                    </td>
                                                    <td>
                                                        {isCspMode ? (
                                                            <input
                                                                type="text"
                                                                inputMode="decimal"
                                                                value={String(row.strength ?? "")}
                                                                onChange={(event) => handleCountChangeRowChange(rowIndex, "strength", event.target.value)}
                                                                className={styles.countChangeInput}
                                                            />
                                                        ) : (
                                                            <span className={styles.countChangeCellText}>{renderCountChangeCell(row.strength, "")}</span>
                                                        )}
                                                    </td>
                                                    <td>
                                                        <span className={styles.countChangeCellText}>{renderCountChangeCell(row.csp, "")}</span>
                                                    </td>
                                                </tr>
                                            )) : null}
                                        </tbody>
                                        {countChangeRows.length > 0 ? (
                                            <tfoot>
                                                <tr className={styles.countChangeFooterRow}>
                                                    <td></td>
                                                    <td className={styles.countChangeFooterCell}>
                                                        <div className={styles.countChangeFooterLabel}>Avg</div>
                                                        <div className={styles.countChangeFooterValue}>{averageReadingValue || "-"}</div>
                                                    </td>
                                                    <td className={styles.countChangeFooterCell}>
                                                        <div className={styles.countChangeFooterLabel}>Avg</div>
                                                        <div className={styles.countChangeFooterValue}>{averageCountValue || "-"}</div>
                                                    </td>
                                                    <td className={styles.countChangeFooterCell}>
                                                        <div className={styles.countChangeFooterLabel}>Avg</div>
                                                        <div className={styles.countChangeFooterValue}>{averageStrengthValue || "-"}</div>
                                                    </td>
                                                    <td className={styles.countChangeFooterCell}>
                                                        <div className={styles.countChangeFooterLabel}>Overall CSP</div>
                                                        <div className={styles.countChangeFooterValue}>{overallAverageCsp || "-"}</div>
                                                    </td>
                                                </tr>

                                                <tr className={styles.countChangeFooterRow}>
                                                    <td></td>
                                                    <td></td>
                                                    <td className={styles.countChangeFooterCell}>
                                                        <div className={styles.countChangeFooterLabel}>CV%</div>
                                                        <div className={styles.countChangeFooterValue}>{countModeCvPercent || "-"}</div>
                                                    </td>
                                                    <td className={styles.countChangeFooterCell}>
                                                        <div className={styles.countChangeFooterLabel}>CV%</div>
                                                        <div className={styles.countChangeFooterValue}>{csvStrengthCvPercent || "-"}</div>
                                                    </td>
                                                    <td></td>
                                                </tr>
                                            </tfoot>
                                        ) : null}
                                    </table>
                                </div>
                            </>
                        ) : isRingFrame ? (
                            <>
                                <div className={styles.row}>
                                    <div className={styles["sp-form-group"]}>
                                        <label>Type</label>
                                        <select className={`${styles["highlight-input"]} ${errors.checkingType ? styles["input-error"] : ""}`} value={checkingType} onChange={handleTypeChange}>
                                            <option value="">Select checking type</option>
                                            {checkingOptions.map((item) => <option key={item.id} value={item.name}>{item.displayName ?? item.name}</option>)}
                                        </select>
                                    </div>
                                    <div className={styles["sp-form-group"]}>
                                        <label>Entry ID</label>
                                        <input type="text" className={styles["highlight-input"]} value={entryId} readOnly disabled />
                                    </div>
                                    <div className={styles["sp-form-group"]}>
                                        <label>Shift</label>
                                        <SearchableSelect
                                            className={`${styles["highlight-input"]} ${errors.shift ? styles["input-error"] : ""}`}
                                            value={shift}
                                            onChange={(value) => {
                                                setShift(value);
                                                clearFieldError("shift");
                                            }}
                                            options={ringFrameShiftSelectOptions}
                                            placeholder="Select Shift"
                                            ariaLabel="Shift"
                                        />
                                    </div>
                                    <div className={styles["sp-form-group"]}>
                                        <label>Checker Name</label>
                                        <SearchableSelect
                                            className={`${styles["highlight-input"]} ${errors.checkerName ? styles["input-error"] : ""}`}
                                            value={checkerName}
                                            onChange={(value) => {
                                                setCheckerName(value);
                                                clearFieldError("checkerName");
                                            }}
                                            options={ringFrameCheckerSelectOptions}
                                            placeholder="Select Checker Name"
                                            ariaLabel="Checker Name"
                                        />
                                    </div>
                                </div>

                                <div className={styles.ringFrameTableWrap}>
                                    <table className={styles.ringFrameTable}>
                                        <thead>
                                            <tr>
                                                <th>Mc.No</th>
                                                <th>Lycra</th>
                                                <th>Bobbin</th>
                                                <th>1</th>
                                                <th>2</th>
                                                <th>3</th>
                                                <th>4</th>
                        <th>5</th>
                        <th>6</th>
                        <th>Guide Roll Lapping</th>
                        <th>Lycra Missing</th>
                        <th>Others</th>
                        <th>Total</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {ringFrameRows.map((row, rowIndex) => (
                                                <tr key={rowIndex}>
                                                    <td className={styles.ringFrameMachineCell}>
                                                        <input
                                                            type="text"
                                                            inputMode="numeric"
                                                            maxLength={2}
                                                            value={String(row.machine_no ?? "")}
                                                            onChange={handleRingFrameMachineNoChange(rowIndex)}
                                                            className={`${styles.ringFrameInput} ${styles.ringFrameMachineInput} ${errors.ringFrameRows?.[rowIndex]?.machine_no ? styles["input-error"] : ""}`}
                                                        />
                                                    </td>
                                                    <td><input type="text" placeholder="Enter" value={String(row.lycra ?? "")} onChange={handleRingFrameTextChange(rowIndex, "lycra")} className={`${styles.ringFrameInputWide} ${errors.ringFrameRows?.[rowIndex]?.lycra ? styles["input-error"] : ""}`} /></td>
                                                    <td>
                                                        <div className={`${styles.ringFrameToggle} ${errors.ringFrameRows?.[rowIndex]?.bobbin_color ? styles["input-error"] : ""}`}>
                                                            {["Yes", "No"].map((option) => (
                                                                <button
                                                                    key={option}
                                                                    type="button"
                                                                    className={row.bobbin_color === option ? styles.ringFrameToggleActive : ""}
                                                                    onClick={() => handleRingFrameChange(rowIndex, "bobbin_color", option)}
                                                                >
                                                                    {option}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </td>
                                                    <td><input type="text" placeholder="Enter" value={String(row.position_1 ?? "")} onChange={handleRingFrameTextChange(rowIndex, "position_1")} className={`${styles.ringFrameInput} ${errors.ringFrameRows?.[rowIndex]?.position_1 ? styles["input-error"] : ""}`} /></td>
                                                    <td><input type="text" placeholder="Enter" value={String(row.position_2 ?? "")} onChange={handleRingFrameTextChange(rowIndex, "position_2")} className={`${styles.ringFrameInput} ${errors.ringFrameRows?.[rowIndex]?.position_2 ? styles["input-error"] : ""}`} /></td>
                                                    <td><input type="text" placeholder="Enter" value={String(row.position_3 ?? "")} onChange={handleRingFrameTextChange(rowIndex, "position_3")} className={`${styles.ringFrameInput} ${errors.ringFrameRows?.[rowIndex]?.position_3 ? styles["input-error"] : ""}`} /></td>
                                                    <td><input type="text" placeholder="Enter" value={String(row.position_4 ?? "")} onChange={handleRingFrameTextChange(rowIndex, "position_4")} className={`${styles.ringFrameInput} ${errors.ringFrameRows?.[rowIndex]?.position_4 ? styles["input-error"] : ""}`} /></td>
                                                    <td><input type="text" placeholder="Enter" value={String(row.position_5 ?? "")} onChange={handleRingFrameTextChange(rowIndex, "position_5")} className={`${styles.ringFrameInput} ${errors.ringFrameRows?.[rowIndex]?.position_5 ? styles["input-error"] : ""}`} /></td>
                                                    <td><input type="text" placeholder="Enter" value={String(row.position_6 ?? "")} onChange={handleRingFrameTextChange(rowIndex, "position_6")} className={`${styles.ringFrameInput} ${errors.ringFrameRows?.[rowIndex]?.position_6 ? styles["input-error"] : ""}`} /></td>
                                                    <td><input type="text" placeholder="Enter" value={String(row.guide_roll_lapping ?? "")} onChange={handleRingFrameTextChange(rowIndex, "guide_roll_lapping")} className={`${styles.ringFrameInputWide} ${errors.ringFrameRows?.[rowIndex]?.guide_roll_lapping ? styles["input-error"] : ""}`} /></td>
                                                    <td><input type="text" placeholder="Enter" value={String(row.lycra_missing ?? "")} onChange={handleRingFrameTextChange(rowIndex, "lycra_missing")} className={`${styles.ringFrameInputWide} ${errors.ringFrameRows?.[rowIndex]?.lycra_missing ? styles["input-error"] : ""}`} /></td>
                                                    <td><input type="text" placeholder="Enter" value={String(row.others ?? "")} onChange={handleRingFrameTextChange(rowIndex, "others")} className={`${styles.ringFrameInputWide} ${errors.ringFrameRows?.[rowIndex]?.others ? styles["input-error"] : ""}`} /></td>
                                                    <td><input type="text" value={String(getRingFrameRowTotal(row))} readOnly className={styles.ringFrameInputWide} /></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                <div className={styles.ringFrameSummaryBox}>
                                    <div className={styles.ringFrameSummaryGrid}>
                                        <div className={styles["sp-form-group"]}>
                                            <label>Out of Center AC</label>
                                            <input type="text" inputMode="decimal" placeholder="Enter" value={outOfCenterAc} onChange={handleDecimalInputChange(setOutOfCenterAc, "outOfCenterAc")} className={`${styles["highlight-input"]} ${errors.outOfCenterAc ? styles["input-error"] : ""}`} />
                                        </div>
                                        <div className={styles["sp-form-group"]}>
                                            <label>Out of Center RF</label>
                                            <input type="text" value={String(outOfCenterRf)} readOnly className={styles["highlight-input"]} />
                                        </div>
                                        <div className={styles["sp-form-group"]}>
                                            <label>Fault Cops AC</label>
                                            <input type="text" inputMode="decimal" placeholder="Enter" value={faultCopsAc} onChange={handleDecimalInputChange(setFaultCopsAc, "faultCopsAc")} className={`${styles["highlight-input"]} ${errors.faultCopsAc ? styles["input-error"] : ""}`} />
                                        </div>
                                        <div className={styles["sp-form-group"]}>
                                            <label>Fault Cops RF</label>
                                            <input type="text" inputMode="decimal" placeholder="Enter" value={faultCopsRf} onChange={handleDecimalInputChange(setFaultCopsRf, "faultCopsRf")} className={`${styles["highlight-input"]} ${errors.faultCopsRf ? styles["input-error"] : ""}`} />
                                        </div>
                                        <div className={styles["sp-form-group"]}>
                                            <label>Total Cops AC</label>
                                            <input type="text" value={String(totalCopsAc)} readOnly className={styles["highlight-input"]} />
                                        </div>
                                        <div className={styles["sp-form-group"]}>
                                            <label>Total Cops RF</label>
                                            <input type="text" value={String(totalCopsRf)} readOnly className={styles["highlight-input"]} />
                                        </div>
                                        <div className={styles["sp-form-group"]}>
                                            <label>Grand Total</label>
                                            <input type="text" value={String(totalCopsGrandTotal)} readOnly className={styles["highlight-input"]} />
                                        </div>
                                        <div className={`${styles.ringFrameExtraSummaryGrid} ${styles.ringFrameSummaryFull}`}>
                                            <div className={styles["sp-form-group"]}>
                                                <label>Guide Roll</label>
                                                <input type="text" value={String(guideRollTotal)} readOnly className={styles["highlight-input"]} />
                                            </div>
                                            <div className={styles["sp-form-group"]}>
                                                <label>Lycra Missing</label>
                                                <input type="text" value={String(lycraMissingTotal)} readOnly className={styles["highlight-input"]} />
                                            </div>
                                            <div className={styles["sp-form-group"]}>
                                                <label>Others</label>
                                                <input type="text" value={String(othersTotal)} readOnly className={styles["highlight-input"]} />
                                            </div>
                                        </div>
                                        <div className={`${styles["sp-form-group"]} ${styles.ringFrameComments} ${styles.ringFrameSummaryFull}`}>
                                            <label>Comments</label>
                                            <textarea placeholder="Enter comments" value={comments} onChange={(e) => { setComments(e.target.value); clearFieldError("comments"); }} className={`${styles["highlight-input"]} ${errors.comments ? styles["input-error"] : ""}`} />
                                        </div>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className={styles.row}>
                                    <div className={styles["sp-form-group"]}>
                                        <label>Type</label>
                                        <select className={`${styles["highlight-input"]} ${errors.checkingType ? styles["input-error"] : ""}`} value={checkingType} onChange={handleTypeChange}>
                                            <option value="">Select checking type</option>
                                            {checkingOptions.map((item) => <option key={item.id} value={item.name}>{item.displayName ?? item.name}</option>)}
                                        </select>
                                    </div>
                                    <div className={styles["sp-form-group"]}>
                                        <label>Entry ID</label>
                                        <input type="text" className={styles["highlight-input"]} value={entryId} readOnly disabled />
                                    </div>
                                    <div className={styles["sp-form-group"]}>
                                        <label>{machineFieldLabel}</label>
                                        <SearchableSelect
                                            className={`${styles["highlight-input"]} ${errors.selectedMachine ? styles["input-error"] : ""}`}
                                            value={selectedMachine}
                                            onChange={(value) => {
                                                setSelectedMachine(value);
                                                clearFieldError("selectedMachine");
                                            }}
                                            options={machineSelectOptions}
                                            placeholder={machineFieldPlaceholder}
                                            ariaLabel={machineFieldLabel}
                                        />
                                    </div>
                                </div>

                                {checkingType === "Speed Checking" && (
                                    <div className={styles["speed-section"]}>
                                        <div className={styles.row}>
                                            <div className={styles["sp-form-group"]}>
                                                <label>Display Speed</label>
                                                <input type="text" inputMode="decimal" placeholder="0.00" value={displaySpeed} onChange={handleDecimalInputChange(setDisplaySpeed, "displaySpeed")} className={errors.displaySpeed ? styles["input-error"] : ""} />
                                            </div>
                                            <div className={styles["sp-form-group"]}>
                                                <label>Spindle Speed</label>
                                                <input type="text" inputMode="decimal" placeholder="0.00" value={spindleSpeed} onChange={handleDecimalInputChange(setSpindleSpeed, "spindleSpeed")} className={errors.spindleSpeed ? styles["input-error"] : ""} />
                                            </div>
                                            <div className={styles["sp-form-group"]}>
                                                <label>Difference</label>
                                                <input type="text" inputMode="decimal" value={calculatedDifference} readOnly className={styles.readonly} />
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div className={styles["comparison-box"]}>
                                    <div className={styles["side-title-row"]}>
                                        <Image src="/SideMeasurement.png" alt="logo" width={15} height={30} priority />
                                        <p className={styles["side-title"]}>SIDE MEASUREMENTS</p>
                                    </div>

                                    <div className={styles["comparison-row"]}>
                                        <div className={styles.side}>
                                            <div className={styles["side-header"]}>
                                                <label>Spindle Number</label>
                                                <span className={styles.required}>REQUIRED</span>
                                            </div>
                                            <input
                                                type="text"
                                                inputMode={isCotsChecking ? "numeric" : "decimal"}
                                                placeholder={isCotsChecking ? "0-650" : "Enter value..."}
                                                value={lhsValue}
                                                onChange={isCotsChecking ? handleCotsSideInputChange(setLhsValue, "lhsValue") : handleDecimalInputChange(setLhsValue, "lhsValue")}
                                                className={errors.lhsValue ? styles["input-error"] : ""}
                                            />
                                            <div className={styles["remarks-header"]}>
                                                <span>Spindle Number Remarks</span>
                                                <div className={styles["mobile-micicon"]}>
                                                    <AiOutlineAudio className={styles["mic-icon"]} />
                                                </div>
                                            </div>
                                            <textarea placeholder="Spindle Number notes..." value={lhsRemarks} maxLength={MAX_CHARS} onChange={(e) => { setLhsRemarks(e.target.value); clearFieldError("lhsRemarks"); }} className={errors.lhsRemarks ? styles["input-error"] : ""} />
                                            <div className={styles["char-count"]}>{lhsRemarks.length}/{MAX_CHARS}</div>
                                        </div>

                                        <div className={styles.side}>
                                            <div className={styles["side-header"]}>
                                                <label>Spindle Number</label>
                                                <span className={styles.required}>REQUIRED</span>
                                            </div>
                                            <input
                                                type="text"
                                                inputMode={isCotsChecking ? "numeric" : "decimal"}
                                                placeholder={isCotsChecking ? "0-650" : "Enter value..."}
                                                value={rhsValue}
                                                onChange={isCotsChecking ? handleCotsSideInputChange(setRhsValue, "rhsValue") : handleDecimalInputChange(setRhsValue, "rhsValue")}
                                                className={errors.rhsValue ? styles["input-error"] : ""}
                                            />
                                            <div className={styles["remarks-header"]}>
                                                <span>Spindle Number Remarks</span>
                                                <div className={styles["mobile-micicon"]}>
                                                    <AiOutlineAudio className={styles["mic-icon"]} />
                                                </div>
                                            </div>
                                            <textarea placeholder="Spindle Number notes..." value={rhsRemarks} maxLength={MAX_CHARS} onChange={(e) => { setRhsRemarks(e.target.value); clearFieldError("rhsRemarks"); }} className={errors.rhsRemarks ? styles["input-error"] : ""} />
                                            <div className={styles["char-count"]}>{rhsRemarks.length}/{MAX_CHARS}</div>
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                        </>
                    )}

                    <div className={styles["card-footer-wrapper"]}>
                        {validationMessage ? (
                            <div className={styles.messageError}>{validationMessage}</div>
                        ) : null}
                        <Footer isMobile={isMobile} onBack={() => router.push("/departments/quality-control")} onClear={handleClearForm} onSave={handleSaveRecord} />
                    </div>
                </div>

                {isProcessParameter && SelectedComponent ? (
                    <div id="spinning-process-parameter-saved-versions" className="mt-5" />
                ) : null}
            </div>

            <PreviewModal
                open={showPreview}
                title="Quality Control - Spinning Notebook"
                subtitle="Preview"
                items={previewItems}
                typeValue={checkingType || "Select Type"}
                onCancel={() => setShowPreview(false)}
                onConfirm={confirmSubmit}
                confirmLabel="Submit"
            />

            <SuccessModal
                open={showSuccess}
                onClose={() => {
                    setShowSuccess(false);
                    successHandledRef.current = false;
                    handleClearForm();
                }}
                closeLabel="OK"
            />
        </div>
    );
}

export default SpinningDepartment;

