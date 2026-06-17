import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { MdEditNote } from "react-icons/md";

import Footer from "@/components/Footer";
import InputScreenUploadButton from "@/components/InputScreenUploadButton";
import PreviewModal from "@/components/PreviewModal";
import SearchableSelect from "@/components/SearchableSelect";
import SuccessModal from "@/components/SuccessModal";
import {
  fetchCardingChangeControlEntries,
  fetchCardingMasterMachines,
  submitCardingChangeControlEntry,
} from "@/apis/carding";
import { fetchSimplexUqcMasterDropdown } from "@/apis/simplex";
import styles from "./cardingWheelChange.module.css";

const CHANGE_CONTROL_TYPE = "Wheel Change";
const DEFAULT_CDG_OPTIONS = Array.from({ length: 20 }, (_, index) => `CDG-${String(index + 1).padStart(2, "0")}`);

const parameterRows = [
  { key: "mixing", field: "mixing", label: "Mixing" },
  { key: "blendPercent", field: "blend_percent", label: "Blend %" },
  { key: "doffHank", field: "del_hank", label: "Del-Hank", numeric: true },
  { key: "feedWeight", field: "feed_weight", label: "Feed Weight", numeric: true },
  { key: "speed", field: "speed", label: "Speed", numeric: true },
  { key: "lickerInSpeed1", field: "licker_in_speed_1", label: "Licker-in Speed 1", numeric: true },
  { key: "cylinderSpeed", field: "cylinder_speed", label: "Cylinder Speed", numeric: true },
  { key: "flatsSpeed", field: "flats_speed_mm_min", label: "Flats Speed in mm/min", numeric: true },
  { key: "feedPlateToLickerIn", field: "feed_plate_to_licker_in", label: "Feed Plate to Licker-in", numeric: true },
  { key: "sfl", field: "sfl", label: "SFL", numeric: true },
  { key: "sfd", field: "sfd", label: "SFD", numeric: true },
  { key: "cylinderToFlats", field: "cylinder_to_flats", label: "Cylinder to Flats", numeric: true },
  { key: "cylinderToDoffer", field: "cylinder_in_doffer", label: "Cylinder to Doffer", numeric: true },
  { key: "webSpeedDots", field: "web_speed_draft_mw_v4", label: "Web Speed Draft MW(V4)", numeric: true },
  { key: "lcWingSetting", field: "lc_wing_setting", label: "LC-Wing Setting", numeric: true },
  { key: "dkNkBeaterSpeed", field: "rr_rk_beater_speed", label: "BR-RK Beater Speed", numeric: true },
];

const createValues = () =>
  parameterRows.reduce((record, row) => {
    record[row.key] = { existing: "", proposed: "" };
    return record;
  }, {});

const getTodayDate = () => new Date().toISOString().split("T")[0];
const hasValue = (value) => String(value ?? "").trim() !== "";
const trimValue = (value) => String(value ?? "").trim();
const isNumericValue = (value) => hasValue(value) && Number.isFinite(Number(value));
const getPayloadValue = (_row, value) => trimValue(value);

const extractLatestEntry = (payload) => {
  const rows = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.rows)
      ? payload.rows
      : Array.isArray(payload)
        ? payload
        : [];
  return rows[0] || null;
};

const buildExistingValuesFromEntry = (entry) =>
  parameterRows.reduce((record, row) => {
    record[row.key] = {
      existing: trimValue(entry?.[`${row.field}_proposed`] ?? entry?.[`${row.field}_existing`] ?? ""),
      proposed: "",
    };
    return record;
  }, {});

function CardingWheelChange({ types = [], selectedType = "WheelChange", onTypeChange, entryId = "" }) {
  const router = useRouter();
  const [entryDate, setEntryDate] = useState(getTodayDate);
  const [cdoNo, setCdoNo] = useState("");
  const [proposedCdgNo, setProposedCdgNo] = useState("");
  const [values, setValues] = useState(createValues);
  const [remarks, setRemarks] = useState("");
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [cdgOptions, setCdgOptions] = useState(DEFAULT_CDG_OPTIONS);
  const [mixingOptions, setMixingOptions] = useState([]);
  const [loadingVarietyOptions, setLoadingVarietyOptions] = useState(false);
  const [varietyOptionsError, setVarietyOptionsError] = useState("");
  const lastLoadedMixingRef = useRef("");
  const selectedMixing = String(values.mixing?.existing || values.mixing?.proposed || "").trim();

  const loadLatestSaved = async (mixingValue = "") => {
    const params = { page: 1, limit: 1 };
    const trimmedMixing = String(mixingValue || "").trim();
    if (trimmedMixing) {
      params.variety = trimmedMixing;
      params.variety_name = trimmedMixing;
      params.mixing = trimmedMixing;
    }

    const payload = await fetchCardingChangeControlEntries(params);
    const latest = extractLatestEntry(payload);
    if (!latest) return null;

    setCdoNo(trimValue(latest.cdg_no_proposed ?? latest.cdo_no ?? ""));
    setProposedCdgNo("");
    setValues(buildExistingValuesFromEntry(latest));
    setRemarks("");
    setErrors({});
    return latest;
  };

  useEffect(() => {
    let active = true;
    const loadVarieties = async () => {
      setLoadingVarietyOptions(true);
      try {
        const dropdown = await fetchSimplexUqcMasterDropdown({ department: "SIMPLEX" });
        if (!active) return;
        setMixingOptions(Array.isArray(dropdown?.varietyNames) ? dropdown.varietyNames : []);
        setVarietyOptionsError("");
      } catch (error) {
        if (!active) return;
        setMixingOptions([]);
        setVarietyOptionsError(error.message || "Unable to load simplex mixing options.");
      } finally {
        if (active) setLoadingVarietyOptions(false);
      }
    };
    loadVarieties();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const loadMachines = async () => {
      try {
        const options = await fetchCardingMasterMachines({ prefix: "CDG" });
        if (options.length) setCdgOptions(options);
      } catch {
        setCdgOptions(DEFAULT_CDG_OPTIONS);
      }
    };
    loadMachines();
  }, []);

  useEffect(() => {
    if (!selectedMixing) {
      lastLoadedMixingRef.current = "";
      return;
    }

    if (lastLoadedMixingRef.current === selectedMixing) return;

    let cancelled = false;
    loadLatestSaved(selectedMixing)
      .then((latest) => {
        if (cancelled || !latest) return;
        lastLoadedMixingRef.current = selectedMixing;
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [selectedMixing]);

  const previewItems = useMemo(
    () => [
      { label: "Type", value: selectedType || "WheelChange" },
      { label: "Entry ID", value: entryId || "-" },
      { label: "CDG No.", value: cdoNo || "-" },
      { label: "CDG No. (Proposed)", value: proposedCdgNo || "-" },
      ...parameterRows.flatMap((row) => [
        { label: `${row.label} - Existing`, value: values[row.key]?.existing || "-" },
        { label: `${row.label} - Proposed`, value: values[row.key]?.proposed || "-" },
      ]),
      { label: "Remarks", value: remarks || "-" },
    ],
    [cdoNo, entryId, proposedCdgNo, remarks, selectedType, values]
  );

  const clearError = (field) => {
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const clearValueError = (rowKey, column) => {
    setErrors((current) => {
      const rowErrors = current.values?.[rowKey];
      if (!rowErrors?.[column]) return current;

      const next = { ...current, values: { ...(current.values || {}) } };
      const nextRow = { ...next.values[rowKey] };
      delete nextRow[column];

      if (Object.keys(nextRow).length) next.values[rowKey] = nextRow;
      else delete next.values[rowKey];
      if (!Object.keys(next.values).length) delete next.values;

      return next;
    });
  };

  const handleValueChange = (rowKey, column) => (event) => {
    const nextValue = typeof event === "string" ? event : event?.target?.value ?? "";
    setValues((current) => ({
      ...current,
      [rowKey]: {
        ...(current[rowKey] || { existing: "", proposed: "" }),
        [column]: nextValue,
      },
    }));
    clearValueError(rowKey, column);
    setMessage("");
  };

  const validate = () => {
    const nextErrors = {};
    if (!selectedType) nextErrors.selectedType = true;
    if (!hasValue(entryDate)) nextErrors.entryDate = true;
    if (!hasValue(cdoNo)) nextErrors.cdoNo = true;
    if (!hasValue(proposedCdgNo)) nextErrors.proposedCdgNo = true;

    const valueErrors = {};
    parameterRows.forEach((row) => {
      const rowErrors = {};
      if (!hasValue(values[row.key]?.existing)) rowErrors.existing = true;
      if (!hasValue(values[row.key]?.proposed)) rowErrors.proposed = true;
      if (Object.keys(rowErrors).length) valueErrors[row.key] = rowErrors;
    });
    if (Object.keys(valueErrors).length) nextErrors.values = valueErrors;

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setMessage("Please fill all required fields with valid values before saving.");
      return false;
    }

    setMessage("");
    return true;
  };

  const buildPayload = () => {
    const parameterPayload = parameterRows.reduce((payload, row) => {
      payload[`${row.field}_existing`] = getPayloadValue(row, values[row.key]?.existing);
      payload[`${row.field}_proposed`] = getPayloadValue(row, values[row.key]?.proposed);
      return payload;
    }, {});

    return {
      type: CHANGE_CONTROL_TYPE,
      entry_date: entryDate || getTodayDate(),
      cdo_no: cdoNo,
      cdg_no_proposed: proposedCdgNo,
      ...parameterPayload,
      remarks: trimValue(remarks),
    };
  };

  const handleClear = () => {
    setEntryDate(getTodayDate());
    setCdoNo("");
    setProposedCdgNo("");
    setValues((current) =>
      parameterRows.reduce((record, row) => {
        record[row.key] = {
          existing: current[row.key]?.existing || "",
          proposed: "",
        };
        return record;
      }, {})
    );
    setRemarks("");
    setErrors({});
    setMessage("");
    setShowPreview(false);
    lastLoadedMixingRef.current = "";
  };

  const handlePreview = () => {
    if (validate()) setShowPreview(true);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await submitCardingChangeControlEntry(buildPayload());
      setShowPreview(false);
      setShowSuccess(true);
      setEntryDate(getTodayDate());
      await loadLatestSaved(values.mixing?.existing || values.mixing?.proposed || "");
    } catch (error) {
      setShowPreview(false);
      setMessage(error?.response?.data?.message || error?.message || "Wheel Change could not be submitted.");
    } finally {
      setSubmitting(false);
    }
  };

  const renderControl = (row, column) => {
    const value = values[row.key]?.[column] || "";
    const className = `${styles.input} ${errors.values?.[row.key]?.[column] ? styles.errorInput : ""}`;

    if (row.key === "mixing") {
      return (
        <SearchableSelect
          className={className}
          value={value}
          onChange={handleValueChange(row.key, column)}
          options={mixingOptions}
          placeholder={loadingVarietyOptions ? "Loading..." : varietyOptionsError ? "Select Mixing" : "Select"}
          ariaLabel="Mixing"
          disabled={loadingVarietyOptions && !mixingOptions.length}
        />
      );
    }

    if (row.inputType === "select") {
      return (
        <select className={className} value={value} onChange={handleValueChange(row.key, column)}>
          <option value="">Select</option>
          {row.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      );
    }

    return (
      <input
        className={className}
        type="text"
        value={value}
        onChange={handleValueChange(row.key, column)}
      />
    );
  };

  return (
    <>
      <div className={styles.titleRow}>
        <MdEditNote className={styles.titleIcon} />
        <h3 className={styles.sectionTitle}>Inspection Data Entry</h3>
        <InputScreenUploadButton className="ml-auto" />
      </div>

      <div className={styles.form}>
        <div className={`${styles.row} ${styles.topRow}`}>
          <div className={styles.field}>
            <label>Type</label>
            <select
              className={`${styles.topInput} ${errors.selectedType ? styles.errorInput : ""}`}
              value={selectedType}
              onChange={(event) => {
                onTypeChange?.(event.target.value);
                clearError("selectedType");
              }}
            >
              <option value="">Select Type</option>
              {types.map((item) => (
                <option key={item.id} value={item.name}>
                  {item.displayName ?? item.name}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label>Entry ID</label>
            <input
              type="text"
              className={`${styles.topInput} ${errors.entryDate ? styles.errorInput : ""}`}
              value={entryId || ""}
              readOnly
              disabled
            />
          </div>
        </div>

        <div className={`${styles.row} ${styles.twoColumnRow}`}>
          <div className={styles.field}>
            <label>CDG No.</label>
            <SearchableSelect
              className={`${styles.topInput} ${errors.cdoNo ? styles.errorInput : ""}`}
              value={cdoNo}
              onChange={(value) => {
                setCdoNo(value);
                clearError("cdoNo");
              }}
              options={cdgOptions}
              placeholder="Select"
              ariaLabel="CDG No."
            />
          </div>

          <div className={styles.field}>
            <label>CDG No. (Proposed)</label>
            <SearchableSelect
              className={`${styles.topInput} ${errors.proposedCdgNo ? styles.errorInput : ""}`}
              value={proposedCdgNo}
              onChange={(value) => {
                setProposedCdgNo(value);
                clearError("proposedCdgNo");
              }}
              options={cdgOptions}
              placeholder="Select"
              ariaLabel="CDG No. Proposed"
            />
          </div>
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>PARAMETER</th>
                <th>EXISTING</th>
                <th>PROPOSED</th>
              </tr>
            </thead>
            <tbody>
              {parameterRows.map((row) => (
                <tr key={row.key}>
                  <td className={styles.parameter}>{row.label}</td>
                  <td>{renderControl(row, "existing")}</td>
                  <td>{renderControl(row, "proposed")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className={styles.remarksRow}>
          <label>Remarks</label>
          <textarea value={remarks} onChange={(event) => setRemarks(event.target.value)} />
        </div>

        {message ? <div className={styles.messageError}>{message}</div> : null}
      </div>

      <div className={styles.footerEdge}>
        <Footer
          onBack={() => router.push("/departments/quality-control")}
          onClear={handleClear}
          onSave={handlePreview}
          saveLabel={submitting ? "Submitting..." : "Submit"}
          disabled={submitting}
        />
      </div>

      <PreviewModal
        open={showPreview}
        title="Carding Preview"
        subtitle="Carding Notebook / Wheel Change"
        items={previewItems}
        typeValue={CHANGE_CONTROL_TYPE}
        onCancel={() => setShowPreview(false)}
        onConfirm={handleSubmit}
        confirmLabel={submitting ? "Submitting..." : "Submit"}
      />

      <SuccessModal open={showSuccess} onClose={() => setShowSuccess(false)} />
    </>
  );
}

export default CardingWheelChange;
