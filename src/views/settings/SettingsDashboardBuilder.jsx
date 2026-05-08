import { useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { FiGrid, FiPlus, FiServer, FiTrash2 } from "react-icons/fi";

import apiConfig from "@/apis/apiConfig";
import { getDashboardOwnerUserId } from "@/utils/dashboardOwner";
import {
<<<<<<< HEAD
  DASHBOARD_CHART_TYPES,
  readStoredDashboardWidgets,
  writeStoredDashboardWidgets,
=======
    DASHBOARD_CHART_TYPES,
    FIELD_WIDGET_TYPE,
>>>>>>> 7ad5f269e07065fc0b8f485820640f74c697cf24
} from "@/utils/dashboardWidgets";
import styles from "@/styles/departmentDirectory.module.css";

const BUILDER_SECTIONS = {
  average: "average",
  performance: "performance",
};

<<<<<<< HEAD
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
=======
const builderVisualizationOptions = [
    { key: "value", label: "Average Value Card", section: BUILDER_SECTIONS.average },
    { key: "line", label: "Performance Trends", section: BUILDER_SECTIONS.performance },
];
const TICKET_TREND_SELECT_KEY = "tickets_trend";
const TICKET_TREND_ID_PREFIX = "ticket-trend-";
const chartTypeToVisualizationType = (chartType) => {
    if (chartType === "value" || chartType === "average") return "average_value_card";
    if (chartType === "area" || chartType === "timeline") return "area_chart";
    if (chartType === "bar") return "bar_chart";
    return "line_chart";
};

const visualizationTypeToChartType = (visualizationType) => {
    if (visualizationType === "average_value_card") return "value";
    if (visualizationType === "area_chart") return "timeline";
    if (visualizationType === "bar_chart") return "line";
    return "line";
};
const normalizeInputFieldKey = (value) =>
    String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[%()]/g, "")
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");

function SettingsDashboardBuilder() {
    const [widgets, setWidgets] = useState([]);
    const [metricOptions, setMetricOptions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState("");
    const [selectedDepartmentSlug, setSelectedDepartmentSlug] = useState("quality-control");
    const [selectedSubDepartmentSlug, setSelectedSubDepartmentSlug] = useState("mixing");
    const [selectedScreenName, setSelectedScreenName] = useState("Cotton HVI Data Entry");
    const [selectedFieldName, setSelectedFieldName] = useState("SCI");
    const [selectedChartType, setSelectedChartType] = useState("value");
    const [selectedRole, setSelectedRole] = useState("");
    const [selectedBuilderUserId, setSelectedBuilderUserId] = useState("");
    const [builderRoles, setBuilderRoles] = useState([]);
    const [builderUsers, setBuilderUsers] = useState([]);
    const [isAddWidgetModalOpen, setIsAddWidgetModalOpen] = useState(false);
    const hasLoadedWidgetsRef = useRef(false);
    const autosaveTimerRef = useRef(null);
    const lastSavedSnapshotRef = useRef("");

    const authUser = useSelector((state) => state.auth?.user);
    const dashboardOwnerUserId = useMemo(
        () => getDashboardOwnerUserId(authUser),
        [authUser]
    );
    const isAdmin = useMemo(() => {
        const role = String(authUser?.role || authUser?.role_name || "").trim().toLowerCase();
        return role === "admin" || role === "super admin" || role === "superadmin";
    }, [authUser]);
>>>>>>> 7ad5f269e07065fc0b8f485820640f74c697cf24

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

<<<<<<< HEAD
    setSelectedDepartment(resolvedDepartment);
    setSelectedSubDepartment(resolvedSubDepartment);
    setSelectedInputScreen(resolvedInputScreen);
    setSelectedInputField(resolvedInputField);
  };
=======
    const normalizeWidgets = (nextWidgets) =>
        (Array.isArray(nextWidgets) ? nextWidgets : []).map((widget, index) => ({
            id: widget?.id || `widget-${index + 1}`,
            name: widget?.name || "Input Submitted Today",
            enabled: widget?.enabled !== false,
            order: Number.isInteger(widget?.order) ? widget.order : index + 1,
            metric_key: widget?.metric_key || "today_submissions",
            widget_type: widget?.widget_type || "metric",
            chart_type: widget?.chart_type || visualizationTypeToChartType(widget?.visualization_type),
            department: widget?.department || "Quality Control",
            sub_department: widget?.sub_department || "Mixing",
            screen_name: widget?.screen_name || widget?.input_screen || "Cotton HVI Data Entry",
            field_name: widget?.field_name || widget?.input_field || "SCI",
            builder_section:
                widget?.builder_section ||
                ((widget?.chart_type || visualizationTypeToChartType(widget?.visualization_type)) === "value"
                    ? BUILDER_SECTIONS.average
                    : BUILDER_SECTIONS.performance),
        }));
>>>>>>> 7ad5f269e07065fc0b8f485820640f74c697cf24

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

<<<<<<< HEAD
    setBuilderOptions(nextOptions);
    syncSelectionFromOptions(nextOptions, {
      department,
      subDepartment,
      inputScreen,
      inputField: selectedInputField,
=======
    const toDashbuilderGetPath = (path) => {
        if (String(path).startsWith("widgets/")) {
            const userId = String(path).split("/")[1] || "";
            return `${userId}/widgets`;
        }
        return path;
    };

    const toDashbuilderPostPath = (path) => {
        if (String(path).startsWith("widgets/")) {
            const userId = String(path).split("/")[1] || "";
            return `${userId}/add-widget`;
        }
        return path;
    };

    const getWithBuilderFallback = async (path, params = {}) => {
        try {
            return await apiConfig.get(`/api/dashboard/builder/${path}`, params, { skipGlobalErrorModal: true });
        } catch (error) {
            if (error?.response?.status !== 404) throw error;
            return apiConfig.get(`/api/dashboard/dashbuilder/${toDashbuilderGetPath(path)}`, params, { skipGlobalErrorModal: true });
        }
    };

    const postWithBuilderFallback = async (path, payload = {}) => {
        try {
            return await apiConfig.post(`/api/dashboard/builder/${path}`, payload, { skipGlobalErrorModal: true });
        } catch (error) {
            if (error?.response?.status !== 404) throw error;
            return apiConfig.post(`/api/dashboard/dashbuilder/${toDashbuilderPostPath(path)}`, payload, { skipGlobalErrorModal: true });
        }
    };

    const saveWithPathCandidates = async (paths, payload) => {
        let lastError = null;
        for (const path of paths) {
            try {
                return await postWithBuilderFallback(path, payload);
            } catch (error) {
                lastError = error;
            }
        }
        throw lastError || new Error("Failed to save dashboard widgets.");
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
                setWidgets([]);
                const selectedUserId = Number(selectedBuilderUserId);
                const effectiveUserId =
                    Number.isInteger(selectedUserId) && selectedUserId > 0
                        ? selectedUserId
                        : dashboardOwnerUserId;
                const response = await getWithBuilderFallback(`widgets/${effectiveUserId}`);
                if (!isMounted) return;
                const apiWidgets = normalizeWidgets(response?.data?.widgets);
                setWidgets(apiWidgets);
                lastSavedSnapshotRef.current = JSON.stringify(apiWidgets);
                hasLoadedWidgetsRef.current = true;
                setSaveMessage("");
            } catch (error) {
                if (!isMounted) return;
                setWidgets([]);
                hasLoadedWidgetsRef.current = true;
                setSaveMessage(error?.response?.data?.message || "Unable to load dashboard widgets.");
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
    }, [dashboardOwnerUserId, selectedBuilderUserId, isAdmin]);

    useEffect(() => {
        setMetricOptions([]);
    }, []);

    useEffect(() => {
        let isMounted = true;

        const toArray = (value) => {
            if (Array.isArray(value)) return value;
            if (Array.isArray(value?.roles)) return value.roles;
            if (Array.isArray(value?.data)) return value.data;
            if (Array.isArray(value?.rows)) return value.rows;
            if (Array.isArray(value?.items)) return value.items;
            return [];
        };

        const normalizeRoleName = (role) =>
            String(
                role?.role_name ||
                role?.name ||
                role?.role ||
                ""
            ).trim();

        const normalizeUserName = (user) =>
            String(
                user?.full_name ||
                user?.name ||
                user?.username ||
                user?.user_name ||
                ""
            ).trim();

        const normalizeUserId = (user) => {
            const id = Number(user?.id || user?.user_id || user?.userId);
            return Number.isInteger(id) && id > 0 ? id : null;
        };

        const normalizeUserRole = (user) =>
            String(
                user?.role_name ||
                user?.role ||
                user?.role_title ||
                ""
            ).trim();

        const loadRoleAndOperatorOptions = async () => {
            try {
                const [rolesResponse, usersResponse] = await Promise.all([
                    apiConfig.get("/roles", { page: 1, limit: 200 }, { skipGlobalErrorModal: true }),
                    apiConfig.get("/users", {}, { skipGlobalErrorModal: true }),
                ]);

                if (!isMounted) return;

                const roleRecords = toArray(rolesResponse?.data);
                const roles = roleRecords
                    .map(normalizeRoleName)
                    .filter(Boolean);
                const allowedRoles = new Set(roles);

                const users = toArray(usersResponse?.data)
                    .map((user) => ({
                        id: normalizeUserId(user),
                        name: normalizeUserName(user),
                        role: normalizeUserRole(user),
                    }))
                    .filter((user) => user.id && user.name && user.role && allowedRoles.has(user.role));

                const dedupedRoles = Array.from(new Set(roles));
                const dedupedUsers = users.filter(
                    (user, index, arr) =>
                        index === arr.findIndex((entry) => entry.id === user.id)
                );

                setBuilderRoles(dedupedRoles);
                setBuilderUsers(dedupedUsers);
                setSelectedRole((current) => current || dedupedRoles[0] || "");
            } catch {
                if (!isMounted) return;
                setBuilderRoles([]);
                setBuilderUsers([]);
            }
        };

        loadRoleAndOperatorOptions();

        return () => {
            isMounted = false;
        };
    }, []);

    const usersForSelectedRole = useMemo(() => {
        const list = selectedRole
            ? builderUsers.filter((user) => !user.role || user.role === selectedRole)
            : builderUsers;
        return list;
    }, [builderUsers, selectedRole]);

    useEffect(() => {
        setSelectedBuilderUserId((current) => {
            if (current && usersForSelectedRole.some((user) => String(user.id) === String(current))) return current;
            return usersForSelectedRole[0]?.id ? String(usersForSelectedRole[0].id) : "";
        });
    }, [usersForSelectedRole]);

    const handleToggle = (widgetIndex) => {
        setWidgets((current) =>
            current.map((widget, index) =>
                index === widgetIndex ? { ...widget, enabled: !widget.enabled } : widget
            )
        );
    };

    const handleDelete = (widgetIndex) => {
        setWidgets((current) => current.filter((_, index) => index !== widgetIndex));
    };

    const handleOpenAddWidget = () => {
        setIsAddWidgetModalOpen(true);
    };

    const handleCloseAddWidget = () => {
        setIsAddWidgetModalOpen(false);
    };

    const handleAddWidget = () => {
        const selectedVisualization =
            builderVisualizationOptions.find((option) => option.key === selectedChartType) ||
            builderVisualizationOptions[0];

        setWidgets((current) => [
            ...current,
            {
                id: `field-widget-${Date.now()}`,
                name: selectedFieldName || "SCI",
                enabled: true,
                order: current.length + 1,
                metric_key: "custom_field",
                widget_type: FIELD_WIDGET_TYPE,
                department: selectedDepartment?.name || "Quality Control",
                sub_department: selectedSubDepartment?.name || "Mixing",
                screen_name: selectedScreenName || "Cotton HVI Data Entry",
                field_name: selectedFieldName || "SCI",
                chart_type: selectedVisualization.key,
                builder_section: selectedVisualization.section,
            },
        ]);
        setIsAddWidgetModalOpen(false);
    };

    const buildFieldWidget = (fieldName, chartType = selectedChartType) => ({
        id: `field-widget-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name: `${fieldName} ${DASHBOARD_CHART_TYPES.find((item) => item.key === chartType)?.label || "Widget"}`,
        enabled: true,
        order: widgets.length + 1,
        metric_key: "custom_field",
        widget_type: FIELD_WIDGET_TYPE,
        chart_type: chartType,
        builder_section: chartType === "value" ? BUILDER_SECTIONS.average : BUILDER_SECTIONS.performance,
        department: selectedDepartment?.name || "",
        sub_department: selectedSubDepartment?.name || "",
        screen_name: selectedScreenName,
        field_name: fieldName,
>>>>>>> 7ad5f269e07065fc0b8f485820640f74c697cf24
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

<<<<<<< HEAD
    return () => {
      isMounted = false;
=======
        const orderedWidgets = widgetsToSave.map((widget, index) => {
            const selectMetric = getMetricSelectValue(widget);
            const isTrend = selectMetric === TICKET_TREND_SELECT_KEY;
            return {
                ...widget,
                id: isTrend
                    ? (String(widget.id || "").startsWith(TICKET_TREND_ID_PREFIX) ? widget.id : `${TICKET_TREND_ID_PREFIX}${Date.now()}-${index + 1}`)
                    : widget.id,
                metric_key: isTrend ? "tickets" : (widget.metric_key || "today_submissions"),
                order: index + 1,
            };
        });

        try {
            setSaving(true);
            const payloadWidgets = orderedWidgets.map((widget) => ({
                id: widget.id,
                department: widget.department || "Quality Control",
                sub_department: widget.sub_department || "Mixing",
                input_screen: widget.screen_name || "Cotton HVI Data Entry",
                input_field: normalizeInputFieldKey(widget.field_name || "SCI"),
                visualization_type: chartTypeToVisualizationType(widget.chart_type),
                enabled: widget.enabled !== false,
                order: widget.order,
            }));

            const selectedUserId = Number(selectedBuilderUserId);
            const effectiveUserId =
                Number.isInteger(selectedUserId) && selectedUserId > 0
                    ? selectedUserId
                    : dashboardOwnerUserId;

            const savePayload = {
                user_id: effectiveUserId,
                userId: effectiveUserId,
                assigned_user_id: effectiveUserId,
                assignedUserId: effectiveUserId,
                owner_user_id: effectiveUserId,
                ownerUserId: effectiveUserId,
                widgets: payloadWidgets,
            };
            const isSavingForAnotherUser = effectiveUserId !== dashboardOwnerUserId;
            const savePaths = isSavingForAnotherUser
                ? [`widgets/${effectiveUserId}`, `assign/${effectiveUserId}`]
                : [`widgets/${effectiveUserId}`, "my-widgets"];
            await saveWithPathCandidates(savePaths, savePayload);
            lastSavedSnapshotRef.current = JSON.stringify(orderedWidgets);
            setWidgets(orderedWidgets);
            if (successMessage) {
                setSaveMessage(successMessage);
            } else {
                setSaveMessage("");
            }
            return true;
        } catch (error) {
            setSaveMessage(error?.response?.data?.message || "Failed to save dashboard widgets.");
            return false;
        } finally {
            setSaving(false);
        }
>>>>>>> 7ad5f269e07065fc0b8f485820640f74c697cf24
    };
  }, [dashboardOwnerUserId]);

<<<<<<< HEAD
  const handleToggle = (widgetIndex) => {
    setWidgets((current) =>
      current.map((widget, index) =>
        index === widgetIndex ? { ...widget, enabled: !widget.enabled } : widget
      )
=======
    const handleSave = async () => {
        if (!dashboardOwnerUserId) {
            setSaveMessage("Unable to identify logged-in user.");
            return;
        }

        await saveWidgets(widgets);
    };

    useEffect(() => {
        if (!hasLoadedWidgetsRef.current || !dashboardOwnerUserId) return;
        const currentSnapshot = JSON.stringify(widgets);
        if (currentSnapshot === lastSavedSnapshotRef.current) return;

        if (autosaveTimerRef.current) {
            clearTimeout(autosaveTimerRef.current);
        }

        autosaveTimerRef.current = setTimeout(() => {
            saveWidgets(widgets, { successMessage: "" });
        }, 500);

        return () => {
            if (autosaveTimerRef.current) {
                clearTimeout(autosaveTimerRef.current);
            }
        };
    }, [widgets, dashboardOwnerUserId, selectedBuilderUserId]);

    const getBuilderRowText = (widget) =>
        [
            widget.department || "Quality Control",
            widget.sub_department || "Mixing",
            widget.screen_name || "Cotton HVI Data Entry",
            widget.field_name || widget.name || "SCI",
        ].join(" | ");

    const builderRows = widgets.map((widget, index) => ({
        widget,
        index,
        section: widget.builder_section || (index < 3 ? BUILDER_SECTIONS.average : BUILDER_SECTIONS.performance),
    }));
    const averageRows = builderRows.filter(({ section }) => section === BUILDER_SECTIONS.average);
    const performanceRows = builderRows.filter(({ section }) => section === BUILDER_SECTIONS.performance);

    return (
        <div className={styles.dashboardMain}>
            <section className={styles.builderHeader}>
                <h1 className={styles.kicker}>Dashboard Builder</h1>
                <div className={styles.rowActions}>
                    <button type="button" className={styles.addWidgetButton} onClick={handleOpenAddWidget}>
                        <FiPlus />
                        <span>Add Widget</span>
                    </button>
                </div>
            </section>

            <section className={styles.builderTopPanel}>
                <div className={styles.builderUserControls}>
                    <label>
                        <span>Role</span>
                        <select
                            value={selectedRole}
                            onChange={(event) => setSelectedRole(event.target.value)}
                        >
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
                            value={selectedBuilderUserId}
                            onChange={(event) => setSelectedBuilderUserId(event.target.value)}
                        >
                            {usersForSelectedRole.map((builderUser) => (
                                <option key={builderUser.id} value={builderUser.id}>
                                    {builderUser.name}
                                </option>
                            ))}
                        </select>
                    </label>
                </div>
                <div className={styles.builderSelectedUser}>
                    <strong>{usersForSelectedRole.find((user) => String(user.id) === String(selectedBuilderUserId))?.name || displayUserName}</strong>
                    <span>{selectedRole}</span>
                </div>
            </section>

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
                    <div className={styles.builderAddModal} role="dialog" aria-modal="true" aria-labelledby="add-widget-title">
                        <header className={styles.builderAddModalHeader}>
                            <h2 id="add-widget-title">Add Widget</h2>
                            <p>Select the Widget you want to add in the Dashboard Builder</p>
                        </header>

                        <div className={styles.builderAddModalGrid}>
                            <label>
                                <span>Department</span>
                                <select
                                    value={selectedDepartmentSlug}
                                    onChange={(event) => {
                                        const nextDepartmentSlug = event.target.value;
                                        const nextDepartment = departmentDirectory.find((item) => item.slug === nextDepartmentSlug);
                                        const nextSubDepartmentSlug = nextDepartment?.subDepartments?.[0]?.slug || "";
                                        const nextScreens = getThresholdScreensForSubDepartment(nextDepartmentSlug, nextSubDepartmentSlug);
                                        const nextScreenName = nextScreens[0] || "";
                                        const nextFields = getThresholdFieldsForScreen(nextScreenName);

                                        setSelectedDepartmentSlug(nextDepartmentSlug);
                                        setSelectedSubDepartmentSlug(nextSubDepartmentSlug);
                                        setSelectedScreenName(nextScreenName);
                                        setSelectedFieldName(nextFields.includes("SCI") ? "SCI" : (nextFields[0] || "SCI"));
                                    }}
                                >
                                    {departmentDirectory.map((department) => (
                                        <option key={department.slug} value={department.slug}>
                                            {department.name}
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <label>
                                <span>Sub Department</span>
                                <select
                                    value={selectedSubDepartmentSlug}
                                    onChange={(event) => {
                                        const nextSubDepartmentSlug = event.target.value;
                                        const nextScreens = getThresholdScreensForSubDepartment(selectedDepartmentSlug, nextSubDepartmentSlug);
                                        const nextScreenName = nextScreens[0] || "";
                                        const nextFields = getThresholdFieldsForScreen(nextScreenName);

                                        setSelectedSubDepartmentSlug(nextSubDepartmentSlug);
                                        setSelectedScreenName(nextScreenName);
                                        setSelectedFieldName(nextFields.includes("SCI") ? "SCI" : (nextFields[0] || "SCI"));
                                    }}
                                >
                                    {subDepartments.map((subDepartment) => (
                                        <option key={subDepartment.slug} value={subDepartment.slug}>
                                            {subDepartment.name}
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <label>
                                <span>Notebook Type</span>
                                <select
                                    value={selectedScreenName}
                                    onChange={(event) => {
                                        const nextScreenName = event.target.value;
                                        const nextFields = getThresholdFieldsForScreen(nextScreenName);

                                        setSelectedScreenName(nextScreenName);
                                        setSelectedFieldName(nextFields.includes("SCI") ? "SCI" : (nextFields[0] || "SCI"));
                                    }}
                                >
                                    {inputScreens.map((screen) => (
                                        <option key={screen} value={screen}>
                                            {screen}
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <label>
                                <span>Field</span>
                                <select value={selectedFieldName} onChange={(event) => setSelectedFieldName(event.target.value)}>
                                    {modalFieldOptions.map((fieldName) => (
                                        <option key={fieldName} value={fieldName}>
                                            {fieldName}
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <label>
                                <span>Visualization Type</span>
                                <select value={selectedChartType} onChange={(event) => setSelectedChartType(event.target.value)}>
                                    {builderVisualizationOptions.map((visualization) => (
                                        <option key={visualization.key} value={visualization.key}>
                                            {visualization.label}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        </div>

                        <footer className={styles.builderAddModalFooter}>
                            <button type="button" className={styles.builderModalCancel} onClick={handleCloseAddWidget}>
                                Cancel
                            </button>
                            <button type="button" className={styles.builderModalSubmit} onClick={handleAddWidget}>
                                Add to Builder
                            </button>
                        </footer>
                    </div>
                </div>
            ) : null}
        </div>
>>>>>>> 7ad5f269e07065fc0b8f485820640f74c697cf24
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
