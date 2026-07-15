import { useEffect, useState } from "react";
import TrialDepartment from "./carding/trialsDataEntry";
import useDatabaseEntryId from "@/hooks/useDatabaseEntryId";
import styles from "./carding/cardThickPlaceEntry.module.css";

const TYPE_NAME = "Individual Card performance Data";
const typeOptions = [
    { id: 0, name: TYPE_NAME, aliases: [TYPE_NAME, "Trials Data Entry Form", "Trials Data Entry", "Trials"] },
];
// trials.js is mounted at plain /trials (backend/server.js), never under /carding — this wrong
// path meant entry_id reservation for this screen has never actually worked.
const ENTRY_ID_CONFIG = { prefix: "TRI", width: 4, routePath: "/trials" };

export const INDIVIDUAL_CARD_PERFORMANCE_INPUT_SCREEN_COUNT = typeOptions.length;

function IndividualCardPerformance() {
    const [currentDateLabel, setCurrentDateLabel] = useState("");
    useEffect(() => {
        setCurrentDateLabel(new Date().toLocaleDateString("en-IN"));
    }, []);
    const { entryId, reserveEntryId } = useDatabaseEntryId({
        department: "Individual Card Performance",
        typeName: TYPE_NAME,
        config: ENTRY_ID_CONFIG,
    });

    return (
        <div className={styles["card-page"]}>
            <div className={styles["card-container"]}>
                <div className={styles["card-header"]}>
                    <h1>Quality Control - Individual Card Performance Notebook</h1>
                    <div className="mt-2 text-right text-base font-bold text-slate-800 dark:text-white">Current Date: {currentDateLabel}</div>
                </div>

                <div className={styles["card-shell"]}>
                    <TrialDepartment
                        types={typeOptions}
                        selectedType={TYPE_NAME}
                        onTypeChange={() => {}}
                        showForm
                        entryId={entryId}
                        reserveEntryId={reserveEntryId}
                    />
                </div>
            </div>
        </div>
    );
}

export default IndividualCardPerformance;
