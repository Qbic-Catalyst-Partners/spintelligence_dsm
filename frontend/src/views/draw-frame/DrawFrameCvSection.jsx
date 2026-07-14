import styles from "@/styles/draw-frame.module.css";
import { cvMachineOptions, emptyMetric } from "./constants";

function DrawFrameCvSection({
  form,
  handleFormChange,
  handleGenerate,
  handleCalculate,
  oneYardMetrics,
  halfYardMetrics,
  hasCalculated,
  handleMetricChange,
  setOneYardMetrics,
  setHalfYardMetrics,
}) {
  return (
    <>
      <div className={styles.field}>
        <label className={styles.label}>Date</label>
        <input
          type="date"
          value={form.date}
          onChange={(e) => handleFormChange("date", e.target.value)}
          className={styles.input}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Machine Number</label>
        <select
          value={form.machineNumber}
          onChange={(e) => handleFormChange("machineNumber", e.target.value)}
          className={styles.select}
        >
          <option value="">Select Machine Number</option>
          {cvMachineOptions.map((machine) => (
            <option key={machine} value={machine}>
              {machine}
            </option>
          ))}
        </select>
      </div>

      <div className={`${styles.field} ${styles.fieldWide}`}>
        <label className={styles.label}>Remarks (optional)</label>
        <textarea
          rows={4}
          value={form.remarks}
          onChange={(e) => handleFormChange("remarks", e.target.value)}
          className={styles.textarea}
        />
      </div>

      <div className={styles.fieldActions}>
        <div className={`${styles.field} ${styles.fieldGrow}`}>
          <label className={styles.label}>Number of Readings (N)</label>
          <input
            type="number"
            min="1"
            value={form.readingCount}
            onChange={(e) => handleFormChange("readingCount", e.target.value)}
            className={styles.input}
          />
        </div>
        <button
          type="button"
          onClick={handleGenerate}
          className={`${styles.button} ${styles.generateButton}`}
        >
          Generate
        </button>
      </div>

      <div className={styles.calculateWrap}>
        <button
          type="button"
          onClick={handleCalculate}
          className={`${styles.button} ${styles.calculateButton}`}
        >
          Calculate CV%
        </button>
      </div>

      <div className={styles.resultsWrap}>
        {(oneYardMetrics.length ? oneYardMetrics : [emptyMetric()]).map((_, index) => (
          <div key={`reading-result-${index}`} className={styles.readingBlock}>
            <h3 className={styles.readingTitle}>{`Reading - ${index + 1}`}</h3>

            <div className={styles.resultCard}>
              <div className={styles.resultSection}>
                <h4 className={styles.resultTitle}>Calculation Results - 1 yard Readings</h4>
                <div className={styles.metricsGrid}>
                  <div className={styles.field}>
                    <label className={styles.label}>AVG (1 Yard)</label>
                    <input
                      value={oneYardMetrics[index]?.avg || ""}
                      onChange={(e) => handleMetricChange(setOneYardMetrics, index, "avg", e.target.value)}
                      className={styles.metricInput}
                    />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>HANK (1 Yard)</label>
                    <input
                      value={oneYardMetrics[index]?.hank || ""}
                      onChange={(e) => handleMetricChange(setOneYardMetrics, index, "hank", e.target.value)}
                      className={styles.metricInput}
                    />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>SD (1 Yard)</label>
                    <input
                      value={oneYardMetrics[index]?.sd || ""}
                      onChange={(e) => handleMetricChange(setOneYardMetrics, index, "sd", e.target.value)}
                      className={styles.metricInput}
                    />
                  </div>
                </div>
                <div className={styles.metricCompact}>
                  <div className={styles.field}>
                    <label className={styles.label}>CV% (1 Yard)</label>
                    <input
                      readOnly
                      value={hasCalculated ? oneYardMetrics[index]?.cv || "" : ""}
                      className={styles.metricInput}
                    />
                  </div>
                </div>
              </div>

              <div className={styles.resultSection}>
                <h4 className={styles.resultTitle}>Calculation Results - 1/2 yard Readings</h4>
                <div className={styles.metricsGrid}>
                  <div className={styles.field}>
                    <label className={styles.label}>AVG (1/2 Yard)</label>
                    <input
                      value={halfYardMetrics[index]?.avg || ""}
                      onChange={(e) => handleMetricChange(setHalfYardMetrics, index, "avg", e.target.value)}
                      className={styles.metricInput}
                    />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>HANK (1/2 Yard)</label>
                    <input
                      value={halfYardMetrics[index]?.hank || ""}
                      onChange={(e) => handleMetricChange(setHalfYardMetrics, index, "hank", e.target.value)}
                      className={styles.metricInput}
                    />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>SD (1/2 Yard)</label>
                    <input
                      value={halfYardMetrics[index]?.sd || ""}
                      onChange={(e) => handleMetricChange(setHalfYardMetrics, index, "sd", e.target.value)}
                      className={styles.metricInput}
                    />
                  </div>
                </div>
                <div className={styles.metricCompact}>
                  <div className={styles.field}>
                    <label className={styles.label}>CV% (1/2 Yard)</label>
                    <input
                      readOnly
                      value={hasCalculated ? halfYardMetrics[index]?.cv || "" : ""}
                      className={styles.metricInput}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export default DrawFrameCvSection;
