import { useMemo } from "react";
import { FiPieChart } from "react-icons/fi";

import styles from "@/styles/departmentDirectory.module.css";

function HomeDashboard() {
    const quickStats = useMemo(
        () =>
            Array.from({ length: 8 }, (_, index) => ({
                id: index + 1,
                label: "Input submitted today",
                value: 8,
            })),
        []
    );

    const performanceBars = [
        { label: "Dept 1", value: 80 },
        { label: "Dept 2", value: 95 },
        { label: "Dept 3", value: 42 },
        { label: "Dept 4", value: 70 },
        { label: "Dept 5", value: 84 },
    ];

    const recentItems = [
        "Threshold Created by EMP002",
        "Threshold Created by EMP002",
        "Threshold Created by EMP002",
        "Threshold Created by EMP002",
        "Threshold Created by EMP002",
    ].map((title, index) => ({
        id: `${title}-${index}`,
        title,
        meta: "Quality Control > Spinning > HVI Data Entry",
        time: "30/04/26, 13:56",
    }));

    return (
        <div className={styles.dashboardMain}>
            <section className={styles.heroPanel}>
                <h1 className={styles.kicker}>Dashboard / Quick insights</h1>
            </section>

            <section className={styles.statsGrid}>
                {quickStats.map((item) => (
                    <article key={item.id} className={styles.statCard}>
                        <span className={styles.statLabel}>{item.label}</span>
                        <strong className={styles.statValue}>{item.value}</strong>
                        <span className={styles.statIconWrap}>
                            <FiPieChart className={styles.statIcon} />
                        </span>
                    </article>
                ))}
            </section>

            <section className={styles.insightGrid}>
                <article className={`${styles.panelCard} ${styles.chartPanel}`}>
                    <div className={styles.panelHeader}>
                        <h2>Performance Report</h2>
                    </div>
                    <div className={styles.chartArea}>
                        <div className={styles.chartYAxis}>
                            {[100, 80, 60, 40, 20].map((tick) => (
                                <span key={tick}>{tick}</span>
                            ))}
                        </div>
                        <div className={styles.chartPlot}>
                            <div className={styles.chartGridLines}>
                                {[100, 80, 60, 40, 20].map((tick) => (
                                    <span key={tick} className={styles.chartGridLine} />
                                ))}
                            </div>
                            <div className={styles.chartBars}>
                                {performanceBars.map((item) => (
                                    <div key={item.label} className={styles.chartBarItem}>
                                        <div className={styles.chartBarTrack}>
                                            <div className={styles.chartBar} style={{ height: `${item.value}%` }} />
                                        </div>
                                        <span className={styles.chartLabel}>{item.label}</span>
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
