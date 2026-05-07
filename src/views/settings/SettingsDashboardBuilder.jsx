import { useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { FiGrid, FiPlus, FiServer, FiTrash2 } from "react-icons/fi";

import apiConfig from "@/apis/apiConfig";
import { getDashboardOwnerUserId } from "@/utils/dashboardOwner";
import { departmentDirectory } from "@/views/departments/data";
import { getThresholdScreensForSubDepartment } from "@/views/thresholds/screenCatalog";
import { getThresholdFieldsForScreen } from "@/views/thresholds/fieldCatalog";
import {
    DASHBOARD_CHART_TYPES,
    FIELD_WIDGET_TYPE,
} from "@/utils/dashboardWidgets";
import styles from "@/styles/departmentDirectory.module.css";

const BUILDER_SECTIONS = {
    average: "average",
    performance: "performance",
};

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
    const [selectedBuilderUser, setSelectedBuilderUser] = useState("");
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

    const selectedDepartment = useMemo(
        () => departmentDirectory.find((item) => item.slug === selectedDepartmentSlug),
        [selectedDepartmentSlug]
    );

    const subDepartments = selectedDepartment?.subDepartments || [];

    const selectedSubDepartment = useMemo(
        () => subDepartments.find((item) => item.slug === selectedSubDepartmentSlug),
        [selectedSubDepartmentSlug, subDepartments]
    );

    const inputScreens = useMemo(
        () => getThresholdScreensForSubDepartment(selectedDepartmentSlug, selectedSubDepartmentSlug),
        [selectedDepartmentSlug, selectedSubDepartmentSlug]
    );

    const availableFields = useMemo(
        () => getThresholdFieldsForScreen(selectedScreenName),
        [selectedScreenName]
    );

    const modalFieldOptions = useMemo(() => {
        const fields = availableFields.length ? availableFields : ["SCI"];
        return fields.includes(selectedFieldName) ? fields : [selectedFieldName, ...fields];
    }, [availableFields, selectedFieldName]);

    const displayUserName =
        authUser?.full_name ||
        authUser?.fullName ||
        authUser?.name ||
        authUser?.username ||
        "Current User";

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

    const getMetricSelectValue = (widget) => {
        if (widget?.metric_key === "tickets" && String(widget?.id || "").startsWith(TICKET_TREND_ID_PREFIX)) {
            return TICKET_TREND_SELECT_KEY;
        }
        return widget?.metric_key || "today_submissions";
    };

    const getWithBuilderFallback = async (path, params = {}) => {
        try {
            return await apiConfig.get(`/api/dashboard/builder/${path}`, params, { skipGlobalErrorModal: true });
        } catch (error) {
            if (error?.response?.status !== 404) throw error;
            return apiConfig.get(`/api/dashboard/dashbuilder/${path}`, params, { skipGlobalErrorModal: true });
        }
    };

    const postWithBuilderFallback = async (path, payload = {}) => {
        try {
            return await apiConfig.post(`/api/dashboard/builder/${path}`, payload, { skipGlobalErrorModal: true });
        } catch (error) {
            if (error?.response?.status !== 404) throw error;
            return apiConfig.post(`/api/dashboard/dashbuilder/${path}`, payload, { skipGlobalErrorModal: true });
        }
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
                const response = await getWithBuilderFallback(`widgets/${dashboardOwnerUserId}`);
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
    }, [dashboardOwnerUserId]);

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
                        name: normalizeUserName(user),
                        role: normalizeUserRole(user),
                    }))
                    .filter((user) => user.name && user.role && allowedRoles.has(user.role));

                const dedupedRoles = Array.from(new Set(roles));
                const dedupedUsers = users.filter(
                    (user, index, arr) =>
                        index === arr.findIndex((entry) => entry.name === user.name && entry.role === user.role)
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
        return list.map((user) => user.name);
    }, [builderUsers, selectedRole]);

    useEffect(() => {
        setSelectedBuilderUser((current) => {
            if (current && usersForSelectedRole.includes(current)) return current;
            return usersForSelectedRole[0] || "";
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
    });

    const handleAddFieldWidget = (fieldName, chartType = selectedChartType) => {
        setWidgets((current) => [
            ...current,
            {
                ...buildFieldWidget(fieldName, chartType),
                order: current.length + 1,
            },
        ]);
    };

    const handleFieldDragStart = (event, fieldName) => {
        event.dataTransfer.setData(
            "application/json",
            JSON.stringify({ fieldName, chartType: selectedChartType })
        );
        event.dataTransfer.effectAllowed = "copy";
    };

    const handleDropField = (event) => {
        event.preventDefault();
        const rawPayload = event.dataTransfer.getData("application/json");
        if (!rawPayload) return;

        try {
            const payload = JSON.parse(rawPayload);
            if (payload?.fieldName) {
                handleAddFieldWidget(payload.fieldName, payload.chartType || selectedChartType);
            }
        } catch {
            // Ignore malformed drag payloads.
        }
    };

    const moveBuilderWidget = (sourceIndex, targetSection, targetPosition = null) => {
        setWidgets((current) => {
            const draggedWidget = current[sourceIndex];
            if (!draggedWidget) return current;

            const remainingWidgets = current.filter((_, index) => index !== sourceIndex);
            const averageWidgets = remainingWidgets.filter(
                (widget, index) =>
                    (widget.builder_section || (index < 3 ? BUILDER_SECTIONS.average : BUILDER_SECTIONS.performance)) === BUILDER_SECTIONS.average
            );
            const performanceWidgets = remainingWidgets.filter(
                (widget, index) =>
                    (widget.builder_section || (index < 3 ? BUILDER_SECTIONS.average : BUILDER_SECTIONS.performance)) === BUILDER_SECTIONS.performance
            );
            const targetWidgets = targetSection === BUILDER_SECTIONS.average ? averageWidgets : performanceWidgets;
            const insertAt = Number.isInteger(targetPosition)
                ? Math.min(Math.max(targetPosition, 0), targetWidgets.length)
                : targetWidgets.length;

            targetWidgets.splice(insertAt, 0, {
                ...draggedWidget,
                builder_section: targetSection,
                chart_type: targetSection === BUILDER_SECTIONS.average ? "value" : (draggedWidget.chart_type === "value" ? "line" : draggedWidget.chart_type),
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

        if (rawSourceIndex !== "") {
            moveBuilderWidget(Number(rawSourceIndex), targetSection, targetPosition);
            return;
        }

        handleDropField(event);
    };

    const handleNameChange = (widgetIndex, nextName) => {
        setWidgets((current) =>
            current.map((widget, index) =>
                index === widgetIndex ? { ...widget, name: nextName } : widget
            )
        );
    };

    const handleMetricChange = (widgetIndex, metricKey) => {
        setWidgets((current) => {
            const selectedMetric = metricOptions.find((metric) => metric.key === metricKey);
            const isTrend = metricKey === TICKET_TREND_SELECT_KEY;
            return current.map((widget, index) =>
                index === widgetIndex
                    ? {
                        ...widget,
                        id: isTrend
                            ? (String(widget.id || "").startsWith(TICKET_TREND_ID_PREFIX) ? widget.id : `${TICKET_TREND_ID_PREFIX}${Date.now()}`)
                            : String(widget.id || "").startsWith(TICKET_TREND_ID_PREFIX)
                                ? `widget-${Date.now()}`
                                : widget.id,
                        metric_key: isTrend ? "tickets" : metricKey,
                        name: isTrend ? "Ticket Trend (7 Days)" : (selectedMetric?.label || widget.name),
                    }
                    : widget
            );
        });
    };

    const handleChartTypeChange = (widgetIndex, chartType) => {
        setWidgets((current) =>
            current.map((widget, index) =>
                index === widgetIndex
                    ? {
                        ...widget,
                        chart_type: chartType,
                        name:
                            widget.widget_type === FIELD_WIDGET_TYPE
                                ? `${widget.field_name} ${DASHBOARD_CHART_TYPES.find((item) => item.key === chartType)?.label || "Widget"}`
                                : widget.name,
                    }
                    : widget
            )
        );
    };

    const saveWidgets = async (widgetsToSave, { successMessage = "Dashboard widgets saved successfully." } = {}) => {
        if (!dashboardOwnerUserId) {
            setSaveMessage("Unable to identify logged-in user.");
            return false;
        }

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
                input_field: String(widget.field_name || "SCI").toLowerCase(),
                visualization_type: chartTypeToVisualizationType(widget.chart_type),
                enabled: widget.enabled !== false,
                order: widget.order,
            }));

            await postWithBuilderFallback(`widgets/${dashboardOwnerUserId}`, {
                widgets: payloadWidgets,
            });
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
    };

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
    }, [widgets, dashboardOwnerUserId]);

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
                            value={selectedBuilderUser}
                            onChange={(event) => setSelectedBuilderUser(event.target.value)}
                        >
                            {usersForSelectedRole.map((builderUser) => (
                                <option key={builderUser} value={builderUser}>
                                    {builderUser}
                                </option>
                            ))}
                        </select>
                    </label>
                </div>
                <div className={styles.builderSelectedUser}>
                    <strong>{selectedBuilderUser}</strong>
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
                                section === BUILDER_SECTIONS.performance ? styles.builderPerformanceWidgetIcon : ""
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
