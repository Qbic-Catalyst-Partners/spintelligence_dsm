import { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { FiPieChart } from "react-icons/fi";

import { getBuilderData, getMyDashboard, getMyPageData, getUserWidgets } from "@/apis/dashboardApi";
import { fetchUsersAPI } from "@/apis/userApi";
import { isFullAccessUser } from "@/utils/accessControl";
import styles from "@/styles/departmentDirectory.module.css";

const trendModes = ["1D", "1W", "1M", "1Y"];

const modeMultipliers = {
    "1D": 0.72,
    "1W": 0.9,
    "1M": 1,
    "1Y": 1.18,
};

const linePoints = [
    { label: "Day 1", value: 82 },
    { label: "Day 2", value: 64 },
    { label: "Day 3", value: 96 },
    { label: "Day 4", value: 76 },
    { label: "Day 5", value: 44 },
    { label: "Day 6", value: 88 },
    { label: "Day 7", value: 71 },
];

const parseWidgetEnabled = (value) => {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    const normalized = String(value || "").trim().toLowerCase();
    if (!normalized) return true;
    if (["false", "0", "off", "disabled", "no"].includes(normalized)) return false;
    if (["true", "1", "on", "enabled", "yes"].includes(normalized)) return true;
    return true;
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
                enabled: parseWidgetEnabled(widget?.enabled),
                order: Number.isInteger(widget?.order) ? widget.order : index + 1,
                department: widget?.department || "Quality Control",
                sub_department: widget?.sub_department || "Mixing",
                input_screen: widget?.input_screen || widget?.screen_name || "Cotton HVI Data Entry",
                raw_input_field: String(widget?.input_field || widget?.field_name || "SCI"),
                input_field: normalizeInputFieldKey(widget?.input_field || widget?.field_name || "SCI"),
                visualization_type: widget?.visualization_type || (widget?.chart_type === "value" ? "average_value_card" : "line_chart"),
                chart_type: widget?.chart_type || visualizationTypeToChartType(widget?.visualization_type),
            })),
        [widgets]
    );

    const visibleWidgets = useMemo(
        () => normalizedWidgets.filter((widget) => widget.enabled).sort((a, b) => a.order - b.order),
        [normalizedWidgets]
    );
    const [trendLineMode, setTrendLineMode] = useState("1M");
    const [lineMode, setLineMode] = useState("1M");

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
                        .catch(async (error) => {
                            const fallbackInputField = String(widget.raw_input_field || "").trim();
                            if (!fallbackInputField || fallbackInputField === widget.input_field) {
                                throw error;
                            }
                            return getWithBuilderFallback(
                                "data",
                                {
                                    department: widget.department,
                                    sub_department: widget.sub_department,
                                    input_screen: widget.input_screen,
                                    input_field: fallbackInputField,
                                    period,
                                },
                                { signal: controller.signal }
                            );
                        })
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
                    {metricCards.map((card) => (
                        <article key={card.id} className={styles.referenceStatCard}>
                            <div className={styles.referenceStatHeader}>
                                <div>
                                    <h2>{card.title}</h2>
                                    <span>{card.meta}</span>
                                </div>
                                <span className={styles.referenceStatIcon}>
                                    <FiPieChart />
                                </span>
                            </div>
                            <div className={styles.referenceStatBottom}>
                                <strong>{getModeValue(card.baseValue, cardModes[card.id])}</strong>
                                <div className={styles.referenceMiniToggle}>
                                    {trendModes.map((mode) => (
                                        <button
                                            key={mode}
                                            type="button"
                                            className={cardModes[card.id] === mode ? styles.referenceMiniToggleActive : ""}
                                            onClick={() =>
                                                setCardModes((current) => ({
                                                    ...current,
                                                    [card.id]: mode,
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

  return (
    <div className={styles.dashboardMain}>
      <section className={styles.referenceDashboardHeader}>
        <span>Welcome Back, {fullName}</span>
        {canSelectUsers ? (
          <div style={{ marginTop: 10 }}>
            <select
              value={selectedUserId || ""}
              onChange={(e) => setSelectedUserId(Number(e.target.value) || ownUserId)}
            >
              {[{ id: ownUserId, name: "My Dashboard" }, ...users]
                .filter((item, index, arr) => item?.id && arr.findIndex((x) => x.id === item.id) === index)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
            </select>
          </div>
        ) : null}
      </section>

      <section className={styles.referenceSection}>
        <h1>Average Values</h1>
        <div className={styles.referenceStatsGrid}>
          {avgWidgets.map((widget) => (
            <article key={widget.id} className={styles.referenceStatCard}>
              <div className={styles.referenceStatHeader}>
                <div>
                  <h2>{widget?.input_field || "SCI"}</h2>
                  <span>{[widget?.department, widget?.sub_department, widget?.input_screen].filter(Boolean).join(" | ")}</span>
                </div>
                <span className={styles.referenceStatIcon}>
                  <FiPieChart />
                </span>
              </div>
              <div className={styles.referenceStatBottom}>
                <strong>{dataById.get(String(widget.id))?.average_value ?? "-"}</strong>
                <div className={styles.referenceMiniToggle}>
                  {trendModes.map((mode) => (
                    <button
                      key={`${widget.id}-${mode}`}
                      type="button"
                      className={period === mode ? styles.referenceMiniToggleActive : ""}
                      onClick={() => setPeriod(mode)}
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
        {trendWidgets.slice(0, 2).map((widget) => (
          <PerformanceLineCard
            key={widget.id}
            widget={widget}
            trend={dataById.get(String(widget.id))?.trend || []}
            activeMode={period}
            setActiveMode={setPeriod}
          />
        ))}
      </section>
    </div>
  );
}

function PerformanceLineCard({ widget, trend, activeMode, setActiveMode }) {
  const lineChartPoints = useMemo(() => {
    const points = Array.isArray(trend) && trend.length ? trend : [{ label: "No Data", value: 0 }];
    const values = points.map((p) => Number(p?.value) || 0);
    const xPadding = 6;
    const yPadding = 8;
    const width = 100 - xPadding * 2;
    const height = 100 - yPadding * 2;
    const max = Math.max(...values, 1);

    return points.map((point, index) => {
      const x = xPadding + ((points.length > 1 ? index / (points.length - 1) : 0)) * width;
      const y = yPadding + height - ((Number(point?.value) || 0) / max) * height;
      return { label: point?.label || `P${index + 1}`, x, y };
    });
  }, [trend]);

  const linePolyline = useMemo(
    () => lineChartPoints.map((point) => `${point.x},${point.y}`).join(" "),
    [lineChartPoints]
  );
  const lineArea = `${lineChartPoints[0]?.x || 0},100 ${linePolyline} ${lineChartPoints[lineChartPoints.length - 1]?.x || 100},100`;

  return (
    <article className={`${styles.referenceChartCard} ${styles.referenceLineCard}`}>
      <div className={styles.referenceChartHeader}>
        <div>
          <h2>{widget?.input_field || "SCI"}</h2>
          <span>{[widget?.department, widget?.sub_department, widget?.input_screen].filter(Boolean).join(" | ")}</span>
        </div>
        <div className={styles.referenceLineHeaderRight}>
          <span className={styles.referenceLegend}>
            <i /> Trend
          </span>
          <div className={styles.referenceModeToggle}>
            {trendModes.map((mode) => (
              <button
                key={`${widget.id}-mode-${mode}`}
                type="button"
                className={activeMode === mode ? styles.referenceModeToggleActive : ""}
                onClick={() => setActiveMode(mode)}
              >
                {mode}
              </button>
            ))}
          </div>
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
              key={`${widget.id}-${point.label}`}
              className={styles.referenceLinePoint}
              style={{ left: `${point.x}%`, top: `${point.y}%` }}
            />
          ))}
        </div>
        <div className={styles.referenceXAxis}>
          {lineChartPoints.map((point) => (
            <span key={`${widget.id}-x-${point.label}`}>{point.label}</span>
          ))}
        </div>
      </div>
    </article>
  );
}

export default HomeDashboard;
