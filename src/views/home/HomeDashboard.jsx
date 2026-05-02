import { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { FiPieChart } from "react-icons/fi";

import apiConfig from "@/apis/apiConfig";
import { getOperatorTickets } from "@/apis/operatorApi";
import { getDashboardOwnerUserId } from "@/utils/dashboardOwner";
import styles from "@/styles/departmentDirectory.module.css";

const TICKET_TREND_ID_PREFIX = "ticket-trend-";

const buildTicketTrendSeries = (tickets) => {
    const now = new Date();
    const dayKeys = Array.from({ length: 7 }, (_, index) => {
        const date = new Date(now);
        date.setDate(now.getDate() - (6 - index));
        return date.toISOString().slice(0, 10);
    });

    const countsByDay = dayKeys.reduce((acc, key) => ({ ...acc, [key]: 0 }), {});

    (Array.isArray(tickets) ? tickets : []).forEach((ticket) => {
        const createdAt = ticket?.created_at || ticket?.createdAt || ticket?.rawCreatedAt;
        if (!createdAt) return;
        const date = new Date(createdAt);
        if (Number.isNaN(date.getTime())) return;
        const dayKey = date.toISOString().slice(0, 10);
        if (dayKey in countsByDay) {
            countsByDay[dayKey] += 1;
        }
    });

    return dayKeys.map((key) => {
        const dayDate = new Date(`${key}T00:00:00`);
        return {
            day: dayDate.toLocaleDateString("en-US", { weekday: "short" }),
            value: countsByDay[key] || 0,
        };
    });
};

function HomeDashboard() {
    const authUser = useSelector((state) => state.auth?.user);
    const dashboardOwnerUserId = useMemo(
        () => getDashboardOwnerUserId(authUser),
        [authUser]
    );
    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState("");
    const [dashboardData, setDashboardData] = useState({
        quick_stats: [],
        performance_bars: [],
        recent_activity: [],
    });
    const [ticketTrendSeries, setTicketTrendSeries] = useState([]);

    useEffect(() => {
        let isMounted = true;

        const loadDashboardData = async () => {
            try {
                setLoading(true);
                const [primaryResponse, ticketsResponse] = await Promise.all([
                    dashboardOwnerUserId
                        ? apiConfig.get(`/api/dashboard/dashboard-data/${dashboardOwnerUserId}`)
                        : apiConfig.get("/api/dashboard/overview"),
                    getOperatorTickets().catch(() => []),
                ]);

                const primary = primaryResponse?.data || {};
                const hasDashboardData = Array.isArray(primary?.quick_stats) || Array.isArray(primary?.performance_bars);

                if (!hasDashboardData) {
                    throw new Error("Invalid dashboard payload");
                }

                if (isMounted) {
                    setDashboardData({
                        quick_stats: primary.quick_stats || [],
                        performance_bars: primary.performance_bars || [],
                        recent_activity: primary.recent_activity || [],
                    });
                    setTicketTrendSeries(buildTicketTrendSeries(Array.isArray(ticketsResponse) ? ticketsResponse : ticketsResponse?.data || ticketsResponse?.tickets || []));
                    setErrorMessage("");
                }
            } catch (error) {
                if (!isMounted) return;
                setErrorMessage(error?.response?.data?.message || "Unable to load dashboard.");
                setDashboardData({
                    quick_stats: [],
                    performance_bars: [],
                    recent_activity: [],
                });
                setTicketTrendSeries([]);
            } finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        };

        loadDashboardData();

        return () => {
            isMounted = false;
        };
    }, [dashboardOwnerUserId]);

    const quickStats = useMemo(
        () =>
            (dashboardData.quick_stats || []).map((item, index) => ({
                id: item?.id || `quick-stat-${index + 1}`,
                label: item?.name || item?.label || "Metric",
                value: Number(item?.value || 0),
                metricKey: item?.metric_key || "",
                isTrendWidget: String(item?.id || "").startsWith(TICKET_TREND_ID_PREFIX) && item?.metric_key === "tickets",
            })),
        [dashboardData.quick_stats]
    );

    const performanceBars = useMemo(
        () =>
            (dashboardData.performance_bars || []).map((item, index) => ({
                id: `${item?.label || "bar"}-${index}`,
                label: String(item?.label || "N/A"),
                value: Number(item?.value || 0),
            })),
        [dashboardData.performance_bars]
    );

    const recentItems = useMemo(
        () =>
            (dashboardData.recent_activity || []).map((item, index) => ({
                id: item?.id || `activity-${index + 1}`,
                title: item?.title || "Recent activity",
                meta: item?.meta || "-",
                time: item?.time ? new Date(item.time).toLocaleString() : "-",
            })),
        [dashboardData.recent_activity]
    );

    const yAxisTicks = useMemo(() => {
        const maxValue = Math.max(...performanceBars.map((item) => item.value), 0);
        const roundedMax = maxValue <= 5 ? 5 : Math.ceil(maxValue / 5) * 5;
        const step = Math.max(1, Math.ceil(roundedMax / 5));
        return [roundedMax, roundedMax - step, roundedMax - step * 2, roundedMax - step * 3, roundedMax - step * 4].map((tick) =>
            Math.max(0, tick)
        );
    }, [performanceBars]);

    const yAxisMax = yAxisTicks[0] || 1;

    return (
        <div className={styles.dashboardMain}>
            <section className={styles.heroPanel}>
                <h1 className={styles.kicker}>Dashboard / Quick insights</h1>
            </section>

            {loading ? <p>Loading dashboard...</p> : null}
            {!loading && errorMessage ? <p>{errorMessage}</p> : null}

            <section className={styles.statsGrid}>
                {quickStats.map((item) => (
                    item.isTrendWidget ? (
                        <article key={item.id} className={`${styles.statCard} ${styles.statTrendCard}`}>
                            <span className={styles.statLabel}>{item.label}</span>
                            <strong className={styles.statValue}>{item.value}</strong>
                            <div className={styles.trendMiniChart}>
                                {ticketTrendSeries.map((point) => {
                                    const max = Math.max(...ticketTrendSeries.map((entry) => entry.value), 1);
                                    const heightPercent = Math.max(8, Math.round((point.value / max) * 100));
                                    return (
                                        <div key={`${item.id}-${point.day}`} className={styles.trendMiniBarItem} title={`${point.day}: ${point.value}`}>
                                            <span className={styles.trendMiniBar} style={{ height: `${heightPercent}%` }} />
                                            <small>{point.day}</small>
                                        </div>
                                    );
                                })}
                            </div>
                        </article>
                    ) : (
                        <article key={item.id} className={styles.statCard}>
                            <span className={styles.statLabel}>{item.label}</span>
                            <strong className={styles.statValue}>{item.value}</strong>
                            <span className={styles.statIconWrap}>
                                <FiPieChart className={styles.statIcon} />
                            </span>
                        </article>
                    )
                ))}
            </section>

            <section className={styles.insightGrid}>
                <article className={`${styles.panelCard} ${styles.chartPanel}`}>
                    <div className={styles.panelHeader}>
                        <h2>Performance Report</h2>
                    </div>
                    <div className={styles.chartArea}>
                        <div className={styles.chartYAxis}>
                            {yAxisTicks.map((tick) => (
                                <span key={tick}>{tick}</span>
                            ))}
                        </div>
                        <div className={styles.chartPlot}>
                            <div className={styles.chartGridLines}>
                                {yAxisTicks.map((tick) => (
                                    <span key={tick} className={styles.chartGridLine} />
                                ))}
                            </div>
                            <div className={styles.chartBars}>
                                {performanceBars.map((item) => (
                                    <div key={item.id} className={styles.chartBarItem}>
                                        <div className={styles.chartBarTrack}>
                                            <div className={styles.chartBar} style={{ height: `${Math.max(0, (item.value / yAxisMax) * 100)}%` }} />
                                        </div>
                                        <span className={styles.chartLabel} title={item.label}>{item.label}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </article>

                <article className={`${styles.panelCard} ${styles.activityPanel}`}>
                    <div className={styles.panelHeader}>
                        <h2>Recent Activity</h2>
                    </div>
                    <div className={styles.activityList}>
                        {recentItems.map((item) => (
                            <div key={item.id} className={styles.activityItem}>
                                <div className={styles.activityRow}>
                                    <strong>{item.title}</strong>
                                    <time>{item.time}</time>
                                </div>
                                <span>{item.meta}</span>
                            </div>
                        ))}
                    </div>
                </article>
            </section>
        </div>
    );
}

export default HomeDashboard;
