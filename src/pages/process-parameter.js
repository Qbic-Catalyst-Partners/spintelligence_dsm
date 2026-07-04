import { useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";

import Footer from "@/components/Footer";
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
import { readProcessParameterRegistry, removeProcessParameterId } from "@/utils/processParameterRegistry";
import { loadLocalEntries, removeLocalEntriesByParamId } from "@/utils/localProcessParameterStore";
import { getMixingProcessParameterEntries } from "@/apis/mixing";
import { fetchBlowroomProcessParametersApi } from "@/apis/blowroom";
import { getCardingProcessParameterEntries } from "@/apis/carding";
import { fetchSimplexProcessParameterEntries } from "@/apis/simplex";
import {
  fetchAutoconerProcessParameters,
  fetchAutoconerQ2Entries,
  fetchAutoconerQ3Entries,
} from "@/apis/autoconer";
import styles from "@/styles/processParameterPage.module.css";

const updateExistingColumns = [
  "PP ID",
  "Mixing",
  "Blow Room",
  "Carding",
  "Draw Frame Breaker",
  "Draw Frame Finisher",
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
  "Draw Frame Breaker": "Draw Frame",
  "Draw Frame Finisher": "Draw Frame",
  "Simplex": "Simplex",
  "Spinning": "Spinning",
  "Autoconer PP": "Autoconer",
  "AC-Q2": "Autoconer",
  "AC-Q3": "Autoconer",
};

const subDepartments = [
  { label: "Mixing", value: "Mixing" },
  { label: "Carding", value: "Carding" },
  { label: "Blow Room", value: "Blow Room" },
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

const getEntryRows = (response) =>
  Array.isArray(response?.data) ? response.data : Array.isArray(response) ? response : [];

// Each source's `getId` mirrors the entry_id extraction used by that department's own
// ProcessParameterDataEntry view, so remote completion state lines up with what those pages show.
// Draw Frame Breaker/Finisher and Spinning don't hit the backend yet — they save to the
// browser's local store (see localProcessParameterStore), so their source reads from there too.
const REMOTE_STATUS_SOURCES = [
  {
    index: 0,
    fetch: () => getMixingProcessParameterEntries({ page: 1, limit: 200 }),
    getId: (entry) => entry?.entry_id ?? entry?.param_id,
    isDone: (entry) => (entry?.status || "DONE") === "DONE",
  },
  {
    index: 1,
    fetch: () => fetchBlowroomProcessParametersApi({ page: 1, limit: 200 }),
    getId: (entry) =>
      entry?.display_entry_id ?? entry?.process_parameter_id ?? entry?.parameter_id ?? entry?.param_id ?? entry?.br_code,
    isDone: () => true,
  },
  {
    index: 2,
    fetch: () => getCardingProcessParameterEntries({ page: 1, limit: 200 }),
    getId: (entry) =>
      entry?.entry_id ?? entry?.param_id ?? entry?.qc_code ?? entry?.qc_id ?? entry?.process_parameter_id ?? entry?.id,
    isDone: () => true,
  },
  {
    index: 3,
    fetch: () => Promise.resolve({ data: loadLocalEntries("draw-frame-breaker") }),
    getId: (entry) => entry?.param_id ?? entry?.entry_id,
    isDone: () => true,
  },
  {
    index: 4,
    fetch: () => Promise.resolve({ data: loadLocalEntries("draw-frame-finisher") }),
    getId: (entry) => entry?.param_id ?? entry?.entry_id,
    isDone: () => true,
  },
  {
    index: 5,
    fetch: () => fetchSimplexProcessParameterEntries({ page: 1, limit: 200 }),
    getId: (entry) => entry?.entry_id ?? entry?.process_parameter_id ?? entry?.param_id,
    isDone: () => true,
  },
  {
    index: 6,
    fetch: () => Promise.resolve({ data: loadLocalEntries("spinning") }),
    getId: (entry) => entry?.param_id ?? entry?.entry_id,
    isDone: (entry) => (entry?.status || "DONE") === "DONE",
  },
  {
    index: 7,
    fetch: () => fetchAutoconerProcessParameters({ page: 1, limit: 200 }),
    getId: (entry) => entry?.entry_id ?? entry?.ins_code ?? entry?.param_id,
    isDone: () => true,
  },
  {
    index: 8,
    fetch: () => fetchAutoconerQ2Entries({ page: 1, limit: 200 }),
    getId: (entry) => entry?.entry_id ?? entry?.ins_code,
    isDone: () => true,
  },
  {
    index: 9,
    fetch: () => fetchAutoconerQ3Entries({ page: 1, limit: 200 }),
    getId: (entry) => entry?.entry_id ?? entry?.ins_code,
    isDone: () => true,
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
  const componentRef = useRef(null);

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
    const results = await Promise.allSettled(REMOTE_STATUS_SOURCES.map((source) => source.fetch()));

    const map = {};
    results.forEach((result, sourceIndex) => {
      if (result.status !== "fulfilled") return;
      const source = REMOTE_STATUS_SOURCES[sourceIndex];
      getEntryRows(result.value).forEach((entry) => {
        const normalizedId = normalizeProcessParameterId(source.getId(entry));
        if (!normalizedId || !isCanonicalPpId(normalizedId) || !source.isDone(entry)) return;
        if (!map[normalizedId]) map[normalizedId] = createBlankStatusRow().statuses.slice();
        map[normalizedId][source.index] = true;
      });
    });

    setRemoteStatusMap(map);
  };

  useEffect(() => {
    loadRemoteStatuses();
  }, []);

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
  const isEditingFromExisting = activeTab === "existing" && Boolean(selectedSubDepartment) && Boolean(selectedEntryId);
  const showFormCard = activeTab === "new" || isEditingFromExisting;
  const showListCard = activeTab === "existing";
  const [searchTerm, setSearchTerm] = useState("");

  const mergedRows = useMemo(() => {
    const byId = new Map();
    dynamicRows.forEach((row) => byId.set(row.id, row));
    Object.keys(remoteStatusMap).forEach((id) => {
      if (!byId.has(id)) byId.set(id, { id, statuses: createBlankStatusRow().statuses });
    });

    return Array.from(byId.values()).map((row) => ({
      ...row,
      statuses: row.statuses.map((done, index) => done || Boolean(remoteStatusMap[row.id]?.[index])),
    }));
  }, [dynamicRows, remoteStatusMap]);

  const nextAvailableId = useMemo(() => {
    const highestSequence = mergedRows.reduce((max, row) => {
      const match = String(row.id || "").match(/^PP-(\d+)$/i);
      if (!match) return max;
      const sequence = Number(match[1]) || 0;
      return sequence > max ? sequence : max;
    }, 0);
    return `PP-${String(highestSequence + 1).padStart(4, "0")}`;
  }, [mergedRows]);

  const filteredRows = mergedRows.filter((row) =>
    String(row.id).toLowerCase().includes(String(searchTerm).toLowerCase())
  );
  const getRowStatuses = (rowId) => {
    const base =
      mergedRows.find((row) => row.id === rowId)?.statuses || createBlankStatusRow().statuses;
    const overrides = completedCells[rowId];
    if (!overrides) return base;
    return base.map((done, index) => done || Boolean(overrides[index]));
  };

  const handleRemoveRow = (rowId) => {
    if (!rowId) return;
    if (typeof window !== "undefined" && !window.confirm(`Remove ${rowId} from this list?`)) return;

    removeProcessParameterId(rowId);
    removeLocalEntriesByParamId("draw-frame-breaker", rowId);
    removeLocalEntriesByParamId("draw-frame-finisher", rowId);
    removeLocalEntriesByParamId("spinning", rowId);

    setCompletedCells((current) => {
      if (!current[rowId]) return current;
      const next = { ...current };
      delete next[rowId];
      return next;
    });

    setDynamicRows(loadRegistryRows());
    loadRemoteStatuses();
  };

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

    setSelectedEntryId(rowId);
    setSelectedSubDepartment(department);
    setActiveTab("existing");

    if (department === "Draw Frame") {
      setDrawFrameType(columnName === "Draw Frame Finisher" ? "PP - Finisher Drawing" : "PP - Breaker Drawing");
    }

    if (department === "Autoconer") {
      if (columnName === "AC-Q2") setAutoconerType("PP - Autoconer Q2");
      else if (columnName === "AC-Q3") setAutoconerType("PP - Autoconer Q3");
      else setAutoconerType("Process Parameter");
    }
  };

  const handleCloseInlineEdit = () => {
    setSelectedEntryId("");
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
    <section className={styles.page}>
      <div className={styles.shell}>
        <div className={styles.panel}>
          <header className={styles.header}>
            <div>
              <h1>Process Parameter</h1>
            </div>
          </header>

          <div className={styles.subHeaderRow}>
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
            <div className={styles.currentDate}>Current Date : {currentDate}</div>
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

              <div className={styles.matrixWrap}>
                <table className={styles.matrixTable}>
                  <thead>
                    <tr>
                      {updateExistingColumns.map((column) => (
                        <th key={column}>{column}</th>
                      ))}
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((row) => (
                      <tr key={row.id}>
                        <td className={styles.matrixIdCell}>{row.id}</td>
                        {getRowStatuses(row.id).map((done, index) => (
                          <td key={`${row.id}-${index}`} className={styles.matrixStatusCell}>
                            <button
                              type="button"
                              className={done ? styles.statusDone : styles.statusPending}
                              onClick={() => handleMatrixCellClick(row.id, index)}
                              aria-label={`${row.id} ${updateExistingColumns[index + 1]} ${done ? "completed" : "pending"}`}
                            >
                              {done ? "✓" : ""}
                            </button>
                          </td>
                        ))}
                        <td>
                          <button
                            type="button"
                            onClick={() => handleRemoveRow(row.id)}
                            aria-label={`Remove ${row.id}`}
                            title="Remove this PP ID from the list"
                            style={{
                              border: "none",
                              background: "transparent",
                              color: "#94a3b8",
                              cursor: "pointer",
                              fontSize: "16px",
                              lineHeight: 1,
                              padding: "4px 8px",
                            }}
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

            </div>
          ) : (
            null
          )}

          {showFormCard ? (
            <div className={styles.formCard}>
              {isEditingFromExisting ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "12px",
                    padding: "10px 16px",
                    marginBottom: "12px",
                    borderRadius: "8px",
                    background: "#eef5ff",
                    border: "1px solid #c8d9f0",
                    fontWeight: 600,
                    color: "#1e3a5f",
                  }}
                >
                  <span>
                    Editing {selectedEntryId} — {selectedSubDepartment}
                  </span>
                  <button
                    type="button"
                    onClick={handleCloseInlineEdit}
                    style={{
                      border: "none",
                      background: "transparent",
                      color: "#3d5a80",
                      cursor: "pointer",
                      fontWeight: 600,
                    }}
                  >
                    Close ✕
                  </button>
                </div>
              ) : null}
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
                      const result = await componentRef.current?.submit?.();
                      refreshRegistryRows();
                      const batchDisplayId = resolveProcessParameterDisplayId(result, selectedEntryId);
                      if (batchDisplayId && !selectedEntryId) setSelectedEntryId(batchDisplayId);

                      const colIndex = getColumnIndexForDepartment();
                      if ((result !== false || batchDisplayId) && batchDisplayId && colIndex > 0) {
                        upsertRowStatus(batchDisplayId, colIndex - 1, true);
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
    </section>
  );
}
