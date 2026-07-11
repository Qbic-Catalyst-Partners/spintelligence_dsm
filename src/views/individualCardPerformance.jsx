import TrialDepartment from "./carding/trialsDataEntry";
import useDatabaseEntryId from "@/hooks/useDatabaseEntryId";
import styles from "./carding/cardThickPlaceEntry.module.css";

const TYPE_NAME = "Individual Card performance Data";
const typeOptions = [
    { id: 0, name: TYPE_NAME, aliases: [TYPE_NAME, "Trials Data Entry Form", "Trials Data Entry", "Trials"] },
];
const ENTRY_ID_CONFIG = { prefix: "TRI", width: 4, routePath: "/carding/trials" };

export const INDIVIDUAL_CARD_PERFORMANCE_INPUT_SCREEN_COUNT = typeOptions.length;

function IndividualCardPerformance() {
    const currentDateLabel = new Date().toLocaleDateString("en-IN");
    const { entryId } = useDatabaseEntryId({
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
                    />
                </div>
            </div>
        </div>
    );
}

export default IndividualCardPerformance;
