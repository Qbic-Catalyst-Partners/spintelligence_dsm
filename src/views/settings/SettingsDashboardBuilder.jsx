import { useState } from "react";
import { FiGrid, FiPlus, FiTrash2 } from "react-icons/fi";
import { HiOutlineDotsVertical } from "react-icons/hi";

import styles from "@/styles/departmentDirectory.module.css";

const initialWidgets = Array.from({ length: 8 }, (_, index) => ({
    id: `widget-${index + 1}`,
    name: "Input Submitted Today",
    enabled: true,
}));

function SettingsDashboardBuilder() {
    const [widgets, setWidgets] = useState(initialWidgets);

    const handleToggle = (widgetId) => {
        setWidgets((current) =>
            current.map((widget) =>
                widget.id === widgetId ? { ...widget, enabled: !widget.enabled } : widget
            )
        );
    };

    const handleDelete = (widgetId) => {
        setWidgets((current) => current.filter((widget) => widget.id !== widgetId));
    };

    const handleAddWidget = () => {
        setWidgets((current) => [
            ...current,
            {
                id: `widget-${Date.now()}`,
                name: "Input Submitted Today",
                enabled: true,
            },
        ]);
    };

    return (
        <div className={styles.dashboardMain}>
            <section className={styles.builderHeader}>
                <h1 className={styles.kicker}>Dashboard Builder</h1>
                <button type="button" className={styles.addWidgetButton} onClick={handleAddWidget}>
                    <FiPlus />
                    <span>Add Widget</span>
                </button>
            </section>

            <section className={styles.builderList}>
                {widgets.map((widget) => (
                    <article key={widget.id} className={styles.builderRow}>
                        <div className={styles.builderRowLeft}>
                            <button type="button" className={styles.dragHandle} aria-label="Reorder widget">
                                <HiOutlineDotsVertical />
                            </button>
                            <FiGrid className={styles.builderWidgetIcon} />
                            <span className={styles.builderWidgetName}>{widget.name}</span>
                        </div>

                        <div className={styles.builderRowRight}>
                            <button
                                type="button"
                                className={`${styles.builderToggle} ${widget.enabled ? styles.builderToggleOn : ""}`}
                                aria-pressed={widget.enabled}
                                onClick={() => handleToggle(widget.id)}
                            >
                                <span className={styles.builderToggleThumb} />
                            </button>
                            <button
                                type="button"
                                className={styles.builderDelete}
                                aria-label="Delete widget"
                                onClick={() => handleDelete(widget.id)}
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
