import { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { FiGrid, FiPlus, FiTrash2 } from "react-icons/fi";
import { HiOutlineDotsVertical } from "react-icons/hi";

import apiConfig from "@/apis/apiConfig";
import { getDashboardOwnerUserId } from "@/utils/dashboardOwner";
import styles from "@/styles/departmentDirectory.module.css";

const initialWidgets = Array.from({ length: 8 }, (_, index) => ({
    id: `widget-${index + 1}`,
    name: "Input Submitted Today",
    enabled: true,
    order: index + 1,
    metric_key: "today_submissions",
}));
const TICKET_TREND_SELECT_KEY = "tickets_trend";
const TICKET_TREND_ID_PREFIX = "ticket-trend-";

function SettingsDashboardBuilder() {
    const [widgets, setWidgets] = useState(initialWidgets);
    const [metricOptions, setMetricOptions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState("");

    const authUser = useSelector((state) => state.auth?.user);
    const dashboardOwnerUserId = useMemo(
        () => getDashboardOwnerUserId(authUser),
        [authUser]
    );

    const normalizeWidgets = (nextWidgets) =>
        (Array.isArray(nextWidgets) ? nextWidgets : []).map((widget, index) => ({
            id: widget?.id || `widget-${index + 1}`,
            name: widget?.name || "Input Submitted Today",
            enabled: widget?.enabled !== false,
            order: Number.isInteger(widget?.order) ? widget.order : index + 1,
            metric_key: widget?.metric_key || "today_submissions",
        }));

    const getMetricSelectValue = (widget) => {
        if (widget?.metric_key === "tickets" && String(widget?.id || "").startsWith(TICKET_TREND_ID_PREFIX)) {
            return TICKET_TREND_SELECT_KEY;
        }
        return widget?.metric_key || "today_submissions";
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
                const response = await apiConfig.get("/api/dashboard/widgets", { userId: dashboardOwnerUserId });
                if (!isMounted) return;
                setWidgets(normalizeWidgets(response?.data?.widgets).length ? normalizeWidgets(response?.data?.widgets) : initialWidgets);
                setSaveMessage("");
            } catch (error) {
                if (!isMounted) return;
                setWidgets(initialWidgets);
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
        let isMounted = true;

        const loadMetricOptions = async () => {
            try {
                const response = await apiConfig.get("/api/dashboard/widget-metrics");
                if (!isMounted) return;
                setMetricOptions(Array.isArray(response?.data?.metrics) ? response.data.metrics : []);
            } catch {
                if (!isMounted) return;
                setMetricOptions([]);
            }
        };

        loadMetricOptions();

        return () => {
            isMounted = false;
        };
    }, []);

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

    const handleAddWidget = () => {
        setWidgets((current) => [
            ...current,
            {
                id: `widget-${Date.now()}`,
                name: "New Widget",
                enabled: true,
                order: current.length + 1,
                metric_key: "today_submissions",
            },
        ]);
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
            await apiConfig.put(`/api/dashboard/widgets?userId=${dashboardOwnerUserId}`, {
                userId: dashboardOwnerUserId,
                widgets: orderedWidgets,
            });
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

    return (
        <div className={styles.dashboardMain}>
            <section className={styles.builderHeader}>
                <h1 className={styles.kicker}>Dashboard Builder</h1>
                <div className={styles.rowActions}>
                    <button type="button" className={styles.addWidgetButton} onClick={handleAddWidget}>
                        <FiPlus />
                        <span>Add Widget</span>
                    </button>
                    <button type="button" className={styles.addWidgetButton} onClick={handleSave} disabled={saving || loading}>
                        <span>{saving ? "Saving..." : "Save"}</span>
                    </button>
                </div>
            </section>

            {loading ? <p>Loading widgets...</p> : null}
            {!loading && saveMessage ? <p>{saveMessage}</p> : null}

            <section className={styles.builderList}>
                {widgets.map((widget, index) => (
                    <article key={`${widget.id}-${index}`} className={styles.builderRow}>
                        <div className={styles.builderRowLeft}>
                            <button type="button" className={styles.dragHandle} aria-label="Reorder widget">
                                <HiOutlineDotsVertical />
                            </button>
                            <FiGrid className={styles.builderWidgetIcon} />
                            <input
                                type="text"
                                className={styles.builderWidgetNameInput}
                                value={widget.name}
                                onChange={(event) => handleNameChange(index, event.target.value)}
                                placeholder="Enter widget name"
                                maxLength={60}
                            />
                            <select
                                className={styles.builderMetricSelect}
                                value={getMetricSelectValue(widget)}
                                onChange={(event) => handleMetricChange(index, event.target.value)}
                            >
                                {[
                                    ...(metricOptions.length ? metricOptions : [{ key: "today_submissions", label: "Input Submitted Today" }]),
                                    { key: TICKET_TREND_SELECT_KEY, label: "Ticket Trend (7 Days)" },
                                ].map((metric) => (
                                    <option key={metric.key} value={metric.key}>
                                        {metric.label}
                                    </option>
                                ))}
                            </select>
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
            </section>
        </div>
    );
}

export default SettingsDashboardBuilder;
