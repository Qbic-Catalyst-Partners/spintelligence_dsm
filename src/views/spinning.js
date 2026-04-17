import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import { useDispatch, useSelector } from "react-redux";
import { AiOutlineAudio } from "react-icons/ai";
import Image from "next/image";

import Footer from "../components/Footer";
import PreviewModal from "@/components/PreviewModal";
import ProcessParameterDataEntry from "./spinning/processParameterDataEntry";
import { submitSpinningRecord, resetSpinningState } from "../store/slices/spinSlice";
import { sanitizeIntegerInput, sanitizeNumericInput } from "@/utils/inputValidation";
import { filterOptionsByDepartmentAccess } from "@/utils/screenAccess";
import styles from "../styles/spinning.module.css";

const COUNT_NAME_OPTIONS = [
    "10 BLACK POLY VISCOSE 65/35 40D SPX YARN CONES",
    "20 BLACK POLY VISCOSE 65/35 40D SPX YARN CONES",
    "30 BLACK POLY VISCOSE 65/35 40D SPX YARN CONES",
];

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
        ...COUNT_CHANGE_BASE_ROWS[index % COUNT_CHANGE_BASE_ROWS.length],
    }));
};

const SHIFT_OPTIONS = ["Shift A", "Shift B", "Shift C", "General"];
const RING_FRAME_CHECKERS = ["Ramesh", "Suresh", "Mahesh", "Karthik", "Anitha"];
const SPINNING_CHECKING_OPTIONS = [
    { id: 0, name: "Process Parameter", aliases: ["Process Parameter", "Process Parameter Data Entry"], component: ProcessParameterDataEntry },
    { id: 1, name: "COTS Checking", aliases: ["COTS Checking", "COTS - CHECKING"] },
    { id: 2, name: "Count Change", aliases: ["Count Change", "COUNT CHANGE"] },
    { id: 3, name: "Ring Frame Log Book", aliases: ["Ring Frame Log Book", "RING FRAME LOG BOOK"] },
    { id: 4, name: "Speed Checking", aliases: ["Speed Checking", "SPEED CHECKING"] },
    { id: 5, name: "Lycra Missing", aliases: ["Lycra Missing", "LYCRA MISSING"] },
    { id: 6, name: "Bottom Apron Checking", aliases: ["Bottom Apron Checking", "BOTTOM APRON CHECKING"] },
    { id: 7, name: "Lycra Centering", aliases: ["Lycra Centering", "LYCRA CENTERING"] },
    { id: 8, name: "RSM & Lycrasensor Checking Online", aliases: ["RSM & Lycrasensor Checking Online", "RSM AND LYCRASENSOR CHECKING ONLINE"] },
    { id: 9, name: "RSM & Lycrasensor Checking Offline", aliases: ["RSM & Lycrasensor Checking Offline", "RSM AND LYCRASENSOR CHECKING OFFLINE"] },
];

export const SPINNING_INPUT_SCREEN_COUNT = SPINNING_CHECKING_OPTIONS.length;
const DECIMAL_10_2_CONFIG = { precision: 10, scale: 2 };
const DECIMAL_5_2_CONFIG = { precision: 5, scale: 2 };

const createRingFrameRows = () =>
    Array.from({ length: 24 }, (_, index) => ({
        machine_no: index + 1,
        lycra: "",
        bobbin_color: "",
        position_1: "",
        position_2: "",
        position_3: "",
        position_4: "",
        position_5: "",
        position_6: "",
        lycra_missing: "",
        guide_roll_lapping: "",
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
    const router = useRouter();
    const dispatch = useDispatch();
    const childRef = useRef(null);
    const { success, error } = useSelector((state) => state.spinning);
    const user = useSelector((state) => state.auth?.user);
    const accessByDepartment = useSelector((state) => state.auth?.accessByDepartment);
    const checkingOptions = filterOptionsByDepartmentAccess(
        SPINNING_CHECKING_OPTIONS,
        accessByDepartment,
        user,
        "Spinning"
    );

    const queryType = Array.isArray(router.query.type) ? router.query.type[0] : router.query.type;
    const findCheckingOption = (value) =>
        checkingOptions.find((item) => item.name === value || item.displayName === value) || null;

    const [checkingType, setCheckingType] = useState(findCheckingOption(queryType)?.name || checkingOptions[0]?.name || "");
    const [selectedMachine, setSelectedMachine] = useState("");
    const [employeeSearch, setEmployeeSearch] = useState("");
    const [showEmployeeList, setShowEmployeeList] = useState(false);
    const [displaySpeed, setDisplaySpeed] = useState("");
    const [spindleSpeed, setSpindleSpeed] = useState("");
    const [countChangeMode, setCountChangeMode] = useState("");
    const [testNo, setTestNo] = useState("");
    const [rfNo, setRfNo] = useState("");
    const [lycraDraft, setLycraDraft] = useState("");
    const [countNameFrom, setCountNameFrom] = useState("");
    const [countNameTo, setCountNameTo] = useState("");
    const [countReadingCount, setCountReadingCount] = useState("");
    const [countChangeRows, setCountChangeRows] = useState([]);
    const [shift, setShift] = useState("");
    const [checkerName, setCheckerName] = useState("");
    const [ringFrameRows, setRingFrameRows] = useState(createRingFrameRows);
    const [outOfCenter, setOutOfCenter] = useState("");
    const [ringFrameLycraMissing, setRingFrameLycraMissing] = useState("");
    const [comments, setComments] = useState("");
    const [faultCops, setFaultCops] = useState("");
    const [totalCops, setTotalCops] = useState("");
    const [date, setDate] = useState("");
    const [lhsValue, setLhsValue] = useState("");
    const [lhsRemarks, setLhsRemarks] = useState("");
    const [rhsValue, setRhsValue] = useState("");
    const [rhsRemarks, setRhsRemarks] = useState("");
    const [isMobile, setIsMobile] = useState(false);
    const [errors, setErrors] = useState({});
    const [showPreview, setShowPreview] = useState(false);
    const [previewItems, setPreviewItems] = useState([]);
    const [validationMessage, setValidationMessage] = useState("");

    const dropdownRef = useRef(null);
    const MAX_CHARS = 500;
    const machineOptions = ["MC-01", "MC-02", "MC-03", "MC-04"];
    const employees = ["Ramesh", "Suresh", "Mahesh", "Karthik", "Anitha"];
    const selectedCheckingOption = checkingOptions.find((item) => item.name === checkingType) || null;
    const SelectedComponent = selectedCheckingOption?.component ?? null;
    const isProcessParameter = checkingType === "Process Parameter";
    const isCountChange = checkingType === "Count Change";
    const isRingFrame = checkingType === "Ring Frame Log Book";

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

    useEffect(() => {
        if (success) {
            handleClearForm();
            dispatch(resetSpinningState());
        }
        if (error) dispatch(resetSpinningState());
    }, [success, error, dispatch]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) setShowEmployeeList(false);
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const getTodayDate = () => new Date().toISOString().split("T")[0];
    const parseNumericInput = (value) => (value === "" ? null : Number.isNaN(Number.parseFloat(value)) ? null : Number.parseFloat(value));
    const parseDecimalPayloadValue = (value) => {
        const parsedValue = parseNumericInput(value);
        return parsedValue === null ? null : Number(parsedValue.toFixed(2));
    };
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
    const filteredEmployees = employees.filter((emp) => emp.toLowerCase().includes(employeeSearch.toLowerCase()));
    const displaySpeedValue = parseNumericInput(displaySpeed);
    const spindleSpeedValue = parseNumericInput(spindleSpeed);
    const calculatedDifferenceValue = displaySpeedValue !== null && spindleSpeedValue !== null ? Number((displaySpeedValue - spindleSpeedValue).toFixed(2)) : null;
    const calculatedDifference = calculatedDifferenceValue !== null ? calculatedDifferenceValue.toFixed(2) : "";

    const handleTypeChange = (e) => {
        const selectedType = e.target.value;
        setCheckingType(selectedType);
        clearFieldError("checkingType");
        if (selectedType) {
            setDate(getTodayDate());
            router.push(`/spinning?type=${encodeURIComponent(selectedType)}`, undefined, { shallow: true });
        } else {
            setDate("");
            router.push("/spinning", undefined, { shallow: true });
        }
    };

    const handleClearForm = () => {
        if (isProcessParameter) {
            childRef.current?.clear?.();
            setErrors({});
            setValidationMessage("");
            return;
        }
        setCheckingType("");
        setSelectedMachine("");
        setEmployeeSearch("");
        setDate("");
        setDisplaySpeed("");
        setSpindleSpeed("");
        setCountChangeMode("");
        setTestNo("");
        setRfNo("");
        setLycraDraft("");
        setCountNameFrom("");
        setCountNameTo("");
        setCountReadingCount("");
        setCountChangeRows([]);
        setShift("");
        setCheckerName("");
        setRingFrameRows(createRingFrameRows());
        setOutOfCenter("");
        setRingFrameLycraMissing("");
        setComments("");
        setFaultCops("");
        setTotalCops("");
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
        if (!checkingType) nextErrors.checkingType = true;
        if (!date) nextErrors.date = true;
        if (isCountChange) {
            if (!testNo.trim()) nextErrors.testNo = true;
            if (!rfNo.trim()) nextErrors.rfNo = true;
            if (!lycraDraft.trim()) nextErrors.lycraDraft = true;
            if (!countNameFrom.trim()) nextErrors.countNameFrom = true;
            if (!countNameTo.trim()) nextErrors.countNameTo = true;
            if (!countReadingCount.trim() || Number(countReadingCount) <= 0) nextErrors.countReadingCount = true;
            if (!countChangeMode) nextErrors.countChangeMode = true;
        } else if (isRingFrame) {
            if (!shift.trim()) nextErrors.shift = true;
            if (!checkerName.trim()) nextErrors.checkerName = true;
            if (!outOfCenter.trim()) nextErrors.outOfCenter = true;
            if (!ringFrameLycraMissing.trim()) nextErrors.ringFrameLycraMissing = true;
            if (!comments.trim()) nextErrors.comments = true;
            if (!faultCops.trim()) nextErrors.faultCops = true;
            if (!totalCops.trim()) nextErrors.totalCops = true;

            const ringFrameRowErrors = {};
            ringFrameRows.forEach((row) => {
                const rowErrors = {};
                if (!hasTextValue(row.lycra)) rowErrors.lycra = true;
                if (!hasTextValue(row.bobbin_color)) rowErrors.bobbin_color = true;
                if (!hasTextValue(row.position_1)) rowErrors.position_1 = true;
                if (!hasTextValue(row.position_2)) rowErrors.position_2 = true;
                if (!hasTextValue(row.position_3)) rowErrors.position_3 = true;
                if (!hasTextValue(row.position_4)) rowErrors.position_4 = true;
                if (!hasTextValue(row.position_5)) rowErrors.position_5 = true;
                if (!hasTextValue(row.position_6)) rowErrors.position_6 = true;
                if (!hasTextValue(row.lycra_missing)) rowErrors.lycra_missing = true;
                if (!hasTextValue(row.guide_roll_lapping)) rowErrors.guide_roll_lapping = true;
                if (!hasTextValue(row.others)) rowErrors.others = true;
                if (Object.keys(rowErrors).length > 0) ringFrameRowErrors[row.machine_no] = rowErrors;
            });

            if (Object.keys(ringFrameRowErrors).length > 0) nextErrors.ringFrameRows = ringFrameRowErrors;
        } else {
            if (!selectedMachine) nextErrors.selectedMachine = true;
            if (!employeeSearch.trim()) nextErrors.employeeSearch = true;
            if (!lhsValue.trim()) nextErrors.lhsValue = true;
            if (!rhsValue.trim()) nextErrors.rhsValue = true;
            if (!lhsRemarks.trim()) nextErrors.lhsRemarks = true;
            if (!rhsRemarks.trim()) nextErrors.rhsRemarks = true;
        }
        if (checkingType === "Speed Checking") {
            if (displaySpeedValue === null) nextErrors.displaySpeed = true;
            if (spindleSpeedValue === null) nextErrors.spindleSpeed = true;
        }
        setErrors(nextErrors);
        return Object.keys(nextErrors).length === 0;
    };

    const buildPayload = () => {
        if (isCountChange) {
            return {
                type: checkingType,
                entry_date: date || getTodayDate(),
                test_no: Number.parseInt(testNo, 10) || 0,
                rf_no: Number.parseInt(rfNo, 10) || 0,
                lycra_draft: parseDecimalPayloadValue(lycraDraft) ?? 0,
                count_name_from: countNameFrom,
                count_name_to: countNameTo,
                readings: countChangeRows.map((row, index) => ({
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
                inspection_type: "Ring Frame",
                entry_date: date || getTodayDate(),
                shift,
                checker_name: checkerName,
                rows: ringFrameRows.map((row) => ({
                    mc_no: row.machine_no,
                    lycra: String(row.lycra ?? "").trim(),
                    bobbin_color: String(row.bobbin_color ?? "").trim(),
                    spindle_1: String(row.position_1 ?? "").trim(),
                    spindle_2: String(row.position_2 ?? "").trim(),
                    spindle_3: String(row.position_3 ?? "").trim(),
                    spindle_4: String(row.position_4 ?? "").trim(),
                    spindle_5: String(row.position_5 ?? "").trim(),
                    spindle_6: String(row.position_6 ?? "").trim(),
                    lycra_missing: String(row.lycra_missing ?? "").trim(),
                    guide_roll_lapping: String(row.guide_roll_lapping ?? "").trim(),
                    others: String(row.others ?? "").trim(),
                    total: String(getRingFrameRowTotal(row)),
                })),
                summary: {
                    out_of_center: parseDecimalPayloadValue(outOfCenter) ?? 0,
                    lycra_missing: parseDecimalPayloadValue(ringFrameLycraMissing) ?? 0,
                    fault_cops: parseDecimalPayloadValue(faultCops) ?? 0,
                    total_cops: parseDecimalPayloadValue(totalCops) ?? 0,
                    comments: comments.trim(),
                },
            };
        }
        const payload = {
            inspectiondate: new Date(date || getTodayDate()).toISOString(),
            machineno: parseInt(selectedMachine.replace("MC-", ""), 10) || 0,
            employeename: employeeSearch,
            lhs_value: parseDecimalPayloadValue(lhsValue) ?? 0,
            rhs_value: parseDecimalPayloadValue(rhsValue) ?? 0,
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

    const confirmSubmit = () => {
        if (isProcessParameter) {
            setShowPreview(false);
            childRef.current?.submit?.();
            return;
        }
        const payload = buildPayload();
        setShowPreview(false);
        dispatch(submitSpinningRecord({ type: checkingType, payload }));
    };

    const handleGenerateCountChangeRows = () => {
        const nextCount = Math.max(1, Number.parseInt(countReadingCount, 10) || 1);
        setCountReadingCount(String(nextCount));
        setCountChangeRows(createCountChangeRows(nextCount));
        setErrors((prev) => ({ ...prev, countReadingCount: false }));
    };

    const handleRingFrameChange = (machineNo, field, value) => {
        setRingFrameRows((currentRows) =>
            currentRows.map((row) =>
                row.machine_no === machineNo
                    ? {
                        ...row,
                        [field]: value,
                    }
                    : row
            )
        );
        clearRingFrameRowError(machineNo, field);
    };
    const handleRingFrameTextChange = (machineNo, field) => (event) => {
        handleRingFrameChange(machineNo, field, event.target.value);
    };

    const getRingFrameRowTotal = (row) => {
        const numericFields = ["position_1", "position_2", "position_3", "position_4", "position_5", "position_6", "lycra_missing", "guide_roll_lapping", "others"];
        return numericFields.reduce((total, field) => total + (parseNumericInput(row[field]) ?? 0), 0);
    };

    const handleSaveRecord = () => {
        if (isProcessParameter) {
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
            setValidationMessage("Please fill all required fields before saving.");
            return;
        }
        setValidationMessage("");

        const headerItems = isCountChange
            ? [
                { label: "Checking Type", value: checkingType || "-" },
                { label: "Entry Date", value: date || getTodayDate() },
                { label: "Test No.", value: testNo || "-" },
                { label: "RF No.", value: rfNo || "-" },
                { label: "Lycra Draft", value: lycraDraft || "-" },
            ]
            : [
                { label: "Checking Type", value: checkingType || "-" },
                { label: "Date", value: date || getTodayDate() },
                { label: "Machine", value: selectedMachine || "-" },
                { label: "Employee", value: employeeSearch || "-" },
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
                    { label: "Out of Center (AC/RF)", value: outOfCenter || "-" },
                    { label: "Lycra Missing (AC/RF)", value: ringFrameLycraMissing || "-" },
                    { label: "Fault Cops", value: faultCops || "-" },
                    { label: "Total Cops", value: totalCops || "-" },
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
                        { label: `MC ${row.machine_no} - Lycra Missing`, value: String(row.lycra_missing ?? "") || "-" },
                        { label: `MC ${row.machine_no} - Guide Roll Lapping`, value: String(row.guide_roll_lapping ?? "") || "-" },
                        { label: `MC ${row.machine_no} - Others`, value: String(row.others ?? "") || "-" },
                        { label: `MC ${row.machine_no} - Total`, value: String(getRingFrameRowTotal(row)) || "0" },
                    ]))
                ]
            : [
                { label: "LHS Value", value: lhsValue || "-" },
                { label: "RHS Value", value: rhsValue || "-" },
                { label: "LHS Remarks", value: lhsRemarks || "-" },
                { label: "RHS Remarks", value: rhsRemarks || "-" },
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
                <div className={styles.breadcrumbs}>
                    <button type="button" className={styles["breadcrumb-link"]} onClick={() => router.push("/")}>Home</button>
                    <span>›</span>
                    <button type="button" className={styles["breadcrumb-link"]} onClick={() => router.push("/dashboard")}>Dashboard</button>
                    <span>›</span>
                    <button type="button" className={styles["breadcrumb-link"]} onClick={() => router.push("/departments/quality-control")}>Quality Control</button>
                    <span>›</span>
                    <span className={styles.active}>{checkingType || "Spinning Notebook QC"}</span>
                </div>

                <h1 className={styles["sp-page-title"]}>Quality Control - Spinning Notebook</h1>
                <p className={styles["sp-page-description"]}>Record and manage industrial machine quality inspections.</p>

                <div className={styles["sp-card"]}>
                    {isProcessParameter && SelectedComponent ? (
                        <SelectedComponent
                            ref={childRef}
                            selectedTypeName={checkingType}
                            typeOptions={checkingOptions}
                            onTypeChange={(value) => handleTypeChange({ target: { value } })}
                            standaloneSection
                            savedVersionsTargetId="spinning-process-parameter-saved-versions"
                        />
                    ) : (
                        <>
                    <div className={styles["title-row"]}>
                        <InspectionEntryIcon />
                        <h3 className={styles.sectiontitle}>Inspection Data Entry</h3>
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
                                        <label>Entry Date</label>
                                        <input type="date" className={`${styles["highlight-input"]} ${errors.date ? styles["input-error"] : ""}`} value={date} onChange={(e) => { setDate(e.target.value); clearFieldError("date"); }} disabled={checkingType !== ""} />
                                    </div>
                                    <div className={styles["sp-form-group"]}>
                                        <label>Test No.</label>
                                        <input type="text" inputMode="numeric" placeholder="Enter test number" className={`${styles["highlight-input"]} ${errors.testNo ? styles["input-error"] : ""}`} value={testNo} onChange={handleIntegerInputChange(setTestNo, "testNo")} />
                                    </div>
                                </div>

                                <div className={styles.row}>
                                    <div className={styles["sp-form-group"]}>
                                        <label>RF No.</label>
                                        <input type="text" inputMode="numeric" placeholder="Enter RF number" className={`${styles["highlight-input"]} ${errors.rfNo ? styles["input-error"] : ""}`} value={rfNo} onChange={handleIntegerInputChange(setRfNo, "rfNo")} />
                                    </div>
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
                                        <select className={`${styles["highlight-input"]} ${errors.countNameFrom ? styles["input-error"] : ""}`} value={countNameFrom} onChange={(e) => { setCountNameFrom(e.target.value); clearFieldError("countNameFrom"); }}>
                                            <option value="">Select count name</option>
                                            {COUNT_NAME_OPTIONS.map((item) => <option key={`from-${item}`} value={item}>{item}</option>)}
                                        </select>
                                    </div>
                                    <div className={styles["sp-form-group"]}>
                                        <label>Count Name (To)</label>
                                        <select className={`${styles["highlight-input"]} ${errors.countNameTo ? styles["input-error"] : ""}`} value={countNameTo} onChange={(e) => { setCountNameTo(e.target.value); clearFieldError("countNameTo"); }}>
                                            <option value="">Select count name</option>
                                            {COUNT_NAME_OPTIONS.map((item) => <option key={`to-${item}`} value={item}>{item}</option>)}
                                        </select>
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
                                                <th>CV%</th>
                                                <th>STRENGTH</th>
                                                <th>MEAN</th>
                                                <th>CV%</th>
                                                <th>CSP</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {countChangeRows.map((row) => (
                                                <tr key={row.reading_no}>
                                                    <td>{row.reading_no}</td>
                                                    <td>{row.reading_value}</td>
                                                    <td>{row.count}</td>
                                                    <td>{row.cv_percent}</td>
                                                    <td>{row.strength}</td>
                                                    <td>{row.mean}</td>
                                                    <td>{row.cv_percent_2}</td>
                                                    <td>{row.csp}</td>
                                                </tr>
                                            ))}
                                        </tbody>
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
                                        <label>Entry Date</label>
                                        <input type="date" className={`${styles["highlight-input"]} ${errors.date ? styles["input-error"] : ""}`} value={date} onChange={(e) => { setDate(e.target.value); clearFieldError("date"); }} disabled={checkingType !== ""} />
                                    </div>
                                    <div className={styles["sp-form-group"]}>
                                        <label>Shift</label>
                                        <select className={`${styles["highlight-input"]} ${errors.shift ? styles["input-error"] : ""}`} value={shift} onChange={(e) => { setShift(e.target.value); clearFieldError("shift"); }}>
                                            <option value="">Select Shift</option>
                                            {SHIFT_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
                                        </select>
                                    </div>
                                </div>

                                <div className={styles.row}>
                                    <div className={styles["sp-form-group"]}>
                                        <label>Checker Name</label>
                                        <select className={`${styles["highlight-input"]} ${errors.checkerName ? styles["input-error"] : ""}`} value={checkerName} onChange={(e) => { setCheckerName(e.target.value); clearFieldError("checkerName"); }}>
                                            <option value="">Select Checker</option>
                                            {RING_FRAME_CHECKERS.map((item) => <option key={item} value={item}>{item}</option>)}
                                        </select>
                                    </div>
                                </div>

                                <div className={styles.ringFrameTableWrap}>
                                    <table className={styles.ringFrameTable}>
                                        <thead>
                                            <tr>
                                                <th>Mc.No</th>
                                                <th>Lycra</th>
                                                <th>Bobbin Color</th>
                                                <th>1</th>
                                                <th>2</th>
                                                <th>3</th>
                                                <th>4</th>
                                                <th>5</th>
                                                <th>6</th>
                                                <th>Lycra Missing</th>
                                                <th>Guide Roll Lapping</th>
                                                <th>Others</th>
                                                <th>Total</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {ringFrameRows.map((row) => (
                                                <tr key={row.machine_no}>
                                                    <td className={styles.ringFrameMachineCell}>{row.machine_no}</td>
                                                    <td><input type="text" placeholder="Enter" value={String(row.lycra ?? "")} onChange={handleRingFrameTextChange(row.machine_no, "lycra")} className={`${styles.ringFrameInputWide} ${errors.ringFrameRows?.[row.machine_no]?.lycra ? styles["input-error"] : ""}`} /></td>
                                                    <td><input type="text" placeholder="Enter" value={String(row.bobbin_color ?? "")} onChange={handleRingFrameTextChange(row.machine_no, "bobbin_color")} className={`${styles.ringFrameInput} ${errors.ringFrameRows?.[row.machine_no]?.bobbin_color ? styles["input-error"] : ""}`} /></td>
                                                    <td><input type="text" placeholder="Enter" value={String(row.position_1 ?? "")} onChange={handleRingFrameTextChange(row.machine_no, "position_1")} className={`${styles.ringFrameInput} ${errors.ringFrameRows?.[row.machine_no]?.position_1 ? styles["input-error"] : ""}`} /></td>
                                                    <td><input type="text" placeholder="Enter" value={String(row.position_2 ?? "")} onChange={handleRingFrameTextChange(row.machine_no, "position_2")} className={`${styles.ringFrameInput} ${errors.ringFrameRows?.[row.machine_no]?.position_2 ? styles["input-error"] : ""}`} /></td>
                                                    <td><input type="text" placeholder="Enter" value={String(row.position_3 ?? "")} onChange={handleRingFrameTextChange(row.machine_no, "position_3")} className={`${styles.ringFrameInput} ${errors.ringFrameRows?.[row.machine_no]?.position_3 ? styles["input-error"] : ""}`} /></td>
                                                    <td><input type="text" placeholder="Enter" value={String(row.position_4 ?? "")} onChange={handleRingFrameTextChange(row.machine_no, "position_4")} className={`${styles.ringFrameInput} ${errors.ringFrameRows?.[row.machine_no]?.position_4 ? styles["input-error"] : ""}`} /></td>
                                                    <td><input type="text" placeholder="Enter" value={String(row.position_5 ?? "")} onChange={handleRingFrameTextChange(row.machine_no, "position_5")} className={`${styles.ringFrameInput} ${errors.ringFrameRows?.[row.machine_no]?.position_5 ? styles["input-error"] : ""}`} /></td>
                                                    <td><input type="text" placeholder="Enter" value={String(row.position_6 ?? "")} onChange={handleRingFrameTextChange(row.machine_no, "position_6")} className={`${styles.ringFrameInput} ${errors.ringFrameRows?.[row.machine_no]?.position_6 ? styles["input-error"] : ""}`} /></td>
                                                    <td><input type="text" placeholder="Enter" value={String(row.lycra_missing ?? "")} onChange={handleRingFrameTextChange(row.machine_no, "lycra_missing")} className={`${styles.ringFrameInputWide} ${errors.ringFrameRows?.[row.machine_no]?.lycra_missing ? styles["input-error"] : ""}`} /></td>
                                                    <td><input type="text" placeholder="Enter" value={String(row.guide_roll_lapping ?? "")} onChange={handleRingFrameTextChange(row.machine_no, "guide_roll_lapping")} className={`${styles.ringFrameInputWide} ${errors.ringFrameRows?.[row.machine_no]?.guide_roll_lapping ? styles["input-error"] : ""}`} /></td>
                                                    <td><input type="text" placeholder="Enter" value={String(row.others ?? "")} onChange={handleRingFrameTextChange(row.machine_no, "others")} className={`${styles.ringFrameInputWide} ${errors.ringFrameRows?.[row.machine_no]?.others ? styles["input-error"] : ""}`} /></td>
                                                    <td><input type="text" value={String(getRingFrameRowTotal(row))} readOnly className={styles.ringFrameInputWide} /></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                <div className={styles.ringFrameSummaryBox}>
                                    <div className={styles.ringFrameSummaryGrid}>
                                        <div className={styles["sp-form-group"]}>
                                            <label>Out of Center (AC/RF)</label>
                                            <input type="text" inputMode="decimal" placeholder="Enter" value={outOfCenter} onChange={handleDecimalInputChange(setOutOfCenter, "outOfCenter")} className={`${styles["highlight-input"]} ${errors.outOfCenter ? styles["input-error"] : ""}`} />
                                        </div>
                                        <div className={styles["sp-form-group"]}>
                                            <label>Lycra Missing (AC/RF)</label>
                                            <input type="text" inputMode="decimal" placeholder="Enter" value={ringFrameLycraMissing} onChange={handleDecimalInputChange(setRingFrameLycraMissing, "ringFrameLycraMissing")} className={`${styles["highlight-input"]} ${errors.ringFrameLycraMissing ? styles["input-error"] : ""}`} />
                                        </div>
                                        <div className={`${styles["sp-form-group"]} ${styles.ringFrameComments}`}>
                                            <label>Comments</label>
                                            <textarea placeholder="Enter comments" value={comments} onChange={(e) => { setComments(e.target.value); clearFieldError("comments"); }} className={`${styles["highlight-input"]} ${errors.comments ? styles["input-error"] : ""}`} />
                                        </div>
                                        <div className={styles["sp-form-group"]}>
                                            <label>Fault Cops</label>
                                            <input type="text" inputMode="decimal" placeholder="Enter" value={faultCops} onChange={handleDecimalInputChange(setFaultCops, "faultCops")} className={`${styles["highlight-input"]} ${errors.faultCops ? styles["input-error"] : ""}`} />
                                        </div>
                                        <div className={styles["sp-form-group"]}>
                                            <label>Total Cops</label>
                                            <input type="text" inputMode="decimal" placeholder="Enter" value={totalCops} onChange={handleDecimalInputChange(setTotalCops, "totalCops")} className={`${styles["highlight-input"]} ${errors.totalCops ? styles["input-error"] : ""}`} />
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
                                        <label>Date</label>
                                        <input type="date" className={`${styles["highlight-input"]} ${errors.date ? styles["input-error"] : ""}`} value={date} onChange={(e) => { setDate(e.target.value); clearFieldError("date"); }} disabled={checkingType !== ""} />
                                    </div>
                                    <div className={styles["sp-form-group"]}>
                                        <label>Machine</label>
                                        <select className={`${styles["highlight-input"]} ${errors.selectedMachine ? styles["input-error"] : ""}`} value={selectedMachine} onChange={(e) => { setSelectedMachine(e.target.value); clearFieldError("selectedMachine"); }}>
                                            <option value="">Select Machine</option>
                                            {machineOptions.map((mc) => <option key={mc}>{mc}</option>)}
                                        </select>
                                    </div>
                                </div>

                                <div className={`${styles["sp-form-group"]} ${styles["full-width"]}`} ref={dropdownRef}>
                                    <label>Employee Name</label>
                                    <div className={styles["search-dropdown"]}>
                                        <div className={styles["input-wrapper"]}>
                                            <input
                                                type="text"
                                                placeholder="Search employee..."
                                                value={employeeSearch}
                                                onChange={(e) => {
                                                    setEmployeeSearch(e.target.value);
                                                    clearFieldError("employeeSearch");
                                                    setShowEmployeeList(true);
                                                }}
                                                onFocus={() => setShowEmployeeList(true)}
                                                className={`${styles["highlight-input"]} ${styles["employee-input"]} ${errors.employeeSearch ? styles["input-error"] : ""}`}
                                            />
                                        </div>
                                        {showEmployeeList && (
                                            <div className={styles["dropdown-list"]}>
                                                {filteredEmployees.length > 0
                                                    ? filteredEmployees.map((emp, index) => (
                                                        <div key={index} className={styles["dropdown-item"]} onClick={() => {
                                                            setEmployeeSearch(emp);
                                                            clearFieldError("employeeSearch");
                                                            setShowEmployeeList(false);
                                                        }}>
                                                            {emp}
                                                        </div>
                                                    ))
                                                    : <div className={`${styles["dropdown-item"]} ${styles.disabled}`}>No employees found</div>}
                                            </div>
                                        )}
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
                                                <label>LHS (Left Hand Side)</label>
                                                <span className={styles.required}>REQUIRED</span>
                                            </div>
                                            <input type="text" inputMode="decimal" placeholder="Enter value..." value={lhsValue} onChange={handleDecimalInputChange(setLhsValue, "lhsValue")} className={errors.lhsValue ? styles["input-error"] : ""} />
                                            <div className={styles["remarks-header"]}>
                                                <span>LHS Remarks</span>
                                                <div className={styles["mobile-micicon"]}>
                                                    <AiOutlineAudio className={styles["mic-icon"]} />
                                                </div>
                                            </div>
                                            <textarea placeholder="LHS specific notes..." value={lhsRemarks} maxLength={MAX_CHARS} onChange={(e) => { setLhsRemarks(e.target.value); clearFieldError("lhsRemarks"); }} className={errors.lhsRemarks ? styles["input-error"] : ""} />
                                            <div className={styles["char-count"]}>{lhsRemarks.length}/{MAX_CHARS}</div>
                                        </div>

                                        <div className={styles.side}>
                                            <div className={styles["side-header"]}>
                                                <label>RHS (Right Hand Side)</label>
                                                <span className={styles.required}>REQUIRED</span>
                                            </div>
                                            <input type="text" inputMode="decimal" placeholder="Enter value..." value={rhsValue} onChange={handleDecimalInputChange(setRhsValue, "rhsValue")} className={errors.rhsValue ? styles["input-error"] : ""} />
                                            <div className={styles["remarks-header"]}>
                                                <span>RHS Remarks</span>
                                                <div className={styles["mobile-micicon"]}>
                                                    <AiOutlineAudio className={styles["mic-icon"]} />
                                                </div>
                                            </div>
                                            <textarea placeholder="RHS specific notes..." value={rhsRemarks} maxLength={MAX_CHARS} onChange={(e) => { setRhsRemarks(e.target.value); clearFieldError("rhsRemarks"); }} className={errors.rhsRemarks ? styles["input-error"] : ""} />
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
                        <Footer isMobile={isMobile} onBack={() => router.push("/dashboard")} onClear={handleClearForm} onSave={handleSaveRecord} />
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
        </div>
    );
}

export default SpinningDepartment;
