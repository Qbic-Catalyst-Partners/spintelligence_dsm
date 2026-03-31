import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import { useDispatch, useSelector } from "react-redux";
import { AiOutlineAudio } from "react-icons/ai";
import { MdEditNote } from "react-icons/md";
import Image from 'next/image';

import Footer from "../components/Footer";
import { submitSpinningRecord, resetSpinningState } from "../store/slices/spinSlice";
import styles from "../styles/spinning.module.css";

function SpinningDepartment() {
    const router = useRouter();
    const dispatch = useDispatch();

    const { loading, success, error } = useSelector((state) => state.spinning);

    const queryType = Array.isArray(router.query.type)
        ? router.query.type[0]
        : router.query.type;

    const [checkingType, setCheckingType] = useState(queryType || "");
    const [selectedMachine, setSelectedMachine] = useState("");
    const [employeeSearch, setEmployeeSearch] = useState("");
    const [showEmployeeList, setShowEmployeeList] = useState(false);
    const [displaySpeed, setDisplaySpeed] = useState("");
    const [spindleSpeed, setSpindleSpeed] = useState("");
    const [date, setDate] = useState("");
    const [lhsValue, setLhsValue] = useState("");
    const [lhsRemarks, setLhsRemarks] = useState("");
    const [rhsValue, setRhsValue] = useState("");
    const [rhsRemarks, setRhsRemarks] = useState("");
    const [isMobile, setIsMobile] = useState(false);

    const dropdownRef = useRef(null);
    const MAX_CHARS = 500;

    const checkingOptions = [
        "COTS Checking",
        "Speed Checking",
        "Lycra Missing",
        "Bottom Apron Checking",
        "Lycra Centering",
        "RSM & Lycrasensor Checking Online",
        "RSM & Lycrasensor Checking Offline",
    ];

    const machineOptions = ["MC-01", "MC-02", "MC-03", "MC-04"];
    const employees = ["Ramesh", "Suresh", "Mahesh", "Karthik", "Anitha"];

    /* ================= EFFECTS ================= */

    useEffect(() => {
        const checkScreen = () => setIsMobile(window.innerWidth <= 767);
        checkScreen();
        window.addEventListener("resize", checkScreen);
        return () => window.removeEventListener("resize", checkScreen);
    }, []);

    useEffect(() => {
        setCheckingType(queryType || "");
        if (queryType) setDate(getTodayDate());
    }, [queryType]);

    const parseNumericInput = (value) => {
        if (value === "") return null;

        const parsedValue = Number.parseFloat(value);
        return Number.isNaN(parsedValue) ? null : parsedValue;
    };

    const displaySpeedValue = parseNumericInput(displaySpeed);
    const spindleSpeedValue = parseNumericInput(spindleSpeed);
    const calculatedDifferenceValue =
        displaySpeedValue !== null && spindleSpeedValue !== null
            ? Number((displaySpeedValue - spindleSpeedValue).toFixed(2))
            : null;
    const calculatedDifference =
        calculatedDifferenceValue !== null ? calculatedDifferenceValue.toFixed(2) : "";

    useEffect(() => {
        if (success) {
            alert("Record saved successfully");
            handleClearForm();
            dispatch(resetSpinningState());
        }
        if (error) {
            alert(error);
            dispatch(resetSpinningState());
        }
    }, [success, error]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setShowEmployeeList(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    /* ================= HELPERS ================= */

    const getTodayDate = () => {
        const today = new Date();
        return today.toISOString().split("T")[0];
    };

    const filteredEmployees = employees.filter((emp) =>
        emp.toLowerCase().includes(employeeSearch.toLowerCase())
    );

    /* ================= HANDLERS ================= */

    const handleTypeChange = (e) => {
        const selectedType = e.target.value;
        setCheckingType(selectedType);

        if (selectedType) {
            setDate(getTodayDate());
            router.push(`/spinning?type=${encodeURIComponent(selectedType)}`, undefined, { shallow: true });
        } else {
            setDate("");
            router.push(`/spinning`, undefined, { shallow: true });
        }
    };

    const handleClearForm = () => {
        setCheckingType("");
        setSelectedMachine("");
        setEmployeeSearch("");
        setDate("");
        setDisplaySpeed("");
        setSpindleSpeed("");
        setLhsValue("");
        setLhsRemarks("");
        setRhsValue("");
        setRhsRemarks("");
        router.push("/spinning", undefined, { shallow: true });
    };

    const handleSaveRecord = () => {
        if (!checkingType) return alert("Please select checking type");
        if (!selectedMachine || !employeeSearch) return alert("Please fill all required fields");
        if (
            checkingType === "Speed Checking" &&
            (displaySpeedValue === null || spindleSpeedValue === null || calculatedDifferenceValue === null)
        ) {
            return alert("Please enter both display speed and spindle speed");
        }

        const payload = {
            inspectiondate: new Date(date || getTodayDate()).toISOString(),
            machineno: parseInt(selectedMachine.replace("MC-", ""), 10) || 0,
            employeename: employeeSearch,
            lhs_value: parseFloat(lhsValue) || 0,
            rhs_value: parseFloat(rhsValue) || 0,
            lhs_textremarks: lhsRemarks.trim(),
            rhs_textremarks: rhsRemarks.trim(),
            lhs_audio: "",
            rhs_audio: "",
        };

        if (checkingType === "Speed Checking") {
            payload.display_speed = displaySpeedValue;
            payload.spindle_speed = spindleSpeedValue;
            payload.difference = calculatedDifferenceValue;

            // Keep aliases during backend transition so the record still stores
            // if the API expects camelCase names instead of snake_case.
            payload.displaySpeed = displaySpeedValue;
            payload.spindleSpeed = spindleSpeedValue;
        }

        dispatch(submitSpinningRecord({ type: checkingType, payload }));
    };

    /* ================= UI ================= */

    return (
        <div className={styles["sp-page"]}>

            {/* Mobile Navbar */}
            <div className={styles["mobile-navbar"]}>
                <div className={styles.hamburger}>☰</div>
                <img src="/logo.png" alt="logo" className={styles["mobile-logo"]} />
            </div>

            <div className={styles.container}>

                {/* Breadcrumb */}
                <div className={styles.breadcrumbs}>
                    <button type="button" className={styles["breadcrumb-link"]} onClick={() => router.push("/")}>
                        Home
                    </button>
                    <span>›</span>
                    <button type="button" className={styles["breadcrumb-link"]} onClick={() => router.push("/dashboard")}>
                        Dashboard
                    </button>
                    <span>›</span>
                    <button
                        type="button"
                        className={styles["breadcrumb-link"]}
                        onClick={() => router.push("/departments/quality-control")}
                    >
                        Quality Control
                    </button>
                    <span>›</span>
                    <span className={styles.active}>
                        {checkingType || "Spinning Notebook QC"}
                    </span>
                </div>

                <h1 className={styles["sp-page-title"]}>
                    Quality Control - Spinning Notebook
                </h1>
                <p className={styles["sp-page-description"]}>
                    Record and manage industrial machine quality inspections.
                </p>

                <div className={styles["sp-card"]}>

                    <div className={styles["title-row"]}>
                        <MdEditNote className={styles["title-icon"]} />
                        <h3 className={styles.sectiontitle}>Inspection Data Entry</h3>
                    </div>

                    {/* FORM */}
                    <div className={styles["sp-form"]}>

                        {/* Top Row */}
                        <div className={styles.row}>
                            <div className={styles["sp-form-group"]}>
                                <label>Type</label>
                                <select
                                    className={styles["highlight-input"]}
                                    value={checkingType}
                                    onChange={handleTypeChange}
                                >
                                    <option value="">Select checking type</option>
                                    {checkingOptions.map((item) => (
                                        <option key={item}>{item}</option>
                                    ))}
                                </select>
                            </div>

                            <div className={styles["sp-form-group"]}>
                                <label>Date</label>
                                <input
                                    type="date"
                                    className={styles["highlight-input"]}
                                    value={date}
                                    onChange={(e) => setDate(e.target.value)}
                                    disabled={checkingType !== ""}
                                />
                            </div>

                            <div className={styles["sp-form-group"]}>
                                <label>Machine</label>
                                <select
                                    className={styles["highlight-input"]}
                                    value={selectedMachine}
                                    onChange={(e) => setSelectedMachine(e.target.value)}
                                >
                                    <option value="">Select Machine</option>
                                    {machineOptions.map((mc) => (
                                        <option key={mc}>{mc}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Employee Search Dropdown */}
                        <div className={`${styles["sp-form-group"]} ${styles["full-width"]}`} ref={dropdownRef}>
                            <label>Employee Name</label>
                            <div className={styles["search-dropdown"]}>
                                <div className={styles["input-wrapper"]}>
                                    <input
                                        type="text"
                                        placeholder="Search employee..."
                                        value={employeeSearch}
                                        onChange={(e) => { setEmployeeSearch(e.target.value); setShowEmployeeList(true); }}
                                        onFocus={() => setShowEmployeeList(true)}
                                        className={`${styles["highlight-input"]} ${styles["employee-input"]}`}
                                    />
                                </div>
                                {showEmployeeList && (
                                    <div className={styles["dropdown-list"]}>
                                        {filteredEmployees.length > 0
                                            ? filteredEmployees.map((emp, index) => (
                                                <div key={index} className={styles["dropdown-item"]} onClick={() => { setEmployeeSearch(emp); setShowEmployeeList(false); }}>
                                                    {emp}
                                                </div>
                                            ))
                                            : <div className={`${styles["dropdown-item"]} ${styles.disabled}`}>No employees found</div>}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Speed Checking Section */}
                        {checkingType === "Speed Checking" && (
                            <div className={styles["speed-section"]}>
                                <div className={styles.row}>
                                    <div className={styles["sp-form-group"]}>
                                        <label>Display Speed</label>
                                        <input
                                            type="number"
                                            placeholder="0.00"
                                            value={displaySpeed}
                                            onChange={(e) => setDisplaySpeed(e.target.value)}
                                            onWheel={(e) => e.target.blur()}
                                        />
                                    </div>

                                    <div className={styles["sp-form-group"]}>
                                        <label>Spindle Speed</label>
                                        <input
                                            type="number"
                                            placeholder="0.00"
                                            value={spindleSpeed}
                                            onChange={(e) => setSpindleSpeed(e.target.value)}
                                            onWheel={(e) => e.target.blur()}
                                        />
                                    </div>

                                    <div className={styles["sp-form-group"]}>
                                        <label>Difference</label>
                                        <input
                                            type="number"
                                            value={calculatedDifference}
                                            readOnly
                                            className={styles.readonly}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Side Measurements */}
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

                                    <input
                                        type="text"
                                        placeholder="Enter value..."
                                        value={lhsValue}
                                        onChange={(e) => setLhsValue(e.target.value)}
                                    />

                                    <div className={styles["remarks-header"]}>
                                        <span>LHS Remarks</span>
                                        <div className={styles["mobile-micicon"]}>
                                            <AiOutlineAudio className={styles["mic-icon"]} />
                                        </div>
                                    </div>

                                    <textarea
                                        placeholder="LHS specific notes..."
                                        value={lhsRemarks}
                                        maxLength={MAX_CHARS}
                                        onChange={(e) => setLhsRemarks(e.target.value)}
                                    />

                                    <div className={styles["char-count"]}>
                                        {lhsRemarks.length}/{MAX_CHARS}
                                    </div>
                                </div>

                                <div className={styles.side}>
                                    <div className={styles["side-header"]}>
                                        <label>RHS (Right Hand Side)</label>
                                        <span className={styles.required}>REQUIRED</span>
                                    </div>

                                    <input
                                        type="text"
                                        placeholder="Enter value..."
                                        value={rhsValue}
                                        onChange={(e) => setRhsValue(e.target.value)}
                                    />

                                    <div className={styles["remarks-header"]}>
                                        <span>RHS Remarks</span>
                                        <div className={styles["mobile-micicon"]}>
                                            <AiOutlineAudio className={styles["mic-icon"]} />
                                        </div>
                                    </div>

                                    <textarea
                                        placeholder="RHS specific notes..."
                                        value={rhsRemarks}
                                        maxLength={MAX_CHARS}
                                        onChange={(e) => setRhsRemarks(e.target.value)}
                                    />

                                    <div className={styles["char-count"]}>
                                        {rhsRemarks.length}/{MAX_CHARS}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>




                    {/* FOOTER */}
                    <div className={styles["card-footer-wrapper"]}>
                        <Footer
                            isMobile={isMobile}
                            onBack={() => router.push("/dashboard")}
                            onClear={handleClearForm}
                            onSave={handleSaveRecord}
                        />
                    </div>

                </div>
            </div>
        </div >
    );
}

export default SpinningDepartment;
