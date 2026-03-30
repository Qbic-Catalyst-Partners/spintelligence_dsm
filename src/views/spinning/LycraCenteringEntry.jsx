import { AiOutlineAudio } from "react-icons/ai";

function LycraCenteringEntry({
    styles,
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
                    <input type="text" placeholder="Enter value..." value={lhsValue} onChange={(e) => setLhsValue(e.target.value)} />
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
                    <input type="text" placeholder="Enter value..." value={rhsValue} onChange={(e) => setRhsValue(e.target.value)} />
                    <div className={styles["remarks-header"]}>
                        <span>RHS Remarks</span>
                        <AiOutlineAudio className={styles["mic-icon"]} />
                    </div>
                    <textarea placeholder="RHS specific notes..." value={rhsRemarks} maxLength={maxChars} onChange={(e) => setRhsRemarks(e.target.value)} />
                    <div className={styles["char-count"]}>{rhsRemarks.length}/{maxChars}</div>
                </div>
            </div>
        </div>
    );
}

export default LycraCenteringEntry;
