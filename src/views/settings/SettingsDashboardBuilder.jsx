import { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { FiGrid, FiPlus, FiServer, FiTrash2 } from "react-icons/fi";
import { HiMiniChevronDown } from "react-icons/hi2";

import {
    assignDashboard,
    getDashboardOptions,
    getRoles,
    getUserWidgets,
    getUsers,
} from "@/apis/dashboardApi";
import { getDashboardOwnerUserId } from "@/utils/dashboardOwner";
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
const chartTypeToVisualizationType = (chartType) => {
    switch (String(chartType || "").toLowerCase()) {
        case "line":
            return "line_chart";
        case "area":
        case "timeline":
            return "area_chart";
        case "bar":
            return "bar_chart";
        default:
            return "average_value_card";
    }
};
const visualizationTypeToChartType = (visualizationType) => {
    switch (String(visualizationType || "").toLowerCase()) {
        case "line_chart":
            return "line";
        case "area_chart":
            return "timeline";
        case "bar_chart":
            return "average";
        default:
            return "value";
    }
};
const TICKET_TREND_SELECT_KEY = "tickets_trend";
const TICKET_TREND_ID_PREFIX = "ticket-trend-";
const uniqueList = (values = []) =>
    Array.from(new Set((Array.isArray(values) ? values : []).map((v) => String(v || "").trim()).filter(Boolean)));

function SettingsDashboardBuilder() {
    const [widgets, setWidgets] = useState([]);
    const [metricOptions, setMetricOptions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState("");
    const [selectedDepartmentSlug, setSelectedDepartmentSlug] = useState("");
    const [selectedSubDepartmentSlug, setSelectedSubDepartmentSlug] = useState("");
    const [selectedScreenName, setSelectedScreenName] = useState("");
    const [selectedFieldName, setSelectedFieldName] = useState("");
    const [selectedChartType, setSelectedChartType] = useState("value");
    const [selectedRole, setSelectedRole] = useState("");
    const [selectedBuilderUser, setSelectedBuilderUser] = useState("");
    const [selectedBuilderUserId, setSelectedBuilderUserId] = useState(null);
    const [roles, setRoles] = useState([]);
    const [users, setUsers] = useState([]);
    const [dashboardOptions, setDashboardOptions] = useState({
        departments: [],
        sub_departments: [],
        notebooks: [],
        input_fields: [],
    });
    const [isAddWidgetModalOpen, setIsAddWidgetModalOpen] = useState(false);

    const authUser = useSelector((state) => state.auth?.user);
    const dashboardOwnerUserId = useMemo(
        () => getDashboardOwnerUserId(authUser),
        [authUser]
    );
    const loggedInUserId = Number(authUser?.id || authUser?.user_id || authUser?.userId) || null;

    const departmentOptions = useMemo(() => uniqueList(dashboardOptions.departments || []), [dashboardOptions.departments]);
    const subDepartmentOptions = useMemo(() => uniqueList(dashboardOptions.sub_departments || []), [dashboardOptions.sub_departments]);
    const notebookOptions = useMemo(() => uniqueList(dashboardOptions.notebooks || []), [dashboardOptions.notebooks]);
    const modalFieldOptions = useMemo(() => uniqueList(dashboardOptions.input_fields || []), [dashboardOptions.input_fields]);

    const displayUserName =
        authUser?.full_name ||
        authUser?.fullName ||
        authUser?.name ||
        authUser?.username ||
        "Current User";
    const ownId = Number(authUser?.id || authUser?.user_id || authUser?.userId) || null;
    const filteredUsers = useMemo(
        () => users.filter((u) => !selectedRole || u.role === selectedRole),
        [users, selectedRole]
    );

    const normalizeWidgets = (nextWidgets) =>
        (Array.isArray(nextWidgets) ? nextWidgets : []).map((widget, index) => ({
            id: widget?.id || `widget-${index + 1}`,
            name: widget?.name || "",
            enabled: widget?.enabled !== false,
            order: Number.isInteger(widget?.order) ? widget.order : index + 1,
            metric_key: widget?.metric_key || "",
            widget_type: widget?.widget_type || "metric",
            chart_type: widget?.chart_type || visualizationTypeToChartType(widget?.visualization_type) || "value",
            visualization_type: widget?.visualization_type || chartTypeToVisualizationType(widget?.chart_type),
            department: widget?.department || "",
            sub_department: widget?.sub_department || "",
            screen_name: widget?.screen_name || widget?.input_screen || "",
            field_name: widget?.field_name || widget?.input_field || "",
            input_screen: widget?.input_screen || widget?.screen_name || "",
            input_field: widget?.input_field || widget?.field_name || "",
            builder_section:
                widget?.builder_section ||
                (index < 3 ? BUILDER_SECTIONS.average : BUILDER_SECTIONS.performance),
        }));

    const getMetricSelectValue = (widget) => {
        if (widget?.metric_key === "tickets" && String(widget?.id || "").startsWith(TICKET_TREND_ID_PREFIX)) {
            return TICKET_TREND_SELECT_KEY;
        }
        return widget?.metric_key || "today_submissions";
    };

    useEffect(() => {
        let isMounted = true;
        const localDisplayUserName =
            authUser?.full_name ||
            authUser?.fullName ||
            authUser?.name ||
            authUser?.username ||
            "Current User";
        const localOwnId = Number(authUser?.id || authUser?.user_id || authUser?.userId) || null;

        const loadDropdownData = async () => {
            try {
                const optionsRes = await getDashboardOptions();
                const hasRolesInOptions = Array.isArray(optionsRes?.data?.roles) && optionsRes.data.roles.length > 0;
                const hasUsersInOptions = Array.isArray(optionsRes?.data?.users) && optionsRes.data.users.length > 0;
                const [rolesRes, usersRes] = await Promise.all([
                    hasRolesInOptions ? Promise.resolve(null) : getRoles(),
                    hasUsersInOptions ? Promise.resolve(null) : getUsers(),
                ]);
                if (!isMounted) return;
                const roleRows = hasRolesInOptions
                    ? optionsRes.data.roles
                    : (Array.isArray(rolesRes?.data?.roles) ? rolesRes.data.roles : []);
                const userRows = hasUsersInOptions
                    ? optionsRes.data.users
                    : (Array.isArray(usersRes?.data?.users) ? usersRes.data.users : []);
                const normalizedRoles = roleRows
                    .map((roleItem) => ({
                        id: String(
                            (typeof roleItem === "string"
                                ? roleItem
                                : roleItem?.role || roleItem?.name || roleItem?.role_name || "")
                        ).trim(),
                        name: String(
                            (typeof roleItem === "string"
                                ? roleItem
                                : roleItem?.role || roleItem?.name || roleItem?.role_name || "")
                        ).trim(),
                    }))
                    .filter((r) => r.name);
                const normalizedUsers = userRows
                    .map((item) => ({
                        id: Number(item?.user_id || item?.id || item?.userId),
                        name: String(item?.user_name || item?.full_name || item?.username || "").trim() || `User ${item?.user_id || item?.id || ""}`,
                        role: String(item?.role || item?.role_name || item?.roleName || "").trim(),
                    }))
                    .filter((item) => Number.isInteger(item.id) && item.id > 0);

                setRoles(normalizedRoles);
                setUsers(normalizedUsers);
                setDashboardOptions({
                    departments: uniqueList(optionsRes?.data?.departments || []),
                    sub_departments: [],
                    notebooks: [],
                    input_fields: [],
                });
                setSelectedDepartmentSlug("");
                setSelectedSubDepartmentSlug("");
                setSelectedScreenName("");
                setSelectedFieldName("");
                setSelectedBuilderUserId(localOwnId);
                const me = normalizedUsers.find((u) => u.id === localOwnId);
                setSelectedBuilderUser(me?.name || localDisplayUserName);
                setSelectedRole(me?.role || "");
            } catch {
                if (!isMounted) return;
                setRoles([]);
                setUsers([]);
                setDashboardOptions({ departments: [], sub_departments: [], notebooks: [], input_fields: [] });
            }
        };

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
                const response = await getUserWidgets(dashboardOwnerUserId);
                if (!isMounted) return;
                setWidgets(normalizeWidgets(response?.data?.widgets));
                setSaveMessage("");
            } catch (error) {
                if (!isMounted) return;
                setWidgets([]);
                setSaveMessage(error?.response?.data?.message || "Unable to load dashboard widgets.");
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        loadDropdownData();
        loadWidgets();
        return () => {
            isMounted = false;
        };
    }, [authUser, dashboardOwnerUserId]);

    useEffect(() => {
        setMetricOptions([]);
    }, []);

    useEffect(() => {
        let isMounted = true;
        if (!isAddWidgetModalOpen) return undefined;

        const loadCascadeOptions = async () => {
            try {
                const response = await getDashboardOptions({
                    department: selectedDepartmentSlug || undefined,
                    sub_department: selectedSubDepartmentSlug || undefined,
                    notebook: selectedScreenName || undefined,
                });
                if (!isMounted) return;
                setDashboardOptions((prev) => ({
                    ...prev,
                    departments: uniqueList(response?.data?.departments || prev.departments),
                    sub_departments: uniqueList(response?.data?.sub_departments || []),
                    notebooks: uniqueList(response?.data?.notebooks || []),
                    input_fields: uniqueList(response?.data?.input_fields || []),
                }));
            } catch {
                // Keep previously loaded options if cascade fetch fails.
            }
        };

        loadCascadeOptions();
        return () => {
            isMounted = false;
        };
    }, [isAddWidgetModalOpen, selectedDepartmentSlug, selectedSubDepartmentSlug, selectedScreenName]);

    useEffect(() => {
        const nextUsers = users.filter((u) => !selectedRole || u.role === selectedRole);
        if (!nextUsers.length) {
            setSelectedBuilderUserId(null);
            setSelectedBuilderUser("");
            return;
        }

        const stillValid = nextUsers.some((u) => u.id === selectedBuilderUserId);
        if (!stillValid) {
            setSelectedBuilderUserId(nextUsers[0].id);
            setSelectedBuilderUser(nextUsers[0].name || "");
        }
    }, [selectedRole, users]);

    useEffect(() => {
        let isMounted = true;
        const targetUserId = selectedBuilderUserId || ownId || dashboardOwnerUserId;
        if (!targetUserId) return undefined;
        const loadSelectedUserWidgets = async () => {
            try {
                setLoading(true);
                const response = await getUserWidgets(targetUserId);
                if (!isMounted) return;
                setWidgets(normalizeWidgets(response?.data?.widgets));
                setSaveMessage("");
            } catch (error) {
                if (!isMounted) return;
                setWidgets([]);
                setSaveMessage(error?.response?.data?.message || "Unable to load selected user widgets.");
            } finally {
                if (isMounted) setLoading(false);
            }
        };
        loadSelectedUserWidgets();
        return () => {
            isMounted = false;
        };
    }, [selectedBuilderUserId, ownId, dashboardOwnerUserId]);

    const handleToggle = (widgetIndex) => {
        setWidgets((current) =>
            current.map((widget, index) =>
                index === widgetIndex ? { ...widget, enabled: !widget.enabled } : widget
            )
        );
    };

    const handleDelete = async (widgetIndex) => {
        const previousWidgets = widgets;
        const nextWidgets = previousWidgets
            .filter((_, index) => index !== widgetIndex)
            .map((widget, index) => ({
                ...widget,
                order: index + 1,
            }));

        setWidgets(nextWidgets);
        const saved = await saveWidgets(nextWidgets, { successMessage: "Widget deleted successfully." });
        if (!saved) {
            setWidgets(previousWidgets);
        }
    };

    const handleOpenAddWidget = async () => {
        setSelectedDepartmentSlug("");
        setSelectedSubDepartmentSlug("");
        setSelectedScreenName("");
        setSelectedFieldName("");
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
                department: selectedDepartmentSlug || "",
                sub_department: selectedSubDepartmentSlug || "",
                screen_name: selectedScreenName || "",
                field_name: selectedFieldName || "",
                input_screen: selectedScreenName || "",
                input_field: String(selectedFieldName || "").trim(),
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
        department: selectedDepartmentSlug || "",
        sub_department: selectedSubDepartmentSlug || "",
        screen_name: selectedScreenName,
        field_name: fieldName,
        input_screen: selectedScreenName || "",
        input_field: String(fieldName || "").trim(),
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
            const chartType = widget?.chart_type || "value";
            return {
                ...widget,
                id: isTrend
                    ? (String(widget.id || "").startsWith(TICKET_TREND_ID_PREFIX) ? widget.id : `${TICKET_TREND_ID_PREFIX}${Date.now()}-${index + 1}`)
                    : widget.id,
                metric_key: isTrend ? "tickets" : (widget.metric_key || "today_submissions"),
                visualization_type: chartTypeToVisualizationType(chartType),
                order: index + 1,
            };
        });

        try {
            setSaving(true);
            const targetUserId = selectedBuilderUserId || loggedInUserId || ownId || dashboardOwnerUserId;
            if (!targetUserId) {
                setSaveMessage("Unable to determine target user for saving widgets.");
                return false;
            }
            await assignDashboard(targetUserId, orderedWidgets);
            setWidgets(normalizeWidgets(orderedWidgets));
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
                    <button
                        type="button"
                        className={styles.builderModalSubmit}
                        onClick={handleSave}
                        disabled={saving || loading}
                    >
                        {saving ? "Saving..." : "Save Widgets"}
                    </button>
                </div>
            </section>
            {saveMessage ? (
                <p style={{ margin: "8px 0 0", fontSize: 14 }}>{saveMessage}</p>
            ) : null}

            <section className={styles.builderTopPanel}>
                <div className={styles.builderUserControls}>
                    <label>
                        <span>Role</span>
                        <select
                            value={selectedRole}
                            onChange={(event) => {
                                setSelectedRole(event.target.value);
                            }}
                        >
                            <option value="">All Roles</option>
                            {roles.map((role) => (
                                <option key={role?.id || role?.name} value={role?.name || ""}>
                                    {role?.name || "Role"}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label>
                        <span>Name</span>
                        <select
                            value={selectedBuilderUserId || ""}
                            onChange={(event) => {
                                const id = Number(event.target.value) || null;
                                setSelectedBuilderUserId(id);
                                const matched = users.find((u) => u.id === id);
                                setSelectedBuilderUser(matched?.name || "");
                                setSelectedRole(matched?.role || "");
                            }}
                        >
                            {!filteredUsers.length ? <option value="">No users</option> : null}
                            {filteredUsers.map((builderUser) => (
                                <option key={builderUser.id} value={builderUser.id}>
                                    {builderUser.name}
                                </option>
                            ))}
                        </select>
                    </label>
                </div>
                <div className={styles.builderSelectedUser}>
                    <strong>{selectedBuilderUser || displayUserName}</strong>
                    <span>{selectedRole || "Role"}</span>
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
                                <div className={styles.builderSelectWrap}>
                                    <select
                                        value={selectedDepartmentSlug}
                                        onChange={(event) => {
                                            setSelectedDepartmentSlug(event.target.value);
                                            setSelectedSubDepartmentSlug("");
                                            setSelectedScreenName("");
                                            setSelectedFieldName("");
                                        }}
                                    >
                                        <option value="">Select department</option>
                                        {departmentOptions.map((department) => (
                                            <option key={department} value={department}>
                                                {department}
                                            </option>
                                        ))}
                                    </select>
                                    <HiMiniChevronDown className={styles.builderSelectChevron} />
                                </div>
                            </label>

                            <label>
                                <span>Sub Department</span>
                                <div className={styles.builderSelectWrap}>
                                    <select
                                        value={selectedSubDepartmentSlug}
                                        disabled={!selectedDepartmentSlug}
                                        onChange={(event) => {
                                            setSelectedSubDepartmentSlug(event.target.value);
                                            setSelectedScreenName("");
                                            setSelectedFieldName("");
                                        }}
                                    >
                                        <option value="">Select sub department</option>
                                        {subDepartmentOptions.map((subDepartment) => (
                                            <option key={subDepartment} value={subDepartment}>
                                                {subDepartment}
                                            </option>
                                        ))}
                                    </select>
                                    <HiMiniChevronDown className={styles.builderSelectChevron} />
                                </div>
                            </label>

                            <label>
                                <span>Notebook Type</span>
                                <div className={styles.builderSelectWrap}>
                                    <select
                                        value={selectedScreenName}
                                        disabled={!selectedDepartmentSlug || !selectedSubDepartmentSlug}
                                        onChange={(event) => {
                                            setSelectedScreenName(String(event.target.value || ""));
                                            setSelectedFieldName("");
                                        }}
                                    >
                                        <option value="">Select notebook</option>
                                        {notebookOptions.map((screen) => (
                                            <option key={screen} value={screen}>
                                                {screen}
                                            </option>
                                        ))}
                                    </select>
                                    <HiMiniChevronDown className={styles.builderSelectChevron} />
                                </div>
                            </label>

                            <label>
                                <span>Field</span>
                                <div className={styles.builderSelectWrap}>
                                    <select
                                        value={selectedFieldName}
                                        disabled={!selectedDepartmentSlug || !selectedSubDepartmentSlug || !selectedScreenName}
                                        onChange={(event) => setSelectedFieldName(String(event.target.value || ""))}
                                    >
                                        <option value="">Select field</option>
                                        {modalFieldOptions.map((fieldName) => (
                                            <option key={fieldName} value={fieldName}>
                                                {fieldName}
                                            </option>
                                        ))}
                                    </select>
                                    <HiMiniChevronDown className={styles.builderSelectChevron} />
                                </div>
                            </label>

                            <label>
                                <span>Visualization Type</span>
                                <div className={styles.builderSelectWrap}>
                                    <select value={selectedChartType} onChange={(event) => setSelectedChartType(event.target.value)}>
                                        {builderVisualizationOptions.map((visualization) => (
                                            <option key={visualization.key} value={visualization.key}>
                                                {visualization.label}
                                            </option>
                                        ))}
                                    </select>
                                    <HiMiniChevronDown className={styles.builderSelectChevron} />
                                </div>
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
