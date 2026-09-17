import { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { FiGrid, FiPlus, FiTrash2 } from "react-icons/fi";

import { fetchBuilderOptions, fetchMyWidgets, fetchUserWidgets, saveMyWidgets, saveUserWidgets } from "@/apis/dashboardBuilderApi";
import { isDashboardManagerUser } from "@/utils/accessControl";
import { getDashboardOwnerUserId } from "@/utils/dashboardOwner";
import { emitGlobalSuccessModal } from "@/utils/globalSuccessModal";

const DASHBOARD_BUILDER_SELECTION_STORAGE_KEY = "spintelligenceDashboardBuilderSelection";
import styles from "@/styles/departmentDirectory.module.css";

const BUILDER_SECTIONS = { ticketing: "ticketing" };

const parseWidgetEnabled = (value) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return true;
  if (["false", "0", "off", "disabled", "no"].includes(normalized)) return false;
  return true;
};

// "pending" stays the internal metric key (existing saved widgets already reference it), but
// the ticket's own real status is always "In Progress" everywhere else in the app - "Pending"
// was never an actual ticket status, just a mislabeled alias for the same correctly-counted
// value, so only the display label changes here.
const TICKET_OPTION_LABELS = {
  total: "Total Tickets",
  open: "Open Tickets",
  reopened: "Reopened Tickets",
  closed: "Closed Tickets",
  pending: "In Progress Tickets",
  overdue: "Overdue Tickets",
  submit: "Submit Tickets",
};
const normalizeTicketMetricKey = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

const getTicketMetricKey = (value) => {
  const key = normalizeTicketMetricKey(value);
  if (["total", "totaltickets"].includes(key)) return "total";
  if (["open", "opentickets"].includes(key)) return "open";
  if (["reopened", "reopenedtickets"].includes(key)) return "reopened";
  if (["closed", "closedtickets"].includes(key)) return "closed";
  if (["pending", "pendingtickets", "inprogress", "inprogresstickets"].includes(key)) return "pending";
  if (["overdue", "overduetickets"].includes(key)) return "overdue";
  if (["submit", "submittickets", "submitted", "submittedtickets"].includes(key)) return "submit";
  return "total";
};
const normalizeRoleKey = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
const isExcludedRole = (role) => normalizeRoleKey(role).includes("somplex");

function SettingsDashboardBuilder() {
  const authUser = useSelector((state) => state.auth?.user);
  const canCustomizeDashboards = useMemo(() => isDashboardManagerUser(authUser), [authUser]);
  const dashboardOwnerUserId = useMemo(() => getDashboardOwnerUserId(authUser), [authUser]);

  const [widgets, setWidgets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  const [builderRoles, setBuilderRoles] = useState([]);
  const [builderUsers, setBuilderUsers] = useState([]);
  const [selectedRole, setSelectedRole] = useState("");
  const [selectedBuilderUserId, setSelectedBuilderUserId] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(DASHBOARD_BUILDER_SELECTION_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.role) setSelectedRole(parsed.role);
        if (parsed?.userId) setSelectedBuilderUserId(String(parsed.userId));
      }
    } catch {
      // invalid storage value
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const payload = {
      role: selectedRole || undefined,
      userId: selectedBuilderUserId || undefined,
    };
    window.localStorage.setItem(DASHBOARD_BUILDER_SELECTION_STORAGE_KEY, JSON.stringify(payload));
  }, [selectedRole, selectedBuilderUserId]);

  const [isAddTicketModalOpen, setIsAddTicketModalOpen] = useState(false);
  const [ticketOptions, setTicketOptions] = useState({
    total: true,
    open: true,
    reopened: true,
    closed: true,
    pending: true,
    overdue: true,
    submit: true,
  });

  useEffect(() => {
    let isMounted = true;
    const loadOptions = async () => {
      if (!canCustomizeDashboards) return;
      try {
        const response = await fetchBuilderOptions();
        if (!isMounted) return;
        const roles = (Array.isArray(response?.data?.roles) ? response.data.roles : [])
          .map((role) => String(role || "").trim())
          .filter((role) => role && !isExcludedRole(role));
        const users = Array.isArray(response?.data?.users) ? response.data.users : [];
        const dedupedRoles = Array.from(new Set(roles));
        setBuilderRoles(dedupedRoles);
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

  const filteredUsers = useMemo(() => {
    if (!selectedRole) return builderUsers;
    return builderUsers.filter((u) => u.role === selectedRole);
  }, [builderUsers, selectedRole]);
  const ownBuilderUser = useMemo(
    () => builderUsers.find((u) => Number(u.id) === dashboardOwnerUserId),
    [builderUsers, dashboardOwnerUserId]
  );

  useEffect(() => {
    if (!builderRoles.length) return;
    if (!selectedRole || !builderRoles.includes(selectedRole)) {
      const ownUserRole = ownBuilderUser?.role;
      setSelectedRole((ownUserRole && builderRoles.includes(ownUserRole)) ? ownUserRole : builderRoles[0]);
    }
  }, [builderRoles, ownBuilderUser, selectedRole]);

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

  const selectedBuilderUserIdNumber = useMemo(() => {
    const id = Number(selectedBuilderUserId);
    return Number.isInteger(id) && id > 0 ? id : null;
  }, [selectedBuilderUserId]);

  const activeUserId = selectedBuilderUserIdNumber || dashboardOwnerUserId;
  const isEditingOwnDashboard = !activeUserId || activeUserId === dashboardOwnerUserId;

  // Average Values / Performance Trends widgets have been removed - only ticket widgets are
  // ever loaded into the builder, regardless of what's still saved in a user's config.
  const normalizeWidgets = (nextWidgets) =>
    (Array.isArray(nextWidgets) ? nextWidgets : [])
      .filter((widget) => {
        const visualizationType = String(widget?.visualization_type || "").trim().toLowerCase();
        return ["ticket_status_card", "individual_ticket_count", "add_ticket_count"].includes(visualizationType);
      })
      .map((widget, index) => {
        const ticketMetricKey = getTicketMetricKey(widget?.metric_key || widget?.ticket_metric || widget?.input_field || widget?.field_name);
        const ticketFieldLabel =
          TICKET_OPTION_LABELS[ticketMetricKey] ||
          widget?.field_name ||
          widget?.input_field ||
          "Total Tickets";

        return {
          id: widget?.id || `widget-${index + 1}`,
          enabled: parseWidgetEnabled(widget?.enabled),
          order: Number.isInteger(widget?.order) ? widget.order : index + 1,
          department: "Ticketing",
          sub_department: "",
          screen_name: "Ticket Dashboard",
          field_name: ticketFieldLabel,
          chart_type: "value",
          ticket_metric_key: ticketMetricKey,
          builder_section: BUILDER_SECTIONS.ticketing,
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
        const response = isEditingOwnDashboard
          ? await fetchMyWidgets()
          : await fetchUserWidgets(activeUserId);
        if (!isMounted) return;
        setWidgets(normalizeWidgets(response?.data?.widgets));
        setSaveMessage("");
      } catch (error) {
        if (!isMounted) return;
        const deniedOwnConfig =
          error?.response?.status === 403 &&
          String(error?.response?.data?.message || "").toLowerCase().includes("own dashboard configuration");

        if (deniedOwnConfig && canCustomizeDashboards && !isEditingOwnDashboard) {
          const fallback = await fetchMyWidgets();
          if (!isMounted) return;
          setWidgets(normalizeWidgets(fallback?.data?.widgets));
          setSaveMessage("Selected user dashboard endpoint is restricted by API. Showing editable admin baseline config.");
          return;
        }

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
  }, [activeUserId, canCustomizeDashboards, dashboardOwnerUserId, isEditingOwnDashboard, ownBuilderUser, selectedRole]);

  const ticketingRows = widgets.map((widget, index) => ({ widget, index }));

  const handleToggle = (widgetIndex) => {
    setWidgets((current) => {
      const next = current.map((w, i) => (i === widgetIndex ? { ...w, enabled: !w.enabled } : w));
      handleSave(next);
      return next;
    });
  };

  const handleDelete = (widgetIndex) => {
    setWidgets((current) => {
      const next = current.filter((_, i) => i !== widgetIndex).map((w, i) => ({ ...w, order: i + 1 }));
      handleSave(next);
      return next;
    });
  };

  const handleToggleTicketOption = (optionKey) => {
    setTicketOptions((current) => ({ ...current, [optionKey]: !current[optionKey] }));
  };

  const handleAddTicketCard = () => {
    const selectedMetrics = Object.entries(ticketOptions)
      .filter(([, isEnabled]) => isEnabled)
      .map(([key]) => key);

    const metricsToAdd = selectedMetrics.length ? selectedMetrics : ["total"];

    setWidgets((current) => {
      const next = [
        ...current,
        ...metricsToAdd.map((metricKey, index) => ({
          id: `ticket-${metricKey}-${Date.now()}-${index + 1}`,
          enabled: true,
          order: current.length + index + 1,
          department: "Ticketing",
          sub_department: "",
          screen_name: "Ticket Dashboard",
          field_name: TICKET_OPTION_LABELS[metricKey] || "Total Tickets",
          chart_type: "value",
          builder_section: BUILDER_SECTIONS.ticketing,
          visualization_type: "ticket_status_card",
          ticket_metric_key: metricKey,
          ticket_options: { ...ticketOptions },
        })),
      ];
      handleSave(next);
      return next;
    });

    setIsAddTicketModalOpen(false);
    emitGlobalSuccessModal({ message: "Data Submitted" });
    setSaveMessage("Data submitted successfully.");
  };

  const handleSave = async (widgetsToSave = widgets) => {
    if (!activeUserId) return;
    try {
      setSaving(true);
      const payloadWidgets = widgetsToSave.map((widget, index) => {
        const metricKey = getTicketMetricKey(
          widget.ticket_metric_key || widget.field_name || widget.input_field || "total"
        );
        return {
          id: widget.id,
          department: "Ticketing",
          sub_department: "",
          input_screen: "Ticket Dashboard",
          input_field: metricKey,
          visualization_type: "ticket_status_card",
          metric_key: metricKey,
          widget_name: TICKET_OPTION_LABELS[metricKey] || "Total Tickets",
          enabled: widget.enabled !== false,
          order: index + 1,
        };
      });
      if (isEditingOwnDashboard) {
        await saveMyWidgets(payloadWidgets);
      } else {
        try {
          await saveUserWidgets(activeUserId, payloadWidgets);
        } catch (error) {
          const deniedOwnConfig =
            error?.response?.status === 403 &&
            String(error?.response?.data?.message || "").toLowerCase().includes("own dashboard configuration");

          if (!deniedOwnConfig || !canCustomizeDashboards) {
            throw error;
          }

          await saveMyWidgets(payloadWidgets);
          setSaveMessage("Selected user save endpoint is restricted by API. Saved as admin baseline config.");
          return;
        }
      }
      emitGlobalSuccessModal({ message: "Data Submitted" });
      setSaveMessage("Data submitted successfully.");
    } catch (error) {
      setSaveMessage(error?.response?.data?.message || "Failed to save dashboard widgets.");
    } finally {
      setSaving(false);
    }
  };

  const selectedUser = builderUsers.find((u) => u.id === selectedBuilderUserId);

  if (authUser && !canCustomizeDashboards) {
    return (
      <div className={styles.dashboardMain}>
        <section className={styles.builderHeader}><h1 className={styles.kicker}>Dashboard Builder</h1></section>
        <p className={styles.builderUserMeta}>Only Admin users can customize user dashboards.</p>
      </div>
    );
  }

  return (
    <div className={styles.dashboardMain}>
      <section className={styles.builderHeader}>
        <h1 className={styles.kicker}>Dashboard Builder</h1>
        <div className={styles.rowActions}>
          <button type="button" className={styles.addWidgetButton} onClick={() => setIsAddTicketModalOpen(true)}><FiPlus /><span>Add Ticket</span></button>
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
        <BuilderGroup title="Ticketing Values" rows={ticketingRows} handleToggle={handleToggle} handleDelete={handleDelete} />
      </section>

      {loading ? <p>Loading...</p> : null}
      {saveMessage ? <p className={styles.builderStatusMessage}>{saveMessage}</p> : null}

      {isAddTicketModalOpen ? (
        <div className={styles.builderModalOverlay}>
          <div className={styles.builderAddModal} role="dialog" aria-modal="true" aria-labelledby="add-ticket-title">
            <header className={styles.builderAddModalHeader}>
              <h2 id="add-ticket-title">Ticket Dashboard</h2>
              <p>Select the ticket metrics you want to display in the Dashboard Builder</p>
            </header>
            <div className={styles.ticketOptionsGrid}>
              <div className={styles.ticketCardOptionRow}>
                <span className={styles.ticketCardOptionName}>Total Tickets</span>
                <button type="button" className={`${styles.builderToggle} ${ticketOptions.total ? styles.builderToggleOn : ""}`} onClick={() => handleToggleTicketOption("total")}><span className={styles.builderToggleThumb} /></button>
              </div>
              <div className={styles.ticketCardOptionRow}>
                <span className={styles.ticketCardOptionName}>Open Tickets</span>
                <button type="button" className={`${styles.builderToggle} ${ticketOptions.open ? styles.builderToggleOn : ""}`} onClick={() => handleToggleTicketOption("open")}><span className={styles.builderToggleThumb} /></button>
              </div>
              <div className={styles.ticketCardOptionRow}>
                <span className={styles.ticketCardOptionName}>Reopened Tickets</span>
                <button type="button" className={`${styles.builderToggle} ${ticketOptions.reopened ? styles.builderToggleOn : ""}`} onClick={() => handleToggleTicketOption("reopened")}><span className={styles.builderToggleThumb} /></button>
              </div>
              <div className={styles.ticketCardOptionRow}>
                <span className={styles.ticketCardOptionName}>Closed Tickets</span>
                <button type="button" className={`${styles.builderToggle} ${ticketOptions.closed ? styles.builderToggleOn : ""}`} onClick={() => handleToggleTicketOption("closed")}><span className={styles.builderToggleThumb} /></button>
              </div>
              <div className={styles.ticketCardOptionRow}>
                <span className={styles.ticketCardOptionName}>In Progress Tickets</span>
                <button type="button" className={`${styles.builderToggle} ${ticketOptions.pending ? styles.builderToggleOn : ""}`} onClick={() => handleToggleTicketOption("pending")}><span className={styles.builderToggleThumb} /></button>
              </div>
              <div className={styles.ticketCardOptionRow}>
                <span className={styles.ticketCardOptionName}>Overdue Tickets</span>
                <button type="button" className={`${styles.builderToggle} ${ticketOptions.overdue ? styles.builderToggleOn : ""}`} onClick={() => handleToggleTicketOption("overdue")}><span className={styles.builderToggleThumb} /></button>
              </div>
              <div className={styles.ticketCardOptionRow}>
                <span className={styles.ticketCardOptionName}>Submit Tickets</span>
                <button type="button" className={`${styles.builderToggle} ${ticketOptions.submit ? styles.builderToggleOn : ""}`} onClick={() => handleToggleTicketOption("submit")}><span className={styles.builderToggleThumb} /></button>
              </div>
            </div>
            <footer className={styles.builderAddModalFooter}>
              <button type="button" className={styles.builderModalCancel} onClick={() => setIsAddTicketModalOpen(false)}>Cancel</button>
              <button type="button" className={styles.builderModalSubmit} onClick={handleAddTicketCard}>Add to Builder</button>
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function BuilderGroup({ title, rows, handleToggle, handleDelete }) {
  return (
    <div className={styles.builderGroup}>
      <h2>{title}</h2>
      {rows.map(({ widget, index }) => (
        <article key={`${widget.id}-${index}`} className={styles.builderRow}>
          <div className={styles.builderRowLeft}>
            <FiGrid className={styles.builderWidgetIcon} />
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
