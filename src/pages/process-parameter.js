import { useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { MdCalendarToday, MdClose, MdPrint, MdSearch } from "react-icons/md";

import Footer from "@/components/Footer";
import CombinedProcessParameterPreview from "@/components/CombinedProcessParameterPreview";
import MixingProcessParameter from "@/views/mixing/processParameterDataEntry";
import CardingProcessParameter from "@/views/carding/processParameterDataEntry";
import BlowRoomProcessParameter from "@/views/blowroom/ProcessParameter";
import SimplexProcessParameter from "@/views/simplex/processParameterDataEntry";
import DrawFrameHeaderEntry from "@/views/draw-frame/DrawFrameHeaderEntry";
import SpinningProcessParameter from "@/views/spinning/processParameterDataEntry";
import AutoconerProcessParameter from "@/views/autoconer/ProcessParameter";
import AutoconerQ2 from "@/views/autoconer/AutoconerQ2";
import AutoconerQ3 from "@/views/autoconer/AutoconerQ3";
import { hasSubDepartmentAccess } from "@/utils/accessControl";
import { normalizeProcessParameterId, resolveProcessParameterDisplayId } from "@/utils/processParameterId";
import { getProcessParameterCountName, readProcessParameterRegistry } from "@/utils/processParameterRegistry";
import { loadLocalEntries } from "@/utils/localProcessParameterStore";
import useMixingCountOptions from "@/hooks/useMixingCountOptions";
import {
  buildProcessParameterOptions,
  PROCESS_PARAMETER_COUNT_OPTIONS,
  PROCESS_PARAMETER_CONSIGNEE_OPTIONS,
} from "@/data/processParameterMasterOptions";
import { getMixingProcessParameterEntries } from "@/apis/mixing";
import { fetchBlowroomProcessParametersApi } from "@/apis/blowroom";
import { getCardingProcessParameterEntries } from "@/apis/carding";
import { fetchSimplexProcessParameterEntries } from "@/apis/simplex";
import {
  fetchAutoconerProcessParameters,
  fetchAutoconerQ2Entries,
  fetchAutoconerQ3Entries,
} from "@/apis/autoconer";
import SearchableSelect from "@/components/SearchableSelect";
import {
  buildProcessParameterOptions,
  PROCESS_PARAMETER_CONSIGNEE_OPTIONS,
  PROCESS_PARAMETER_COUNT_OPTIONS,
} from "@/data/processParameterMasterOptions";
import styles from "@/styles/processParameterPage.module.css";

const updateExistingColumns = [
  "PP ID",
  "Mixing",
  "Blow Room",
  "Carding",
  "DF Breaker",
  "DF Finisher",
  "Simplex",
  "Spinning",
  "Autoconer PP",
  "AC-Q2",
  "AC-Q3",
];

const createBlankStatusRow = () => ({
  id: "",
  statuses: [false, false, false, false, false, false, false, false, false, false],
});

const PROCESS_PARAMETER_UI_STATE_KEY = "process-parameter-ui-state";

const COLUMN_TO_DEPARTMENT = {
  "Mixing": "Mixing",
  "Blow Room": "Blow Room",
  "Carding": "Carding",
  "DF Breaker": "Draw Frame",
  "DF Finisher": "Draw Frame",
  "Simplex": "Simplex",
  "Spinning": "Spinning",
  "Autoconer PP": "Autoconer",
  "AC-Q2": "Autoconer",
  "AC-Q3": "Autoconer",
};

const subDepartments = [
  { label: "Mixing", value: "Mixing" },
  { label: "Blow Room", value: "Blow Room" },
  { label: "Carding", value: "Carding" },
  { label: "Draw Frame", value: "Draw Frame" },
  { label: "Simplex", value: "Simplex" },
  { label: "Spinning", value: "Spinning" },
  { label: "Autoconer", value: "Autoconer" },
];

const normalizeRegistryId = (value) => String(value || "").trim();

// Only "PP-000N" rows belong in this unified list — legacy/foreign IDs (e.g. "#MQ-0001")
// from before the PP-prefixed scheme was adopted shouldn't surface here or count toward
// the next reserved ID.
const isCanonicalPpId = (value) => /^PP-\d+$/i.test(String(value || "").trim());

const getPpSequence = (id) => {
  const match = String(id || "").trim().match(/^PP-(\d+)$/i);
  return match ? Number(match[1]) || 0 : 0;
};

const getEntryRows = (response) =>
  Array.isArray(response?.data) ? response.data : Array.isArray(response) ? response : [];

// Shared across every source: the PP data-entry forms all submit these three fields under
// the same generic names regardless of department, so one extractor works for all of them.
const getEntryDetails = (entry) => ({
  consigneeName: entry?.consignee_name ?? entry?.consigneeName ?? "",
  countName: entry?.count_name ?? entry?.countName ?? "",
  creationDate: entry?.creation_date ?? entry?.creationDate ?? entry?.created_at ?? entry?.createdAt ?? "",
});

const buildFilterParams = (filters) => ({
  ...(filters?.consigneeFilter ? { consignee_name: filters.consigneeFilter } : {}),
  ...(filters?.countFilter ? { count_name: filters.countFilter } : {}),
  ...(filters?.dateFrom ? { date_from: filters.dateFrom } : {}),
  ...(filters?.dateTo ? { date_to: filters.dateTo } : {}),
});

// Each source's `getId` mirrors the entry_id extraction used by that department's own
// ProcessParameterDataEntry view, so remote completion state lines up with what those pages show.
// Draw Frame Breaker/Finisher and Spinning don't hit the backend yet — they save to the
// browser's local store (see localProcessParameterStore), so their source reads from there too
// (and filter query params are meaningless for them since there's no server round-trip).
const REMOTE_STATUS_SOURCES = [
  {
    index: 0,
    fetch: (filters) => getMixingProcessParameterEntries({ page: 1, limit: 200, ...buildFilterParams(filters) }),
    getId: (entry) => entry?.entry_id ?? entry?.param_id,
    isDone: (entry) => (entry?.status || "DONE") === "DONE",
    getDetails: getEntryDetails,
  },
  {
    index: 1,
    fetch: (filters) => fetchBlowroomProcessParametersApi({ page: 1, limit: 200, ...buildFilterParams(filters) }),
    getId: (entry) =>
      entry?.display_entry_id ?? entry?.process_parameter_id ?? entry?.parameter_id ?? entry?.param_id ?? entry?.br_code,
    isDone: () => true,
    getDetails: getEntryDetails,
  },
  {
    index: 2,
    fetch: (filters) => getCardingProcessParameterEntries({ page: 1, limit: 200, ...buildFilterParams(filters) }),
    getId: (entry) =>
      entry?.entry_id ?? entry?.param_id ?? entry?.qc_code ?? entry?.qc_id ?? entry?.process_parameter_id ?? entry?.id,
    isDone: () => true,
    getDetails: getEntryDetails,
  },
  {
    index: 3,
    fetch: () => Promise.resolve({ data: loadLocalEntries("draw-frame-breaker") }),
    getId: (entry) => entry?.param_id ?? entry?.entry_id,
    isDone: () => true,
    getDetails: getEntryDetails,
  },
  {
    index: 4,
    fetch: () => Promise.resolve({ data: loadLocalEntries("draw-frame-finisher") }),
    getId: (entry) => entry?.param_id ?? entry?.entry_id,
    isDone: () => true,
    getDetails: getEntryDetails,
  },
  {
    index: 5,
    fetch: (filters) => fetchSimplexProcessParameterEntries({ page: 1, limit: 200, ...buildFilterParams(filters) }),
    getId: (entry) => entry?.entry_id ?? entry?.process_parameter_id ?? entry?.param_id,
    isDone: () => true,
    getDetails: getEntryDetails,
  },
  {
    index: 6,
    fetch: () => Promise.resolve({ data: loadLocalEntries("spinning") }),
    getId: (entry) => entry?.param_id ?? entry?.entry_id,
    isDone: (entry) => (entry?.status || "DONE") === "DONE",
    getDetails: getEntryDetails,
  },
  {
    index: 7,
    fetch: (filters) => fetchAutoconerProcessParameters({ page: 1, limit: 200, ...buildFilterParams(filters) }),
    getId: (entry) => entry?.entry_id ?? entry?.ins_code ?? entry?.param_id,
    isDone: () => true,
    getDetails: getEntryDetails,
  },
  {
    index: 8,
    fetch: (filters) => fetchAutoconerQ2Entries({ page: 1, limit: 200, ...buildFilterParams(filters) }),
    getId: (entry) => entry?.entry_id ?? entry?.ins_code,
    isDone: () => true,
    getDetails: getEntryDetails,
  },
  {
    index: 9,
    fetch: (filters) => fetchAutoconerQ3Entries({ page: 1, limit: 200, ...buildFilterParams(filters) }),
    getId: (entry) => entry?.entry_id ?? entry?.ins_code,
    isDone: () => true,
    getDetails: getEntryDetails,
  },
];

const DEPARTMENT_COMPONENTS = {
  Mixing: MixingProcessParameter,
  Carding: CardingProcessParameter,
  "Blow Room": BlowRoomProcessParameter,
  "Draw Frame": DrawFrameHeaderEntry,
  Simplex: SimplexProcessParameter,
  Spinning: SpinningProcessParameter,
  Autoconer: AutoconerProcessParameter,
};

const AUTOCONER_COMPONENTS = {
  "Process Parameter": AutoconerProcessParameter,
  "PP - Autoconer Q2": AutoconerQ2,
  "PP - Autoconer Q3": AutoconerQ3,
};

const DEPARTMENT_TYPE_NAMES = {
  Mixing: "Process Parameter",
  Carding: "Process Parameter",
  "Blow Room": "Process Parameter",
  "Draw Frame": "PP - Breaker Drawing",
  Simplex: "Process Parameter",
  Spinning: "Process Parameter",
  Autoconer: "Process Parameter",
};

const makeTypeOption = (id, name, aliases = []) => ({ id, name, aliases });

const DEPARTMENT_TYPE_OPTION_OBJECTS = {
  Mixing: [makeTypeOption(1, "Process Parameter", ["Process Parameter"])],
  Carding: [makeTypeOption(1, "Process Parameter", ["Process Parameter"])],
  "Blow Room": [makeTypeOption(1, "Process Parameter", ["Process Parameter"])],
  "Draw Frame": [
    makeTypeOption(1, "PP - Breaker Drawing", ["PP - Breaker Drawing", "Process Parameter", "Draw Frame QC Header Entry", "Drawframe Header Entry"]),
    makeTypeOption(2, "PP - Finisher Drawing", ["PP - Finisher Drawing", "Finisher Drawing"]),
  ],
  Simplex: [makeTypeOption(1, "Process Parameter", ["Process Parameter"])],
  Spinning: [makeTypeOption(1, "Process Parameter", ["Process Parameter"])],
  Autoconer: [
    makeTypeOption(1, "Process Parameter", ["Process Parameter", "Process Parameter Data Entry"]),
    makeTypeOption(2, "PP - Autoconer Q2", ["PP - Autoconer Q2", "Autoconer Q2", "Q2"]),
    makeTypeOption(3, "PP - Autoconer Q3", ["PP - Autoconer Q3", "Autoconer Q3", "Q3"]),
  ],
};

const getDepartmentFormProps = (department, selectedTypeName, typeOptions) => {
  const baseProps = {
    selectedTypeName,
    selectedType: selectedTypeName,
    onTypeChange: () => { },
    standaloneSection: true,
    savedVersionsTargetId: "process-parameter-saved-versions",
  };

  if (department === "Simplex") {
    return {
      ...baseProps,
      typeOptions: typeOptions.map((item) => item.name),
    };
  }

  if (department === "Draw Frame") {
    return {
      ...baseProps,
      typeOptions,
      types: typeOptions,
      tablePortalTargetId: "process-parameter-saved-versions",
    };
  }

  if (department === "Autoconer") {
    return {
      ...baseProps,
      typeOptions,
      types: typeOptions.map((item) => item.name),
    };
  }

  if (department === "Carding") {
    return {
      ...baseProps,
      typeOptions,
      types: typeOptions,
    };
  }

  return {
    ...baseProps,
    typeOptions,
    types: typeOptions.map((item) => item.name),
  };
};

// One entry per matrix column (same order as updateExistingColumns.slice(1)), used to
// mount a hidden instance of each department's own form so its real getPreviewData() output
// can be read for the combined PP preview modal.
const COMBINED_PREVIEW_COLUMNS = [
  { key: "Mixing", label: "Mixing", department: "Mixing", typeName: "Process Parameter", Component: MixingProcessParameter },
  { key: "Blow Room", label: "Blow Room", department: "Blow Room", typeName: "Process Parameter", Component: BlowRoomProcessParameter },
  { key: "Carding", label: "Carding", department: "Carding", typeName: "Process Parameter", Component: CardingProcessParameter },
  { key: "Draw Frame Breaker", label: "DF Breaker", department: "Draw Frame", typeName: "PP - Breaker Drawing", Component: DrawFrameHeaderEntry },
  { key: "Draw Frame Finisher", label: "DF Finisher", department: "Draw Frame", typeName: "PP - Finisher Drawing", Component: DrawFrameHeaderEntry },
  { key: "Simplex", label: "Simplex", department: "Simplex", typeName: "Process Parameter", Component: SimplexProcessParameter },
  { key: "Spinning", label: "Spinning", department: "Spinning", typeName: "Process Parameter", Component: SpinningProcessParameter },
  { key: "Autoconer PP", label: "Autoconer PP", department: "Autoconer", typeName: "Process Parameter", Component: AutoconerProcessParameter },
  { key: "AC-Q2", label: "AC-Q2", department: "Autoconer", typeName: "PP - Autoconer Q2", Component: AutoconerQ2 },
  { key: "AC-Q3", label: "AC-Q3", department: "Autoconer", typeName: "PP - Autoconer Q3", Component: AutoconerQ3 },
];

const getHiddenPreviewProps = (column) => {
  const typeOptions = DEPARTMENT_TYPE_OPTION_OBJECTS[column.department] || [
    makeTypeOption(1, column.typeName, [column.typeName]),
  ];
  const baseProps = getDepartmentFormProps(column.department, column.typeName, typeOptions);
  return { ...baseProps, savedVersionsTargetId: "" };
};

export default function ProcessParameterPage() {
  const user = useSelector((state) => state.auth?.user);
  const accessByDepartment = useSelector((state) => state.auth?.accessByDepartment);
  const [activeTab, setActiveTab] = useState("new");
  const [selectedSubDepartment, setSelectedSubDepartment] = useState("");
  const [drawFrameType, setDrawFrameType] = useState("PP - Breaker Drawing");
  const [autoconerType, setAutoconerType] = useState("Process Parameter");
  const [selectedEntryId, setSelectedEntryId] = useState("");
  const [completedCells, setCompletedCells] = useState({});
  const [dynamicRows, setDynamicRows] = useState([]);
  const [remoteStatusMap, setRemoteStatusMap] = useState({});
  const [remoteCountNameMap, setRemoteCountNameMap] = useState({});
  const [remoteConsigneeNameMap, setRemoteConsigneeNameMap] = useState({});
  const [remoteDateMap, setRemoteDateMap] = useState({});
  const [countNameFilter, setCountNameFilter] = useState("");
  const [consigneeNameFilter, setConsigneeNameFilter] = useState("");
  const [dateFromFilter, setDateFromFilter] = useState("");
  const [dateToFilter, setDateToFilter] = useState("");
  const { countOptions: masterCountOptions } = useMixingCountOptions();
  const dateFromInputRef = useRef(null);
  const dateToInputRef = useRef(null);
  const componentRef = useRef(null);
  const [previewPpId, setPreviewPpId] = useState("");
  const [previewData, setPreviewData] = useState({});
  const previewRefs = useRef({});
  const [printMode, setPrintMode] = useState(null); // null | "matrix" | "row"
  const [pendingPrintRowId, setPendingPrintRowId] = useState("");
  const [openEditTabs, setOpenEditTabs] = useState([]);

  const visibleSubDepartments = useMemo(
    () => subDepartments.filter((item) => hasSubDepartmentAccess(accessByDepartment, item.value, user)),
    [accessByDepartment, user]
  );

  const currentDate = new Date().toLocaleDateString("en-IN");

  const loadRegistryRows = () =>
    readProcessParameterRegistry()
      .map((row) => ({
        id: normalizeRegistryId(row?.displayId),
        statuses: Array.isArray(row?.statuses) && row.statuses.length === 10
          ? row.statuses.slice(0, 10)
          : createBlankStatusRow().statuses,
      }))
      .filter((row) => row.id && isCanonicalPpId(row.id))
      .slice(0, 10);

  useEffect(() => {
    setDynamicRows(loadRegistryRows());
  }, []);

  const loadRemoteStatuses = async () => {
    const filters = { consigneeFilter, countFilter, dateFrom, dateTo };
    const results = await Promise.allSettled(
      REMOTE_STATUS_SOURCES.map((source) => source.fetch(filters))
    );

    const map = {};
    const countNameMap = {};
    const consigneeNameMap = {};
    const dateMap = {};
    results.forEach((result, sourceIndex) => {
      if (result.status !== "fulfilled") return;
      const source = REMOTE_STATUS_SOURCES[sourceIndex];
      getEntryRows(result.value).forEach((entry) => {
        const normalizedId = normalizeProcessParameterId(source.getId(entry));
        if (!normalizedId || !isCanonicalPpId(normalizedId) || !source.isDone(entry)) return;
        if (!map[normalizedId]) map[normalizedId] = createBlankStatusRow().statuses.slice();
        map[normalizedId][source.index] = true;

        // Older PP ids saved before the count-name lock existed have no entry in the
        // local registry, so fall back to whatever count name the earliest-saved
        // sub-department entry already has on the backend.
        const countName = String(entry?.count_name || "").trim();
        if (countName && !countNameMap[normalizedId]) countNameMap[normalizedId] = countName;

        // A PP id can have a different consignee name per sub-department, so keep
        // every distinct value seen for it (used to power the consignee filter).
        const consigneeName = String(entry?.consignee_name || "").trim();
        if (consigneeName) {
          if (!consigneeNameMap[normalizedId]) consigneeNameMap[normalizedId] = new Set();
          consigneeNameMap[normalizedId].add(consigneeName);
        }

        const creationDate = String(entry?.creation_date || "").split("T")[0];
        if (creationDate && (!dateMap[normalizedId] || creationDate < dateMap[normalizedId])) {
          dateMap[normalizedId] = creationDate;
        }
      });
    });

    setRemoteStatusMap(map);
    setRemoteCountNameMap(countNameMap);
    setRemoteConsigneeNameMap(
      Object.fromEntries(Object.entries(consigneeNameMap).map(([id, set]) => [id, Array.from(set)]))
    );
    setRemoteDateMap(dateMap);
  };

  useEffect(() => {
    loadRemoteStatuses();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadRemoteStatuses();
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consigneeFilter, countFilter, dateFrom, dateTo]);

  useEffect(() => {
    const handleStorageChange = () => {
      setDynamicRows(loadRegistryRows());
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        setDynamicRows(loadRegistryRows());
      }
    };

    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("focus", handleStorageChange);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("focus", handleStorageChange);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const selectedAutoconerType =
    selectedSubDepartment === "Autoconer" ? autoconerType : "Process Parameter";
  const SelectedComponent =
    selectedSubDepartment === "Autoconer"
      ? AUTOCONER_COMPONENTS[selectedAutoconerType] || AutoconerProcessParameter
      : DEPARTMENT_COMPONENTS[selectedSubDepartment] || null;
  const selectedTypeName =
    selectedSubDepartment === "Draw Frame"
      ? drawFrameType
      : selectedSubDepartment === "Autoconer"
        ? selectedAutoconerType
        : DEPARTMENT_TYPE_NAMES[selectedSubDepartment] || "Process Parameter";
  const typeOptions = DEPARTMENT_TYPE_OPTION_OBJECTS[selectedSubDepartment] || [makeTypeOption(1, selectedTypeName, [selectedTypeName])];
  const showFooter = ["Mixing", "Carding", "Blow Room", "Simplex", "Spinning", "Autoconer"].includes(
    selectedSubDepartment
  );
  const lockedCountName = selectedEntryId
    ? getProcessParameterCountName(selectedEntryId) ||
      remoteCountNameMap[normalizeProcessParameterId(selectedEntryId)] ||
      ""
    : "";
  const isEditingViaTab = openEditTabs.some((tab) => tab.tabId === activeTab);
  const showFormCard = activeTab === "new" || isEditingViaTab;
  const showListCard = activeTab === "existing";
  const [searchTerm, setSearchTerm] = useState("");

  const consigneeFilterOptions = useMemo(
    () => buildProcessParameterOptions(PROCESS_PARAMETER_CONSIGNEE_OPTIONS, [], consigneeFilter),
    [consigneeFilter]
  );
  const countFilterOptions = useMemo(
    () => buildProcessParameterOptions(PROCESS_PARAMETER_COUNT_OPTIONS, [], countFilter),
    [countFilter]
  );

  const mergedRows = useMemo(() => {
    const byId = new Map();
    dynamicRows.forEach((row) => byId.set(row.id, row));
    Object.keys(remoteStatusMap).forEach((id) => {
      if (!byId.has(id)) byId.set(id, { id, statuses: createBlankStatusRow().statuses });
    });

    return Array.from(byId.values())
      .map((row) => ({
        ...row,
        statuses: row.statuses.map((done, index) => done || Boolean(remoteStatusMap[row.id]?.[index])),
      }))
      .sort((a, b) => getPpSequence(b.id) - getPpSequence(a.id));
  }, [dynamicRows, remoteStatusMap]);

  const nextAvailableId = useMemo(() => {
    const highestSequence = mergedRows.reduce(
      (max, row) => Math.max(max, getPpSequence(row.id)),
      0
    );
    return `PP-${String(highestSequence + 1).padStart(4, "0")}`;
  }, [mergedRows]);

  const getRowCountName = (rowId) => getProcessParameterCountName(rowId) || remoteCountNameMap[rowId] || "";
  const getRowConsigneeNames = (rowId) => remoteConsigneeNameMap[rowId] || [];
  const getRowDate = (rowId) => remoteDateMap[rowId] || "";

  // Same master option lists (plus whatever backend values aren't in them yet) used by
  // the PP data-entry forms, so the filter dropdowns offer the full catalogue rather than
  // only the count/consignee names that already appear in the matrix.
  const countNameFilterOptions = useMemo(() => {
    const baseCountNames = masterCountOptions.length
      ? masterCountOptions.map((option) => option.count_name || option.label || option.value)
      : PROCESS_PARAMETER_COUNT_OPTIONS;
    const usedCountNames = mergedRows.map((row) => getRowCountName(row.id)).filter(Boolean);
    return buildProcessParameterOptions(baseCountNames, usedCountNames).sort((a, b) =>
      a.localeCompare(b)
    );
  }, [mergedRows, remoteCountNameMap, masterCountOptions]);

  const consigneeNameFilterOptions = useMemo(() => {
    const usedConsigneeNames = mergedRows.flatMap((row) => getRowConsigneeNames(row.id));
    return buildProcessParameterOptions(PROCESS_PARAMETER_CONSIGNEE_OPTIONS, usedConsigneeNames).sort(
      (a, b) => a.localeCompare(b)
    );
  }, [mergedRows, remoteConsigneeNameMap]);

  const filteredRows = mergedRows.filter((row) => {
    if (!String(row.id).toLowerCase().includes(String(searchTerm).toLowerCase())) return false;

    if (countNameFilter && getRowCountName(row.id) !== countNameFilter) return false;

    if (consigneeNameFilter && !getRowConsigneeNames(row.id).includes(consigneeNameFilter)) return false;

    const rowDate = getRowDate(row.id);
    if (dateFromFilter && (!rowDate || rowDate < dateFromFilter)) return false;
    if (dateToFilter && (!rowDate || rowDate > dateToFilter)) return false;

    return true;
  });
  const getRowStatuses = (rowId) => {
    const base =
      mergedRows.find((row) => row.id === rowId)?.statuses || createBlankStatusRow().statuses;
    const overrides = completedCells[rowId];
    if (!overrides) return base;
    return base.map((done, index) => done || Boolean(overrides[index]));
  };

  const findIdentifierValue = (items) => {
    const match = items.find(
      (item) => item?.label === "Process Parameter ID" || item?.label === "Entry ID"
    );
    return match?.value;
  };

  useEffect(() => {
    if (!previewPpId) {
      setPreviewData({});
      return;
    }

    // Every column now gets a real entryId (see the hidden-mount render below) and attempts
    // its own fetch/match against the backend, independent of the matrix's aggregated done
    // status (which can be stale/incomplete if the status-fetch sweep missed or failed for
    // a source). Columns that genuinely have no saved entry will simply time out with their
    // blank output, which is still the correct result for them.
    const pendingKeys = new Set(COMBINED_PREVIEW_COLUMNS.map((column) => column.key));
    const targetId = normalizeProcessParameterId(previewPpId);
    const startedAt = Date.now();

    const poll = () => {
      pendingKeys.forEach((key) => {
        const items = previewRefs.current[key]?.getPreviewData?.();
        if (!Array.isArray(items)) return;

        const identifier = findIdentifierValue(items);
        const isReady = Boolean(identifier) && normalizeProcessParameterId(identifier) === targetId;
        const timedOut = Date.now() - startedAt > 15000;

        if (isReady || timedOut) {
          pendingKeys.delete(key);
          setPreviewData((current) => ({ ...current, [key]: { items, ready: true } }));
        }
      });

      if (!pendingKeys.size) clearInterval(intervalId);
    };

    const intervalId = setInterval(poll, 250);
    poll();

    return () => clearInterval(intervalId);
  }, [previewPpId]);

  const openCombinedPreview = (rowId) => {
    if (!rowId) return;
    previewRefs.current = {};
    setPreviewData({});
    setPreviewPpId(rowId);
  };

  const closeCombinedPreview = () => {
    setPreviewPpId("");
    setPreviewData({});
  };

  const handlePrintMatrix = () => {
    setPrintMode("matrix");
  };

  const openDatePicker = (inputRef) => {
    const input = inputRef.current;
    if (!input) return;
    if (typeof input.showPicker === "function") {
      input.showPicker();
    } else {
      input.focus();
    }
  };

  const clearAllFilters = () => {
    setSearchTerm("");
    setConsigneeNameFilter("");
    setCountNameFilter("");
    setDateFromFilter("");
    setDateToFilter("");
  };

  const handlePrintRow = (rowId) => {
    if (!rowId) return;
    openCombinedPreview(rowId);
    setPendingPrintRowId(rowId);
    setPrintMode("row");
  };

  // Resets print mode once the browser's print dialog closes (works for both the
  // "Print" button flow and Ctrl+P / the OS print shortcut).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleAfterPrint = () => {
      if (printMode === "row") closeCombinedPreview();
      setPrintMode(null);
      setPendingPrintRowId("");
    };
    window.addEventListener("afterprint", handleAfterPrint);
    return () => window.removeEventListener("afterprint", handleAfterPrint);
  }, [printMode]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.classList.toggle("pp-printing", Boolean(printMode));
    return () => document.body.classList.remove("pp-printing");
  }, [printMode]);

  useEffect(() => {
    if (printMode !== "matrix") return;
    const frame = requestAnimationFrame(() => window.print());
    return () => cancelAnimationFrame(frame);
  }, [printMode]);

  useEffect(() => {
    if (printMode !== "row" || !pendingPrintRowId || pendingPrintRowId !== previewPpId) return;
    const allReady = COMBINED_PREVIEW_COLUMNS.every((column) => previewData[column.key]?.ready);
    if (!allReady) return;
    const frame = requestAnimationFrame(() => window.print());
    return () => cancelAnimationFrame(frame);
  }, [printMode, pendingPrintRowId, previewPpId, previewData]);

  const upsertRowStatus = (rowId, columnIndex, isDone = true) => {
    if (!rowId) return;

    setDynamicRows((currentRows) => {
      const nextRows = [...currentRows];
      const rowIndex = nextRows.findIndex((row) => String(row.id) === String(rowId));
      const baseRow = rowIndex >= 0 ? nextRows[rowIndex] : { ...createBlankStatusRow(), id: rowId };
      const nextStatuses = [...(baseRow.statuses || createBlankStatusRow().statuses)];
      nextStatuses[columnIndex] = isDone;
      const nextRow = { ...baseRow, id: String(rowId), statuses: nextStatuses };

      if (rowIndex >= 0) nextRows[rowIndex] = nextRow;
      else nextRows.unshift(nextRow);

      return nextRows;
    });

    setCompletedCells((current) => {
      const next = { ...current };
      const nextStatuses = [...(next[rowId] || createBlankStatusRow().statuses)];
      nextStatuses[columnIndex] = isDone;
      next[rowId] = nextStatuses;
      return next;
    });

  };

  const getColumnIndexForDepartment = () => {
    if (selectedSubDepartment === "Draw Frame") {
      return drawFrameType === "PP - Finisher Drawing" ? 5 : 4;
    }
    if (selectedSubDepartment === "Autoconer") {
      if (autoconerType === "PP - Autoconer Q2") return 9;
      if (autoconerType === "PP - Autoconer Q3") return 10;
      return 8;
    }
    const mapping = {
      Mixing: 1,
      "Blow Room": 2,
      Carding: 3,
      Simplex: 6,
      Spinning: 7,
    };
    return mapping[selectedSubDepartment] ?? -1;
  };

  const refreshRegistryRows = () => {
    setDynamicRows(loadRegistryRows());
    loadRemoteStatuses();
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(PROCESS_PARAMETER_UI_STATE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved?.activeTab === "new" || saved?.activeTab === "existing") {
        setActiveTab(saved.activeTab);
      }
      if (typeof saved?.selectedSubDepartment === "string") {
        setSelectedSubDepartment(saved.selectedSubDepartment);
      }
      if (typeof saved?.selectedEntryId === "string") {
        setSelectedEntryId(saved.selectedEntryId);
      }
      if (typeof saved?.drawFrameType === "string") {
        setDrawFrameType(saved.drawFrameType);
      }
      if (typeof saved?.autoconerType === "string") {
        setAutoconerType(saved.autoconerType);
      }
    } catch {
      // ignore storage issues
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        PROCESS_PARAMETER_UI_STATE_KEY,
        JSON.stringify({
          activeTab,
          selectedSubDepartment,
          selectedEntryId,
          drawFrameType,
          autoconerType,
        })
      );
    } catch {
      // ignore storage issues
    }
  }, [activeTab, selectedSubDepartment, selectedEntryId, drawFrameType, autoconerType]);

  const handleMatrixCellClick = (rowId, columnIndex) => {
    const columnName = updateExistingColumns[columnIndex + 1];
    const department = COLUMN_TO_DEPARTMENT[columnName];
    if (!department) return;

    const nextDrawFrameType =
      department === "Draw Frame"
        ? columnName === "DF Finisher"
          ? "PP - Finisher Drawing"
          : "PP - Breaker Drawing"
        : null;
    const nextAutoconerType =
      department === "Autoconer"
        ? columnName === "AC-Q2"
          ? "PP - Autoconer Q2"
          : columnName === "AC-Q3"
            ? "PP - Autoconer Q3"
            : "Process Parameter"
        : null;

    // Every cell (done or pending) opens its own tab in the tab bar (alongside
    // "Create New PP" / "Update Existing PP") instead of editing inline below the
    // matrix, so several entries can be worked on side by side without losing the
    // matrix view.
    const tabId = `edit:${rowId}:${columnName}`;
    setOpenEditTabs((current) =>
      current.some((tab) => tab.tabId === tabId)
        ? current
        : [...current, { tabId, rowId, department, drawFrameType: nextDrawFrameType, autoconerType: nextAutoconerType, label: `${rowId} · ${columnName}` }]
    );
    setSelectedEntryId(rowId);
    setSelectedSubDepartment(department);
    if (nextDrawFrameType) setDrawFrameType(nextDrawFrameType);
    if (nextAutoconerType) setAutoconerType(nextAutoconerType);
    setActiveTab(tabId);
  };

  const handleSelectEditTab = (tabId) => {
    const tab = openEditTabs.find((item) => item.tabId === tabId);
    if (!tab) return;
    setSelectedEntryId(tab.rowId);
    setSelectedSubDepartment(tab.department);
    if (tab.drawFrameType) setDrawFrameType(tab.drawFrameType);
    if (tab.autoconerType) setAutoconerType(tab.autoconerType);
    setActiveTab(tabId);
  };

  const handleCloseEditTab = (tabId, event) => {
    event.stopPropagation();
    setOpenEditTabs((current) => current.filter((tab) => tab.tabId !== tabId));
    setActiveTab((current) => (current === tabId ? "existing" : current));
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSelectedEntryId("");
  };

  const handleSubDepartmentChange = (value) => {
    setSelectedSubDepartment(value);
    if (value === "Draw Frame") {
      setDrawFrameType((current) => current || "PP - Breaker Drawing");
    }
    if (value === "Autoconer") {
      setAutoconerType((current) => current || "Process Parameter");
    }
  };

  return (
    <section
      className={`${styles.page} ${printMode === "matrix" ? styles.printMatrixMode : ""} ${
        printMode === "row" ? styles.printRowMode : ""
      }`}
    >
      <div className={styles.shell}>
        <div className={styles.panel}>
          <header className={styles.header}>
            <div>
              <h1>Process Parameter</h1>
            </div>
          </header>

          <div className={styles.subHeaderRow}>
            {activeTab === "new" ? (
              <label className={styles.subDeptField}>
                <span>Sub Department</span>
                <select
                  value={selectedSubDepartment}
                  onChange={(event) => handleSubDepartmentChange(event.target.value)}
                >
                  <option value="">Select sub-department</option>
                  {visibleSubDepartments.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <div />
            )}
            <div className={styles.subHeaderRight}>
              {showListCard ? (
                <button
                  type="button"
                  className={styles.printMatrixButton}
                  onClick={handlePrintMatrix}
                  title="Print this matrix"
                >
                  <MdPrint /> Print Matrix
                </button>
              ) : null}
              <div className={styles.currentDate}>Current Date : {currentDate}</div>
            </div>
          </div>

          <div className={styles.tabBar} role="tablist" aria-label="Process parameter mode">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "new"}
              className={`${styles.tabButton} ${activeTab === "new" ? styles.tabButtonActive : ""}`}
              onClick={() => handleTabChange("new")}
            >
              Create New PP
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "existing"}
              className={`${styles.tabButton} ${activeTab === "existing" ? styles.tabButtonActive : ""}`}
              onClick={() => handleTabChange("existing")}
            >
              Update Existing PP
            </button>
            {openEditTabs.map((tab) => (
              <button
                key={tab.tabId}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.tabId}
                className={`${styles.tabButton} ${styles.editTabButton} ${
                  activeTab === tab.tabId ? styles.tabButtonActive : ""
                }`}
                onClick={() => handleSelectEditTab(tab.tabId)}
              >
                {tab.label}
                <span
                  className={styles.editTabClose}
                  role="button"
                  tabIndex={0}
                  aria-label={`Close ${tab.label} tab`}
                  onClick={(event) => handleCloseEditTab(tab.tabId, event)}
                >
                  ×
                </span>
              </button>
            ))}
          </div>

          {showListCard ? (
            <div className={styles.listCard}>
              <div className={styles.listToolbar}>
                <input
                  type="text"
                  className={styles.searchInput}
                  placeholder="Search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                />
              </div>

              <div className={styles.filterRow}>
                <label className={styles.filterField}>
                  <span>Consignee Name</span>
                  <SearchableSelect
                    className={styles.filterInput}
                    value={consigneeFilter}
                    onChange={setConsigneeFilter}
                    options={consigneeFilterOptions}
                    placeholder="Search or select consignee name"
                    ariaLabel="Filter by Consignee Name"
                  />
                </label>

                <label className={styles.filterField}>
                  <span>Count Name</span>
                  <SearchableSelect
                    className={styles.filterInput}
                    value={countFilter}
                    onChange={setCountFilter}
                    options={countFilterOptions}
                    placeholder="Search or select count name"
                    ariaLabel="Filter by Count Name"
                  />
                </label>

                <label className={styles.filterField}>
                  <span>Date From</span>
                  <input
                    type="date"
                    className={styles.filterInput}
                    value={dateFrom}
                    onChange={(event) => setDateFrom(event.target.value)}
                  />
                </div>

                <div className={styles.selectFilterWrap}>
                  <select
                    className={styles.filterSelect}
                    value={consigneeNameFilter}
                    onChange={(event) => setConsigneeNameFilter(event.target.value)}
                    aria-label="Filter by consignee name"
                  >
                    <option value="">Consignee Name</option>
                    {consigneeNameFilterOptions.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className={styles.dateClearButton}
                    onClick={() => setConsigneeNameFilter("")}
                    disabled={!consigneeNameFilter}
                    aria-label="Clear consignee name filter"
                    title="Clear consignee name filter"
                  >
                    <MdClose />
                  </button>
                </div>

                <div className={styles.selectFilterWrap}>
                  <select
                    className={styles.filterSelect}
                    value={countNameFilter}
                    onChange={(event) => setCountNameFilter(event.target.value)}
                    aria-label="Filter by count name"
                  >
                    <option value="">Count Name</option>
                    {countNameFilterOptions.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className={styles.dateClearButton}
                    onClick={() => setCountNameFilter("")}
                    disabled={!countNameFilter}
                    aria-label="Clear count name filter"
                    title="Clear count name filter"
                  >
                    <MdClose />
                  </button>
                </div>

                <div className={styles.dateRangeFilter}>
                  <label className={styles.dateFieldWrap}>
                    <span className={styles.dateFieldLabel}>From Date</span>
                    <div className={styles.dateInputWrap}>
                      <button
                        type="button"
                        className={styles.dateCalendarButton}
                        onClick={() => openDatePicker(dateFromInputRef)}
                        aria-label="Open from date calendar"
                        title="Open calendar"
                      >
                        <MdCalendarToday />
                      </button>
                      <input
                        ref={dateFromInputRef}
                        type="date"
                        className={styles.filterDateInput}
                        value={dateFromFilter}
                        onChange={(event) => setDateFromFilter(event.target.value)}
                        aria-label="Filter from date"
                      />
                      {dateFromFilter ? (
                        <button
                          type="button"
                          className={styles.dateClearButton}
                          onClick={() => setDateFromFilter("")}
                          aria-label="Clear from date"
                          title="Clear from date"
                        >
                          <MdClose />
                        </button>
                      ) : null}
                    </div>
                  </label>
                  <span className={styles.dateRangeSeparator}>to</span>
                  <label className={styles.dateFieldWrap}>
                    <span className={styles.dateFieldLabel}>To Date</span>
                    <div className={styles.dateInputWrap}>
                      <button
                        type="button"
                        className={styles.dateCalendarButton}
                        onClick={() => openDatePicker(dateToInputRef)}
                        aria-label="Open to date calendar"
                        title="Open calendar"
                      >
                        <MdCalendarToday />
                      </button>
                      <input
                        ref={dateToInputRef}
                        type="date"
                        className={styles.filterDateInput}
                        value={dateToFilter}
                        onChange={(event) => setDateToFilter(event.target.value)}
                        aria-label="Filter to date"
                      />
                      {dateToFilter ? (
                        <button
                          type="button"
                          className={styles.dateClearButton}
                          onClick={() => setDateToFilter("")}
                          aria-label="Clear to date"
                          title="Clear to date"
                        >
                          <MdClose />
                        </button>
                      ) : null}
                    </div>
                  </label>
                </div>

                <button
                  type="button"
                  className={styles.clearFiltersButton}
                  onClick={clearAllFilters}
                  disabled={
                    !searchTerm &&
                    !consigneeNameFilter &&
                    !countNameFilter &&
                    !dateFromFilter &&
                    !dateToFilter
                  }
                  title="Clear all filters"
                >
                  Clear Filter
                </button>
              </div>

              <div className={styles.matrixWrap}>
                <table className={styles.matrixTable}>
                  <thead>
                    <tr>
                      <th>{updateExistingColumns[0]}</th>
                      <th>Count Name</th>
                      {updateExistingColumns.slice(1).map((column) => (
                        <th key={column}>{column}</th>
                      ))}
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((row) => {
                      const rowStatuses = getRowStatuses(row.id);
                      const allSubDepartmentsDone = rowStatuses.every(Boolean);
                      return (
                      <tr key={row.id}>
                        <td className={styles.matrixIdCell}>
                          <button
                            type="button"
                            className={styles.matrixIdButton}
                            onClick={() => openCombinedPreview(row.id)}
                            title="View combined preview"
                          >
                            {row.id}
                          </button>
                        </td>
                        <td className={styles.matrixCountNameCell} title={getRowCountName(row.id) || ""}>
                          {getRowCountName(row.id) || "-"}
                        </td>
                        {rowStatuses.map((done, index) => (
                          <td key={`${row.id}-${index}`} className={styles.matrixStatusCell}>
                            <button
                              type="button"
                              className={done ? styles.statusDone : styles.statusPending}
                              onClick={done ? undefined : () => handleMatrixCellClick(row.id, index)}
                              disabled={done}
                              aria-label={`${row.id} ${updateExistingColumns[index + 1]} ${done ? "completed" : "pending"}`}
                              title={done ? "Completed" : "Opens in a new tab"}
                            >
                              {done ? "✓" : ""}
                            </button>
                          </td>
                        ))}
                        <td className={styles.matrixActionCell}>
                          <button
                            type="button"
                            className={styles.matrixPrintButton}
                            onClick={() => handlePrintRow(row.id)}
                            disabled={!allSubDepartmentsDone}
                            aria-label={`Print ${row.id}`}
                            title={
                              allSubDepartmentsDone
                                ? "Print this row's preview"
                                : "Complete all sub-departments before printing"
                            }
                          >
                            <MdPrint />
                          </button>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

            </div>
          ) : (
            null
          )}

          {showFormCard ? (
            <div className={styles.formCard}>
              {SelectedComponent ? (
                <SelectedComponent
                  key={`${selectedSubDepartment}-${selectedTypeName}-${selectedEntryId || "new"}`}
                  ref={componentRef}
                  onSubmitSuccess={(response) => {
                    const nextEntryId = resolveProcessParameterDisplayId(response, selectedEntryId);

                    if (nextEntryId) {
                      if (!selectedEntryId) setSelectedEntryId(nextEntryId);
                      refreshRegistryRows();
                    }
                  }}
                  entryId={selectedEntryId}
                  nextEntryIdPreview={nextAvailableId}
                  lockedCountName={lockedCountName}
                  {...getDepartmentFormProps(selectedSubDepartment, selectedTypeName, typeOptions)}
                  onTypeChange={
                    selectedSubDepartment === "Draw Frame"
                      ? (nextType) => setDrawFrameType(nextType)
                      : selectedSubDepartment === "Autoconer"
                        ? (nextType) => setAutoconerType(nextType)
                        : () => { }
                  }
                />
              ) : (
                <div className={styles.messageBox}>
                  Open the selected department to view its process parameter form.
                </div>
              )}
              {showFooter ? (
                <div className={styles.footerWrap}>
                  <Footer
                    onBack={() => { }}
                    onClear={() => componentRef.current?.clear?.()}
                    onSave={async () => {
                      const valid = componentRef.current?.validate?.();
                      if (valid === false) return;
                      const previewItems = componentRef.current?.getPreviewData?.() || [];
                      const result = await componentRef.current?.submit?.();
                      refreshRegistryRows();
                      const batchDisplayId = resolveProcessParameterDisplayId(result, selectedEntryId);
                      if (batchDisplayId && !selectedEntryId) setSelectedEntryId(batchDisplayId);

                      const colIndex = getColumnIndexForDepartment();
                      const isSuccess = result !== false || batchDisplayId;
                      if (isSuccess && batchDisplayId && colIndex > 0) {
                        upsertRowStatus(batchDisplayId, colIndex - 1, true);
                      }

                      if (isSuccess) {
                        try {
                          await recordSubmittedNotebook({
                            department: "Quality Control",
                            subDepartment: selectedSubDepartment,
                            notebookName: selectedTypeName,
                            entryId: batchDisplayId || selectedEntryId,
                            previewItems,
                            user,
                          });
                        } catch (error) {
                          console.warn(
                            "Process parameter submitted notebook record failed:",
                            error?.response?.data || error?.message || error
                          );
                        }
                      }
                    }}
                    saveLabel="Save Record"
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          <div id="process-parameter-saved-versions" className={styles.savedVersionsSlot} />
        </div>
      </div>

      {previewPpId ? (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            width: 0,
            height: 0,
            overflow: "hidden",
            opacity: 0,
            pointerEvents: "none",
          }}
        >
          {COMBINED_PREVIEW_COLUMNS.map((column) => {
            const HiddenComponent = column.Component;
            return (
              <HiddenComponent
                key={`${previewPpId}-${column.key}`}
                ref={(instance) => {
                  previewRefs.current[column.key] = instance;
                }}
                entryId={previewPpId}
                {...getHiddenPreviewProps(column)}
              />
            );
          })}
        </div>
      ) : null}

      <CombinedProcessParameterPreview
        open={Boolean(previewPpId)}
        ppId={previewPpId}
        columns={COMBINED_PREVIEW_COLUMNS}
        doneMap={previewPpId ? getRowStatuses(previewPpId) : []}
        dataByColumn={previewData}
        onClose={closeCombinedPreview}
        onPrint={() => {
          setPendingPrintRowId(previewPpId);
          setPrintMode("row");
        }}
      />
    </section>
  );
}
