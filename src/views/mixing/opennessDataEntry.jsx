import { forwardRef, useImperativeHandle, useMemo, useState } from "react";
import CustomInput from "@/components/CustomInput";
import styles from "@/styles/opennessDataEntry.module.css";
import { mixingOpennessDataEntry } from "@/apis/mixing";
import { sanitizeIntegerInput, sanitizeNumericInput } from "@/utils/inputValidation";

const initialForm = {
  target: "",
  entries: "",
};

const parseNumber = (value) => {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const roundToDecimals = (value, decimals) => {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

const normalizeTargetSpecificVolume = (value) => {
  const numericValue = parseNumber(value);
  if (numericValue <= 0) return 0;

  return roundToDecimals(numericValue > 1 ? numericValue / 100 : numericValue, 10);
};

const createStages = (totalEntries) => {
  const stages = [];
  let remaining = totalEntries;
  let stageIndex = 0;

  while (remaining > 0) {
    const rowCount = Math.min(5, remaining);

    stages.push({
      stageName: `Stage ${stageIndex + 1}`,
      rows: Array.from({ length: rowCount }, () => ({
        weight: "",
        vol1: "",
        vol2: "",
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
  { date, mixing, onSubmitSuccess },
  ref
) {
  const [form, setForm] = useState(initialForm);
  const [stages, setStages] = useState([]);
  const [overallOpen, setOverallOpen] = useState("");
  const [errors, setErrors] = useState({});

  const handleFormChange = (field, value) => {
    const nextValue =
      field === "entries"
        ? sanitizeIntegerInput(value, 9)
        : field === "target"
          ? sanitizeNumericInput(value, { precision: 20, scale: 10 })
          : value;

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
    setErrors((prev) => ({ ...prev, target: !form.target, entries: !form.entries }));
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
              const targetSpecificVolume = normalizeTargetSpecificVolume(form.target);
              const actualOpennessValue =
                  targetSpecificVolume > 0
                  ? (((apparentSpecificVolume - targetSpecificVolume) / targetSpecificVolume).toFixed(2))
                  : "";
              nextRow.asv = apparentSpecificVolume.toFixed(2);
              nextRow.aov = actualOpennessValue;
            } else {
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

          if (weight > 0 && vol1 > 0 && vol2 > 0) {
            const avgVolume = (vol1 + vol2) / 2;
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
        const openness = avgAov;

        return { ...stage, rows: updatedRows, avgWeight, avgVol, avgAsv, avgAov, openness };
      });

      const validStages = updated.filter((stage) => stage.openness !== "");
      const overall =
        validStages.length > 0
          ? (
              validStages.reduce((sum, stage) => sum + parseNumber(stage.openness), 0) /
              validStages.length
            ).toFixed(2)
          : "";
      setOverallOpen(overall);

      return updated;
    });
  };

  const handleStageNameChange = (stageIndex, value) => {
    setStages((current) =>
      current.map((stage, currentStageIndex) =>
        currentStageIndex === stageIndex ? { ...stage, stageName: value } : stage
      )
    );
  };

  const canSubmit = useMemo(() => {
    if (!date || !mixing?.trim() || !form.target.trim() || !form.entries.trim()) return false;
    if (!stages.length) return false;

    return stages.every(
      (stage) =>
        stage.rows.every((row) => row.weight !== "" && row.vol1 !== "" && row.vol2 !== "") &&
        stage.avgWeight !== "" &&
        stage.avgVol !== "" &&
        stage.avgAsv !== "" &&
        stage.avgAov !== "" &&
        stage.openness !== ""
    );
  }, [date, mixing, form, stages]);

  const handleClear = () => {
    setForm(initialForm);
    setStages([]);
    setOverallOpen("");
    setErrors({});
  };

  const buildPayload = () => ({
    inspection_date: date,
    mixing,
    actual_specific_volume_target: Number(form.target),
    no_of_entries: Number(form.entries),
    entries: stages.flatMap((stage) =>
      stage.rows.map((row) => ({
        machine_name: stage.stageName,
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
      { label: "Mixing", value: mixing },
      { label: "Target (ASV)", value: form.target },
      { label: "Entries (N)", value: form.entries },
    ];

    const stageRows = stages.flatMap((stage) =>
      stage.rows.map((row, rowIndex) => ({
        label: `${stage.stageName} - Row ${rowIndex + 1}`,
        value: `W:${row.weight} | V1:${row.vol1} | V2:${row.vol2} | ASV:${row.asv} | AOV:${row.aov}`,
      }))
    );

    const stageSummaries = stages.map((stage) => ({
      label: `${stage.stageName} Openness %`,
      value: stage.openness,
    }));

    return [...header, ...stageRows, ...stageSummaries, { label: "Overall Openness %", value: overallOpen }];
  };

  useImperativeHandle(ref, () => ({
    submit: handleSubmit,
    clear: handleClear,
    getPreviewData,
    getPayload: buildPayload,
    validate: () => {
      const nextErrors = {};
      if (!form.target) nextErrors.target = true;
      if (!form.entries) nextErrors.entries = true;
      stages.forEach((stage, sIdx) => {
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
          value={form.target}
          onChange={(value) => handleFormChange("target", value)}
          error={errors.target}
        />

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
        <div key={stage.stageName} className={styles.stageBox}>
          <h3 className={styles.stageTitle}>Machine Stage {stageIndex + 1}</h3>
          <input
            className={styles.stageNameInput}
            value={stage.stageName}
            onChange={(e) => handleStageNameChange(stageIndex, e.target.value)}
            aria-label={`Stage ${stageIndex + 1} name`}
          />

          {stage.rows.map((row, rowIndex) => {
            runningIndex += 1;
            return (
              <div key={`${stage.stageName}-${rowIndex}`} className={styles.rowBox}>
                <div className={styles.rowNumber}>{runningIndex}</div>
                <div className={styles.rowGrid}>
                  <CustomInput
                    label="Weight in Gms"
                    placeholder="0.00"
                    value={row.weight}
                    onChange={(value) => handleRowChange(stageIndex, rowIndex, "weight", value)}
                    error={errors[`stage-${stageIndex}-row-${rowIndex}-weight`]}
                  />
                  <CustomInput
                    label="Volume 1 in CC"
                    placeholder="0.00"
                    value={row.vol1}
                    onChange={(value) => handleRowChange(stageIndex, rowIndex, "vol1", value)}
                    error={errors[`stage-${stageIndex}-row-${rowIndex}-vol1`]}
                  />
                  <CustomInput
                    label="Volume 2 in CC"
                    placeholder="0.00"
                    value={row.vol2}
                    onChange={(value) => handleRowChange(stageIndex, rowIndex, "vol2", value)}
                    error={errors[`stage-${stageIndex}-row-${rowIndex}-vol2`]}
                  />
                </div>

                <div className={styles.rowGrid}>
                  <ReadOnlyField label="Apparent Specific Vol (A=V/M)" value={row.asv} />
                  <ReadOnlyField label="Actual Op. Value (AOV)" value={row.aov} />
                  <div />
                </div>
              </div>
            );
          })}

          <div className={styles.avgSection}>
            <h4 className={styles.avgTitle}>Stage {stageIndex + 1} Averages</h4>
            <div className={styles.avgGrid}>
              <ReadOnlyField label="Avg. Weight (M)" value={stage.avgWeight} />
              <ReadOnlyField label="Avg. Volume (V)" value={stage.avgVol} />
              <ReadOnlyField label="Average of Apparent Specific Vol (A=V/M)" value={stage.avgAsv} />
              <ReadOnlyField label="Average of Actual Op. Value (AOV)" value={stage.avgAov} />
              <ReadOnlyField label="Avg. Openness %" value={stage.openness} />
            </div>
          </div>
        </div>
      ))}

      {stages.length > 0 && (
        <div className={styles.overallBox}>
          <h3 className={styles.overallTitle}>Overall Openness Percentage</h3>
          <input className={styles.overallInput} value={overallOpen} readOnly />
        </div>
      )}
    </div>
  );
});

export default OpennessDataEntry;
