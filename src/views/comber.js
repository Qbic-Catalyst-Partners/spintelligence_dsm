import { useState } from "react";
import { useRouter } from "next/router";
import { MdEditNote } from "react-icons/md";
import RibbonLapCVDataEntry from "./comber/ribbonLapCVDataEntry";
import NatiDataEntry from "./comber/natiDataEntry";
import styles from "./comber/ribbonLapCVDataEntry.module.css";
import UPercentDataEntry from "./carding/u%dataentry";
const comberDepartmentTypes = [
    {
        id: 1,
        name: "Ribbon Lap CV Data Entry",
    },
    {
        id: 2,
        name: "Nati Data Entry",
    },
    {
        id: 3,
        name: "U% Data Entry",
    },
];
function Comber() {
    const router = useRouter();
    const [checkingType, setCheckingType] = useState(null);

    const handleTypeChange = (value) => {
        const selectedType = comberDepartmentTypes.find((item) => item.name === value);
        setCheckingType(selectedType?.id ?? null);
    };

    const selectedType = comberDepartmentTypes.find((item) => item.id === checkingType)?.name || "";

    return (
        <div className={styles["cb-page"]}>
            <div className={styles["cb-container"]} id="car-container">
                <div className={styles["mobile-navbar"]}>
                    <div className={styles["hamburger"]}></div>
                    <img src="/logo.png" alt="Company Logo" />
                </div>

                <div className={styles["cb-breadcrumbs"]}>
                    <button
                        type="button"
                        className={styles["cb-breadcrumb-link"]}
                        onClick={() => router.push("/")}
                    >
                        Home
                    </button>
                    <span>&rsaquo;</span>
                    <button
                        type="button"
                        className={styles["cb-breadcrumb-link"]}
                        onClick={() => router.push("/dashboard")}
                    >
                        Dashboard
                    </button>
                    <span>&rsaquo;</span>
                    <button
                        type="button"
                        className={styles["cb-breadcrumb-link"]}
                        onClick={() => router.push("/departments/quality-control")}
                    >
                        Quality Control
                    </button>
                    <span>&rsaquo;</span>
                    <span className={styles["cb-breadcrumb-active"]}>Comber Notebook QC</span>
                </div>

                <div className={styles["cb-header"]}>
                    <h1>Quality Control - Comber Notebook</h1>
                    <p>Record and manage industrial machine quality inspections.</p>
                </div>

                <div className={styles["cb-card"]}>
                    <div className={styles["cb-form-title"]}>
                        <MdEditNote id="car-title-icon" />
                        <h3>Inspection Data Entry</h3>
                    </div>

                   {selectedType === "Nati Data Entry" && (
    <NatiDataEntry
        types={comberDepartmentTypes}
        selectedType={selectedType}
        onTypeChange={handleTypeChange}
        showForm={Boolean(checkingType)}
    />
)}

{selectedType === "U% Data Entry" && (
    <UPercentDataEntry
        types={comberDepartmentTypes}
        selectedType={selectedType}
        onTypeChange={handleTypeChange}
    />
)}

{(!selectedType || selectedType === "Ribbon Lap CV Data Entry") && (
    <RibbonLapCVDataEntry
        types={comberDepartmentTypes}
        selectedType={selectedType}
        onTypeChange={handleTypeChange}
        showForm={Boolean(checkingType)}
    />
)}
                  
                </div>
                    {selectedType === "U% Data Entry" && (
    <div
        style={{
            marginTop: "20px",
            background: "#fff",
            borderRadius: "10px",
            padding: "16px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
            overflowX: "auto",
        }}
    >
        <h3
            style={{
                marginBottom: "12px",
                fontSize: "18px",
                fontWeight: "600",
                color: "#333",
            }}
        >
            Last 10 Entries
        </h3>

        <table
            style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "14px",
                minWidth: "900px",
            }}
        >
            <thead style={{ backgroundColor: "#f4f6f8" }}>
                <tr>
                    {[
                        "Date",
                        "Shift",
                        "Variety",
                        "Department",
                        "MC No.",
                        "U%",
                        "CVM",
                        "1mCVM",
                        "3mCVM",
                        "Remarks",
                    ].map((head) => (
                        <th
                            key={head}
                            style={{
                                padding: "12px 10px",
                                textAlign: "left",
                                fontWeight: "600",
                                color: "#444",
                                borderBottom: "2px solid #e0e0e0",
                                whiteSpace: "nowrap",
                            }}
                        >
                            {head}
                        </th>
                    ))}
                </tr>
            </thead>

            <tbody>
                {[...Array(10)].map((_, i) => (
                    <tr
                        key={i}
                        style={{
                            backgroundColor: i % 2 === 0 ? "#fff" : "#fafafa",
                        }}
                    >
                        {[
                            "02/04/2026",
                            "General",
                            "WPSF 0.90",
                            "FR Drawing",
                            "FR DSS-1",
                            "1.32",
                            "1.67",
                            "0.32",
                            "1.55",
                            "Sample remark text",
                        ].map((cell, idx) => (
                            <td
                                key={idx}
                                style={{
                                    padding: "10px",
                                    borderBottom: "1px solid #eaeaea",
                                    color: idx === 5 ? "#1976d2" : "#555",
                                    fontWeight: idx === 5 ? "600" : "400",
                                }}
                            >
                                {cell}
                            </td>
                        ))}
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
)}
            </div>
        
        </div>
    );
}

export default Comber;
