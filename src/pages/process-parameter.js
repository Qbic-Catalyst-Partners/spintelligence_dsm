import { useMemo, useRef, useState } from "react";
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
import styles from "@/styles/processParameterPage.module.css";

const updateExistingColumns = [
  "PP ID",
  "Mixing",
  "Blow Room",
  "Carding",
  "DF-Breaker",
  "DF-Finisher",
  "Simplex",
  "Spinning",
  "AC-Q1",
  "AC-Q2",
  "AC-Q3",
];

const updateExistingRows = [
  { id: "PP-0001", statuses: [false, false, false, false, false, false, false, false, false, false] },
  { id: "PP-0002", statuses: [false, false, false, false, false, false, false, false, false, false] },
  { id: "PP-0003", statuses: [false, false, false, false, false, false, false, false, false, false] },
  { id: "PP-0004", statuses: [false, false, false, false, false, false, false, false, false, false] },
  { id: "PP-0005", statuses: [false, false, false, false, false, false, false, false, false, false] },
];

const COLUMN_TO_DEPARTMENT = {
  Mixing: "Mixing",
  "Blow Room": "Blow Room",
  Carding: "Carding",
  "DF-Breaker": "Draw Frame",
  "DF-Finisher": "Draw Frame",
  Simplex: "Simplex",
  Spinning: "Spinning",
  "AC-Q1": "Autoconer",
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
  const componentRef = useRef(null);

  const visibleSubDepartments = useMemo(
    () => subDepartments.filter((item) => hasSubDepartmentAccess(accessByDepartment, item.value, user)),
    [accessByDepartment, user]
  );

  const currentDate = new Date().toLocaleDateString("en-IN");
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
  const filteredRows = updateExistingRows.filter((row) =>
    String(row.id).toLowerCase().includes(String(searchTerm).toLowerCase())
  );
  const getRowStatuses = (rowId) =>
    completedCells[rowId] || updateExistingRows.find((row) => row.id === rowId)?.statuses || [];

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

          {showFormCard ? (
            <div className={styles.formCard}>
              {SelectedComponent ? (
                <SelectedComponent
                  key={`${selectedSubDepartment}-${selectedTypeName}-${selectedEntryId || "new"}`}
                  ref={componentRef}
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
                      const ok = await componentRef.current?.submit?.();
                      if (ok && selectedEntryId) {
                        const colIndex = updateExistingColumns.findIndex((column) => {
                          if (selectedSubDepartment === "Draw Frame") {
                            return drawFrameType === "PP - Finisher Drawing"
                              ? column === "DF-Finisher"
                              : column === "DF-Breaker";
                          }
                          if (selectedSubDepartment === "Autoconer") {
                            if (autoconerType === "PP - Autoconer Q2") return column === "AC-Q2";
                            if (autoconerType === "PP - Autoconer Q3") return column === "AC-Q3";
                            return column === "AC-Q1";
                          }
                          return column === selectedSubDepartment;
                        });
                        if (colIndex > 0) {
                          setCompletedCells((current) => {
                            const next = { ...current };
                            const nextRow = [...getRowStatuses(selectedEntryId)];
                            nextRow[colIndex - 1] = true;
                            next[selectedEntryId] = nextRow;
                            return next;
                          });
                        }
                      }
                    }}
                    saveLabel="Save Record"
                  />
                </div>
              ) : null}
            </div>
          ) : null}

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

              <div id="process-parameter-saved-versions" className={styles.savedVersionsSlot} />
            </div>
          ) : (
            <div id="process-parameter-saved-versions" className={styles.savedVersionsSlot} />
          )}
        </div>
      </div>
    </section>
  );
}
