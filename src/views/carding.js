import { useState } from "react";
import { useRouter } from "next/router";
import { MdEditNote } from "react-icons/md";
import BetweenWithinCardEntry from "./carding/betweenWithinCardEntry";
import CardThickPlaceEntry from "./carding/cardThickPlaceEntry";
import TrialDepartment from "./carding/trialsDataEntry";
import NatiDataEntry from "./carding/natiDataEntry";
import styles from "./carding/cardThickPlaceEntry.module.css";

const cardingDepartmentTypes = [
    { id: 1, name: "Between & Within Card Data Entry" },
    { id: 2, name: "Card Thick Place Entry" },
    { id: 3, name: "Trials Data Entry Form" },
    { id: 4, name: "Nati Data Entry" },
];

function Carding() {
    const router = useRouter();
    const [checkingType, setCheckingType] = useState(null);

    const handleTypeChange = (value) => {
        const selectedType = cardingDepartmentTypes.find((item) => item.name === value);
        setCheckingType(selectedType?.id ?? null);
    };

    const selectedType = cardingDepartmentTypes.find((item) => item.id === checkingType)?.name || "";

    return (
        <div className={styles["card-page"]}>
            <div className={styles["card-container"]} id="card-container">
                <div className={styles["mobile-navbar"]}>
                    <div className={styles["hamburger"]}></div>
                    <img src="/logo.png" alt="Company Logo" />
                </div>

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
                    <span className={styles["card-breadcrumb-active"]}>Carding Notebook QC</span>
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
                </div>
            </div>
        </div>
    );
}

export default Carding;
