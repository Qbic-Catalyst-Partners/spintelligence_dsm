import { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { FiGrid, FiPlus, FiServer, FiTrash2 } from "react-icons/fi";

import apiConfig from "@/apis/apiConfig";
import { isFullAccessUser } from "@/utils/accessControl";
import { getDashboardOwnerUserId } from "@/utils/dashboardOwner";
import { departmentDirectory } from "@/views/departments/data";
import { getThresholdFieldsForScreen } from "@/views/thresholds/fieldCatalog";
import { getThresholdScreensForSubDepartment } from "@/views/thresholds/screenCatalog";
import styles from "@/styles/departmentDirectory.module.css";

const BUILDER_SECTIONS = { average: "average", performance: "performance" };
const builderVisualizationOptions = [
  { key: "value", label: "Average Value Card", section: BUILDER_SECTIONS.average },
  { key: "line", label: "Performance Trends", section: BUILDER_SECTIONS.performance },
];

const parseWidgetEnabled = (value) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return true;
  if (["false", "0", "off", "disabled", "no"].includes(normalized)) return false;
  return true;
};

const normalizeInputFieldKey = (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, "_");
const visualizationTypeToChartType = (visualizationType) =>
  String(visualizationType || "").toLowerCase().includes("average") ? "value" : "line";
const chartTypeToVisualizationType = (chartType) => (chartType === "value" ? "average_value_card" : "line_chart");

function SettingsDashboardBuilder() {
  const authUser = useSelector((state) => state.auth?.user);
  const canCustomizeDashboards = useMemo(() => isFullAccessUser(authUser), [authUser]);
  const dashboardOwnerUserId = useMemo(() => getDashboardOwnerUserId(authUser), [authUser]);

  const [widgets, setWidgets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  const [builderRoles, setBuilderRoles] = useState([]);
  const [builderUsers, setBuilderUsers] = useState([]);
  const [selectedRole, setSelectedRole] = useState("");
  const [selectedBuilderUserId, setSelectedBuilderUserId] = useState("");

  const [selectedDepartmentSlug, setSelectedDepartmentSlug] = useState("");
  const [selectedSubDepartmentSlug, setSelectedSubDepartmentSlug] = useState("");
  const [selectedScreenName, setSelectedScreenName] = useState("");
  const [selectedFieldName, setSelectedFieldName] = useState("");
  const [selectedChartType, setSelectedChartType] = useState("value");
  const [isAddWidgetModalOpen, setIsAddWidgetModalOpen] = useState(false);

  const selectedDepartment = useMemo(
    () => departmentDirectory.find((item) => item.slug === selectedDepartmentSlug),
    [selectedDepartmentSlug]
  );
  const subDepartments = selectedDepartment?.subDepartments || [];
  const selectedSubDepartment = useMemo(
    () => subDepartments.find((item) => item.slug === selectedSubDepartmentSlug),
    [subDepartments, selectedSubDepartmentSlug]
  );
  const inputScreens = useMemo(
    () => getThresholdScreensForSubDepartment(selectedDepartmentSlug, selectedSubDepartmentSlug),
    [selectedDepartmentSlug, selectedSubDepartmentSlug]
  );
  const availableFields = useMemo(() => getThresholdFieldsForScreen(selectedScreenName), [selectedScreenName]);

  useEffect(() => {
    if (!departmentDirectory.length) return;
    if (!selectedDepartmentSlug || !departmentDirectory.some((d) => d.slug === selectedDepartmentSlug)) {
      setSelectedDepartmentSlug(departmentDirectory[0].slug);
    }
  }, [selectedDepartmentSlug]);

  useEffect(() => {
    const nextSubDepartmentSlug = subDepartments[0]?.slug || "";
    if (!selectedSubDepartmentSlug || !subDepartments.some((s) => s.slug === selectedSubDepartmentSlug)) {
      setSelectedSubDepartmentSlug(nextSubDepartmentSlug);
    }
  }, [subDepartments, selectedSubDepartmentSlug]);

  useEffect(() => {
    const nextScreenName = inputScreens[0] || "";
    if (!selectedScreenName || !inputScreens.includes(selectedScreenName)) setSelectedScreenName(nextScreenName);
  }, [inputScreens, selectedScreenName]);

  useEffect(() => {
    const nextFieldName = availableFields[0] || "";
    if (!selectedFieldName || !availableFields.includes(selectedFieldName)) setSelectedFieldName(nextFieldName);
  }, [availableFields, selectedFieldName]);

  useEffect(() => {
    let isMounted = true;
    const loadOptions = async () => {
      if (!canCustomizeDashboards) return;
      try {
        const response = await apiConfig.get("/api/dashboard/builder/options", {}, { skipGlobalErrorModal: true });
        if (!isMounted) return;
        const roles = Array.isArray(response?.data?.roles) ? response.data.roles : [];
        const users = Array.isArray(response?.data?.users) ? response.data.users : [];
        setBuilderRoles(roles);
        setBuilderUsers(
          users
            .map((u) => ({ id: String(u?.user_id || u?.id || ""), name: u?.user_name || u?.full_name || "", role: u?.role || "" }))
            .filter((u) => u.id && u.name)
        );
      } catch {
        if (!isMounted) return;
        setBuilderRoles([]);
        setBuilderUsers([]);
      }
    };
    loadOptions();
    return () => {
      isMounted = false;
    };
  }, [canCustomizeDashboards]);

  const filteredUsers = useMemo(
    () => (selectedRole ? builderUsers.filter((u) => !u.role || u.role === selectedRole) : builderUsers),
    [builderUsers, selectedRole]
  );

  useEffect(() => {
    if (builderRoles.length && (!selectedRole || !builderRoles.includes(selectedRole))) {
      setSelectedRole(builderRoles[0]);
    }
  }, [builderRoles, selectedRole]);

  useEffect(() => {
    if (!filteredUsers.length) {
      setSelectedBuilderUserId("");
      return;
    }
    if (!selectedBuilderUserId || !filteredUsers.some((u) => u.id === selectedBuilderUserId)) {
      const own = filteredUsers.find((u) => Number(u.id) === dashboardOwnerUserId);
      setSelectedBuilderUserId((own || filteredUsers[0]).id);
    }
  }, [filteredUsers, selectedBuilderUserId, dashboardOwnerUserId]);

  const activeUserId = Number(selectedBuilderUserId) || dashboardOwnerUserId;

  const normalizeWidgets = (nextWidgets) =>
    (Array.isArray(nextWidgets) ? nextWidgets : []).map((widget, index) => {
      const chartType = widget?.chart_type || visualizationTypeToChartType(widget?.visualization_type);
      return {
        id: widget?.id || `widget-${index + 1}`,
        enabled: parseWidgetEnabled(widget?.enabled),
        order: Number.isInteger(widget?.order) ? widget.order : index + 1,
        department: widget?.department || "",
        sub_department: widget?.sub_department || "",
        screen_name: widget?.screen_name || widget?.input_screen || "",
        field_name: widget?.field_name || widget?.input_field || "",
        chart_type: chartType,
        builder_section: chartType === "value" ? BUILDER_SECTIONS.average : BUILDER_SECTIONS.performance,
      };
    });

  useEffect(() => {
    let isMounted = true;
    const loadWidgets = async () => {
      if (!canCustomizeDashboards || !activeUserId) {
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        const response = await apiConfig.get(`/api/dashboard/builder/widgets/${activeUserId}`);
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
    loadWidgets();
    return () => {
      isMounted = false;
    };
  }, [activeUserId, canCustomizeDashboards]);

  const builderRows = widgets.map((widget, index) => ({
    widget,
    index,
    section: widget.builder_section || (widget.chart_type === "value" ? BUILDER_SECTIONS.average : BUILDER_SECTIONS.performance),
  }));
  const averageRows = builderRows.filter(({ section }) => section === BUILDER_SECTIONS.average);
  const performanceRows = builderRows.filter(({ section }) => section === BUILDER_SECTIONS.performance);

  const handleToggle = (widgetIndex) => {
    setWidgets((current) => {
      const next = current.map((w, i) => (i === widgetIndex ? { ...w, enabled: !w.enabled } : w));
      setTimeout(() => { handleSave(next); }, 0);
      return next;
    });
  };

  const handleDelete = (widgetIndex) => {
    setWidgets((current) => {
      const next = current.filter((_, i) => i !== widgetIndex).map((w, i) => ({ ...w, order: i + 1 }));
      setTimeout(() => { handleSave(next); }, 0);
      return next;
    });
  };

  const handleAddWidget = () => {
    const selectedVisualization = builderVisualizationOptions.find((o) => o.key === selectedChartType) || builderVisualizationOptions[0];
    setWidgets((current) => {
      const next = [
        ...current,
        {
        id: `widget-${Date.now()}`,
        enabled: true,
        order: current.length + 1,
        department: selectedDepartment?.name || "",
        sub_department: selectedSubDepartment?.name || "",
        screen_name: selectedScreenName || "",
        field_name: selectedFieldName || "",
        chart_type: selectedVisualization.key,
        builder_section: selectedVisualization.section,
        },
      ];
      setTimeout(() => { handleSave(next); }, 0);
      return next;
    });
    setIsAddWidgetModalOpen(false);
  };

  const handleSave = async (widgetsToSave = widgets) => {
    if (!activeUserId) return;
    try {
      setSaving(true);
      const payloadWidgets = widgetsToSave.map((widget, index) => ({
        id: widget.id,
        department: widget.department || "",
        sub_department: widget.sub_department || "",
        input_screen: widget.screen_name || "",
        input_field: normalizeInputFieldKey(widget.field_name || ""),
        visualization_type: chartTypeToVisualizationType(widget.chart_type),
        enabled: widget.enabled !== false,
        order: index + 1,
      }));
      await apiConfig.post(`/api/dashboard/builder/widgets/${activeUserId}`, { widgets: payloadWidgets });
      setSaveMessage("Dashboard widgets saved successfully.");
    } catch (error) {
      setSaveMessage(error?.response?.data?.message || "Failed to save dashboard widgets.");
    } finally {
      setSaving(false);
    }
  };

  const selectedUser = filteredUsers.find((u) => u.id === selectedBuilderUserId);

  if (authUser && !canCustomizeDashboards) {
    return (
      <div className={styles.dashboardMain}>
        <section className={styles.builderHeader}><h1 className={styles.kicker}>Dashboard Builder</h1></section>
        <p className={styles.builderUserMeta}>Only EMP001 can customize user dashboards.</p>
      </div>
    );
  }

  return (
    <div className={styles.dashboardMain}>
      <section className={styles.builderHeader}>
        <h1 className={styles.kicker}>Dashboard Builder</h1>
        <div className={styles.rowActions}>
          <button type="button" className={styles.addWidgetButton} onClick={() => setIsAddWidgetModalOpen(true)}><FiPlus /><span>Add Widget</span></button>
        </div>
      </section>

      <section className={styles.builderTopPanel}>
        <div className={styles.builderUserControls}>
          <label><span>Role</span><select value={selectedRole} onChange={(e) => setSelectedRole(e.target.value)}>{builderRoles.map((role) => <option key={role} value={role}>{role}</option>)}</select></label>
          <label><span>Name</span><select value={selectedBuilderUserId} onChange={(e) => setSelectedBuilderUserId(e.target.value)}>{filteredUsers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
        </div>
        <div className={styles.builderSelectedUser}><strong>{selectedUser?.name || "-"}</strong><span>{selectedRole || "-"}</span></div>
      </section>

      <section className={styles.builderList}>
        <BuilderGroup title="Average Values Card" section={BUILDER_SECTIONS.average} rows={averageRows} handleToggle={handleToggle} handleDelete={handleDelete} />
        <BuilderGroup title="Performance Trends" section={BUILDER_SECTIONS.performance} rows={performanceRows} handleToggle={handleToggle} handleDelete={handleDelete} />
      </section>

      {loading ? <p>Loading...</p> : null}
      {saveMessage ? <p className={styles.builderStatusMessage}>{saveMessage}</p> : null}

      {isAddWidgetModalOpen ? (
        <div className={styles.builderModalOverlay}>
          <div className={styles.builderAddModal} role="dialog" aria-modal="true" aria-labelledby="add-widget-title">
            <header className={styles.builderAddModalHeader}><h2 id="add-widget-title">Add Widget</h2></header>
            <div className={styles.builderAddModalGrid}>
              <label><span>Department</span><select value={selectedDepartmentSlug} onChange={(e) => setSelectedDepartmentSlug(e.target.value)}>{departmentDirectory.map((d) => <option key={d.slug} value={d.slug}>{d.name}</option>)}</select></label>
              <label><span>Sub Department</span><select value={selectedSubDepartmentSlug} onChange={(e) => setSelectedSubDepartmentSlug(e.target.value)}>{subDepartments.map((d) => <option key={d.slug} value={d.slug}>{d.name}</option>)}</select></label>
              <label><span>Notebook Type</span><select value={selectedScreenName} onChange={(e) => setSelectedScreenName(e.target.value)}>{inputScreens.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
              <label><span>Field</span><select value={selectedFieldName} onChange={(e) => setSelectedFieldName(e.target.value)}>{availableFields.map((f) => <option key={f} value={f}>{f}</option>)}</select></label>
              <label><span>Visualization Type</span><select value={selectedChartType} onChange={(e) => setSelectedChartType(e.target.value)}>{builderVisualizationOptions.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}</select></label>
            </div>
            <footer className={styles.builderAddModalFooter}>
              <button type="button" className={styles.builderModalCancel} onClick={() => setIsAddWidgetModalOpen(false)}>Cancel</button>
              <button type="button" className={styles.builderModalSubmit} onClick={handleAddWidget}>Add to Builder</button>
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function BuilderGroup({ title, section, rows, handleToggle, handleDelete }) {
  const WidgetIcon = section === BUILDER_SECTIONS.performance ? FiServer : FiGrid;
  return (
    <div className={styles.builderGroup}>
      <h2>{title}</h2>
      {rows.map(({ widget, index }) => (
        <article key={`${widget.id}-${index}`} className={styles.builderRow}>
          <div className={styles.builderRowLeft}>
            <WidgetIcon className={`${styles.builderWidgetIcon} ${section === BUILDER_SECTIONS.performance ? styles.builderPerformanceWidgetIcon : ""}`} />
            <span className={styles.builderWidgetPath}>{[widget.department || "-", widget.sub_department || "-", widget.screen_name || "-", widget.field_name || "-"].join(" | ")}</span>
          </div>
          <div className={styles.builderRowRight}>
            <button type="button" className={`${styles.builderToggle} ${widget.enabled ? styles.builderToggleOn : ""}`} onClick={() => handleToggle(index)}><span className={styles.builderToggleThumb} /></button>
            <button type="button" className={styles.builderDelete} onClick={() => handleDelete(index)}><FiTrash2 /></button>
          </div>
        </article>
      ))}
    </div>
  );
}

export default SettingsDashboardBuilder;
