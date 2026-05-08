import { useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { FiPieChart } from "react-icons/fi";

import styles from "@/styles/departmentDirectory.module.css";

const metricCards = Array.from({ length: 8 }, (_, index) => ({
    id: `sci-average-${index + 1}`,
    title: "SCI",
    meta: "QC | Mix | Cotton HVI",
    baseValue: 8,
}));

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

function HomeDashboard() {
    const user = useSelector((state) => state.auth?.user);
    const fullName = user?.full_name || user?.fullName || user?.name || "Hency Belix";
    const [cardModes, setCardModes] = useState(() =>
        metricCards.reduce((modes, card) => ({ ...modes, [card.id]: "1M" }), {})
    );
    const [trendLineMode, setTrendLineMode] = useState("1M");
    const [lineMode, setLineMode] = useState("1M");

    const getModeValue = (value, mode) =>
        Math.max(1, Math.round(value * (modeMultipliers[mode] || 1)));

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

                <PerformanceLineCard activeMode={trendLineMode} setActiveMode={setTrendLineMode} />
                <PerformanceLineCard activeMode={lineMode} setActiveMode={setLineMode} />
            </section>
        </div>
    );
}

function PerformanceLineCard({ activeMode, setActiveMode }) {
    const currentLinePoints = useMemo(
        () => linePoints.map((point) => ({
            ...point,
            value: Math.min(100, Math.max(1, Math.round(point.value * (modeMultipliers[activeMode] || 1)))),
        })),
        [activeMode]
    );

    const lineChartPoints = useMemo(() => {
        const xPadding = 6;
        const yPadding = 8;
        const width = 100 - xPadding * 2;
        const height = 100 - yPadding * 2;
        const max = Math.max(...currentLinePoints.map((point) => point.value), 100);

        return currentLinePoints.map((point, index) => {
            const x = xPadding + (index / (currentLinePoints.length - 1)) * width;
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
                    <h2>SCI</h2>
                    <span>QC | Mix | Cotton HVI</span>
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
