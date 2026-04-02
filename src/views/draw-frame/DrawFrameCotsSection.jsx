import styles from "@/styles/draw-frame.module.css";
import {
  cvMachineOptions,
  processTypeOptions,
  shiftOptions,
} from "./constants";

function DrawFrameCotsSection({
  form,
  handleFormChange,
  machineEntries,
  handleMachineChange,
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
        <label className={styles.label}>Shift</label>
        <select
          value={form.shift}
          onChange={(e) => handleFormChange("shift", e.target.value)}
          className={styles.select}
        >
          {shiftOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Type</label>
        <select
          value={form.processType}
          onChange={(e) => handleFormChange("processType", e.target.value)}
          className={styles.select}
        >
          {processTypeOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.machineSection}>
        <h3 className={styles.machineSectionTitle}>Machine-Specific Data</h3>

        <div className={styles.machineCardList}>
          {machineEntries.map((machine, index) => (
            <div key={`machine-card-${index}`} className={styles.machineCard}>
              <div className={styles.machineNameRow}>
                <label className={styles.machineNameLabel}>MC Name :</label>
                <span className={styles.machineNameValue}>{machine.machineName}</span>
              </div>

              <div className={styles.machineGrid}>
                <div className={styles.field}>
                  <label className={styles.label}>Fan Waste</label>
                  <input
                    value={machine.fanWaste}
                    onChange={(e) => handleMachineChange(index, "fanWaste", e.target.value)}
                    className={styles.input}
                  />
                </div>

                <div className={styles.field}>
                  <label className={styles.label}>Cot Change</label>
                  <input
                    value={machine.cotChange}
                    onChange={(e) => handleMachineChange(index, "cotChange", e.target.value)}
                    className={styles.input}
                  />
                </div>

                <div className={styles.field}>
                  <label className={styles.label}>Stripper W</label>
                  <input
                    value={machine.stripperWaste}
                    onChange={(e) => handleMachineChange(index, "stripperWaste", e.target.value)}
                    className={styles.input}
                  />
                </div>

                {form.processType === "Finisher" ? (
                  <>
                    <div className={styles.field}>
                      <label className={styles.label}>Thick Place</label>
                      <input
                        value={machine.thickPlace}
                        onChange={(e) => handleMachineChange(index, "thickPlace", e.target.value)}
                        className={styles.input}
                      />
                    </div>

                    <div className={styles.field}>
                      <label className={styles.label}>Auto Level</label>
                      <input
                        value={machine.autoLevel}
                        onChange={(e) => handleMachineChange(index, "autoLevel", e.target.value)}
                        className={styles.input}
                      />
                    </div>

                    <div className={styles.field}>
                      <label className={styles.label}>Silver Mon</label>
                      <input
                        value={machine.silverMon}
                        onChange={(e) => handleMachineChange(index, "silverMon", e.target.value)}
                        className={styles.input}
                      />
                    </div>

                    <div className={styles.field}>
                      <label className={styles.label}>Mass Thick</label>
                      <input
                        value={machine.massThick}
                        onChange={(e) => handleMachineChange(index, "massThick", e.target.value)}
                        className={styles.input}
                      />
                    </div>

                    <div className={styles.field}>
                      <label className={styles.label}>Scanning R</label>
                      <input
                        value={machine.scanningR}
                        onChange={(e) => handleMachineChange(index, "scanningR", e.target.value)}
                        className={styles.input}
                      />
                    </div>
                  </>
                ) : (
                  <div className={`${styles.field} ${styles.machineFieldCompact}`}>
                    <label className={styles.label}>Thick Place</label>
                    <input
                      value={machine.thickPlace}
                      onChange={(e) => handleMachineChange(index, "thickPlace", e.target.value)}
                      className={styles.input}
                    />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export default DrawFrameCotsSection;
