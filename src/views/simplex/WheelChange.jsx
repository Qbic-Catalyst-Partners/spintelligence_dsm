import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { MdEditNote } from "react-icons/md";
import { HiChevronDown, HiChevronUp } from "react-icons/hi2";
import InputScreenUploadButton from "@/components/InputScreenUploadButton";
import SearchableSelect from "@/components/SearchableSelect";
import { createSmxMachineOptions } from "@/views/simplex/smxMachineNames";
import {
  fetchSimplexUqcMasterDropdown,
  fetchSimplexWheelChangeNotebookEntries,
  submitSimplexWheelChangeNotebookEntry,
} from "@/apis/simplex";

const today = new Date().toISOString().split("T")[0];

const rowGroups = {
  "Type 1 (LRSB)": [
    { key: "mixing", label: "Mixing / Process", select: true },
    { key: "blendPercent", label: "Blend" },
    { key: "feedHank", label: "Feed-Hank" },
    { key: "delHank", label: "Delivery-Hank" },
    { key: "cp", label: "CP", select: true },
    { key: "smxid", label: "SMXID", select: true },
    { key: "breakDraft", label: "Break Draft (CP)", select: true },
    { key: "totalDraft", label: "Total Draft", dark: true, readOnly: true },
    { key: "breakDraftValue", label: "Break Draft", dark: true, readOnly: true },
    { key: "md1", label: "Front Roller Dia" },
    { key: "md2", label: "TW", select: true },
    { key: "tw0", label: "TCW (0)", select: true },
    { key: "tw1", label: "TCW (1)", select: true },
    { key: "tf", label: "TPI", dark: true, readOnly: true },
    { key: "tm", label: "TM", dark: true, readOnly: true },
    { key: "lm", label: "LW", select: true },
    { key: "lcw0", label: "LCW (1)", select: true },
    { key: "lcw1", label: "LCW (0)", select: true },
    { key: "bottomRollerSetting", label: "Bottom Roller Setting", dark: true },      
    { key: "topArmSetting", label: "Top Arm Setting", dark: true },
    { key: "topArmLoad", label: "Top Arm Load", dark: true },
    { key: "floatingCondensor", label: "Floating Condenser", dark: true },
    { key: "spacer", label: "Spacer", dark: true },
    { key: "tension", label: "Tension", select: true },
    { key: "creelDraftChange", label: "Creel Draft Change (WE)", select: true },
    { key: "creelDraft", label: "Creel Draft", dark: true, readOnly: true },
    { key: "bobbinColour", label: "Bobbin Colour", dark: true },
  ],
  "Type 1 - SB20": [
    { key: "nw1", label: "NW1", select: true },
    { key: "nw2", label: "NW2", select: true },
    { key: "w8veg", label: "W8 VEG", select: true },
    { key: "w8dr", label: "W8DR", select: true },
    { key: "w1vwz", label: "W1 VWZ", select: true },
    { key: "w1dr", label: "W1DR", select: true },
    { key: "w3", label: "W3", select: true },
    { key: "w3dr", label: "W3DR", select: true },
    { key: "w4", label: "W4", select: true },
    { key: "w4dr", label: "W4DR", select: true },
    { key: "bottomRollerFront", label: "Bottom Roller Setting Front Zone", select: true },
    { key: "bottomRollerBack", label: "Bottom Roller Setting Back Zone", select: true },
    { key: "trumpet", label: "Trumpet", select: true },
    { key: "draftConstant", label: "Draft Constant", dark: true, readOnly: true },
    { key: "totalDraft", label: "Total Draft", dark: true, readOnly: true },
  ],
};

const SIMPLEX_WHEEL_CHANGE_TYPES = Object.keys(rowGroups);
const DEFAULT_SIMPLEX_WHEEL_CHANGE_TYPE = SIMPLEX_WHEEL_CHANGE_TYPES[0];

const getRowGroupForType = (type) => rowGroups[type] || rowGroups[DEFAULT_SIMPLEX_WHEEL_CHANGE_TYPE];

const createEmptyRows = (type = DEFAULT_SIMPLEX_WHEEL_CHANGE_TYPE) =>
  getRowGroupForType(type).map((row) => ({
    key: row.key,
    existing: "",
    proposed: "",
  }));

const normalizeRows = (rows = [], type = DEFAULT_SIMPLEX_WHEEL_CHANGE_TYPE) => {
  const sourceRows = Array.isArray(rows)
    ? rows
    : rows && typeof rows === "object"
      ? Object.entries(rows).map(([key, value]) => ({
          key,
          ...((value && typeof value === "object") ? value : { existing: value }),
        }))
      : [];

  return getRowGroupForType(type).map((row) => {
    const saved = sourceRows.find(
      (item) =>
        String(item?.key ?? item?.label ?? "").trim() === row.key ||
        String(item?.label ?? "").trim() === row.label
    );

    return {
      key: row.key,
      existing: String(saved?.existing ?? saved?.proposed ?? saved?.value ?? saved?.[row.key] ?? ""),
      proposed: "",
    };
  });
};

// Matches history by BOTH the selected Wheel Change Type (LRSB vs SB20 use
// entirely different fields) and Count Name/mixing — never falls back across
// types, since one type's saved values don't map onto another's fields.
const findLatestEntryForSelection = (entries = [], { mixing = "", type = "" } = {}) => {
  const normalizedMixing = String(mixing || "").trim().toLowerCase();
  const normalizedType = String(type || "").trim().toLowerCase();

  const getEntryType = (entry) =>
    String(entry?.wheel_change_type ?? entry?.wheel_change_type_label ?? "").trim().toLowerCase();
  const getEntryMixing = (entry) =>
    String(entry?.mixing ?? entry?.mixing_name ?? entry?.prep_variety_name ?? entry?.variety ?? "").trim().toLowerCase();

  const sameType = normalizedType ? entries.filter((entry) => getEntryType(entry) === normalizedType) : entries;
  if (!sameType.length) return null;
  if (!normalizedMixing) return sameType[0];

  return sameType.find((entry) => getEntryMixing(entry) === normalizedMixing) || sameType[0];
};

const extractSequence = (value) => {
  const match = String(value ?? "").trim().match(/(\d+)(?!.*\d)/);
  return match ? Number(match[1]) || 0 : 0;
};

const mapApiEntryToVersion = (entry) => {
  const normalizedDate = String(entry?.entry_date || "").split("T")[0];
  const paramRows = Array.isArray(entry?.parameter_rows)
    ? entry.parameter_rows
    : Array.isArray(entry?.parameters)
      ? entry.parameters
      : Array.isArray(entry?.rows)
        ? entry.rows
        : [];
  const mixingRow = paramRows.find((row) =>
    String(row?.key ?? row?.label ?? "").trim().toLowerCase().includes("mixing")
  );
  const entryType =
    SIMPLEX_WHEEL_CHANGE_TYPES.find(
      (type) => type.toLowerCase() === String(entry?.wheel_change_type ?? entry?.wheel_change_type_label ?? "").trim().toLowerCase()
    ) || DEFAULT_SIMPLEX_WHEEL_CHANGE_TYPE;

  return {
    id: String(entry?.entry_id ?? entry?.id ?? Date.now()),
    label: normalizedDate,
    data: {
      entryId: String(entry?.entry_id || ""),
      date: normalizedDate || today,
      type: entryType,
      smxNo: String(entry?.sap_no || ""),
      smxNoProposed: String(entry?.proposed_sap_no || ""),
      mixing: String(mixingRow?.existing || mixingRow?.proposed || ""),
      rows: normalizeRows(paramRows, entryType),
    },
  };
};

const extractLatestNotebookEntry = (payload) => {
  const rows = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.rows)
      ? payload.rows
      : Array.isArray(payload)
        ? payload
        : [];
  return rows[0] || payload?.data?.[0] || payload?.latest || null;
};

const parseNumericValue = (value) => {
  const parsed = Number.parseFloat(String(value ?? "").trim());
  return Number.isFinite(parsed) ? parsed : null;
};

const computeType1Sb20TotalDraft = ({ nw1, nw2 }) => {
  const nw1Value = parseNumericValue(nw1);
  const nw2Value = parseNumericValue(nw2);
  if (nw1Value === null || nw2Value === null || nw1Value === 0) return "";
  return String((3.993 * (nw2Value / nw1Value)).toFixed(2));
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
  nw1: Array.from({ length: 70 - 23 + 1 }, (_, index) => String(23 + index)),
  nw2: Array.from({ length: 70 - 23 + 1 }, (_, index) => String(23 + index)),
  w8veg: ["79", "80", "81", "82", "83", "84"],
  w8dr: ["0.97", "0.98", "0.99", "1", "1.02", "1.03"],
  w1vwz: ["143.9", "145.3", "146.7", "148.1", "149.5", "152.3"],
  w1dr: ["0.99", "1", "1.01", "1.03", "1.04", "1.06"],
  w3: ["143.1", "141.6", "140.2", "138.8", "137.5"],
  w3dr: ["0.9", "1", "1.01", "1.02", "1.03"],
  w4: [
    "77.4",
    "72.2",
    "70.3",
    "65.5",
    "63.8",
    "59.6",
    "57.9",
    "54",
    "52.7",
    "49.1",
    "48",
    "44.8",
    "43.5",
    "40.7",
    "39.6",
    "36.9",
  ],
  w4dr: [
    "1.05",
    "1.13",
    "1.16",
    "1.24",
    "1.28",
    "1.36",
    "1.41",
    "1.5",
    "1.55",
    "1.66",
    "1.7",
    "1.82",
    "1.87",
    "2",
    "2.06",
    "2.2",
  ],
  bottomRollerFront: [
    "35 / 1.5",
    "36 / 2.5",
    "37 / 3.5",
    "38 / 4.5",
    "39 / 5.5",
    "40 / 6.5",
    "41 / 7.5",
    "42 / 8.5",
    "43 / 9.5",
    "44 / 10.5",
    "45 / 11.5",
    "46 / 12.5",
    "47 / 13.5",
    "48 / 14.5",
    "49 / 15.5",
    "50 / 16.5",
    "51 / 17.5",
    "52 / 18.5",
    "53 / 19.5",
    "54 / 20.5",
    "55 / 21.5",
    "56 / 22.5",
    "57 / 23.5",
    "58 / 24.5",
    "59 / 25.5",
    "60 / 26.5",
  ],
  bottomRollerBack: [
    "40 / 10",
    "42 / 12",
    "44 / 14",
    "46 / 16",
    "48 / 18",
    "50 / 20",
    "52 / 22",
    "54 / 24",
    "56 / 26",
    "58 / 28",
    "60 / 30",
    "62 / 32",
    "64 / 34",
    "66 / 36",
    "68 / 38",
    "70 / 40",
    "72 / 42",
    "74 / 44",
    "76 / 46",
    "78 / 48",
    "80 / 50",
    "82 / 52",
    "84 / 54",
    "86 / 56",
    "88 / 58",
  ],
  trumpet: ["3.8", "4.2"],
};

const createInitialForm = () => ({
  type: "Wheel Change",
  entryId: "",
  date: today,
  smxNo: "",
  smxNoProposed: "",
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
  const [form, setForm] = useState(createInitialForm);
  const [wheelChangeType, setWheelChangeType] = useState(DEFAULT_SIMPLEX_WHEEL_CHANGE_TYPE);
  const [rows, setRows] = useState(createEmptyRows);
  const [machineOptions, setMachineOptions] = useState([]);
  const [mixingOptions, setMixingOptions] = useState([]);
  const [submitError, setSubmitError] = useState("");
  const [versions, setVersions] = useState([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [expandedVersionId, setExpandedVersionId] = useState(null);
  const skipMixingRefreshRef = useRef(false);
  const skipTypeRefreshRef = useRef(false);

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

  // Re-runs whenever the Wheel Change Type changes (LRSB vs SB20 use entirely
  // different fields), seeding the form from the most recent approved entry
  // of that type — Count Name/mixing is applied separately below.
  useEffect(() => {
    if (skipTypeRefreshRef.current) {
      skipTypeRefreshRef.current = false;
      return undefined;
    }

    let cancelled = false;
    setRows(createEmptyRows(wheelChangeType));

    const loadLatestForType = async () => {
      try {
        const payload = await fetchSimplexWheelChangeNotebookEntries({ page: 1, limit: 100, approval_status: "approved" });
        if (cancelled) return;
        const entries = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.rows) ? payload.rows : Array.isArray(payload) ? payload : [];
        const latest = findLatestEntryForSelection(entries, { type: wheelChangeType });
        if (!latest) return;

        setForm((current) => ({
          ...current,
          entryId: String(latest.entry_id || latest.entryId || entryId || current.entryId || ""),
          date: String(latest.entry_date || latest.date || current.date || today).slice(0, 10),
          smxNo: String(latest.sap_no || latest.smx_no || latest.smxNo || current.smxNo || ""),
          smxNoProposed: String(
            latest.proposed_sap_no || latest.proposedSapNo || latest.smx_no_proposed || current.smxNoProposed || ""
          ),
        }));

        const savedRows = Array.isArray(latest.parameter_rows)
          ? latest.parameter_rows
          : Array.isArray(latest.parameters)
            ? latest.parameters
            : Array.isArray(latest.rows)
              ? latest.rows
              : latest.rows && typeof latest.rows === "object"
                ? latest.rows
                : [];
        setRows(normalizeRows(savedRows, wheelChangeType));
      } catch {
        // Keep the freshly-cleared rows for this type when history isn't available.
      }
    };

    loadLatestForType();
    return () => {
      cancelled = true;
    };
  }, [wheelChangeType]);

  const clear = () => {
    setForm(createInitialForm());
    setWheelChangeType(DEFAULT_SIMPLEX_WHEEL_CHANGE_TYPE);
    setRows(createEmptyRows(DEFAULT_SIMPLEX_WHEEL_CHANGE_TYPE));
    setSubmitError("");
  };

  const validate = () => Boolean(selectedTypeName && form.date && form.smxNo && form.smxNoProposed);

  const getPreviewData = () => [
    { label: "Type", value: selectedTypeName || "-" },
    { label: "Wheel Change Type", value: wheelChangeType || "-" },
    { label: "Entry ID", value: entryId || "-" },
    { label: "Date", value: form.date || "-" },
    { label: "SMX No.", value: form.smxNo || "-" },
    { label: "SMX No. (Proposed)", value: form.smxNoProposed || "-" },
    ...selectedRows.map((row) => ({
      label: `${row.label} - Proposed`,
      value: rows.find((item) => item.key === row.key)?.proposed || "-",
    })),
  ];

  const submit = async () => {
    setSubmitError("");
    const payload = {
      entry_id: entryId || form.entryId || undefined,
      notebook_type: "Wheel Change",
      department: "Simplex",
      approval_status: "pending",
      entry_date: form.date,
      sap_no: form.smxNo,
      proposed_sap_no: form.smxNoProposed,
      parameter_rows: selectedRows.map((row) => {
        const current = rows.find((item) => item.key === row.key) || {};
        return {
          key: row.key,
          label: row.label,
          existing: current.existing || "",
          proposed: current.proposed || "",
        };
      }),
      wheel_change_type: wheelChangeType,
      notes: {
        type: selectedTypeName,
      },
    };

    try {
      await submitSimplexWheelChangeNotebookEntry(payload);
      // Existing values only change once an L2 user approves the proposal,
      // so keep the current baseline and just clear the proposed column.
      setRows((current) =>
        current.map((item) => ({
          ...item,
          proposed: "",
        }))
      );
      loadVersions();
      return true;
    } catch (error) {
      setSubmitError(error?.message || "Unable to submit simplex notebook entry.");
      return false;
    }
  };

  useImperativeHandle(ref, () => ({
    clear,
    validate,
    getPreviewData,
    submit,
  }));

  const selectedRows = useMemo(() => getRowGroupForType(wheelChangeType), [wheelChangeType]);

  const selectedMixing = useMemo(() => {
    const row = rows.find((item) => item.key === "mixing");
    return String(row?.proposed || row?.existing || "").trim();
  }, [rows]);

  useEffect(() => {
    let cancelled = false;

    const refreshByMixing = async () => {
      if (skipMixingRefreshRef.current) {
        skipMixingRefreshRef.current = false;
        return;
      }
      if (!selectedMixing) return;
      try {
        const payload = await fetchSimplexWheelChangeNotebookEntries({ page: 1, limit: 100, approval_status: "approved" });
        if (cancelled) return;
        const list = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.rows) ? payload.rows : Array.isArray(payload) ? payload : [];
        const latest = findLatestEntryForSelection(list, { mixing: selectedMixing, type: wheelChangeType });
        if (!latest) return;
        const savedRows = Array.isArray(latest.parameter_rows)
          ? latest.parameter_rows
          : Array.isArray(latest.parameters)
            ? latest.parameters
            : Array.isArray(latest.rows)
              ? latest.rows
              : latest.rows && typeof latest.rows === "object"
                ? latest.rows
                : [];
        setRows((current) => {
          const currentMixing = current.find((item) => item.key === "mixing");
          return normalizeRows(savedRows, wheelChangeType).map((item) =>
            item.key === "mixing" && currentMixing
              ? { ...item, existing: currentMixing.existing, proposed: currentMixing.proposed }
              : item
          );
        });
      } catch {
        // Keep current values when a mixing-specific history row isn't available.
      }
    };

    refreshByMixing();
    return () => {
      cancelled = true;
    };
  }, [selectedMixing, wheelChangeType]);

  const loadVersions = async () => {
    setLoadingVersions(true);
    try {
      const payload = await fetchSimplexWheelChangeNotebookEntries({ page: 1, limit: 200 });
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
    skipMixingRefreshRef.current = true;
    skipTypeRefreshRef.current = true;
    setWheelChangeType(version.data.type || DEFAULT_SIMPLEX_WHEEL_CHANGE_TYPE);
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
    if (selectedRows !== rowGroups["Type 1 - SB20"]) return;

    const nw1Value = rows.find((item) => item.key === "nw1")?.proposed || rows.find((item) => item.key === "nw1")?.existing || "";
    const nw2Value = rows.find((item) => item.key === "nw2")?.proposed || rows.find((item) => item.key === "nw2")?.existing || "";
    const totalDraftValue = computeType1Sb20TotalDraft({ nw1: nw1Value, nw2: nw2Value });

    setRows((current) => {
      const computedByKey = { totalDraft: totalDraftValue, draftConstant: "3.993" };

      const isUnchanged = current.every((item) => {
        if (!(item.key in computedByKey)) return true;
        const computed = computedByKey[item.key];
        return (item.existing || "") === computed && (item.proposed || "") === computed;
      });
      if (isUnchanged) return current;

      return current.map((item) =>
        item.key in computedByKey
          ? { ...item, existing: computedByKey[item.key], proposed: computedByKey[item.key] }
          : item
      );
    });
  }, [rows, selectedRows]);

  useEffect(() => {
    if (selectedRows !== rowGroups["Type 1 (LRSB)"]) return;

    const getValue = (key) => rows.find((item) => item.key === key)?.proposed || rows.find((item) => item.key === key)?.existing || "";

    const tpiValue = computeSimplexLrsbTpi({
      tw: getValue("md2"),
      tcwh: getValue("tw1"),
      tcwg: getValue("tw0"),
      frontRollerDia: getValue("md1"),
    });
    const tmValue = computeSimplexLrsbTm({ tpi: tpiValue, delHank: getValue("delHank") });
    const breakDraftValueResult = computeSimplexLrsbBreakDraftValue({ breakDraftCp: getValue("breakDraft") });
    const creelDraftValue = computeSimplexLrsbCreelDraft({ creelDraftChange: getValue("creelDraftChange") });
    const totalDraftValue = computeSimplexLrsbTotalDraft({ breakDraftCp: getValue("breakDraft"), cp: getValue("cp") });

    setRows((current) => {
      const computedByKey = {
        tf: tpiValue,
        tm: tmValue,
        breakDraftValue: breakDraftValueResult,
        creelDraft: creelDraftValue,
        totalDraft: totalDraftValue,
      };

      const isUnchanged = current.every((item) => {
        if (!(item.key in computedByKey)) return true;
        const computed = computedByKey[item.key];
        return (item.existing || "") === computed && (item.proposed || "") === computed;
      });
      if (isUnchanged) return current;

      return current.map((item) =>
        item.key in computedByKey
          ? { ...item, existing: computedByKey[item.key], proposed: computedByKey[item.key] }
          : item
      );
    });
  }, [rows, selectedRows]);

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
            onChange={(nextValue) =>
              setRows((current) =>
                current.map((item) => (item.key === row.key ? { ...item, [valueKey]: nextValue } : item))
              )
            }
            options={options}
            placeholder="Select"
            ariaLabel={row.label}
            disabled={row.readOnly === true}
          />
        );
      }

      return (
        <select
          className={className}
          value={value}
          disabled={row.readOnly === true}
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
        readOnly={row.readOnly === true}
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
          <InputScreenUploadButton className="ml-auto" />
        </div>

        <div className="grid grid-cols-1 gap-x-4 gap-y-5 md:grid-cols-2 xl:grid-cols-3 print:grid-cols-3">
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
            <label className="text-[14px] font-semibold text-slate-700">Wheel Change Type</label>
            <select
              className="w-full h-[42px] rounded-[10px] border border-slate-200 bg-[#F1F5F9] px-3 text-[14px] text-slate-700"
              value={wheelChangeType}
              onChange={(e) => setWheelChangeType(e.target.value)}
            >
              {SIMPLEX_WHEEL_CHANGE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
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
              {selectedRows.map((row) => (
                <tr key={row.key} className="border-b border-slate-200">
                  <td className="px-0 py-4 pr-6 font-semibold text-slate-700">{row.label}</td>
                  <td className="px-0 py-4 pr-6">{renderField(row, "existing")}</td>
                  <td className="px-0 py-4">{renderField(row, "proposed")}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
                        {getRowGroupForType(version.data.type).map((field) => (
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
