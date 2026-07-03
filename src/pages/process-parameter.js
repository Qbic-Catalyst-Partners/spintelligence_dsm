import { useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";

import Footer from "@/components/Footer";
import apiConfig from "@/apis/apiConfig";
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
import {
  registerProcessParameterId,
  readProcessParameterRegistry,
  writeProcessParameterRegistry,
} from "@/utils/processParameterRegistry";
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

const normalizeRowId = (value) => String(value || "").trim();

const MATRIX_FETCH_ENDPOINTS = ["/process-parameters", "/process-parameter", "/process_parameters"];

const COLUMN_MATCHERS = [
  { columnIndex: 1, department: "Mixing", types: ["mixing"] },
  { columnIndex: 2, department: "Blow Room", types: ["blowroom", "blow room"] },
  { columnIndex: 3, department: "Carding", types: ["carding"] },
  { columnIndex: 4, department: "Draw Frame", types: ["breaker", "pp-breaker", "breaker drawing"] },
  { columnIndex: 5, department: "Draw Frame", types: ["finisher", "pp - finisher", "finisher drawing"] },
  { columnIndex: 6, department: "Simplex", types: ["simplex"] },
  { columnIndex: 7, department: "Spinning", types: ["spinning"] },
  { columnIndex: 8, department: "Autoconer", types: ["autoconer process parameter", "autoconer process parameter"] },
  { columnIndex: 9, department: "Autoconer", types: ["autoconer pp - autoconer q2", "q2"] },
  { columnIndex: 10, department: "Autoconer", types: ["autoconer pp - autoconer q3", "q3"] },
];

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

const extractRegistryRows = (payload) => {
  const candidates = [
    payload?.data,
    payload?.rows,
    payload?.entries,
    payload?.masters,
    payload?.items,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate) && candidate.length) return candidate;
  }

  if (Array.isArray(payload)) return payload;
  return [];
};

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
    entryId: "Generated on Save",
    selectedTypeName,
    selectedType: selectedTypeName,
    onTypeChange: () => {},
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
  const componentRef = useRef(null);
  const lastSubmittedEntryIdRef = useRef("");

  const visibleSubDepartments = useMemo(
    () => subDepartments.filter((item) => hasSubDepartmentAccess(accessByDepartment, item.value, user)),
    [accessByDepartment, user]
  );

  const currentDate = new Date().toLocaleDateString("en-IN");
  const buildRowStatuses = (entries = []) => {
    const statuses = createBlankStatusRow().statuses;
    entries.forEach((entry) => {
      const department = normalizeRowId(entry?.department || entry?.sub_department || entry?.dept_name).toLowerCase();
      const processType = normalizeRowId(entry?.process_type || entry?.type || entry?.function_name).toLowerCase();
      COLUMN_MATCHERS.forEach((matcher) => {
        const deptMatch = normalizeRowId(matcher.department).toLowerCase() === department;
        const typeMatch = matcher.types.some((type) => processType.includes(type));
        if (deptMatch && typeMatch) {
          statuses[matcher.columnIndex - 1] = true;
        }
      });
    });
    return statuses;
  };

  const loadRegistryRows = async () => {
    const localRegistryRows = readProcessParameterRegistry()
      .map((row) => ({
        id: normalizeRegistryId(row?.displayId),
        statuses: Array.isArray(row?.statuses) && row.statuses.length === 10
          ? row.statuses.slice(0, 10)
          : createBlankStatusRow().statuses,
      }))
      .filter((row) => row.id);

    for (const endpoint of MATRIX_FETCH_ENDPOINTS) {
      try {
        const response = await apiConfig.get(endpoint, { page: 1, limit: 10 }, { skipGlobalErrorModal: true });
        const masters = extractRegistryRows(response?.data);
        if (!Array.isArray(masters) || masters.length === 0) continue;

        const rows = masters
          .map((master) => {
            const id = normalizeRegistryId(
              master?.entry_id ||
              master?.entryId ||
              master?.process_parameter_id ||
              master?.processParameterId ||
              master?.param_id ||
              master?.paramId ||
              master?.id
            );
            const rowsPayload = Array.isArray(master?.entries)
              ? master.entries
              : Array.isArray(master?.rows)
                ? master.rows
                : Array.isArray(master?.data)
                  ? master.data
                  : [];
            const statuses = Array.isArray(master?.statuses) && master.statuses.length === 10
              ? master.statuses
              : buildRowStatuses(rowsPayload);

            return { id, statuses };
          })
          .filter((row) => row.id)
          .slice(0, 10);

        if (rows.length) return rows;
      } catch {
        // try next endpoint
      }
    }
    return localRegistryRows.slice(0, 10);
  };

  useEffect(() => {
    writeProcessParameterRegistry([]);
    loadRegistryRows().then(setDynamicRows);
  }, []);

  useEffect(() => {
    const handleStorageChange = () => {
      loadRegistryRows().then(setDynamicRows);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        loadRegistryRows().then(setDynamicRows);
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
  const showFormCard = activeTab === "new";
  const showListCard = activeTab === "existing";
  const [searchTerm, setSearchTerm] = useState("");
  const filteredRows = dynamicRows.filter((row) =>
    String(row.id).toLowerCase().includes(String(searchTerm).toLowerCase())
  );
  const getRowStatuses = (rowId) =>
    completedCells[rowId] ||
    dynamicRows.find((row) => row.id === rowId)?.statuses ||
    createBlankStatusRow().statuses;

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
    loadRegistryRows().then(setDynamicRows);
  };

  const handleMatrixCellClick = (rowId, columnIndex) => {
    const columnName = updateExistingColumns[columnIndex + 1];
    const department = COLUMN_TO_DEPARTMENT[columnName];
    if (!department) return;

    setSelectedEntryId(rowId);
    setSelectedSubDepartment(department);
    setActiveTab("new");

    if (department === "Draw Frame") {
      setDrawFrameType(columnName === "DF-Finisher" ? "PP - Finisher Drawing" : "PP - Breaker Drawing");
    }

    if (department === "Autoconer") {
      if (columnName === "AC-Q2") setAutoconerType("PP - Autoconer Q2");
      else if (columnName === "AC-Q3") setAutoconerType("PP - Autoconer Q3");
      else setAutoconerType("Process Parameter");
    }
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
              onClick={() => setActiveTab("new")}
            >
              Create New PP
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "existing"}
              className={`${styles.tabButton} ${activeTab === "existing" ? styles.tabButtonActive : ""}`}
              onClick={() => setActiveTab("existing")}
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
              {SelectedComponent ? (
                <SelectedComponent
                  key={`${selectedSubDepartment}-${selectedTypeName}-${selectedEntryId || "new"}`}
                  ref={componentRef}
                  onSubmitSuccess={(response) => {
                    const nextEntryId = String(
                      response?.entry_id ||
                        response?.param_id ||
                        response?.process_parameter_id ||
                        response?.id ||
                        selectedEntryId ||
                        ""
                    ).trim();

                    if (nextEntryId) {
                      lastSubmittedEntryIdRef.current = nextEntryId;
                      setSelectedEntryId(nextEntryId);
                      refreshRegistryRows();
                    }
                  }}
                  {...getDepartmentFormProps(selectedSubDepartment, selectedTypeName, typeOptions)}
                  entryId={selectedEntryId || "Generated on Save"}
                  onTypeChange={
                    selectedSubDepartment === "Draw Frame"
                      ? (nextType) => setDrawFrameType(nextType)
                      : selectedSubDepartment === "Autoconer"
                        ? (nextType) => setAutoconerType(nextType)
                        : () => {}
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
                    onBack={() => {}}
                    onClear={() => componentRef.current?.clear?.()}
                    onSave={async () => {
                      const valid = componentRef.current?.validate?.();
                      if (valid === false) return;
                      lastSubmittedEntryIdRef.current = "";
                      const result = await componentRef.current?.submit?.();
                      const submittedEntryId =
                        String(
                          result?.entry_id ||
                            result?.param_id ||
                            result?.process_parameter_id ||
                            result?.id ||
                            lastSubmittedEntryIdRef.current ||
                            selectedEntryId ||
                            ""
                        ).trim();
                      if (submittedEntryId) {
                        setSelectedEntryId(submittedEntryId);
                      }
                      const batchDisplayId = registerProcessParameterId(
                        { id: submittedEntryId },
                        selectedSubDepartment,
                        { mode: activeTab === "new" ? "create" : "update" }
                      );
                      refreshRegistryRows();
                      const colIndex = getColumnIndexForDepartment();
                      if ((result !== false || submittedEntryId) && batchDisplayId && colIndex > 0) {
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
