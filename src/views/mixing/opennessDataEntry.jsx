import { forwardRef, useImperativeHandle, useMemo, useState } from "react";
import CustomInput from "@/components/CustomInput";
import styles from "@/styles/opennessDataEntry.module.css";
import { mixingOpennessDataEntry } from "@/apis/mixing"; // direct API call

const initialForm = {
  target: "",
  entries: "",
};

const parseNumber = (value) => {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

// ✅ dynamic stage creation
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
  { date, mixing }, // ✅ mixing passed as prop
  ref
) {
  const [form, setForm] = useState(initialForm);
  const [stages, setStages] = useState([]);
  const [overallOpen, setOverallOpen] = useState("");
  const [errors, setErrors] = useState({});

  const handleFormChange = (field, value) => {
    if (field === "entries" && value !== "" && !/^\d+$/.test(value)) return;

    setForm((current) => ({
      ...current,
      [field]: value,
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
            const nextRow = { ...row, [field]: value };

            const weight = parseNumber(nextRow.weight);
            const volumeOne = parseNumber(nextRow.vol1);
            const volumeTwo = parseNumber(nextRow.vol2);

            if (weight > 0 && volumeOne > 0 && volumeTwo > 0) {
              const avgVolume = (volumeOne + volumeTwo) / 2;
              const calculated = (avgVolume / weight).toFixed(2);
              nextRow.asv = calculated;
              nextRow.aov = calculated;
            } else {
              nextRow.asv = "";
              nextRow.aov = "";
            }

            return nextRow;
          }
          return row;
        });

        let totalVol = 0;
        let totalAov = 0;
        let validRows = 0;

        updatedRows.forEach((row) => {
          const weight = parseNumber(row.weight);
          const vol1 = parseNumber(row.vol1);
          const vol2 = parseNumber(row.vol2);

          if (weight > 0 && vol1 > 0 && vol2 > 0) {
            const avgVolume = (vol1 + vol2) / 2;
            totalVol += avgVolume;
            totalAov += parseNumber(row.aov);
            validRows += 1;
          }
        });

        const avgVol = validRows ? (totalVol / validRows).toFixed(2) : "";
        const avgAov = validRows ? (totalAov / validRows).toFixed(2) : "";
        const target = parseNumber(form.target);
        const openness = target > 0 && avgAov !== "" ? ((parseNumber(avgAov) / target) * 100).toFixed(2) : "";

        return { ...stage, rows: updatedRows, avgVol, avgAov, openness };
      });

      const validStages = updated.filter((stage) => stage.openness !== "");
      const overall = validStages.length > 0
        ? (validStages.reduce((sum, stage) => sum + parseNumber(stage.openness), 0) / validStages.length).toFixed(2)
        : "";
      setOverallOpen(overall);

      return updated;
    });
  };

  const canSubmit = useMemo(() => {
    if (!date || !mixing?.trim() || !form.target.trim() || !form.entries.trim()) return false;
    if (!stages.length) return false;

    return stages.every(
      (stage) =>
        stage.rows.every((row) => row.weight !== "" && row.vol1 !== "" && row.vol2 !== "") &&
        stage.avgVol !== "" &&
        stage.openness !== ""
    );
  }, [date, mixing, form, stages]);

  const handleClear = () => {
    setForm(initialForm);
    setStages([]);
    setOverallOpen("");
  };

  const buildPayload = () => ({
    inspection_date: date,
    mixing: mixing,
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
      const res = await mixingOpennessDataEntry(buildPayload());
      alert(res.message || "Saved successfully");
      handleClear();
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

    const stageRows = stages.flatMap((stage, stageIndex) =>
      stage.rows.map((row, rowIndex) => ({
        label: `${stage.stageName} - Row ${rowIndex + 1}`,
        value: `W:${row.weight} | V1:${row.vol1} | V2:${row.vol2} | ASV:${row.asv} | AOV:${row.aov}`,
      }))
    );

    const stageSummaries = stages.map((stage, idx) => ({
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
          ["weight","vol1","vol2"].forEach((k)=>{
            if (String(row[k]||"").trim()==="") nextErrors[`stage-${sIdx}-row-${rIdx}-${k}`]=true;
          });
        });
      });
      setErrors(nextErrors);
      return Object.keys(nextErrors).length === 0;
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
          <input className={styles.stageNameInput} value={stage.stageName} readOnly />

          {stage.rows.map((row, rowIndex) => {
            runningIndex++;
            return (
              <div key={`${stage.stageName}-${rowIndex}`} className={styles.rowBox}>
                <div className={styles.rowNumber}>{runningIndex}</div>
                <div className={styles.rowGrid}>
                 <CustomInput
                    label="Weight (W)"
                    placeholder="0.00"
                    value={row.weight}
                    onChange={(value) => handleRowChange(stageIndex, rowIndex, "weight", value)}
                    error={errors[`stage-${stageIndex}-row-${rowIndex}-weight`]}
                  />
                  <CustomInput
                    label="Volume 1"
                    placeholder="0.00"
                    value={row.vol1}
                    onChange={(value) => handleRowChange(stageIndex, rowIndex, "vol1", value)}
                    error={errors[`stage-${stageIndex}-row-${rowIndex}-vol1`]}
                  />
                  <CustomInput
                    label="Volume 2"
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
            <div className={styles.rowGrid}>
              <ReadOnlyField label="Avg. Volume (V)" value={stage.avgVol} />
              <ReadOnlyField label="Actual Op. Value (AOV)" value={stage.avgAov} />
            </div>
            <div className={styles.opennessField}>
              <ReadOnlyField label="Openness %" value={stage.openness} />
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
