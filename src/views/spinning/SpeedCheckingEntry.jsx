import { AiOutlineAudio } from "react-icons/ai";
import { sanitizeNumericInput } from "@/utils/inputValidation";

const DECIMAL_10_2_CONFIG = { precision: 10, scale: 2 };

function SpeedCheckingEntry({
    styles,
    displaySpeed,
    setDisplaySpeed,
    spindleSpeed,
    setSpindleSpeed,
    calculatedDifference,
    lhsValue,
    setLhsValue,
    lhsRemarks,
    setLhsRemarks,
    rhsValue,
    setRhsValue,
    rhsRemarks,
    setRhsRemarks,
    maxChars,
}) {
    return (
        <>
            <div className={styles["speed-section"]}>
                <div className={styles.row}>
                    <div className={styles["sp-form-group"]}>
                        <label>Display Speed</label>
                        <input type="text" inputMode="decimal" placeholder="0.00" value={displaySpeed} onChange={(e) => setDisplaySpeed(sanitizeNumericInput(e.target.value, DECIMAL_10_2_CONFIG))} />
                    </div>
                    <div className={styles["sp-form-group"]}>
                        <label>Spindle Speed</label>
                        <input type="text" inputMode="decimal" placeholder="0.00" value={spindleSpeed} onChange={(e) => setSpindleSpeed(sanitizeNumericInput(e.target.value, DECIMAL_10_2_CONFIG))} />
                    </div>
                    <div className={styles["sp-form-group"]}>
                        <label>Difference</label>
                        <input type="text" inputMode="decimal" value={calculatedDifference} readOnly className={styles.readonly} />
                    </div>
                </div>
            </div>

            <div className={styles["comparison-box"]}>
                <div className={styles["side-title-row"]}>
                    <span className={styles["side-title"]}>SIDE MEASUREMENTS</span>
                </div>

                <div className={styles["comparison-row"]}>
                    <div className={styles.side}>
                        <div className={styles["side-header"]}>
                            <label>LHS (Left Hand Side)</label>
                            <span className={styles.required}>REQUIRED</span>
                        </div>
                        <input type="text" inputMode="decimal" placeholder="Enter value..." value={lhsValue} onChange={(e) => setLhsValue(sanitizeNumericInput(e.target.value, DECIMAL_10_2_CONFIG))} />
                        <div className={styles["remarks-header"]}>
                            <span>LHS Remarks</span>
                            <AiOutlineAudio className={styles["mic-icon"]} />
                        </div>
                        <textarea placeholder="LHS specific notes..." value={lhsRemarks} maxLength={maxChars} onChange={(e) => setLhsRemarks(e.target.value)} />
                        <div className={styles["char-count"]}>{lhsRemarks.length}/{maxChars}</div>
                    </div>

                    <div className={styles.side}>
                        <div className={styles["side-header"]}>
                            <label>RHS (Right Hand Side)</label>
                            <span className={styles.required}>REQUIRED</span>
                        </div>
                        <input type="text" inputMode="decimal" placeholder="Enter value..." value={rhsValue} onChange={(e) => setRhsValue(sanitizeNumericInput(e.target.value, DECIMAL_10_2_CONFIG))} />
                        <div className={styles["remarks-header"]}>
                            <span>RHS Remarks</span>
                            <AiOutlineAudio className={styles["mic-icon"]} />
                        </div>
                        <textarea placeholder="RHS specific notes..." value={rhsRemarks} maxLength={maxChars} onChange={(e) => setRhsRemarks(e.target.value)} />
                        <div className={styles["char-count"]}>{rhsRemarks.length}/{maxChars}</div>
                    </div>
                </div>
            </div>
        </>
    );
}

export default SpeedCheckingEntry;
