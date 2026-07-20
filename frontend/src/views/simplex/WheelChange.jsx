import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { MdEditNote } from "react-icons/md";
import { HiChevronDown, HiChevronUp } from "react-icons/hi2";
import InputScreenUploadButton from "@/components/InputScreenUploadButton";
import SearchableSelect from "@/components/SearchableSelect";
import { createSmxMachineOptions } from "@/views/simplex/smxMachineNames";
import {
  fetchSimplexUqcMasterDropdown,
  fetchSimplexWheelChangeEntries,
  submitSimplexWheelChangeEntry,
} from "@/apis/simplex";

const today = new Date().toISOString().split("T")[0];

// Simplex only has one wheel change field set — there is no Wheel Change Type
// selector on this screen.
const PARAMETER_ROWS = [
  { key: "mixing", label: "Mixing / Process", select: true },
  { key: "blendPercent", label: "Blend" },
  { key: "feedHank", label: "Feed - Hank" },
  { key: "delHank", label: "Delivery - Hank" },
  { key: "cp", label: "CP", select: true },
  { key: "smxid", label: "SMXID", select: true },
  { key: "breakDraft", label: "Break Draft (CP)", select: true },
  { key: "totalDraft", label: "Total Draft", dark: true, readOnly: true },
  { key: "md1", label: "Front Roller Dia" },
  { key: "md2", label: "TW", select: true },
  { key: "tw0", label: "TCW [G]", select: true },
  { key: "tw1", label: "TCW [H]", select: true },
  { key: "tf", label: "TPI", dark: true, readOnly: true },
  { key: "tm", label: "TM", dark: true, readOnly: true },
  { key: "lm", label: "LW", select: true },
  { key: "lcw0", label: "LCW [E]", select: true },
  { key: "lcw1", label: "LCW [F]", select: true },
  { key: "breakDraftValue", label: "Break Draft", dark: true, readOnly: true },
  { key: "bottomRollerSetting", label: "Bottom Roller Setting", dark: true },
  { key: "topArmSetting", label: "Top Arm Setting", dark: true },
  { key: "topArmLoad", label: "Top Arm Load", dark: true },
  { key: "floatingCondensor", label: "Floating Condenser", dark: true },
  { key: "spacer", label: "Spacer", dark: true },
  { key: "tension", label: "Tension", select: true },
  { key: "creelDraftChange", label: "Creel Draft Change (WE)", select: true },
  { key: "creelDraft", label: "Creel Draft", dark: true, readOnly: true },
  { key: "bobbinColour", label: "Bobbin Colour", dark: true },
];

const createEmptyRows = () =>
  PARAMETER_ROWS.map((row) => ({
    key: row.key,
    existing: "",
    proposed: "",
  }));

const normalizeRows = (rows = []) => {
  const sourceRows = Array.isArray(rows)
    ? rows
    : rows && typeof rows === "object"
      ? Object.entries(rows).map(([key, value]) => ({
          key,
          ...((value && typeof value === "object") ? value : { existing: value }),
        }))
      : [];

  return PARAMETER_ROWS.map((row) => {
    const saved = sourceRows.find(
      (item) =>
        String(item?.key ?? item?.label ?? "").trim() === row.key ||
        String(item?.label ?? "").trim() === row.label
    );

    return {
      key: row.key,
      // For an approved record, `proposed` holds the newly-approved value
      // that should become the next entry's baseline — prioritize it over
      // the stale pre-approval `existing`, matching Carding/Spinning/Draw
      // Frame's carry-forward convention.
      existing: String(saved?.proposed ?? saved?.existing ?? saved?.value ?? saved?.[row.key] ?? ""),
      proposed: "",
    };
  });
};

const extractSequence = (value) => {
  const match = String(value ?? "").trim().match(/(\d+)(?!.*\d)/);
  return match ? Number(match[1]) || 0 : 0;
};

const mapApiEntryToVersion = (entry) => {
  const normalizedDate = String(entry?.entry_date || "").split("T")[0];
  const paramRows = Array.isArray(entry?.parameters)
    ? entry.parameters
    : Array.isArray(entry?.rows)
      ? entry.rows
      : Array.isArray(entry?.parameter_rows)
        ? entry.parameter_rows
        : [];
  const mixingRow = paramRows.find((row) =>
    String(row?.key ?? row?.label ?? "").trim().toLowerCase().includes("mixing")
  );

  return {
    id: String(entry?.entry_id ?? entry?.id ?? Date.now()),
    label: normalizedDate,
    data: {
      entryId: String(entry?.entry_id || ""),
      date: normalizedDate || today,
      smxNo: String(entry?.sap_no || ""),
      smxNoProposed: String(entry?.proposed_sap_no || ""),
      mixing: String(mixingRow?.existing || mixingRow?.proposed || ""),
      rows: normalizeRows(paramRows),
    },
  };
};

// "Latest" means most recently *entered* (submitted), not most recently
// *touched* — an older entry's updated_at can be bumped later than a newer
// entry's created_at simply because an L2 reviewer approved/rejected it
// after the fact, which would otherwise outrank the actual newest row.
const getRecordTimestamp = (record) => {
  const raw =
    record?.created_at ??
    record?.createdAt ??
    record?.created_time ??
    record?.createdTime ??
    record?.created_on ??
    record?.createdOn ??
    record?.entry_date ??
    record?.date ??
    record?.updated_at ??
    record?.updatedAt ??
    Object.entries(record || {}).find(([key, value]) => {
      if (!value) return false;
      const normalizedKey = String(key || "").toLowerCase();
      if (!/(created|updated|time|date)/.test(normalizedKey)) return false;
      return !Number.isNaN(new Date(value).getTime());
    })?.[1] ??
    null;
  const parsed = raw ? new Date(raw).getTime() : NaN;
  return Number.isFinite(parsed) ? parsed : -Infinity;
};

// The backend's id column for these tables isn't consistently named "id" —
// fall back to any *_id-shaped numeric key so the recency tiebreaker still
// works when the field is e.g. entry_id instead.
const getRecordId = (record) => {
  const direct = Number(record?.id);
  if (Number.isFinite(direct) && direct !== 0) return direct;
  const match = Object.entries(record || {}).find(([key, value]) => {
    if (!/(^|_)id$/i.test(key)) return false;
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric !== 0;
  });
  return match ? Number(match[1]) : 0;
};

// Extracts every candidate record from a wheel-change list/detail payload,
// without picking a "winner" yet — the caller may need to filter by mixing
// first (the backend has been observed to ignore the mixing/variety query
// param entirely and return entries for every machine/mixing).
const extractNotebookEntryCandidates = (payload) => {
  const latestRecord = payload?.latest ?? payload?.latest_record ?? payload?.latestRecord ?? null;

  const rows = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.rows)
      ? payload.rows
      : Array.isArray(payload)
        ? payload
        : [];

  // Filtered wheel-change queries (e.g. approval_status=approved) can come
  // back as a single flat record object with no data/rows/latest wrapper at
  // all — the payload itself *is* the record.
  const isWrapperPayload =
    payload && typeof payload === "object" && !Array.isArray(payload) &&
    (Array.isArray(payload.data) || Array.isArray(payload.rows) || "latest" in payload || "latest_record" in payload || "latestRecord" in payload);
  const singleRecord =
    payload && typeof payload === "object" && !Array.isArray(payload) && !isWrapperPayload && Object.keys(payload).length
      ? payload
      : null;

  return [latestRecord, singleRecord, ...rows].filter(Boolean);
};

// Some endpoints don't guarantee newest-first ordering, and the backend's
// own latest record has been observed to lag behind the actual newest row
// (e.g. it reflects the first entry ever saved instead of the most
// recent). Don't trust rows[0]/latest blindly — pick whichever candidate is
// actually newest by timestamp, falling back to id.
const pickLatestEntry = (candidates) => {
  if (!candidates.length) return null;
  const sortedByRecency = [...candidates].sort((a, b) => {
    const diff = getRecordTimestamp(b) - getRecordTimestamp(a);
    if (diff !== 0) return diff;
    return getRecordId(b) - getRecordId(a);
  });
  return sortedByRecency[0] || null;
};

const extractLatestNotebookEntry = (payload) => pickLatestEntry(extractNotebookEntryCandidates(payload));

const parseNumericValue = (value) => {
  const parsed = Number.parseFloat(String(value ?? "").trim());
  return Number.isFinite(parsed) ? parsed : null;
};

const computeSimplexLrsbTpi = ({ tw, tcwh, tcwg, frontRollerDia }) => {
  const twValue = parseNumericValue(tw);
  const tcwhValue = parseNumericValue(tcwh);
  const tcwgValue = parseNumericValue(tcwg);
  const frontRollerDiaValue = parseNumericValue(frontRollerDia);
  if (
    twValue === null ||
    tcwhValue === null ||
    tcwgValue === null ||
    frontRollerDiaValue === null ||
    tcwgValue === 0 ||
    frontRollerDiaValue === 0
  ) {
    return "";
  }
  const numerator = 51 * 36 * twValue * tcwhValue * 67 * 25.4;
  const denominator = 40 * 38 * 102 * tcwgValue * 26.3 * 3.14 * frontRollerDiaValue;
  if (denominator === 0) return "";
  return String((numerator / denominator).toFixed(2));
};

const computeSimplexLrsbTm = ({ tpi, delHank }) => {
  const tpiValue = parseNumericValue(tpi);
  const delHankValue = parseNumericValue(delHank);
  if (tpiValue === null || delHankValue === null || delHankValue <= 0) return "";
  return String((tpiValue / Math.sqrt(delHankValue)).toFixed(2));
};

const computeSimplexLrsbBreakDraftValue = ({ breakDraftCp }) => {
  const breakDraftCpValue = parseNumericValue(breakDraftCp);
  if (breakDraftCpValue === null || breakDraftCpValue === 0) return "";
  return String((66.7 / breakDraftCpValue).toFixed(2));
};

const computeSimplexLrsbCreelDraft = ({ creelDraftChange }) => {
  const creelDraftChangeValue = parseNumericValue(creelDraftChange);
  if (creelDraftChangeValue === null) return "";
  return String((0.0245 * creelDraftChangeValue).toFixed(4));
};

const computeSimplexLrsbTotalDraft = ({ breakDraftCp, cp }) => {
  const breakDraftCpValue = parseNumericValue(breakDraftCp);
  const cpValue = parseNumericValue(cp);
  if (breakDraftCpValue === null || cpValue === null || breakDraftCpValue === 0 || cpValue === 0) return "";
  return String((29968 / breakDraftCpValue / cpValue).toFixed(2));
};

const SIMPLEX_WHEEL_CHANGE_SELECT_OPTIONS = {
  cp: Array.from({ length: 75 - 34 + 1 }, (_, index) => String(34 + index)),
  smxid: ["1", "2", "3", "4", "5", "6"],
  breakDraft: Array.from({ length: 70 - 52 + 1 }, (_, index) => String(52 + index)),
  md2: Array.from({ length: 77 - 27 + 1 }, (_, index) => String(27 + index)),
  tw0: ["25", "27", "28", "30", "35"],
  tw1: ["77", "75", "74", "72", "67"],
  lm: ["30", "34", "36", "37", "38", "40", "42", "43", "45", "46", "48", "50", "57", "59", "60", "61", "64", "67", "69", "70"],
  lcw0: ["60", "67", "0"],
  lcw1: ["38", "42", "35"],
  tension: ["28", "30", "33", "34", "35", "36", "37", "32", "38", "40", "41", "42", "45", "46", "48", "50", "52", "55", "60", "62", "68"],
  creelDraftChange: ["37", "44", "45", "46", "47", "48"],
};

const createInitialForm = () => ({
  type: "Wheel Change",
  entryId: "",
  date: today,
  smxNo: "",
  smxNoProposed: "",
  remarks: "",
});

const normalizeMachineOptions = (rows = []) =>
  (Array.isArray(rows) ? rows : [])
    .map((row) => {
      if (typeof row === "string") {
        const value = row.trim();
        if (!value) return null;
        const label = value.toUpperCase().replace(/\s+/g, "-");
        return { value: label, label };
      }

      const value = String(row?.value ?? row?.mc_no ?? row?.machine_no ?? row?.machine_number ?? "").trim();
      const labelSource = String(row?.label ?? row?.mc_name ?? row?.machine_name ?? value).trim();
      const label = labelSource ? labelSource.toUpperCase().replace(/\s+/g, "-") : value.toUpperCase().replace(/\s+/g, "-");
      const normalizedValue = label || value;
      return normalizedValue ? { value: normalizedValue, label: normalizedValue } : null;
    })
    .filter(Boolean);

const getOptionText = (option) => {
  if (option === null || option === undefined) return "";
  if (typeof option === "string" || typeof option === "number") return String(option).trim();
  return String(option?.label ?? option?.value ?? option?.name ?? option?.text ?? "").trim();
};

const mergeMachineOptions = (apiOptions = []) => {
  const merged = [
    ...createSmxMachineOptions(),
    ...(Array.isArray(apiOptions) ? apiOptions : [])
      .map((option) => {
        if (!option) return null;
        if (typeof option === "string") {
          const value = option.trim();
          return value ? { value, label: value } : null;
        }

        const value = String(option?.value ?? option?.mc_no ?? option?.machine_no ?? option?.mcName ?? "").trim();
        const label = String(option?.label ?? option?.mc_name ?? option?.machine_name ?? value ?? "").trim();
        return value ? { value, label: label || value } : null;
      })
      .filter(Boolean),
  ];

  const seen = new Set();
  return merged.filter((item) => {
    if (!item?.value || seen.has(item.value)) return false;
    seen.add(item.value);
    return true;
  });
};

const WheelChange = forwardRef(function WheelChange(
  { selectedTypeName = "Wheel Change", onTypeChange, typeOptions = [], entryId = "" },
  ref
) {
  const user = useSelector((state) => state.auth?.user);
  const operatorName = String(
    user?.name || user?.full_name || user?.user_name || user?.username || ""
  ).trim();
  const [form, setForm] = useState(createInitialForm);
  const [rows, setRows] = useState(createEmptyRows);
  const [machineOptions, setMachineOptions] = useState([]);
  const [mixingOptions, setMixingOptions] = useState([]);
  const [submitError, setSubmitError] = useState("");
  const [versions, setVersions] = useState([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [expandedVersionId, setExpandedVersionId] = useState(null);
  // The most recent *unapproved* submission for this machine, if any — either
  // still awaiting L2 review or previously rejected. It's the row still
  // sitting in the pending table, so its Proposed values are shown (and will
  // be silently overwritten on the next submit).
  const [unapprovedEntry, setUnapprovedEntry] = useState(null);
  const skipAutoLoadRef = useRef(false);
  const lastLoadedMixingRef = useRef("");
  const lastLoadedMachineOnlyRef = useRef("");
  // Tracks whether the user has actually picked a Mixing / Process value (vs.
  // it merely being auto-filled for display by the machine-only lookup
  // below) — using this instead of "is the mixing text non-empty" as the
  // machine-only effect's guard, since auto-filling Mixing's Existing cell
  // for display would otherwise make selectedMixing look user-picked and
  // permanently block that effect from ever re-running on a later machine
  // switch.
  const [mixingUserPicked, setMixingUserPicked] = useState(false);
  // selectedMixing is a derived string, so re-picking the *same* mixing (or
  // it already being selected) never changes the value and the lookup
  // effect below never re-fires — it just keeps showing whatever was
  // fetched the first time that mixing was ever selected, even if a newer
  // entry was saved for it afterward. Bumping this on every focus of the
  // Mixing dropdown forces a fresh fetch of the current latest entry
  // regardless of whether the mixing text itself changed, matching Spinning.
  const [mixingRefreshTick, setMixingRefreshTick] = useState(0);
  const refreshSelectedMixing = () => setMixingRefreshTick((tick) => tick + 1);

  // Fetch/pre-populate is keyed by the Mixing / Process row (matching
  // Spinning and Carding). SMX No. is still sent on submit below since the
  // backend uses machine_no as its own carry-forward/supersede key, but the
  // frontend's "what was last approved" lookup goes by mixing here.
  const selectedMixing = String(
    rows.find((item) => item.key === "mixing")?.proposed || rows.find((item) => item.key === "mixing")?.existing || ""
  ).trim();

  useEffect(() => {
    setForm((current) => ({ ...current, entryId }));
  }, [entryId]);

  useEffect(() => {
    let cancelled = false;

    const loadMachineOptions = async () => {
      try {
        const dropdown = await fetchSimplexUqcMasterDropdown();
        if (cancelled) return;
        const options = normalizeMachineOptions(dropdown?.mcNos || []);
        setMachineOptions(mergeMachineOptions(options));
      } catch {
        if (!cancelled) setMachineOptions(createSmxMachineOptions());
      }
    };

    const loadMixingOptions = async () => {
      try {
        const dropdown = await fetchSimplexUqcMasterDropdown();
        if (cancelled) return;
        setMixingOptions(Array.isArray(dropdown?.varietyNames) ? dropdown.varietyNames : []);
      } catch {
        if (!cancelled) setMixingOptions([]);
      }
    };

    loadMachineOptions();
    loadMixingOptions();
    return () => {
      cancelled = true;
    };
  }, []);

  // Prefer `parameters`/`rows` — the two fields the backend actually
  // processes and carries forward (per routes/simplex.js). `parameter_rows`
  // is a frontend-only alias with no backend processing guarantee; if it's
  // echoed back verbatim on GET, it would still hold the pre-carry-forward
  // value the operator originally typed, so it's checked last as a fallback
  // only, never preferred over the two fields backend actually computes.
  const extractRowsBlob = (entry) =>
    Array.isArray(entry?.parameters)
      ? entry.parameters
      : Array.isArray(entry?.rows)
        ? entry.rows
        : entry?.rows && typeof entry.rows === "object"
          ? entry.rows
          : Array.isArray(entry?.parameter_rows)
            ? entry.parameter_rows
            : [];

  // Overlays only the Proposed column from a still-unapproved (pending or
  // rejected) entry onto an already-built Existing baseline. The Existing
  // baseline always comes from the last *approved* entry only.
  const applyUnapprovedProposedRows = (baseline, entry) => {
    const savedRows = extractRowsBlob(entry);
    return PARAMETER_ROWS.map((row) => {
      const saved = savedRows.find(
        (item) =>
          String(item?.key ?? item?.label ?? "").trim() === row.key ||
          String(item?.label ?? "").trim() === row.label
      );
      const baselineRow = baseline.find((item) => item.key === row.key) || { existing: "", proposed: "" };
      return {
        key: row.key,
        existing: baselineRow.existing || "",
        proposed: String(saved?.proposed ?? ""),
      };
    });
  };

  // The backend has been observed to ignore the mixing/variety query param
  // entirely and return entries for every machine/mixing in the table, so
  // "latest" must be filtered to only entries whose own mixing value
  // (proposed, i.e. the one now in effect, else existing) matches what was
  // actually selected — otherwise the most recent entry for a *different*
  // mixing wins by timestamp alone.
  const getEntryMixingValue = (entry) => {
    const savedRows = extractRowsBlob(entry);
    const list = Array.isArray(savedRows) ? savedRows : Object.values(savedRows || {});
    const mixingRow = list.find(
      (item) => String(item?.key ?? "").trim() === "mixing" || String(item?.label ?? "").trim().toLowerCase().includes("mixing")
    );
    return String(mixingRow?.proposed || mixingRow?.existing || "").trim().toLowerCase();
  };

  const extractLatestNotebookEntryForMixing = (payload, mixing) => {
    const candidates = extractNotebookEntryCandidates(payload).filter(
      (candidate) => getEntryMixingValue(candidate) === mixing.trim().toLowerCase()
    );
    return pickLatestEntry(candidates);
  };

  // Machine No. (SMX No.) has its own column on the backend (unlike Mixing,
  // which lives inside the parameters JSONB blob), so it's matched directly
  // against the entry's own machine_no/sap_no field.
  const getEntryMachineValue = (entry) =>
    String(entry?.machine_no ?? entry?.machineNo ?? entry?.sap_no ?? entry?.smxNo ?? "").trim().toLowerCase();

  const extractLatestNotebookEntryForMachine = (payload, machine) => {
    const candidates = extractNotebookEntryCandidates(payload).filter(
      (candidate) => getEntryMachineValue(candidate) === machine.trim().toLowerCase()
    );
    return pickLatestEntry(candidates);
  };

  // Fetches approved/pending/rejected for the selected Mixing/Process in
  // parallel — Existing always comes from the approved record only;
  // Proposed is prefilled from whichever unapproved (pending/rejected)
  // record exists, since resubmitting silently overwrites that temp-table
  // row. Called both by the mixing-change effect below and again after a
  // successful submit.
  const loadLatestForMixing = async (mixingValue = selectedMixing) => {
    const mixing = String(mixingValue || "").trim();
    if (!mixing) {
      lastLoadedMixingRef.current = "";
      setUnapprovedEntry(null);
      return null;
    }

    // limit must be large enough to actually receive every matching row —
    // the backend doesn't sort by recency before truncating to the page
    // size, so a limit of 1 can hand back the *oldest* entry instead of the
    // latest, leaving nothing for the client-side recency sort/filter above
    // to work with.
    const baseParams = { page: 1, limit: 200, variety: mixing, variety_name: mixing, mixing };

    const [approvedResult, pendingResult, rejectedResult] = await Promise.allSettled([
      fetchSimplexWheelChangeEntries({ ...baseParams, approval_status: "approved" }),
      fetchSimplexWheelChangeEntries({ ...baseParams, approval_status: "pending" }),
      fetchSimplexWheelChangeEntries({ ...baseParams, approval_status: "rejected" }),
    ]);

    const approved = approvedResult.status === "fulfilled" ? extractLatestNotebookEntryForMixing(approvedResult.value, mixing) : null;
    const pending = pendingResult.status === "fulfilled" ? extractLatestNotebookEntryForMixing(pendingResult.value, mixing) : null;
    const rejected = rejectedResult.status === "fulfilled" ? extractLatestNotebookEntryForMixing(rejectedResult.value, mixing) : null;
    const unapproved = pending || rejected;

    setUnapprovedEntry(
      unapproved
        ? {
            status: pending ? "pending" : "rejected",
            remarks: String(unapproved?.review_remarks ?? unapproved?.reviewRemarks ?? "").trim(),
            reviewedBy: String(unapproved?.reviewed_by ?? unapproved?.reviewedBy ?? "").trim(),
            reviewedAt: unapproved?.reviewed_at ?? unapproved?.reviewedAt ?? "",
          }
        : null
    );

    if (!approved && !unapproved) return null;

    lastLoadedMixingRef.current = mixing;
    const referenceEntry = approved || unapproved;
    setForm((current) => ({
      ...current,
      entryId: String(referenceEntry.entry_id || referenceEntry.entryId || entryId || current.entryId || ""),
      date: String(referenceEntry.entry_date || referenceEntry.date || current.date || today).slice(0, 10),
      // Existing carries forward from the last entry's Proposed value (same
      // carry-forward pattern the parameter rows already use), so the
      // operator only has to type a new Proposed SMX No. each time.
      smxNo: String(
        referenceEntry.proposed_sap_no ||
          referenceEntry.proposedSapNo ||
          referenceEntry.smx_no_proposed ||
          current.smxNo ||
          ""
      ),
      smxNoProposed: String(
        referenceEntry.proposed_sap_no ||
          referenceEntry.proposedSapNo ||
          referenceEntry.smx_no_proposed ||
          current.smxNoProposed ||
          ""
      ),
    }));

    const baseline = normalizeRows(extractRowsBlob(approved));
    const nextRows = unapproved ? applyUnapprovedProposedRows(baseline, unapproved) : baseline;
    setRows((current) => {
      const currentMixing = current.find((item) => item.key === "mixing");
      // Keep the operator's own mixing selection/proposal — don't let the
      // fetched record's mixing value clobber what triggered this lookup.
      return currentMixing
        ? nextRows.map((item) =>
            item.key === "mixing" ? { ...item, existing: currentMixing.existing, proposed: currentMixing.proposed } : item
          )
        : nextRows;
    });
    return referenceEntry;
  };

  // Before Mixing / Process is picked, carry forward the last approved entry
  // for this SMX No. alone so Existing isn't blank while the operator is
  // still filling in the rest of the form. Once Mixing is chosen, the
  // mixing-scoped lookup below takes over and is the more specific match.
  const loadLatestForMachine = async (machineValue) => {
    const machine = String(machineValue || "").trim();
    if (!machine) return null;

    // limit must be large enough to actually receive every matching row —
    // the backend doesn't sort by recency before truncating to the page
    // size, so a limit of 1 can hand back the *oldest* entry instead of the
    // latest.
    const baseParams = { page: 1, limit: 200, machine_no: machine };

    const [approvedResult, pendingResult, rejectedResult] = await Promise.allSettled([
      fetchSimplexWheelChangeEntries({ ...baseParams, approval_status: "approved" }),
      fetchSimplexWheelChangeEntries({ ...baseParams, approval_status: "pending" }),
      fetchSimplexWheelChangeEntries({ ...baseParams, approval_status: "rejected" }),
    ]);

    const approved = approvedResult.status === "fulfilled" ? extractLatestNotebookEntryForMachine(approvedResult.value, machine) : null;
    const pending = pendingResult.status === "fulfilled" ? extractLatestNotebookEntryForMachine(pendingResult.value, machine) : null;
    const rejected = rejectedResult.status === "fulfilled" ? extractLatestNotebookEntryForMachine(rejectedResult.value, machine) : null;
    const unapproved = pending || rejected;

    if (!approved && !unapproved) {
      // No saved data for this machine — clear whatever a previously
      // selected machine had populated instead of leaving it showing.
      setUnapprovedEntry(null);
      setRows(createEmptyRows());
      return null;
    }

    const referenceEntry = approved || unapproved;
    setUnapprovedEntry(
      unapproved
        ? {
            status: pending ? "pending" : "rejected",
            remarks: String(unapproved?.review_remarks ?? unapproved?.reviewRemarks ?? "").trim(),
            reviewedBy: String(unapproved?.reviewed_by ?? unapproved?.reviewedBy ?? "").trim(),
            reviewedAt: unapproved?.reviewed_at ?? unapproved?.reviewedAt ?? "",
          }
        : null
    );

    setForm((current) => ({
      ...current,
      entryId: String(referenceEntry.entry_id || referenceEntry.entryId || entryId || current.entryId || ""),
      date: String(referenceEntry.entry_date || referenceEntry.date || current.date || today).slice(0, 10),
      smxNo: String(
        referenceEntry.proposed_sap_no ||
          referenceEntry.proposedSapNo ||
          referenceEntry.smx_no_proposed ||
          current.smxNo ||
          ""
      ),
      smxNoProposed: String(
        referenceEntry.proposed_sap_no ||
          referenceEntry.proposedSapNo ||
          referenceEntry.smx_no_proposed ||
          current.smxNoProposed ||
          ""
      ),
    }));

    const baseline = normalizeRows(extractRowsBlob(approved));
    const nextRows = unapproved ? applyUnapprovedProposedRows(baseline, unapproved) : baseline;
    setRows(nextRows);
    return referenceEntry;
  };

  useEffect(() => {
    if (skipAutoLoadRef.current) return undefined;

    const trimmedMachine = form.smxNo.trim();
    if (!trimmedMachine || mixingUserPicked) {
      lastLoadedMachineOnlyRef.current = "";
      return undefined;
    }

    const selectionKey = trimmedMachine;
    if (lastLoadedMachineOnlyRef.current === selectionKey) return undefined;

    let cancelled = false;
    loadLatestForMachine(trimmedMachine)
      .then(() => {
        if (!cancelled) lastLoadedMachineOnlyRef.current = selectionKey;
      })
      .catch(() => {
        // Keep the current rows when history isn't available for this machine.
      });

    return () => {
      cancelled = true;
    };
  }, [form.smxNo, mixingUserPicked]);

  // Runs whenever the selected mixing changes, or the dropdown is focused
  // again (mixingRefreshTick) — mixingRefreshTick is folded into the cache
  // key so reopening/reselecting the same mixing always forces a fresh
  // fetch even when the mixing text itself hasn't changed.
  useEffect(() => {
    if (skipAutoLoadRef.current) {
      skipAutoLoadRef.current = false;
      return undefined;
    }

    if (!selectedMixing) {
      lastLoadedMixingRef.current = "";
      setUnapprovedEntry(null);
      return undefined;
    }

    const selectionKey = `${selectedMixing}::${mixingRefreshTick}`;
    if (lastLoadedMixingRef.current === selectionKey) return undefined;

    let cancelled = false;
    loadLatestForMixing(selectedMixing).then(() => {
      if (!cancelled) lastLoadedMixingRef.current = selectionKey;
    }).catch(() => {
      // Keep the current rows when history isn't available for this mixing.
    });

    return () => {
      cancelled = true;
    };
  }, [selectedMixing, mixingRefreshTick]);

  const clear = () => {
    setForm(createInitialForm());
    setRows(createEmptyRows());
    setSubmitError("");
    setUnapprovedEntry(null);
    setMixingUserPicked(false);
    lastLoadedMixingRef.current = "";
    lastLoadedMachineOnlyRef.current = "";
  };

  const validate = () => Boolean(selectedTypeName && form.smxNo && form.smxNoProposed);

  const getPreviewData = () => [
    ...(unapprovedEntry
      ? [
          {
            label: "⚠ Overwrite Warning",
            value:
              unapprovedEntry.status === "rejected"
                ? "This machine has a rejected entry still pending resubmission. Submitting will replace it — there is no undo."
                : "This machine already has an entry awaiting L2 verification. Submitting will overwrite it — there is no undo.",
            wide: true,
          },
        ]
      : []),
    { label: "Type", value: selectedTypeName || "-" },
    { label: "Entry ID", value: entryId || "-" },
    { label: "Date", value: form.date || "-" },
    { label: "SMX No.", value: form.smxNo || "-" },
    { label: "SMX No. (Proposed)", value: form.smxNoProposed || "-" },
    ...PARAMETER_ROWS.map((row) => ({
      label: `${row.label} - Proposed`,
      value: rows.find((item) => item.key === row.key)?.proposed || "-",
    })),
    { label: "Remarks", value: form.remarks || "-" },
  ];

  const submit = async () => {
    setSubmitError("");
    const parameterRowsPayload = PARAMETER_ROWS.map((row) => {
      const current = rows.find((item) => item.key === row.key) || {};
      return {
        key: row.key,
        label: row.label,
        existing: current.existing || "",
        proposed: current.proposed || "",
      };
    });
    const payload = {
      entry_id: entryId || form.entryId || undefined,
      notebook_type: "Wheel Change",
      department: "Simplex",
      approval_status: "pending",
      operator: operatorName,
      machine_no: form.smxNo,
      entry_date: form.date,
      sap_no: form.smxNo,
      proposed_sap_no: form.smxNoProposed,
      // Only send the two fields the backend actually processes/carries
      // forward (routes/simplex.js) — `parameter_rows` was a defensive extra
      // alias that risked being echoed back verbatim (unprocessed) and
      // shadowing the correctly carried-forward data on read.
      parameters: parameterRowsPayload,
      rows: parameterRowsPayload.reduce((acc, row) => {
        acc[row.key] = row;
        return acc;
      }, {}),
      remarks: form.remarks.trim(),
      notes: {
        type: selectedTypeName,
      },
    };

    try {
      await submitSimplexWheelChangeEntry(payload);
      // Re-fetch so the just-submitted entry shows up as "Awaiting L2" (or
      // supersedes whatever was previously pending/rejected for this machine).
      lastLoadedMixingRef.current = "";
      await loadLatestForMixing(selectedMixing);
      loadVersions();
      return true;
    } catch (error) {
      setSubmitError(error?.message || "Unable to submit simplex wheel change entry.");
      return false;
    }
  };

  useImperativeHandle(ref, () => ({
    clear,
    validate,
    getPreviewData,
    submit,
  }));

  const loadVersions = async () => {
    setLoadingVersions(true);
    try {
      const payload = await fetchSimplexWheelChangeEntries({ page: 1, limit: 200 });
      const list = Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload?.rows)
          ? payload.rows
          : Array.isArray(payload)
            ? payload
            : [];
      const nextVersions = list
        .map(mapApiEntryToVersion)
        .sort((a, b) => extractSequence(b.id) - extractSequence(a.id));
      setVersions(nextVersions);
    } catch {
      setVersions([]);
    } finally {
      setLoadingVersions(false);
    }
  };

  useEffect(() => {
    loadVersions();
  }, []);

  const handleVersionSelect = (version) => {
    skipAutoLoadRef.current = true;
    setForm((current) => ({
      ...current,
      entryId: version.data.entryId,
      date: version.data.date,
      smxNo: version.data.smxNo,
      smxNoProposed: version.data.smxNoProposed,
    }));
    setRows(version.data.rows);
    setExpandedVersionId(version.id);
  };

  const handleVersionToggle = (version) => {
    setExpandedVersionId((current) => (current === version.id ? null : version.id));
  };

  useEffect(() => {
    // Existing and Proposed are independent columns — each computed field
    // must be derived from that same column's own inputs only, otherwise
    // editing Proposed would bleed into the Existing column's value (and
    // vice versa) instead of the two staying separate.
    const getColumnValue = (key, column) => rows.find((item) => item.key === key)?.[column] || "";

    const computeForColumn = (column) => {
      const getValue = (key) => getColumnValue(key, column);
      const tpiValue = computeSimplexLrsbTpi({
        tw: getValue("md2"),
        tcwh: getValue("tw1"),
        tcwg: getValue("tw0"),
        frontRollerDia: getValue("md1"),
      });
      return {
        tf: tpiValue,
        tm: computeSimplexLrsbTm({ tpi: tpiValue, delHank: getValue("delHank") }),
        breakDraftValue: computeSimplexLrsbBreakDraftValue({ breakDraftCp: getValue("breakDraft") }),
        creelDraft: computeSimplexLrsbCreelDraft({ creelDraftChange: getValue("creelDraftChange") }),
        totalDraft: computeSimplexLrsbTotalDraft({ breakDraftCp: getValue("breakDraft"), cp: getValue("cp") }),
      };
    };

    const existingByKey = computeForColumn("existing");
    const proposedByKey = computeForColumn("proposed");

    setRows((current) => {
      const isUnchanged = current.every((item) => {
        if (!(item.key in existingByKey)) return true;
        return (item.existing || "") === existingByKey[item.key] && (item.proposed || "") === proposedByKey[item.key];
      });
      if (isUnchanged) return current;

      return current.map((item) =>
        item.key in existingByKey
          ? { ...item, existing: existingByKey[item.key], proposed: proposedByKey[item.key] }
          : item
      );
    });
  }, [rows]);

  const renderField = (row, valueKey) => {
    const value = rows.find((item) => item.key === row.key)?.[valueKey] || "";
    const className = `w-full h-[38px] rounded-[8px] border border-slate-200 bg-[#F8FAFC] px-3 text-[14px] text-slate-700 ${row.dark ? "bg-[#e3e9f0]" : ""}`;
    const options =
      row.key === "mixing"
        ? mixingOptions
        : SIMPLEX_WHEEL_CHANGE_SELECT_OPTIONS[row.key] || machineOptions;

    if (row.select) {
      if (row.key === "mixing") {
        return (
          <SearchableSelect
            className={className}
            value={value}
            onChange={(nextValue) => {
              // Mixing / Process is the one driving control: picking its
              // Proposed cell looks up the latest approved entry and fills
              // in every row's Existing baseline, including its own — so
              // only a real user pick on the Proposed cell should count as
              // "Mixing has been picked" for the machine-only lookup guard
              // above.
              if (valueKey === "proposed") {
                setMixingUserPicked(Boolean(String(nextValue ?? "").trim()));
              }
              setRows((current) =>
                current.map((item) => (item.key === row.key ? { ...item, [valueKey]: nextValue } : item))
              );
            }}
            options={options}
            placeholder="Select"
            ariaLabel={row.label}
            disabled={row.readOnly === true || valueKey === "existing"}
            onFocus={refreshSelectedMixing}
          />
        );
      }

      return (
        <select
          className={className}
          value={value}
          disabled={row.readOnly === true || valueKey === "existing"}
          onChange={(e) =>
            setRows((current) =>
              current.map((item) => (item.key === row.key ? { ...item, [valueKey]: e.target.value } : item))
            )
          }
        >
          <option value="">Select</option>
          {options.map((option) => {
            const optionText = getOptionText(option);
            return (
              <option key={optionText} value={optionText}>
                {optionText}
              </option>
            );
          })}
        </select>
      );
    }

    return (
      <input
        className={className}
        value={value}
        readOnly={row.readOnly === true || valueKey === "existing"}
        onChange={(e) =>
          setRows((current) =>
            current.map((item) => (item.key === row.key ? { ...item, [valueKey]: e.target.value } : item))
          )
        }
      />
    );
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="p-5">
        <div className="flex items-center gap-2 min-w-0 mb-4">
          <MdEditNote className="text-[#3d539f] text-[22px]" />
          <span className="text-[18px] font-bold text-slate-900">Inspection Data Entry</span>
          {unapprovedEntry?.status && (
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
                unapprovedEntry.status === "rejected"
                  ? "border-red-300 bg-red-100 text-red-800"
                  : "border-amber-300 bg-amber-100 text-amber-800"
              }`}
            >
              {unapprovedEntry.status === "rejected" ? "Rejected" : "Awaiting L2"}
            </span>
          )}
          <InputScreenUploadButton className="ml-auto" />
        </div>

        {unapprovedEntry?.status === "pending" && (
          <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] font-semibold text-amber-800">
            A proposed entry for this machine is still awaiting L2 approval. The Proposed column below shows that
            pending submission — submitting again will overwrite it.
          </div>
        )}

        {unapprovedEntry?.status === "rejected" && (
          <div className="mb-4 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-[13px] font-semibold text-red-800">
            <div>
              This entry was rejected by L2{unapprovedEntry.reviewedBy ? ` (${unapprovedEntry.reviewedBy})` : ""}.
              {unapprovedEntry.reviewedAt ? ` Reviewed ${unapprovedEntry.reviewedAt}.` : ""} The Proposed column
              below shows the rejected submission — resubmitting will overwrite it.
            </div>
            {unapprovedEntry.remarks && <div className="mt-1 font-bold">Reviewer remarks: {unapprovedEntry.remarks}</div>}
          </div>
        )}

        <div className="grid grid-cols-1 gap-x-4 gap-y-5 md:grid-cols-2 xl:grid-cols-3">
          <div className="flex min-w-0 flex-col gap-2">
            <label className="text-[14px] font-semibold text-slate-700">Type</label>
            <select
              className="w-full h-[42px] rounded-[10px] border border-slate-200 bg-[#F1F5F9] px-3 text-[14px] text-slate-700"
              value={selectedTypeName}
              onChange={(e) => onTypeChange?.(e.target.value)}
            >
              <option value="">Select checking type</option>
              {typeOptions.map((item, idx) => {
                const optionText = getOptionText(item);
                return optionText ? (
                  <option key={optionText || idx} value={optionText}>
                    {optionText}
                  </option>
                ) : null;
              })}
            </select>
          </div>

          <div className="flex min-w-0 flex-col gap-2">
            <label className="text-[14px] font-semibold text-slate-700">Entry ID</label>
            <input
              className="w-full h-[42px] rounded-[10px] border border-slate-200 bg-[#F1F5F9] px-3 text-[14px] text-slate-700"
              value={entryId || "SWC-0001"}
              readOnly
              disabled
            />
          </div>

          <div className="flex min-w-0 flex-col gap-2">
            <label className="text-[14px] font-semibold text-slate-700">Date</label>
            <input
              type="text"
              className="w-full h-[42px] rounded-[10px] border border-slate-200 bg-[#F1F5F9] px-3 text-[14px] text-slate-700"
              value={form.date.split("-").reverse().join("/")}
              readOnly
            />
          </div>

          <div className="flex min-w-0 flex-col gap-2">
            <label className="text-[14px] font-semibold text-slate-700">SMX No.</label>
            <SearchableSelect
              className="w-full h-[42px] rounded-[10px] border border-slate-200 bg-[#F1F5F9] px-3 text-[14px] text-slate-700"
              value={form.smxNo}
              onChange={(value) => setForm((current) => ({ ...current, smxNo: value }))}
              options={machineOptions}
              placeholder="Select"
              ariaLabel="SMX No."
            />
          </div>

          <div className="flex min-w-0 flex-col gap-2">
            <label className="text-[14px] font-semibold text-slate-700">SMX No. (Proposed)</label>
            <SearchableSelect
              className="w-full h-[42px] rounded-[10px] border border-slate-200 bg-[#F1F5F9] px-3 text-[14px] text-slate-700"
              value={form.smxNoProposed}
              onChange={(value) => setForm((current) => ({ ...current, smxNoProposed: value }))}
              options={machineOptions}
              placeholder="Select"
              ariaLabel="SMX No. Proposed"
            />
          </div>
        </div>

        <div className="mt-8 overflow-x-auto">
          <table className="min-w-full border-collapse text-[14px] text-slate-700">
            <thead>
              <tr className="border-b border-slate-300 text-left uppercase text-slate-500">
                <th className="px-0 py-3 pr-6 font-semibold">PARAMETER</th>
                <th className="px-0 py-3 pr-6 font-semibold">EXISTING</th>
                <th className="px-0 py-3 font-semibold">PROPOSED</th>
              </tr>
            </thead>
            <tbody>
              {PARAMETER_ROWS.map((row) => (
                <tr key={row.key} className="border-b border-slate-200">
                  <td className="px-0 py-4 pr-6 font-semibold text-slate-700">{row.label}</td>
                  <td className="px-0 py-4 pr-6">{renderField(row, "existing")}</td>
                  <td className="px-0 py-4">{renderField(row, "proposed")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 flex min-w-0 flex-col gap-2">
          <label className="text-[14px] font-semibold text-slate-700">Remarks</label>
          <textarea
            className="w-full min-h-[72px] rounded-[8px] border border-slate-200 bg-[#F8FAFC] px-3 py-2 text-[14px] text-slate-700"
            value={form.remarks}
            onChange={(e) => setForm((current) => ({ ...current, remarks: e.target.value }))}
          />
        </div>

        {submitError ? <p className="mt-3 text-[14px] text-red-600">{submitError}</p> : null}

        <div className="mt-8">
          <h4 className="mb-3 text-[15px] font-bold text-slate-900">Saved Entries</h4>
          {loadingVersions ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
              Loading saved entries...
            </div>
          ) : null}
          {!loadingVersions && versions.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
              No saved entries found.
            </div>
          ) : null}
          <div className="flex flex-col gap-3">
            {versions.map((version) => {
              const isExpanded = expandedVersionId === version.id;
              const isActive = version.data.entryId === form.entryId;
              return (
                <div key={version.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <div
                    className={`grid w-full grid-cols-1 gap-3 px-4 py-3 transition-colors md:grid-cols-[120px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] ${
                      isActive ? "bg-[#f8fbff]" : "bg-white hover:bg-slate-50"
                    }`}
                  >
                    <button
                      type="button"
                      className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left"
                      onClick={() => handleVersionSelect(version)}
                    >
                      <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-500">Entry ID</div>
                      <div className="mt-1 text-[13px] font-bold text-slate-900">{version.data.entryId || "-"}</div>
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left"
                      onClick={() => handleVersionSelect(version)}
                    >
                      <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-500">Date</div>
                      <div className="mt-1 text-[13px] font-bold text-slate-900">{version.data.date || "-"}</div>
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left"
                      onClick={() => handleVersionSelect(version)}
                    >
                      <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-500">Mixing / Process</div>
                      <div className="mt-1 text-[13px] font-bold text-slate-900">{version.data.mixing || "-"}</div>
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left"
                      onClick={() => handleVersionSelect(version)}
                    >
                      <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-500">SMX No.</div>
                      <div className="mt-1 text-[13px] font-bold text-slate-900">{version.data.smxNo || "-"}</div>
                    </button>
                    <button
                      type="button"
                      className="flex items-center justify-center text-[20px] text-slate-500"
                      onClick={() => handleVersionToggle(version)}
                      aria-label={isExpanded ? "Collapse saved entry details" : "Expand saved entry details"}
                    >
                      {isExpanded ? <HiChevronUp /> : <HiChevronDown />}
                    </button>
                  </div>

                  {isExpanded ? (
                    <div className="border-t border-[#dbe4f0] bg-[#eef5ff] p-4">
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                        {PARAMETER_ROWS.map((field) => (
                          <div
                            key={`${version.id}-${field.key}`}
                            className="rounded-lg border border-[#c8d9f0] bg-white px-3 py-2 shadow-[0_1px_2px_rgba(15,23,42,0.05)]"
                          >
                            <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                              {field.label}
                            </div>
                            <div className="mt-1 text-[13px] font-bold text-slate-900">
                              {version.data.rows.find((r) => r.key === field.key)?.existing || "-"}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
});

export default WheelChange;
