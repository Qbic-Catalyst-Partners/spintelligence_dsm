import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { useSelector } from "react-redux";
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
  { key: "lickerInSpeed1", field: "licker_in_speed_1", label: "Licker-in Speed 1", numeric: true },
  { key: "lickerInSpeed2", field: "licker_in_speed_2", label: "Licker-in Speed 2", numeric: true },
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

const normalizeCdgProposedList = (value) => {
  if (Array.isArray(value)) return value.map(trimValue).filter(hasValue);
  return hasValue(value) ? [trimValue(value)] : [];
};

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

// Overlays only the Proposed column from a still-unapproved (pending or
// rejected) entry onto an already-built Existing baseline. The Existing
// baseline always comes from the last *approved* entry only — carrying a
// rejected/pending row's values into Existing would let an unreviewed
// submission masquerade as the approved machine state.
const applyUnapprovedProposedValues = (existingValues, entry) =>
  parameterRows.reduce((record, row) => {
    record[row.key] = {
      existing: existingValues[row.key]?.existing || "",
      proposed: trimValue(entry?.[`${row.field}_proposed`] ?? ""),
    };
    return record;
  }, {});

function CardingWheelChange({ types = [], selectedType = "WheelChange", onTypeChange, entryId = "" }) {
  const router = useRouter();
  const user = useSelector((state) => state.auth?.user);
  const operatorName = trimValue(user?.name || user?.full_name || user?.user_name || user?.username || "");
  const [entryDate, setEntryDate] = useState(getTodayDate);
  const [cdoNo, setCdoNo] = useState("");
  const [proposedCdgNos, setProposedCdgNos] = useState([]);
  const [isCdgProposedOpen, setIsCdgProposedOpen] = useState(false);
  const cdgProposedRef = useRef(null);
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
  // The most recent *unapproved* submission for this mixing, if any — either
  // still awaiting L2 review or previously rejected. It's the row still sitting
  // in the pending table, so its Proposed values are shown (and will be
  // silently overwritten on the next submit).
  const [unapprovedEntry, setUnapprovedEntry] = useState(null);

  const loadLatestSaved = async (mixingValue = "") => {
    const baseParams = { page: 1, limit: 1 };
    const trimmedMixing = String(mixingValue || "").trim();
    if (trimmedMixing) {
      baseParams.variety = trimmedMixing;
      baseParams.variety_name = trimmedMixing;
      baseParams.mixing = trimmedMixing;
    }

    const [approvedResult, pendingResult, rejectedResult] = await Promise.allSettled([
      fetchCardingChangeControlEntries({ ...baseParams, approval_status: "approved", status: "approved" }),
      fetchCardingChangeControlEntries({ ...baseParams, approval_status: "pending", status: "pending" }),
      fetchCardingChangeControlEntries({ ...baseParams, approval_status: "rejected", status: "rejected" }),
    ]);

    const approved = approvedResult.status === "fulfilled" ? extractLatestEntry(approvedResult.value) : null;
    const pending = pendingResult.status === "fulfilled" ? extractLatestEntry(pendingResult.value) : null;
    const rejected = rejectedResult.status === "fulfilled" ? extractLatestEntry(rejectedResult.value) : null;
    const unapproved = pending || rejected;
    if (!approved && !unapproved) return null;

    setUnapprovedEntry(
      unapproved
        ? {
            status: pending ? "pending" : "rejected",
            remarks: trimValue(unapproved?.review_remarks ?? unapproved?.reviewRemarks ?? ""),
            reviewedBy: trimValue(unapproved?.reviewed_by ?? unapproved?.reviewedBy ?? ""),
            reviewedAt: unapproved?.reviewed_at ?? unapproved?.reviewedAt ?? "",
          }
        : null
    );

    const previousProposedCdgList = normalizeCdgProposedList(approved?.cdg_no_proposed);
    setCdoNo(previousProposedCdgList[0] || trimValue(approved?.cdo_no ?? ""));
    setProposedCdgNos(unapproved ? normalizeCdgProposedList(unapproved.cdg_no_proposed) : []);
    setValues(() => {
      const baseline = buildExistingValuesFromEntry(approved || {});
      return unapproved ? applyUnapprovedProposedValues(baseline, unapproved) : baseline;
    });
    setRemarks("");
    setErrors({});
    return approved || unapproved;
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
    if (!isCdgProposedOpen) return undefined;
    const handleOutsideClick = (event) => {
      if (!cdgProposedRef.current?.contains(event.target)) {
        setIsCdgProposedOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [isCdgProposedOpen]);

  useEffect(() => {
    if (!selectedMixing) {
      lastLoadedMixingRef.current = "";
      setUnapprovedEntry(null);
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
      ...(unapprovedEntry
        ? [
            {
              label: "⚠ Overwrite Warning",
              value:
                unapprovedEntry.status === "rejected"
                  ? "This mixing has a rejected entry still pending resubmission. Submitting will replace it — there is no undo."
                  : "This mixing already has an entry awaiting L2 verification. Submitting will overwrite it — there is no undo.",
              wide: true,
            },
          ]
        : []),
      { label: "Type", value: selectedType || "WheelChange" },
      { label: "Entry ID", value: entryId || "-" },
      { label: "CDG No. (Existing)", value: cdoNo || "-" },
      { label: "CDG No. (Proposed)", value: proposedCdgNos.length ? proposedCdgNos.join(", ") : "-" },
      ...parameterRows.flatMap((row) => [
        { label: `${row.label} - Existing`, value: values[row.key]?.existing || "-" },
        { label: `${row.label} - Proposed`, value: values[row.key]?.proposed || "-" },
      ]),
      { label: "Remarks", value: remarks || "-" },
    ],
    [cdoNo, entryId, proposedCdgNos, remarks, selectedType, unapprovedEntry, values]
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
    if (!proposedCdgNos.length) nextErrors.proposedCdgNo = true;

    const valueErrors = {};
    parameterRows.forEach((row) => {
      const rowErrors = {};
      // Existing values come from previously approved data; a first-time entry
      // has none, so only the proposed column is required.
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
      department: "Carding",
      approval_status: "pending",
      operator: operatorName,
      entry_date: entryDate || getTodayDate(),
      cdo_no: cdoNo,
      cdg_no_proposed: proposedCdgNos,
      ...parameterPayload,
      remarks: trimValue(remarks),
    };
  };

  const handleClear = () => {
    setEntryDate(getTodayDate());
    setCdoNo("");
    setProposedCdgNos([]);
    setIsCdgProposedOpen(false);
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
    setUnapprovedEntry(null);
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
        {unapprovedEntry?.status && (
          <span
            className={`${styles.statusBadge} ${
              unapprovedEntry.status === "rejected" ? styles.statusBadgeRejected : styles.statusBadgePending
            }`}
          >
            {unapprovedEntry.status === "rejected" ? "Rejected" : "Awaiting L2"}
          </span>
        )}
        <InputScreenUploadButton className="ml-auto" />
      </div>

      <div className={styles.form}>
        {unapprovedEntry?.status === "pending" && (
          <div className={styles.pendingNotice}>
            A proposed entry for this mixing is still awaiting L2 approval. The Proposed column below shows that
            pending submission — submitting again will overwrite it.
          </div>
        )}

        {unapprovedEntry?.status === "rejected" && (
          <div className={styles.rejectedNotice}>
            <div>
              This entry was rejected by L2{unapprovedEntry.reviewedBy ? ` (${unapprovedEntry.reviewedBy})` : ""}.
              {unapprovedEntry.reviewedAt ? ` Reviewed ${unapprovedEntry.reviewedAt}.` : ""} The Proposed column
              below shows the rejected submission — resubmitting will overwrite it.
            </div>
            {unapprovedEntry.remarks && (
              <div className={styles.rejectedRemarks}>Reviewer remarks: {unapprovedEntry.remarks}</div>
            )}
          </div>
        )}

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
            <label>CDG No. (Existing)</label>
            <SearchableSelect
              className={`${styles.topInput} ${errors.cdoNo ? styles.errorInput : ""}`}
              value={cdoNo}
              onChange={(value) => {
                setCdoNo(value);
                clearError("cdoNo");
              }}
              options={cdgOptions}
              placeholder="Select"
              ariaLabel="CDG No. (Existing)"
            />
          </div>

          <div className={styles.field} ref={cdgProposedRef} style={{ position: "relative" }}>
            <label>CDG No. (Proposed)</label>
            <button
              type="button"
              className={`${styles.topInput} ${errors.proposedCdgNo ? styles.errorInput : ""}`}
              style={{ textAlign: "left", cursor: "pointer" }}
              onClick={() => setIsCdgProposedOpen((current) => !current)}
              aria-haspopup="listbox"
              aria-expanded={isCdgProposedOpen}
            >
              {proposedCdgNos.length ? proposedCdgNos.join(", ") : "Select"}
            </button>
            {isCdgProposedOpen ? (
              <div
                role="listbox"
                aria-label="CDG No. (Proposed)"
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  right: 0,
                  zIndex: 50,
                  marginTop: "0.25rem",
                  maxHeight: "16rem",
                  overflowY: "auto",
                  borderRadius: "0.5rem",
                  border: "1px solid #dbe4f0",
                  background: "#fff",
                  boxShadow: "0 4px 12px rgba(15,23,42,0.12)",
                }}
              >
                {cdgOptions.map((option) => {
                  const checked = proposedCdgNos.includes(option);
                  return (
                    <label
                      key={option}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        padding: "0.5rem 0.75rem",
                        fontSize: "12px",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setProposedCdgNos((current) =>
                            current.includes(option)
                              ? current.filter((value) => value !== option)
                              : [...current, option]
                          );
                          clearError("proposedCdgNo");
                        }}
                      />
                      {option}
                    </label>
                  );
                })}
              </div>
            ) : null}
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
          <label>Remarks (optional)</label>
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
