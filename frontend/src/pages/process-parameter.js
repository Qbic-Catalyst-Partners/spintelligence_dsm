import { useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { MdPrint, MdSearch } from "react-icons/md";

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
import { hasSubDepartmentAccess, isFullAccessUser } from "@/utils/accessControl";
import { normalizeProcessParameterId, resolveProcessParameterDisplayId } from "@/utils/processParameterId";
import {
  getProcessParameterCountName,
  readProcessParameterRegistry,
  resetProcessParameterLocalState,
} from "@/utils/processParameterRegistry";
import { loadLocalEntries } from "@/utils/localProcessParameterStore";
import { fetchDrawFrameHeaderEntries } from "@/apis/draw-frame";
import {
  buildProcessParameterOptions,
  PROCESS_PARAMETER_COUNT_OPTIONS,
  PROCESS_PARAMETER_CONSIGNEE_OPTIONS,
} from "@/data/processParameterMasterOptions";
import { getMixingProcessParameterEntries, fetchMixingCountOptions } from "@/apis/mixing";
import { fetchBlowroomProcessParametersApi } from "@/apis/blowroom";
import { getCardingProcessParameterEntries } from "@/apis/carding";
import { fetchSimplexProcessParameterEntries } from "@/apis/simplex";
import {
  fetchAutoconerProcessParameters,
  fetchAutoconerQ2Entries,
  fetchAutoconerQ3Entries,
  fetchAutoconerConsigneeMaster,
} from "@/apis/autoconer";
import { fetchPpThresholdsAPI } from "@/apis/ppThresholdApi";
import { fetchSupervisorTicketsApi } from "@/apis/supervisorApi";
import { fetchNextProcessParameterId } from "@/apis/processParameter";
import { getColumnForNotebookKey } from "@/utils/ppNotebookKeys";
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

const getPpSequence = (value) => {
  const match = String(value || "").trim().match(/(\d+)/);
  return match ? Number(match[1]) : 0;
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
// Spinning doesn't hit the backend yet — it saves to the browser's local store (see
// localProcessParameterStore), so its source reads from there too (filter query params are
// meaningless for it since there's no server round-trip). Draw Frame Breaker/Finisher now save
// via submitDrawFrameHeaderEntry/fetchDrawFrameHeaderEntries (/drawframe/header), distinguished
// by the entry_scope field.
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
      entry?.entry_id ?? entry?.display_entry_id ?? entry?.process_parameter_id ?? entry?.parameter_id ?? entry?.param_id ?? entry?.br_code,
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
    fetch: async () => {
      const response = await fetchDrawFrameHeaderEntries({ page: 1, limit: 200 });
      const allRows = getEntryRows(response);
      return { data: allRows.filter((row) => (row?.entry_scope || "").toLowerCase() === "breaker") };
    },
    getId: (entry) => entry?.param_id ?? entry?.entry_id,
    isDone: () => true,
    getDetails: getEntryDetails,
  },
  {
    index: 4,
    fetch: async () => {
      const response = await fetchDrawFrameHeaderEntries({ page: 1, limit: 200 });
      const allRows = getEntryRows(response);
      return { data: allRows.filter((row) => (row?.entry_scope || "").toLowerCase() === "finisher") };
    },
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
  const [masterCountNames, setMasterCountNames] = useState([]);
  const [masterConsigneeNames, setMasterConsigneeNames] = useState([]);
  // Per-notebook completion thresholds (PP Threshold page) and any
  // PP_NOTEBOOK_INCOMPLETE tickets already raised, so the matrix can show
  // each column's threshold, mark a pending cell overdue, and surface an
  // existing escalation ticket instead of the operator finding out cold.
  const [ppThresholdMap, setPpThresholdMap] = useState({});
  const [ppTicketMap, setPpTicketMap] = useState({});
  const [consigneeFilter, setConsigneeFilter] = useState("");
  const [countFilter, setCountFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
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
    const filters = {
      consigneeFilter,
      countFilter,
      dateFrom,
      dateTo,
    };
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

  // Master Count Name / Consignee Name lists for the "Update Existing PP" filter
  // dropdowns — fetched once from the backend so every known name is selectable,
  // not just the ones already seen in currently-loaded PP rows.
  useEffect(() => {
    let cancelled = false;

    fetchMixingCountOptions()
      .then((options) => {
        if (cancelled) return;
        setMasterCountNames(
          (Array.isArray(options) ? options : [])
            .map((option) => String(option?.count_name || option?.label || option?.value || "").trim())
            .filter(Boolean)
        );
      })
      .catch(() => {
        if (!cancelled) setMasterCountNames([]);
      });

    fetchAutoconerConsigneeMaster()
      .then((options) => {
        if (cancelled) return;
        setMasterConsigneeNames(
          (Array.isArray(options) ? options : []).map((option) => String(option || "").trim()).filter(Boolean)
        );
      })
      .catch(() => {
        if (!cancelled) setMasterConsigneeNames([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Per-notebook completion thresholds (PP Threshold page) and any
  // PP_NOTEBOOK_INCOMPLETE tickets already raised for this PP id/notebook —
  // used to mark overdue cells and link to an existing escalation ticket.
  useEffect(() => {
    let cancelled = false;

    fetchPpThresholdsAPI()
      .then((rows) => {
        if (cancelled) return;
        const map = {};
        (Array.isArray(rows) ? rows : []).forEach((row) => {
          const notebookName = String(
            row?.notebook_name || row?.notebookName || row?.notebook || row?.screen_name || ""
          ).trim();
          if (!notebookName) return;
          const hours = Number(row?.completion_threshold_hours ?? row?.completionThresholdHours);
          if (!Number.isFinite(hours) || hours <= 0) return;
          map[notebookName] = hours;
        });
        setPpThresholdMap(map);
      })
      .catch(() => {
        if (!cancelled) setPpThresholdMap({});
      });

    fetchSupervisorTicketsApi({ ticket_type: "pp_notebook_incomplete", limit: 500 })
      .then((response) => {
        if (cancelled) return;
        const rows = Array.isArray(response)
          ? response
          : Array.isArray(response?.data)
            ? response.data
            : Array.isArray(response?.tickets)
              ? response.tickets
              : [];
        const map = {};
        rows.forEach((ticket) => {
          const ticketType = String(ticket?.ticket_type || ticket?.ticketType || "").trim().toLowerCase();
          if (ticketType && ticketType !== "pp_notebook_incomplete") return;
          const entryIdValue = String(
            ticket?.entry_id || ticket?.entryId || ticket?.pp_id || ticket?.ppId || ""
          ).trim();
          const notebookName = String(
            ticket?.notebook || ticket?.notebook_name || ticket?.notebookName || ticket?.screen_name || ""
          ).trim();
          if (!entryIdValue || !notebookName) return;
          map[`${entryIdValue}::${notebookName}`] =
            ticket?.ticket_id || ticket?.ticketId || ticket?.id || ticket?._id || true;
        });
        setPpTicketMap(map);
      })
      .catch(() => {
        if (!cancelled) setPpTicketMap({});
      });

    return () => {
      cancelled = true;
    };
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

  // Fallback only: purely local to this browser's matrix/registry view, blind to what other
  // departments/browsers have already claimed on the backend (see PP-0022 incident — this
  // local calc suggested an id another department had already taken with a different count
  // name). The real source of truth is the backend's global sequence, fetched below.
  const localNextAvailableId = useMemo(() => {
    const highestSequence = mergedRows.reduce(
      (max, row) => Math.max(max, getPpSequence(row.id)),
      0
    );
    return `PP-${String(highestSequence + 1).padStart(4, "0")}`;
  }, [mergedRows]);

  const [backendNextAvailableId, setBackendNextAvailableId] = useState("");

  const refreshNextAvailableId = async () => {
    const backendId = await fetchNextProcessParameterId();
    setBackendNextAvailableId(backendId || "");
  };

  useEffect(() => {
    refreshNextAvailableId();
  }, []);

  const nextAvailableId = backendNextAvailableId || localNextAvailableId;

  const getRowCountName = (rowId) => getProcessParameterCountName(rowId) || remoteCountNameMap[rowId] || "";
  const getRowConsigneeNames = (rowId) => remoteConsigneeNameMap[rowId] || [];
  const getRowDate = (rowId) => remoteDateMap[rowId] || "";

  const getColumnThresholdHours = (columnName) => ppThresholdMap[columnName] || null;

  // A pending cell is overdue once the PP id's creation date is further back
  // than that notebook's own configured completion_threshold_hours — mirrors
  // the backend's generatePpNotebookBatchIncompleteTickets logic (MIN(submitted_at)
  // across the PP id's notebooks vs. that notebook's threshold), just computed
  // client-side from whatever date precision we already have.
  const isCellOverdue = (rowId, columnName, done) => {
    if (done) return false;
    const hours = getColumnThresholdHours(columnName);
    if (!hours) return false;
    const createdDate = getRowDate(rowId);
    if (!createdDate) return false;
    const createdTime = new Date(createdDate).getTime();
    if (!Number.isFinite(createdTime)) return false;
    return (Date.now() - createdTime) / (1000 * 60 * 60) > hours;
  };

  // Returns the ticket id string when known, "" when a ticket exists but no
  // id was returned by the API, or null when no ticket exists for this cell.
  const getCellTicketId = (rowId, columnName) => {
    const value = ppTicketMap[`${rowId}::${columnName}`];
    if (value === undefined) return null;
    return typeof value === "string" || typeof value === "number" ? String(value) : "";
  };

  // Backend master list is the primary source (every known name is selectable,
  // not just ones already present in currently-loaded PP rows); names seen only
  // on existing rows are still merged in as a fallback in case the master list
  // hasn't caught up with a newly-entered name yet.
  const countNameFilterOptions = useMemo(
    () =>
      Array.from(
        new Set([...masterCountNames, ...mergedRows.map((row) => getRowCountName(row.id))].filter(Boolean))
      ).sort((a, b) => a.localeCompare(b)),
    [masterCountNames, mergedRows, remoteCountNameMap]
  );
  const consigneeNameFilterOptions = useMemo(
    () =>
      Array.from(
        new Set(
          [...masterConsigneeNames, ...mergedRows.flatMap((row) => getRowConsigneeNames(row.id))].filter(Boolean)
        )
      ).sort((a, b) => a.localeCompare(b)),
    [masterConsigneeNames, mergedRows, remoteConsigneeNameMap]
  );

  const filteredRows = mergedRows.filter((row) => {
    if (!String(row.id).toLowerCase().includes(String(searchTerm).toLowerCase())) return false;

    if (countFilter && getRowCountName(row.id) !== countFilter) return false;

    if (consigneeFilter && !getRowConsigneeNames(row.id).includes(consigneeFilter)) return false;

    const rowDate = getRowDate(row.id);
    if (dateFrom && (!rowDate || rowDate < dateFrom)) return false;
    if (dateTo && (!rowDate || rowDate > dateTo)) return false;

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

  // The identifier alone isn't proof the form actually loaded matching data — every
  // department's form falls back to displaying the requested entryId as its "Process
  // Parameter ID"/"Entry ID" even when it found no saved version for it (all other
  // fields stay blank/zero in that case). So also require at least one non-identifier
  // field to hold a real value before treating a column as genuinely loaded.
  const hasNonIdentifierData = (items) =>
    items.some((item) => {
      if (item?.label === "Process Parameter ID" || item?.label === "Entry ID" || item?.label === "Type") {
        return false;
      }
      const value = String(item?.value ?? "").trim();
      return value && value !== "-" && value !== "0";
    });

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
        const identifierMatches = Boolean(identifier) && normalizeProcessParameterId(identifier) === targetId;
        const timedOut = Date.now() - startedAt > 15000;
        // Before the timeout, only accept a match once real field data has loaded —
        // otherwise we lock in the blank/zero fallback the instant the form mounts,
        // before its own fetch has had a chance to find the saved version.
        const isReady = identifierMatches && (hasNonIdentifierData(items) || timedOut);

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

  const clearAllFilters = () => {
    setSearchTerm("");
    setConsigneeFilter("");
    setCountFilter("");
    setDateFrom("");
    setDateTo("");
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
    refreshNextAvailableId();
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
            <div />
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
              {isFullAccessUser(user) ? (
                <button
                  type="button"
                  className={styles.printMatrixButton}
                  title="Clears this browser's PP id counter and locally-stored Draw Frame/Spinning entries so new PPs start from PP-0001 again. Does not delete backend records (Mixing/Blow Room/Carding/Simplex/Autoconer/Q2/Q3) — those must be removed from the database separately."
                  onClick={() => {
                    const confirmed = window.confirm(
                      "This clears the PP id counter and locally-stored Draw Frame/Spinning entries on this browser so new PPs start from PP-0001.\n\n" +
                        "It does NOT delete backend records (Mixing, Blow Room, Carding, Simplex, Autoconer, AC-Q2, AC-Q3) — those must be deleted from the database first, otherwise their rows and PP ids will still appear.\n\n" +
                        "Continue?"
                    );
                    if (!confirmed) return;
                    resetProcessParameterLocalState();
                    setDynamicRows(loadRegistryRows());
                    loadRemoteStatuses();
                    setSelectedEntryId("");
                    setOpenEditTabs([]);
                    setActiveTab("new");
                  }}
                >
                  Reset Local PP Data
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
          ) : null}

          {showListCard ? (
            <div className={styles.listCard}>
              <div className={styles.filterRow}>
                <div className={styles.searchInputWrap}>
                  <MdSearch className={styles.searchIcon} />
                  <input
                    type="text"
                    className={styles.searchInput}
                    placeholder="Search"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                  />
                </div>

                <div className={styles.dateRangeFilter}>
                  <div className={styles.dateFieldWrap}>
                    <span className={styles.dateFieldLabel}>Count Name</span>
                    <div className={styles.dateInputWrap}>
                      <select
                        className={styles.filterSelect}
                        value={countFilter}
                        onChange={(event) => setCountFilter(event.target.value)}
                      >
                        <option value="">All</option>
                        {countNameFilterOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className={styles.dateFieldWrap}>
                    <span className={styles.dateFieldLabel}>Consignee Name</span>
                    <div className={styles.dateInputWrap}>
                      <select
                        className={styles.filterSelect}
                        value={consigneeFilter}
                        onChange={(event) => setConsigneeFilter(event.target.value)}
                      >
                        <option value="">All</option>
                        {consigneeNameFilterOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div className={styles.dateRangeFilter}>
                  <div className={styles.dateFieldWrap}>
                    <span className={styles.dateFieldLabel}>Date From</span>
                    <div className={styles.dateInputWrap}>
                      <input
                        type="date"
                        className={styles.filterSelect}
                        value={dateFrom}
                        onChange={(event) => setDateFrom(event.target.value)}
                      />
                    </div>
                  </div>

                  <div className={styles.dateFieldWrap}>
                    <span className={styles.dateFieldLabel}>Date To</span>
                    <div className={styles.dateInputWrap}>
                      <input
                        type="date"
                        className={styles.filterSelect}
                        value={dateTo}
                        onChange={(event) => setDateTo(event.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  className={styles.clearFiltersButton}
                  onClick={clearAllFilters}
                  disabled={!searchTerm && !consigneeFilter && !countFilter && !dateFrom && !dateTo}
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
                      {updateExistingColumns.slice(1).map((column) => {
                        const hours = getColumnThresholdHours(column);
                        return (
                          <th key={column}>
                            {column}
                            {hours ? <div className={styles.columnThresholdHint}>{hours}h threshold</div> : null}
                          </th>
                        );
                      })}
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
                        {rowStatuses.map((done, index) => {
                          const columnName = updateExistingColumns[index + 1];
                          const overdue = isCellOverdue(row.id, columnName, done);
                          const ticketId = getCellTicketId(row.id, columnName);
                          return (
                            <td key={`${row.id}-${index}`} className={styles.matrixStatusCell}>
                              <button
                                type="button"
                                className={
                                  done
                                    ? styles.statusDone
                                    : overdue
                                      ? styles.statusOverdue
                                      : styles.statusPending
                                }
                                onClick={done ? undefined : () => handleMatrixCellClick(row.id, index)}
                                disabled={done}
                                aria-label={`${row.id} ${columnName} ${done ? "completed" : overdue ? "overdue" : "pending"}`}
                                title={done ? "Completed" : overdue ? "Overdue — past its completion threshold" : "Opens in a new tab"}
                              >
                                {done ? "✓" : overdue ? "!" : ""}
                              </button>
                              {!done && ticketId !== null ? (
                                <a
                                  className={styles.matrixTicketBadge}
                                  href={ticketId ? `/operatordetail/${ticketId}` : "/supervisordashboard"}
                                  title="A PP notebook incomplete ticket has been raised for this cell"
                                >
                                  Ticket
                                </a>
                              ) : null}
                            </td>
                          );
                        })}
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
                  Select Sub Department to view respective process parameter form.
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
