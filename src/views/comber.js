import { useState } from "react";
import { useRouter } from "next/router";
import { MdEditNote } from "react-icons/md";
import RibbonLapCVDataEntry from "./comber/ribbonLapCVDataEntry";
import NatiDataEntry from "./comber/natiDataEntry";
import styles from "./comber/ribbonLapCVDataEntry.module.css";

const comberDepartmentTypes = [
    {
        id: 1,
        name: "Ribbon Lap CV Data Entry",
    },
    {
        id: 2,
        name: "Nati Data Entry",
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

                    {selectedType === "Nati Data Entry" ? (
                        <NatiDataEntry
                            types={comberDepartmentTypes}
                            selectedType={selectedType}
                            onTypeChange={handleTypeChange}
                            showForm={Boolean(checkingType)}
                        />
                    ) : (
                        <RibbonLapCVDataEntry
                            types={comberDepartmentTypes}
                            selectedType={selectedType}
                            onTypeChange={handleTypeChange}
                            showForm={Boolean(checkingType)}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}

export default Comber;
