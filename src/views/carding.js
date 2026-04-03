import { useState } from "react";
import { useRouter } from "next/router";
import { MdEditNote } from "react-icons/md";

import BetweenWithinCardEntry from "./carding/betweenWithinCardEntry";
import CardingDfk from "./carding/cardingdfk";
import CardThickPlaceEntry from "./carding/cardThickPlaceEntry";
import TrialDepartment from "./carding/trialsDataEntry";
import NatiDataEntry from "./carding/natiDataEntry";
import UPercentDataEntry from "./carding/u%dataentry";

import styles from "./carding/cardThickPlaceEntry.module.css";

const cardingDepartmentTypes = [
    { id: 1, name: "Between & Within Card Data Entry" },
    { id: 2, name: "Card Thick Place Entry" },
    { id: 3, name: "Trials Data Entry Form" },
    { id: 4, name: "Nati Data Entry" },
    { id: 5, name: "U% Data Entry" },
    { id: 6, name: "Card DFK Pressure Checking" },
];

function Carding() {
    const router = useRouter();
    const [checkingType, setCheckingType] = useState(null);

    const handleTypeChange = (value) => {
        const selected = cardingDepartmentTypes.find(
            (item) => item.name === value
        );
        setCheckingType(selected?.id ?? null);
    };

    const selectedType =
        cardingDepartmentTypes.find((item) => item.id === checkingType)?.name || "";

    return (
        <div className={styles["card-page"]}>
            <div className={styles["card-container"]}>
                <div className={styles["card-breadcrumbs"]}>
                    <button
                        type="button"
                        className={styles["card-breadcrumb-link"]}
                        onClick={() => router.push("/")}
                    >
                        Home
                    </button>
                    <span>&rsaquo;</span>
                    <button
                        type="button"
                        className={styles["card-breadcrumb-link"]}
                        onClick={() => router.push("/dashboard")}
                    >
                        Dashboard
                    </button>
                    <span>&rsaquo;</span>
                    <button
                        type="button"
                        className={styles["card-breadcrumb-link"]}
                        onClick={() => router.push("/departments/quality-control")}
                    >
                        Quality Control
                    </button>
                    <span>&rsaquo;</span>
                    <span className={styles["card-breadcrumb-active"]}>
                        {selectedType || "Carding Notebook QC"}
                    </span>
                </div>

                <div className={styles["card-header"]}>
                    <h1>Quality Control - Carding Notebook</h1>
                    <p>Record and manage industrial machine quality inspections.</p>
                </div>

                <div className={styles["card-shell"]}>
                    <div className={styles["card-form-title"]}>
                        <MdEditNote />
                        <h3>Inspection Data Entry</h3>
                    </div>

                    {selectedType === "Between & Within Card Data Entry" && (
                        <BetweenWithinCardEntry
                            types={cardingDepartmentTypes}
                            selectedType={selectedType}
                            onTypeChange={handleTypeChange}
                            showForm
                        />
                    )}

                    {selectedType === "Trials Data Entry Form" && (
                        <TrialDepartment
                            types={cardingDepartmentTypes}
                            selectedType={selectedType}
                            onTypeChange={handleTypeChange}
                            showForm
                        />
                    )}

                    {selectedType === "Nati Data Entry" && (
                        <NatiDataEntry
                            types={cardingDepartmentTypes}
                            selectedType={selectedType}
                            onTypeChange={handleTypeChange}
                            showForm
                        />
                    )}

                    {selectedType === "Card Thick Place Entry" || !selectedType ? (
                        <CardThickPlaceEntry
                            types={cardingDepartmentTypes}
                            selectedType={selectedType}
                            onTypeChange={handleTypeChange}
                            showForm={selectedType === "Card Thick Place Entry"}
                        />
                    ) : null}

                    {selectedType === "U% Data Entry" && (
                        <UPercentDataEntry
                            types={cardingDepartmentTypes}
                            selectedType={selectedType}
                            onTypeChange={handleTypeChange}
                        />
                    )}

                    {selectedType === "Card DFK Pressure Checking" && (
                        <CardingDfk
                            types={cardingDepartmentTypes}
                            selectedType={selectedType}
                            onTypeChange={handleTypeChange}
                        />
                    )}
                </div>

                {selectedType === "U% Data Entry" && (
                    <div
                        style={{
                            margin: "20px auto 0",
                            maxWidth: "1120px",
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
                                            "Lorem Ipsum is simply dummy",
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

export default Carding;
