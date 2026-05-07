import { useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { FiPieChart } from "react-icons/fi";

import apiConfig from "@/apis/apiConfig";
import { getDashboardOwnerUserId } from "@/utils/dashboardOwner";
import styles from "@/styles/departmentDirectory.module.css";

const trendModes = ["1D", "1W", "1M", "1Y"];
const DASHBOARD_FETCH_DEBOUNCE_MS = 350;
const visualizationTypeToChartType = (visualizationType) => {
    if (visualizationType === "average_value_card") return "value";
    if (visualizationType === "area_chart") return "timeline";
    if (visualizationType === "bar_chart") return "line";
    return "line";
};

function HomeDashboard() {
    const user = useSelector((state) => state.auth?.user);
    const fullName = user?.full_name || user?.fullName || user?.name || "Hency Belix";
    const dashboardOwnerUserId = useMemo(() => getDashboardOwnerUserId(user), [user]);
    const [widgets, setWidgets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState("");
    const [cardModes, setCardModes] = useState({});
    const [trendModesById, setTrendModesById] = useState({});
    const [widgetData, setWidgetData] = useState({});
    const widgetDataCacheRef = useRef(new Map());
    const debounceTimerRef = useRef(null);
    const inFlightControllersRef = useRef([]);

    const getWithBuilderFallback = async (path, params = {}, options = {}) => {
        try {
            return await apiConfig.get(`/api/dashboard/builder/${path}`, params, {
                skipGlobalErrorModal: true,
                ...options,
            });
        } catch (error) {
            if (error?.response?.status !== 404) throw error;
            return apiConfig.get(`/api/dashboard/dashbuilder/${path}`, params, {
                skipGlobalErrorModal: true,
                ...options,
            });
        }
    };

    const normalizedWidgets = useMemo(
        () =>
            (Array.isArray(widgets) ? widgets : []).map((widget, index) => ({
                id: widget?.id || `widget-${index + 1}`,
                enabled: widget?.enabled !== false,
                order: Number.isInteger(widget?.order) ? widget.order : index + 1,
                department: widget?.department || "Quality Control",
                sub_department: widget?.sub_department || "Mixing",
                input_screen: widget?.input_screen || widget?.screen_name || "Cotton HVI Data Entry",
                input_field: String(widget?.input_field || widget?.field_name || "SCI").toLowerCase(),
                visualization_type: widget?.visualization_type || (widget?.chart_type === "value" ? "average_value_card" : "line_chart"),
                chart_type: widget?.chart_type || visualizationTypeToChartType(widget?.visualization_type),
            })),
        [widgets]
    );

    const visibleWidgets = useMemo(
        () => normalizedWidgets.filter((widget) => widget.enabled).sort((a, b) => a.order - b.order),
        [normalizedWidgets]
    );

    const averageWidgets = useMemo(
        () => visibleWidgets.filter((widget) => widget.visualization_type === "average_value_card" || widget.chart_type === "value"),
        [visibleWidgets]
    );

    const performanceWidgets = useMemo(
        () => visibleWidgets.filter((widget) => !(widget.visualization_type === "average_value_card" || widget.chart_type === "value")),
        [visibleWidgets]
    );

    useEffect(() => {
        let isMounted = true;

        const loadWidgets = async () => {
            if (!dashboardOwnerUserId) return;
            try {
                setLoading(true);
                const response = await getWithBuilderFallback(`widgets/${dashboardOwnerUserId}`);
                if (!isMounted) return;
                const nextWidgets = Array.isArray(response?.data?.widgets) ? response.data.widgets : [];
                setWidgets(nextWidgets);
                setErrorMessage("");
            } catch (error) {
                if (!isMounted) return;
                setWidgets([]);
                setErrorMessage(error?.response?.data?.message || "Unable to load dashboard widgets.");
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        loadWidgets();
        return () => {
            isMounted = false;
        };
    }, [dashboardOwnerUserId]);

    useEffect(() => {
        setCardModes((current) =>
            averageWidgets.reduce((next, widget) => {
                next[widget.id] = current[widget.id] || "1M";
                return next;
            }, {})
        );
        setTrendModesById((current) =>
            performanceWidgets.reduce((next, widget) => {
                next[widget.id] = current[widget.id] || "1M";
                return next;
            }, {})
        );
    }, [averageWidgets, performanceWidgets]);

    useEffect(() => {
        let isMounted = true;

        const clearInFlightRequests = () => {
            inFlightControllersRef.current.forEach((controller) => {
                try {
                    controller.abort();
                } catch {
                    // no-op
                }
            });
            inFlightControllersRef.current = [];
        };

        const buildWidgetRequest = (widget) => {
            const period =
                widget.visualization_type === "average_value_card" || widget.chart_type === "value"
                    ? (cardModes[widget.id] || "1M")
                    : (trendModesById[widget.id] || "1M");
            const requestKey = [
                widget.department,
                widget.sub_department,
                widget.input_screen,
                widget.input_field,
                period,
            ].join("::");

            return { widget, period, requestKey };
        };

        const fetchWidgetData = async () => {
            if (!visibleWidgets.length) {
                if (isMounted) setWidgetData({});
                return;
            }

            const widgetRequests = visibleWidgets.map(buildWidgetRequest);
            const cachedByWidgetId = {};
            const pendingRequests = [];

            widgetRequests.forEach(({ widget, requestKey, period }) => {
                const cached = widgetDataCacheRef.current.get(requestKey);
                if (cached) {
                    cachedByWidgetId[widget.id] = cached;
                    return;
                }

                const controller = new AbortController();
                inFlightControllersRef.current.push(controller);
                pendingRequests.push(
                    getWithBuilderFallback(
                        "data",
                        {
                            department: widget.department,
                            sub_department: widget.sub_department,
                            input_screen: widget.input_screen,
                            input_field: widget.input_field,
                            period,
                        },
                        { signal: controller.signal }
                    )
                        .then((response) => ({ widgetId: widget.id, requestKey, data: response?.data || null }))
                        .catch((error) => ({ widgetId: widget.id, requestKey, error }))
                );
            });

            if (Object.keys(cachedByWidgetId).length) {
                setWidgetData((current) => ({ ...current, ...cachedByWidgetId }));
            }

            const results = await Promise.all(pendingRequests);
            if (!isMounted) return;

            setWidgetData((current) => {
                const next = { ...current };
                results.forEach((result) => {
                    if (result?.error) return;
                    next[result.widgetId] = result.data;
                    widgetDataCacheRef.current.set(result.requestKey, result.data);
                });
                return next;
            });
        };

        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
            debounceTimerRef.current = null;
        }

        clearInFlightRequests();
        debounceTimerRef.current = setTimeout(() => {
            fetchWidgetData();
        }, DASHBOARD_FETCH_DEBOUNCE_MS);

        return () => {
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
                debounceTimerRef.current = null;
            }
            clearInFlightRequests();
            isMounted = false;
        };
    }, [visibleWidgets, cardModes, trendModesById]);

    return (
        <div className={styles.dashboardMain}>
            <section className={styles.referenceDashboardHeader}>
                <span>Welcome Back, {fullName}</span>
            </section>

            <section className={styles.referenceSection}>
                <h1>Average Values</h1>
                <div className={styles.referenceStatsGrid}>
                    {averageWidgets.map((widget) => (
                        <article key={widget.id} className={styles.referenceStatCard}>
                            <div className={styles.referenceStatHeader}>
                                <div>
                                    <h2>{String(widget.input_field || "").toUpperCase()}</h2>
                                    <span>{`${widget.department} | ${widget.sub_department} | ${widget.input_screen}`}</span>
                                </div>
                                <span className={styles.referenceStatIcon}>
                                    <FiPieChart />
                                </span>
                            </div>
                            <div className={styles.referenceStatBottom}>
                                <strong>{widgetData?.[widget.id]?.average_value ?? "-"}</strong>
                                <div className={styles.referenceMiniToggle}>
                                    {trendModes.map((mode) => (
                                        <button
                                            key={mode}
                                            type="button"
                                            className={cardModes[widget.id] === mode ? styles.referenceMiniToggleActive : ""}
                                            onClick={() =>
                                                setCardModes((current) => ({
                                                    ...current,
                                                    [widget.id]: mode,
                                                }))
                                            }
                                        >
                                        {mode}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </article>
                    ))}
                </div>
            </section>

            <section className={styles.referenceSection}>
                <h1>Performance Trends</h1>
                {performanceWidgets.map((widget) => (
                    <PerformanceLineCard
                        key={widget.id}
                        widget={widget}
                        data={widgetData?.[widget.id]}
                        activeMode={trendModesById[widget.id] || "1M"}
                        setActiveMode={(nextMode) =>
                            setTrendModesById((current) => ({ ...current, [widget.id]: nextMode }))
                        }
                    />
                ))}
            </section>
            {loading ? <p>Loading dashboard...</p> : null}
            {!loading && !averageWidgets.length && !performanceWidgets.length ? <p>No dashboard widgets configured.</p> : null}
            {errorMessage ? <p>{errorMessage}</p> : null}
        </div>
    );
}

function PerformanceLineCard({ widget, data, activeMode, setActiveMode }) {
    const linePoints = Array.isArray(data?.trend) && data.trend.length
        ? data.trend.map((point, index) => ({
            label: point?.label || `Point ${index + 1}`,
            value: Number(point?.value) || 0,
        }))
        : [{ label: "No Data", value: 0 }];

    const currentLinePoints = useMemo(
        () => linePoints,
        [linePoints]
    );

    const lineChartPoints = useMemo(() => {
        const xPadding = 6;
        const yPadding = 8;
        const width = 100 - xPadding * 2;
        const height = 100 - yPadding * 2;
        const max = Math.max(...currentLinePoints.map((point) => point.value), 100);

        const denominator = Math.max(1, currentLinePoints.length - 1);

        return currentLinePoints.map((point, index) => {
            const x = xPadding + (index / denominator) * width;
            const y = yPadding + height - (point.value / max) * height;

            return {
                ...point,
                x,
                y,
            };
        });
    }, [currentLinePoints]);

    const linePolyline = useMemo(
        () => lineChartPoints.map((point) => `${point.x},${point.y}`).join(" "),
        [lineChartPoints]
    );

    const lineArea = `${lineChartPoints[0]?.x || 0},100 ${linePolyline} ${lineChartPoints[lineChartPoints.length - 1]?.x || 100},100`;

    return (
        <article className={`${styles.referenceChartCard} ${styles.referenceLineCard}`}>
            <div className={styles.referenceChartHeader}>
                <div>
                    <h2>{String(widget?.input_field || "").toUpperCase()}</h2>
                    <span>{`${widget?.department || ""} | ${widget?.sub_department || ""} | ${widget?.input_screen || ""}`}</span>
                </div>
                <div className={styles.referenceLineHeaderRight}>
                    <span className={styles.referenceLegend}>
                        <i /> Trend
                    </span>
                    <ModeToggle activeMode={activeMode} setActiveMode={setActiveMode} />
                </div>
            </div>

            <div className={styles.referenceLineChart}>
                <div className={styles.referenceYAxis}>
                    <span>100%</span>
                    <span>75%</span>
                    <span>50%</span>
                    <span>25%</span>
                    <span>0%</span>
                </div>
                <div className={styles.referenceLinePlot}>
                    <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                        <polygon points={lineArea} />
                        <polyline points={linePolyline} />
                    </svg>
                    {lineChartPoints.map((point) => (
                        <span
                            key={point.label}
                            className={styles.referenceLinePoint}
                            style={{
                                left: `${point.x}%`,
                                top: `${point.y}%`,
                            }}
                        />
                    ))}
                </div>
                <div className={styles.referenceXAxis}>
                    {currentLinePoints.map((point) => (
                        <span key={point.label}>{point.label}</span>
                    ))}
                </div>
            </div>
        </article>
    );
}

function ModeToggle({ activeMode, setActiveMode }) {
    return (
        <div className={styles.referenceModeToggle}>
            {trendModes.map((mode) => (
                <button
                    key={mode}
                    type="button"
                    className={activeMode === mode ? styles.referenceModeToggleActive : ""}
                    onClick={() => setActiveMode(mode)}
                >
                    {mode}
                </button>
            ))}
        </div>
    );
}

export default HomeDashboard;
