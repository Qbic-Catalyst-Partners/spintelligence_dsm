import styles from "@/styles/draw-frame.module.css";
import {
  cvMachineOptions,
  processTypeOptions,
  shiftOptions,
  cleanUncleanOptions,
  onOffOptions,
  yesNoOptions,
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
                  <div className={styles.radioGroup}>
                    {cleanUncleanOptions.map((option) => (
                      <label key={option} className={styles.radioOption}>
                        <input
                          type="radio"
                          name={`fanWaste-${index}`}
                          value={option}
                          checked={machine.fanWaste === option}
                          onChange={(e) => handleMachineChange(index, "fanWaste", e.target.value)}
                        />
                        <span>{option}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className={styles.field}>
                  <label className={styles.label}>Cot Change</label>
                  <div className={styles.radioGroup}>
                    {yesNoOptions.map((option) => (
                      <label key={option} className={styles.radioOption}>
                        <input
                          type="radio"
                          name={`cotChange-${index}`}
                          value={option}
                          checked={machine.cotChange === option}
                          onChange={(e) => handleMachineChange(index, "cotChange", e.target.value)}
                        />
                        <span>{option}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className={styles.field}>
                  <label className={styles.label}>Stripper Waste</label>
                  <div className={styles.radioGroup}>
                    {cleanUncleanOptions.map((option) => (
                      <label key={option} className={styles.radioOption}>
                        <input
                          type="radio"
                          name={`stripperWaste-${index}`}
                          value={option}
                          checked={machine.stripperWaste === option}
                          onChange={(e) => handleMachineChange(index, "stripperWaste", e.target.value)}
                        />
                        <span>{option}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {form.processType === "Finisher" ? (
                  <>
                    <div className={styles.field}>
                      <label className={styles.label}>Mass Thick Place</label>
                      <input
                        value={machine.thickPlace}
                        onChange={(e) => handleMachineChange(index, "thickPlace", e.target.value)}
                        className={styles.input}
                        inputMode="decimal"
                        type="number"
                        step="any"
                      />
                    </div>

                    <div className={styles.field}>
                      <label className={styles.label}>Auto Leveller Status</label>
                      <div className={styles.radioGroup}>
                        {onOffOptions.map((option) => (
                          <label key={option} className={styles.radioOption}>
                            <input
                              type="radio"
                              name={`autoLevel-${index}`}
                              value={option}
                              checked={machine.autoLevel === option}
                              onChange={(e) => handleMachineChange(index, "autoLevel", e.target.value)}
                            />
                            <span>{option}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className={styles.field}>
                      <label className={styles.label}>Silver Monitor</label>
                      <div className={styles.radioGroup}>
                        {onOffOptions.map((option) => (
                          <label key={option} className={styles.radioOption}>
                            <input
                              type="radio"
                              name={`silverMon-${index}`}
                              value={option}
                              checked={machine.silverMon === option}
                              onChange={(e) => handleMachineChange(index, "silverMon", e.target.value)}
                            />
                            <span>{option}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className={styles.field}>
                      <label className={styles.label}>Mass Thick Place</label>
                      <input
                        value={machine.massThick}
                        onChange={(e) => handleMachineChange(index, "massThick", e.target.value)}
                        className={styles.input}
                        inputMode="decimal"
                        type="number"
                        step="any"
                      />
                    </div>

                    <div className={styles.field}>
                      <label className={styles.label}>Scanning Roller Area</label>
                      <div className={styles.radioGroup}>
                        {cleanUncleanOptions.map((option) => (
                          <label key={option} className={styles.radioOption}>
                            <input
                              type="radio"
                              name={`scanningR-${index}`}
                              value={option}
                              checked={machine.scanningR === option}
                              onChange={(e) => handleMachineChange(index, "scanningR", e.target.value)}
                            />
                            <span>{option}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className={`${styles.field} ${styles.machineFieldCompact}`}>
                    <label className={styles.label}>Mass Thick Place</label>
                    <input
                      value={machine.thickPlace}
                      onChange={(e) => handleMachineChange(index, "thickPlace", e.target.value)}
                      className={styles.input}
                      inputMode="decimal"
                      type="number"
                      step="any"
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
