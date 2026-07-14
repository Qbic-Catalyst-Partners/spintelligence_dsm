import { forwardRef, useImperativeHandle, useMemo, useState } from "react";
import CustomInput from "@/components/CustomInput";
import SearchableSelect from "@/components/SearchableSelect";
import styles from "@/styles/opennessDataEntry.module.css";
import { mixingOpennessDataEntry } from "@/apis/mixing";
import { sanitizeIntegerInput, sanitizeNumericInput } from "@/utils/inputValidation";

const MACHINE_NAME_OPTIONS = [
  "Circular Bale Pulker",
  "MPM",
  "MO",
  "RK",
  "Flexi cleaner",
  "KB",
  "GBR",
  "Vario clean",
  "Chute opening roller",
];

const initialForm = {
  entries: "",
};

const parseNumber = (value) => {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const BASE_AOV = 0.649350649;

const STAGE_OPTIONS = [
  "Circular bale pulker",
  "MPM",
  "MO",
  "RK",
  "Flexi cleaner",
  "KB",
  "GBR",
  "Vario clean",
  "Chute opening roller",
];

const createStages = (totalEntries) => {
  const stages = [];
  let remaining = totalEntries;
  let stageIndex = 0;

  while (remaining > 0) {
    const rowCount = Math.min(5, remaining);

      stages.push({
        stageName: "",
        beaterType: "",
        beaterSpeed: "",
        rows: Array.from({ length: rowCount }, () => ({
          weight: "",
          vol1: "",
          vol2: "",
          avgVol: "",
          asv: "",
          aov: "",
        })),
      avgWeight: "",
      avgVol: "",
      avgAsv: "",
      avgAov: "",
      openness: "",
    });

    remaining -= rowCount;
    stageIndex++;
  }

  return stages;
};

function ReadOnlyField({ label, value }) {
  return (
    <div className="flex flex-col gap-1.5 min-w-0 w-full">
      <label className="text-[14px] font-semibold text-slate-700 truncate">
        {label}
      </label>
      <input
        type="text"
        value={value}
        readOnly
        className="w-full h-9.5 px-3 py-2 border border-slate-200 rounded-lg bg-slate-100 text-[14px] focus:outline-none"
      />
    </div>
  );
}

const OpennessDataEntry = forwardRef(function OpennessDataEntry(
  { date, target, onTargetChange, targetError, brLine, onSubmitSuccess, entryId = "" },
  ref
) {
  const [form, setForm] = useState(initialForm);
  const [stages, setStages] = useState([]);
  const [overallOpen, setOverallOpen] = useState("");
  const [errors, setErrors] = useState({});

  const handleFormChange = (field, value) => {
    const nextValue = field === "entries" ? sanitizeIntegerInput(value, 9) : value;

    setForm((current) => ({
      ...current,
      [field]: nextValue,
    }));
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const handleGenerate = () => {
    const totalEntries = Number(form.entries);

    setStages(createStages(totalEntries));
    setOverallOpen("");
    setErrors((prev) => ({ ...prev, entries: !form.entries }));
  };

  const handleRowChange = (stageIndex, rowIndex, field, value) => {
    const nextValue = sanitizeNumericInput(value, { precision: 10, scale: 2 });
    setErrors((prev) => {
      const key = `stage-${stageIndex}-row-${rowIndex}-${field}`;
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });

    setStages((current) => {
      const updated = current.map((stage, currentStageIndex) => {
        const updatedRows = stage.rows.map((row, currentRowIndex) => {
          if (currentStageIndex === stageIndex && currentRowIndex === rowIndex) {
            const nextRow = { ...row, [field]: nextValue };

            const weight = parseNumber(nextRow.weight);
            const volumeOne = parseNumber(nextRow.vol1);
            const volumeTwo = parseNumber(nextRow.vol2);

            if (weight > 0 && volumeOne > 0 && volumeTwo > 0) {
              const avgVolume = (volumeOne + volumeTwo) / 2;
              const apparentSpecificVolume = (avgVolume / weight);
              const actualOpennessValue = ((apparentSpecificVolume - BASE_AOV) / BASE_AOV).toFixed(2);
              nextRow.avgVol = avgVolume.toFixed(2);
              nextRow.asv = apparentSpecificVolume.toFixed(2);
              nextRow.aov = actualOpennessValue;
            } else {
              nextRow.avgVol = "";
              nextRow.asv = "";
              nextRow.aov = "";
            }

            return nextRow;
          }
          return row;
        });

        let totalWeight = 0;
        let totalVol = 0;
        let totalAsv = 0;
        let totalAov = 0;
        let validRows = 0;

        updatedRows.forEach((row) => {
          const weight = parseNumber(row.weight);
          const vol1 = parseNumber(row.vol1);
          const vol2 = parseNumber(row.vol2);
          const avgVolume = parseNumber(row.avgVol);

          if (weight > 0 && vol1 > 0 && vol2 > 0) {
            const apparentSpecificVolume = parseNumber(row.asv);
            totalWeight += weight;
            totalVol += avgVolume;
            totalAsv += apparentSpecificVolume;
            totalAov += parseNumber(row.aov);
            validRows += 1;
          }
        });

        const avgWeight = validRows ? (totalWeight / validRows).toFixed(2) : "";
        const avgVol = validRows ? (totalVol / validRows).toFixed(2) : "";
        const avgAsv = validRows ? (totalAsv / validRows).toFixed(2) : "";
        const avgAov = validRows ? (totalAov / validRows).toFixed(2) : "";
        return { ...stage, rows: updatedRows, avgWeight, avgVol, avgAsv, avgAov, openness: "" };
      });

      const withOpenness = updated.map((stage, stageIndex) => {
        if (stageIndex === 0 || stageIndex === updated.length - 1 || stage.avgAov === "") {
          return { ...stage, openness: "" };
        }

        const previousStageAvgAov = parseNumber(updated[stageIndex - 1].avgAov);
        if (previousStageAvgAov === 0) {
          return { ...stage, openness: "" };
        }

        const openness = (((parseNumber(stage.avgAov) - previousStageAvgAov) / previousStageAvgAov) * 100).toFixed(2);
        return { ...stage, openness };
      });

      const firstStage = withOpenness[0];
      const lastStage = withOpenness[withOpenness.length - 1];
      const firstAov = firstStage ? parseNumber(firstStage.avgAov) : 0;
      const lastAov = lastStage ? parseNumber(lastStage.avgAov) : 0;
      const overall =
        firstAov > 0 && lastAov > 0
          ? (((lastAov - firstAov) / lastAov) * 100).toFixed(2)
          : "";
      setOverallOpen(overall);

      return withOpenness;
    });
  };

  const handleStageNameChange = (stageIndex, value) => {
    setStages((current) =>
      current.map((stage, currentStageIndex) =>
        currentStageIndex === stageIndex ? { ...stage, stageName: value } : stage
      )
    );
  };

  const handleStageFieldChange = (stageIndex, field, value) => {
    const nextValue = field === "beaterSpeed" ? sanitizeNumericInput(value, { precision: 10, scale: 2 }) : value;
    setStages((current) =>
      current.map((stage, currentStageIndex) =>
        currentStageIndex === stageIndex ? { ...stage, [field]: nextValue } : stage
      )
    );
  };

  const canSubmit = useMemo(() => {
    if (!date || !String(target || "").trim() || !form.entries.trim()) return false;
    if (!stages.length) return false;

    return stages.every(
      (stage) =>
        stage.stageName !== "" &&
        stage.rows.every((row) => row.weight !== "" && row.vol1 !== "" && row.vol2 !== "" && row.avgVol !== "") &&
        stage.avgWeight !== "" &&
        stage.avgVol !== "" &&
        stage.avgAsv !== "" &&
        stage.avgAov !== "" &&
        (stage === stages[0] || stage === stages[stages.length - 1] ? true : stage.openness !== "")
    );
  }, [date, target, form, stages]);

  const handleClear = () => {
    setForm(initialForm);
    setStages([]);
    setOverallOpen("");
    setErrors({});
  };

  const buildPayload = () => ({
    entry_id: entryId || undefined,
    inspection_date: date,
    br_line: brLine || "",
    actual_specific_volume_target: Number(target),
    no_of_entries: Number(form.entries),
    entries: stages.flatMap((stage) =>
      stage.rows.map((row) => ({
        machine_name: stage.stageName,
        beater_type: stage.beaterType,
        beater_speed_rpm: Number(stage.beaterSpeed) || 0,
        weight: Number(row.weight),
        volume_1: Number(row.vol1),
        volume_2: Number(row.vol2),
        apparent_specific_volume: Number(row.asv),
        actual_op_value: Number(row.aov),
      }))
    ),
  });

  const handleSubmit = async () => {
    try {
      await mixingOpennessDataEntry(buildPayload());
      handleClear();
      onSubmitSuccess?.();
    } catch (error) {
      alert(error.message || "Failed to save");
    }
  };

  const getPreviewData = () => {
    const header = [
      { label: "Date", value: date },
      { label: "B/R Line No", value: brLine },
      { label: "Target (ASV)", value: target },
      { label: "Entries (N)", value: form.entries },
    ];

    const stageMeta = stages.flatMap((stage, stageIndex) => [
      { label: `${stage.stageName || `Stage ${stageIndex + 1}`} - Beater Type`, value: stage.beaterType },
      { label: `${stage.stageName || `Stage ${stageIndex + 1}`} - Beater Speed (RPM)`, value: stage.beaterSpeed },
    ]);

    const stageRows = stages.flatMap((stage, stageIndex) =>
        stage.rows.map((row, rowIndex) => ({
        label: `${stage.stageName || `Stage ${stageIndex + 1}`} - Row ${rowIndex + 1}`,
        value: `W:${row.weight} | V1:${row.vol1} | V2:${row.vol2} | V:${row.avgVol} | ASV:${row.asv} | AOV:${row.aov}`,
      }))
    );

    const stageSummaries = stages.map((stage, stageIndex) => ({
      label: `${stage.stageName || `Stage ${stageIndex + 1}`} Openness %`,
      value: stage.openness,
    }));

    return [...header, ...stageMeta, ...stageRows, ...stageSummaries, { label: "Overall Openness %", value: overallOpen }];
  };

  useImperativeHandle(ref, () => ({
    submit: handleSubmit,
    clear: handleClear,
    getPreviewData,
    getPayload: buildPayload,
    validate: () => {
      const nextErrors = {};
      if (!form.entries) nextErrors.entries = true;
      stages.forEach((stage, sIdx) => {
        if (!stage.stageName) {
          nextErrors[`stage-${sIdx}-stageName`] = true;
        }
        stage.rows.forEach((row, rIdx) => {
          ["weight", "vol1", "vol2"].forEach((key) => {
            if (String(row[key] || "").trim() === "") {
              nextErrors[`stage-${sIdx}-row-${rIdx}-${key}`] = true;
            }
          });
        });
      });
      setErrors(nextErrors);
      return Object.keys(nextErrors).length === 0 && canSubmit;
    },
  }));

  let runningIndex = 0;

  return (
    <div className={styles.wrapper}>
      <div className={styles.topGrid}>
        <CustomInput
          label="Actual Specific Volume (Target)"
          placeholder="1.0"
          value={target}
          onChange={onTargetChange}
          error={targetError}
          numericConfig={{ precision: 20, scale: 10 }}
        />
      </div>
      <div className={styles.topGrid}>
        <div className={styles.generateField}>
          <CustomInput
            label="No. of Entries (N)"
            placeholder="Enter N"
            value={form.entries}
            onChange={(value) => handleFormChange("entries", value)}
            error={errors.entries}
          />
          <button type="button" className={styles.generateButton} onClick={handleGenerate}>
            Generate
          </button>
        </div>
      </div>

      {stages.map((stage, stageIndex) => (
        <div key={stageIndex} className={styles.stageBox}>
          <div className={styles.rowGrid}>
            <div>
              <label className={styles.stageLabel} htmlFor={`stage-name-${stageIndex}`}>
                Stage
              </label>
              <SearchableSelect
                name={`stage-name-${stageIndex}`}
                className={styles.stageNameInput}
                style={
                  errors[`stage-${stageIndex}-stageName`]
                    ? { border: "1px solid #ef4444", background: "#fff1f2" }
                    : undefined
                }
                value={stage.stageName}
                options={MACHINE_NAME_OPTIONS}
                onChange={(value) => handleStageNameChange(stageIndex, value)}
                placeholder="Select Machine Name"
                ariaLabel={`Stage ${stageIndex + 1} name`}
              />
            </div>
            <CustomInput
              label="Beater Type"
              placeholder="Enter Beater Type"
              value={stage.beaterType}
              onChange={(value) => handleStageFieldChange(stageIndex, "beaterType", value)}
            />
            <CustomInput
              label="Beater Speed (RPM)"
              placeholder="Enter Beater Speed"
              value={stage.beaterSpeed}
              onChange={(value) => handleStageFieldChange(stageIndex, "beaterSpeed", value)}
            />
          </div>

          {stage.rows.map((row, rowIndex) => {
            runningIndex += 1;
            return (
              <div key={`stage-${stageIndex}-row-${rowIndex}`} className={styles.rowBox}>
                <div className={styles.rowNumber}>{runningIndex}</div>
                <div className={styles.rowContent}>
                  <div className={styles.rowGrid}>
                    <CustomInput
                      label="Weight (M)"
                      placeholder=""
                      value={row.weight}
                      onChange={(value) => handleRowChange(stageIndex, rowIndex, "weight", value)}
                      error={errors[`stage-${stageIndex}-row-${rowIndex}-weight`]}
                    />
                    <CustomInput
                      label="Volume 1"
                      placeholder=""
                      value={row.vol1}
                      onChange={(value) => handleRowChange(stageIndex, rowIndex, "vol1", value)}
                      error={errors[`stage-${stageIndex}-row-${rowIndex}-vol1`]}
                    />
                    <CustomInput
                      label="Volume 2"
                      placeholder=""
                      value={row.vol2}
                      onChange={(value) => handleRowChange(stageIndex, rowIndex, "vol2", value)}
                      error={errors[`stage-${stageIndex}-row-${rowIndex}-vol2`]}
                    />
                  </div>

                  <div className={styles.rowGrid}>
                    <ReadOnlyField label="Average Volume (V)" value={row.avgVol} />
                    <ReadOnlyField label="Apparent Specific Vol (A=V/M)" value={row.asv} />
                    <ReadOnlyField label="Actual Op. Value (AOV)" value={row.aov} />
                  </div>
                </div>
              </div>
            );
          })}

          <div className={styles.avgSection}>
            <h4 className={styles.avgTitle}>Averages</h4>
            <div className={styles.avgGrid}>
              <ReadOnlyField label="Avg. Weight (M)" value={stage.avgWeight} />
              <ReadOnlyField label="Avg. Volume (V)" value={stage.avgVol} />
              <ReadOnlyField label="Average of Apparent Specific Vol (A=V/M)" value={stage.avgAsv} />
              <ReadOnlyField label="Average of Actual Op. Value (AOV)" value={stage.avgAov} />
              {stageIndex > 0 && stageIndex < stages.length - 1 ? (
                <ReadOnlyField label="Openness %" value={stage.openness} />
              ) : (
                <div />
              )}
            </div>
          </div>

        </div>
      ))}

      {stages.length > 0 && (
        <div className={styles.overallBox}>
          <h3 className={styles.overallTitle}>Overall Openness Efficiency (%)</h3>
          <input className={styles.overallInput} value={overallOpen} readOnly />
        </div>
      )}
    </div>
  );
});

export default OpennessDataEntry;
