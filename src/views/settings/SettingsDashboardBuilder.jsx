import { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { FiGrid, FiPlus, FiServer, FiTrash2 } from "react-icons/fi";

import apiConfig from "@/apis/apiConfig";
import { getDashboardOwnerUserId } from "@/utils/dashboardOwner";
import {
  DASHBOARD_CHART_TYPES,
  readStoredDashboardWidgets,
  writeStoredDashboardWidgets,
} from "@/utils/dashboardWidgets";
import styles from "@/styles/departmentDirectory.module.css";

const BUILDER_SECTIONS = {
  average: "average",
  performance: "performance",
};

const VISUALIZATION_TYPE_TO_CHART_TYPE = {
  average_value_card: "value",
  bar_chart: "bar",
  area_chart: "area",
  line_chart: "line",
};

const CHART_TYPE_TO_VISUALIZATION_TYPE = {
  value: "average_value_card",
  average: "average_value_card",
  bar: "bar_chart",
  area: "area_chart",
  line: "line_chart",
  timeline: "line_chart",
};

const getBuilderSectionFromVisualization = (visualizationType) =>
  visualizationType === "average_value_card"
    ? BUILDER_SECTIONS.average
    : BUILDER_SECTIONS.performance;

const getChartTypeFromVisualization = (visualizationType) =>
  VISUALIZATION_TYPE_TO_CHART_TYPE[visualizationType] || "line";

const getVisualizationFromChartType = (chartType) =>
  CHART_TYPE_TO_VISUALIZATION_TYPE[chartType] || "line_chart";

const formatWidgetName = (inputField, visualizationType) => {
  const suffix =
    visualizationType === "average_value_card"
      ? "Average Value Card"
      : DASHBOARD_CHART_TYPES.find(
          (item) => item.key === getChartTypeFromVisualization(visualizationType)
        )?.label || "Chart";

  return `${inputField || "Widget"} ${suffix}`;
};

const normalizeWidget = (widget, index) => {
  const visualizationType = String(
    widget?.visualization_type ||
      getVisualizationFromChartType(widget?.chart_type) ||
      "average_value_card"
  )
    .trim()
    .toLowerCase();
  const inputScreen = widget?.input_screen || widget?.screen_name || "Cotton HVI Data Entry";
  const inputField = widget?.input_field || widget?.field_name || "SCI";

  return {
    id: widget?.id || `widget-${index + 1}`,
    name: widget?.name || formatWidgetName(inputField, visualizationType),
    enabled: widget?.enabled !== false,
    order: Number.isInteger(widget?.order) ? widget.order : index + 1,
    department: widget?.department || "Quality Control",
    sub_department: widget?.sub_department || "Mixing",
    input_screen: inputScreen,
    input_field: inputField,
    visualization_type: visualizationType,
    chart_type: getChartTypeFromVisualization(visualizationType),
    builder_section:
      widget?.builder_section || getBuilderSectionFromVisualization(visualizationType),
  };
};

const normalizeWidgets = (widgets) =>
  (Array.isArray(widgets) ? widgets : []).map((widget, index) =>
    normalizeWidget(widget, index)
  );

const createDefaultWidget = (index = 0) =>
  normalizeWidget(
    {
      id: `widget-${index + 1}`,
      department: "Quality Control",
      sub_department: "Mixing",
      input_screen: "Cotton HVI Data Entry",
      input_field: "SCI",
      visualization_type:
        index < 3 ? "average_value_card" : "line_chart",
      enabled: true,
      order: index + 1,
    },
    index
  );

const initialWidgets = Array.from({ length: 7 }, (_, index) =>
  createDefaultWidget(index)
);

const builderRoles = ["Operator", "Supervisor", "Admin"];
const builderUsers = ["John Doe", "Hency Belix", "Aravinth"];

const defaultBuilderOptions = {
  departments: [],
  sub_departments: [],
  input_screens: [],
  input_fields: [],
  periods: ["1D", "1W", "1M", "1Y"],
  visualization_types: [
    "average_value_card",
    "bar_chart",
    "area_chart",
    "line_chart",
  ],
};

function SettingsDashboardBuilder() {
  const [widgets, setWidgets] = useState(initialWidgets);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [builderOptions, setBuilderOptions] = useState(defaultBuilderOptions);
  const [selectedDepartment, setSelectedDepartment] = useState("Quality Control");
  const [selectedSubDepartment, setSelectedSubDepartment] = useState("Mixing");
  const [selectedInputScreen, setSelectedInputScreen] = useState("Cotton HVI Data Entry");
  const [selectedInputField, setSelectedInputField] = useState("SCI");
  const [selectedVisualizationType, setSelectedVisualizationType] = useState(
    "average_value_card"
  );
  const [selectedRole, setSelectedRole] = useState("Operator");
  const [selectedBuilderUser, setSelectedBuilderUser] = useState("John Doe");
  const [isAddWidgetModalOpen, setIsAddWidgetModalOpen] = useState(false);

  const authUser = useSelector((state) => state.auth?.user);
  const dashboardOwnerUserId = useMemo(
    () => getDashboardOwnerUserId(authUser),
    [authUser]
  );

  const displayUserName =
    authUser?.full_name ||
    authUser?.fullName ||
    authUser?.name ||
    authUser?.username ||
    "Current User";

  const builderVisualizationOptions = useMemo(
    () =>
      (builderOptions.visualization_types || []).map((type) => ({
        key: type,
        label:
          type === "average_value_card"
            ? "Average Value Card"
            : type === "bar_chart"
            ? "Bar Chart"
            : type === "area_chart"
            ? "Area Chart"
            : "Line Chart",
        section: getBuilderSectionFromVisualization(type),
      })),
    [builderOptions.visualization_types]
  );

  const selectedSection = getBuilderSectionFromVisualization(
    selectedVisualizationType
  );

  const syncSelectionFromOptions = (
    nextOptions,
    {
      department = selectedDepartment,
      subDepartment = selectedSubDepartment,
      inputScreen = selectedInputScreen,
      inputField = selectedInputField,
    } = {}
  ) => {
    const departments = nextOptions?.departments || [];
    const resolvedDepartment = departments.includes(department)
      ? department
      : departments[0] || "";

    const subDepartments = nextOptions?.sub_departments || [];
    const resolvedSubDepartment = subDepartments.includes(subDepartment)
      ? subDepartment
      : subDepartments[0] || "";

    const inputScreens = nextOptions?.input_screens || [];
    const resolvedInputScreen = inputScreens.includes(inputScreen)
      ? inputScreen
      : inputScreens[0] || "";

    const inputFields = nextOptions?.input_fields || [];
    const resolvedInputField = inputFields.includes(inputField)
      ? inputField
      : inputFields[0] || "";

    setSelectedDepartment(resolvedDepartment);
    setSelectedSubDepartment(resolvedSubDepartment);
    setSelectedInputScreen(resolvedInputScreen);
    setSelectedInputField(resolvedInputField);
  };

  const loadBuilderOptions = async ({
    department = selectedDepartment,
    subDepartment = selectedSubDepartment,
    inputScreen = selectedInputScreen,
  } = {}) => {
    const params = {};
    if (department) params.department = department;
    if (subDepartment) params.sub_department = subDepartment;
    if (inputScreen) params.input_screen = inputScreen;

    const response = await apiConfig.get("/api/dashboard/builder/options", params, {
      skipGlobalErrorModal: true,
    });
    const nextOptions = {
      ...defaultBuilderOptions,
      ...(response?.data || {}),
    };

    setBuilderOptions(nextOptions);
    syncSelectionFromOptions(nextOptions, {
      department,
      subDepartment,
      inputScreen,
      inputField: selectedInputField,
    });

    return nextOptions;
  };

  useEffect(() => {
    let isMounted = true;

    const loadWidgets = async () => {
      if (!dashboardOwnerUserId) {
        if (isMounted) {
          setLoading(false);
          setSaveMessage("Unable to identify logged-in user.");
        }
        return;
      }

      try {
        setLoading(true);
        await loadBuilderOptions();
        const response = await apiConfig.get(
          `/api/dashboard/builder/widgets/${dashboardOwnerUserId}`,
          {},
          { skipGlobalErrorModal: true }
        );
        if (!isMounted) return;

        const apiWidgets = normalizeWidgets(response?.data?.widgets);
        const storedWidgets = normalizeWidgets(
          readStoredDashboardWidgets(dashboardOwnerUserId)
        );
        setWidgets(apiWidgets.length ? apiWidgets : storedWidgets.length ? storedWidgets : initialWidgets);
        setSaveMessage("");
      } catch (error) {
        if (!isMounted) return;
        const storedWidgets = normalizeWidgets(
          readStoredDashboardWidgets(dashboardOwnerUserId)
        );
        setWidgets(storedWidgets.length ? storedWidgets : initialWidgets);
        setSaveMessage(
          error?.response?.data?.message || "Unable to load dashboard widgets."
        );
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadWidgets();

    return () => {
      isMounted = false;
    };
  }, [dashboardOwnerUserId]);

  const handleToggle = (widgetIndex) => {
    setWidgets((current) =>
      current.map((widget, index) =>
        index === widgetIndex ? { ...widget, enabled: !widget.enabled } : widget
      )
    );
  };

  const handleDelete = (widgetIndex) => {
    setWidgets((current) =>
      current
        .filter((_, index) => index !== widgetIndex)
        .map((widget, index) => ({ ...widget, order: index + 1 }))
    );
  };

  const handleOpenAddWidget = () => {
    setIsAddWidgetModalOpen(true);
  };

  const handleCloseAddWidget = () => {
    setIsAddWidgetModalOpen(false);
  };

  const handleAddWidget = () => {
    setWidgets((current) => [
      ...current,
      normalizeWidget(
        {
          id: `field-widget-${Date.now()}`,
          name: formatWidgetName(selectedInputField, selectedVisualizationType),
          enabled: true,
          order: current.length + 1,
          department: selectedDepartment,
          sub_department: selectedSubDepartment,
          input_screen: selectedInputScreen,
          input_field: selectedInputField,
          visualization_type: selectedVisualizationType,
        },
        current.length
      ),
    ]);
    setIsAddWidgetModalOpen(false);
  };

  const moveBuilderWidget = (sourceIndex, targetSection, targetPosition = null) => {
    setWidgets((current) => {
      const draggedWidget = current[sourceIndex];
      if (!draggedWidget) return current;

      const remainingWidgets = current.filter((_, index) => index !== sourceIndex);
      const averageWidgets = remainingWidgets.filter(
        (widget) =>
          (widget.builder_section || getBuilderSectionFromVisualization(widget.visualization_type)) ===
          BUILDER_SECTIONS.average
      );
      const performanceWidgets = remainingWidgets.filter(
        (widget) =>
          (widget.builder_section || getBuilderSectionFromVisualization(widget.visualization_type)) ===
          BUILDER_SECTIONS.performance
      );
      const targetWidgets =
        targetSection === BUILDER_SECTIONS.average
          ? averageWidgets
          : performanceWidgets;
      const insertAt = Number.isInteger(targetPosition)
        ? Math.min(Math.max(targetPosition, 0), targetWidgets.length)
        : targetWidgets.length;

      const nextVisualizationType =
        targetSection === BUILDER_SECTIONS.average
          ? "average_value_card"
          : draggedWidget.visualization_type === "average_value_card"
          ? "line_chart"
          : draggedWidget.visualization_type;

      targetWidgets.splice(insertAt, 0, {
        ...draggedWidget,
        visualization_type: nextVisualizationType,
        chart_type: getChartTypeFromVisualization(nextVisualizationType),
        builder_section: targetSection,
        name: formatWidgetName(draggedWidget.input_field, nextVisualizationType),
      });

      return [...averageWidgets, ...performanceWidgets].map((widget, index) => ({
        ...widget,
        order: index + 1,
      }));
    });
  };

  const handleBuilderDragStart = (event, sourceIndex) => {
    event.dataTransfer.setData("application/x-dashboard-widget", String(sourceIndex));
    event.dataTransfer.effectAllowed = "move";
  };

  const handleBuilderDrop = (event, targetSection, targetPosition = null) => {
    event.preventDefault();
    const rawSourceIndex = event.dataTransfer.getData("application/x-dashboard-widget");
    if (rawSourceIndex === "") return;
    moveBuilderWidget(Number(rawSourceIndex), targetSection, targetPosition);
  };

  const saveWidgets = async (
    widgetsToSave,
    { successMessage = "Dashboard widgets saved successfully." } = {}
  ) => {
    if (!dashboardOwnerUserId) {
      setSaveMessage("Unable to identify logged-in user.");
      return false;
    }

    const orderedWidgets = widgetsToSave.map((widget, index) =>
      normalizeWidget(
        {
          ...widget,
          order: index + 1,
        },
        index
      )
    );

    const payload = orderedWidgets.map((widget, index) => ({
      id: widget.id,
      department: widget.department,
      sub_department: widget.sub_department,
      input_screen: widget.input_screen,
      input_field: widget.input_field,
      visualization_type: widget.visualization_type,
      enabled: widget.enabled,
      order: index + 1,
    }));

    try {
      setSaving(true);
      const response = await apiConfig.post(
        `/api/dashboard/builder/widgets/${dashboardOwnerUserId}`,
        { widgets: payload },
        { skipGlobalSuccessModal: true }
      );
      const savedWidgets = normalizeWidgets(response?.data?.widgets || payload);
      writeStoredDashboardWidgets(dashboardOwnerUserId, savedWidgets);
      setWidgets(savedWidgets);
      setSaveMessage(successMessage || "");
      return true;
    } catch (error) {
      setSaveMessage(
        error?.response?.data?.message || "Failed to save dashboard widgets."
      );
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    await saveWidgets(widgets);
  };

  const getBuilderRowText = (widget) =>
    [
      widget.department || "Quality Control",
      widget.sub_department || "Mixing",
      widget.input_screen || "Cotton HVI Data Entry",
      widget.input_field || widget.name || "SCI",
    ].join(" | ");

  const builderRows = widgets.map((widget, index) => ({
    widget,
    index,
    section:
      widget.builder_section ||
      getBuilderSectionFromVisualization(widget.visualization_type),
  }));
  const averageRows = builderRows.filter(
    ({ section }) => section === BUILDER_SECTIONS.average
  );
  const performanceRows = builderRows.filter(
    ({ section }) => section === BUILDER_SECTIONS.performance
  );

  return (
    <div className={styles.dashboardMain}>
      <section className={styles.builderHeader}>
        <h1 className={styles.kicker}>Dashboard Builder</h1>
        <div className={styles.rowActions}>
          <button type="button" className={styles.addWidgetButton} onClick={handleOpenAddWidget}>
            <FiPlus />
            <span>Add Widget</span>
          </button>
          <button
            type="button"
            className={styles.builderModalSubmit}
            onClick={handleSave}
            disabled={saving || loading}
          >
            {saving ? "Saving..." : "Save Builder"}
          </button>
        </div>
      </section>

      <section className={styles.builderTopPanel}>
        <div className={styles.builderUserControls}>
          <label>
            <span>Role</span>
            <select value={selectedRole} onChange={(event) => setSelectedRole(event.target.value)}>
              {builderRoles.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Name</span>
            <select
              value={selectedBuilderUser}
              onChange={(event) => setSelectedBuilderUser(event.target.value)}
            >
              {builderUsers.map((builderUser) => (
                <option key={builderUser} value={builderUser}>
                  {builderUser}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className={styles.builderSelectedUser}>
          <strong>{selectedBuilderUser || displayUserName}</strong>
          <span>{selectedRole}</span>
        </div>
      </section>

      {saveMessage ? <p className={styles.builderStatusMessage}>{saveMessage}</p> : null}

      <section className={styles.builderList}>
        <BuilderGroup
          title="Average Values Card"
          section={BUILDER_SECTIONS.average}
          rows={averageRows}
          getBuilderRowText={getBuilderRowText}
          handleBuilderDragStart={handleBuilderDragStart}
          handleBuilderDrop={handleBuilderDrop}
          handleToggle={handleToggle}
          handleDelete={handleDelete}
        />
        <BuilderGroup
          title="Performance Trends"
          section={BUILDER_SECTIONS.performance}
          rows={performanceRows}
          getBuilderRowText={getBuilderRowText}
          handleBuilderDragStart={handleBuilderDragStart}
          handleBuilderDrop={handleBuilderDrop}
          handleToggle={handleToggle}
          handleDelete={handleDelete}
        />
      </section>

      {isAddWidgetModalOpen ? (
        <div className={styles.builderModalOverlay}>
          <div
            className={styles.builderAddModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-widget-title"
          >
            <header className={styles.builderAddModalHeader}>
              <h2 id="add-widget-title">Add Widget</h2>
              <p>Select the widget you want to add in the dashboard builder.</p>
            </header>

            <div className={styles.builderAddModalGrid}>
              <label>
                <span>Department</span>
                <select
                  value={selectedDepartment}
                  onChange={async (event) => {
                    const department = event.target.value;
                    const nextOptions = await loadBuilderOptions({
                      department,
                      subDepartment: "",
                      inputScreen: "",
                    });
                    syncSelectionFromOptions(nextOptions, {
                      department,
                      subDepartment: "",
                      inputScreen: "",
                      inputField: "",
                    });
                  }}
                >
                  {(builderOptions.departments || []).map((department) => (
                    <option key={department} value={department}>
                      {department}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Sub Department</span>
                <select
                  value={selectedSubDepartment}
                  onChange={async (event) => {
                    const subDepartment = event.target.value;
                    const nextOptions = await loadBuilderOptions({
                      department: selectedDepartment,
                      subDepartment,
                      inputScreen: "",
                    });
                    syncSelectionFromOptions(nextOptions, {
                      department: selectedDepartment,
                      subDepartment,
                      inputScreen: "",
                      inputField: "",
                    });
                  }}
                >
                  {(builderOptions.sub_departments || []).map((subDepartment) => (
                    <option key={subDepartment} value={subDepartment}>
                      {subDepartment}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Input Screen</span>
                <select
                  value={selectedInputScreen}
                  onChange={async (event) => {
                    const inputScreen = event.target.value;
                    const nextOptions = await loadBuilderOptions({
                      department: selectedDepartment,
                      subDepartment: selectedSubDepartment,
                      inputScreen,
                    });
                    syncSelectionFromOptions(nextOptions, {
                      department: selectedDepartment,
                      subDepartment: selectedSubDepartment,
                      inputScreen,
                      inputField: "",
                    });
                  }}
                >
                  {(builderOptions.input_screens || []).map((inputScreen) => (
                    <option key={inputScreen} value={inputScreen}>
                      {inputScreen}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Field</span>
                <select
                  value={selectedInputField}
                  onChange={(event) => setSelectedInputField(event.target.value)}
                >
                  {(builderOptions.input_fields || []).map((inputField) => (
                    <option key={inputField} value={inputField}>
                      {inputField}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Visualization Type</span>
                <select
                  value={selectedVisualizationType}
                  onChange={(event) => setSelectedVisualizationType(event.target.value)}
                >
                  {builderVisualizationOptions.map((visualization) => (
                    <option key={visualization.key} value={visualization.key}>
                      {visualization.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <footer className={styles.builderAddModalFooter}>
              <button
                type="button"
                className={styles.builderModalCancel}
                onClick={handleCloseAddWidget}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.builderModalSubmit}
                onClick={handleAddWidget}
                disabled={
                  !selectedDepartment ||
                  !selectedSubDepartment ||
                  !selectedInputScreen ||
                  !selectedInputField
                }
              >
                Add to Builder
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function BuilderGroup({
  title,
  section,
  rows,
  getBuilderRowText,
  handleBuilderDragStart,
  handleBuilderDrop,
  handleToggle,
  handleDelete,
}) {
  const WidgetIcon = section === BUILDER_SECTIONS.performance ? FiServer : FiGrid;

  return (
    <div
      className={styles.builderGroup}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => handleBuilderDrop(event, section)}
    >
      <h2>{title}</h2>
      {rows.map(({ widget, index }, rowIndex) => (
        <article
          key={`${widget.id}-${index}`}
          className={styles.builderRow}
          draggable
          onDragStart={(event) => handleBuilderDragStart(event, index)}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.stopPropagation();
            handleBuilderDrop(event, section, rowIndex);
          }}
        >
          <div className={styles.builderRowLeft}>
            <button type="button" className={styles.dragHandle} aria-label="Reorder widget">
              <span className={styles.dragDots} aria-hidden="true">
                {Array.from({ length: 6 }).map((_, dotIndex) => (
                  <span key={dotIndex} />
                ))}
              </span>
            </button>
            <WidgetIcon
              className={`${styles.builderWidgetIcon} ${
                section === BUILDER_SECTIONS.performance
                  ? styles.builderPerformanceWidgetIcon
                  : ""
              }`}
            />
            <span className={styles.builderWidgetPath}>{getBuilderRowText(widget)}</span>
          </div>

          <div className={styles.builderRowRight}>
            <button
              type="button"
              className={`${styles.builderToggle} ${widget.enabled ? styles.builderToggleOn : ""}`}
              aria-pressed={widget.enabled}
              onClick={() => handleToggle(index)}
            >
              <span className={styles.builderToggleThumb} />
            </button>
            <button
              type="button"
              className={styles.builderDelete}
              aria-label="Delete widget"
              onClick={() => handleDelete(index)}
            >
              <FiTrash2 />
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}

export default SettingsDashboardBuilder;
