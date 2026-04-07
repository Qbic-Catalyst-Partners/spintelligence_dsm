import { useRouter } from "next/router";
import { PiChartPieSliceFill } from "react-icons/pi";

import styles from "@/styles/departmentDirectory.module.css";
import { getDepartmentBySlug } from "./data";
import { MIXING_INPUT_SCREEN_COUNT } from "@/views/mixing";
import { BLOWROOM_INPUT_SCREEN_COUNT } from "@/views/blowroom";
import { CARDING_INPUT_SCREEN_COUNT } from "@/views/carding";
import { COMBER_INPUT_SCREEN_COUNT } from "@/views/comber";
import { DRAW_FRAME_INPUT_SCREEN_COUNT } from "@/views/draw-frame";
import { SIMPLEX_INPUT_SCREEN_COUNT } from "@/views/simplex";
import { SPINNING_INPUT_SCREEN_COUNT } from "@/views/spinning";
import { AUTOCONER_INPUT_SCREEN_COUNT } from "@/views/autoconer";

const subDepartmentScreenCounts = {
    mixing: MIXING_INPUT_SCREEN_COUNT,
    "blow-room": BLOWROOM_INPUT_SCREEN_COUNT,
    carding: CARDING_INPUT_SCREEN_COUNT,
    comber: COMBER_INPUT_SCREEN_COUNT,
    "draw-frame": DRAW_FRAME_INPUT_SCREEN_COUNT,
    simplex: SIMPLEX_INPUT_SCREEN_COUNT,
    spinning: SPINNING_INPUT_SCREEN_COUNT,
    autoconer: AUTOCONER_INPUT_SCREEN_COUNT,
};

const formatInputScreenLabel = (count) => {
    const safeCount = Number.isFinite(count) ? count : 0;
    return `${safeCount} Input Screen${safeCount === 1 ? "" : "s"}`;
};

function SubDepartmentDirectory() {
    const router = useRouter();
    const department =
        typeof router.query.department === "string"
            ? router.query.department
            : router.pathname === "/departments/quality-control"
                ? "quality-control"
                : undefined;

    const departmentData = router.isReady ? getDepartmentBySlug(department) : null;

    if (router.isReady && !departmentData) {
        return (
            <div className={styles.page}>
                <main className={styles.shell}>
                    <section className={styles.hero}>
                        <p className={styles.breadcrumbs}>Departments</p>
                        <h1>Department Not Found</h1>
                    </section>
                </main>
            </div>
        );
    }

    return (
        <div className={styles.page}>
            <main className={styles.shell}>
                <section className={styles.hero}>
                    <div className={styles.breadcrumbs}>
                        <button type="button" className={styles.breadcrumbLink} onClick={() => router.push("/dashboard")}>
                            Departments
                        </button>
                        <span>&rsaquo;</span>
                        <button
                            type="button"
                            className={styles.breadcrumbCurrent}
                            onClick={() => router.push(`/departments/${departmentData?.slug}`)}
                        >
                            {departmentData?.name}
                        </button>
                    </div>
                    <h1>{departmentData?.name}</h1>
                    <p>{departmentData?.description}</p>
                </section>

                <section className={styles.grid}>
                    {departmentData?.subDepartments.map((subDepartment) => (
                        <button
                            key={subDepartment.slug}
                            type="button"
                            className={`${styles.subCard} ${subDepartment.enabled ? styles.subCardEnabled : styles.disabledCard}`}
                            onClick={() => subDepartment.enabled && router.push(subDepartment.href)}
                            disabled={!subDepartment.enabled}
                        >
                            <span className={styles.cardContent}>
                                <span className={styles.subCardLabel}>{subDepartment.name}</span>
                                <span className={styles.cardMeta}>
                                    {formatInputScreenLabel(subDepartmentScreenCounts[subDepartment.slug])}
                                </span>
                            </span>
                            <span className={styles.subCardArrow}>
                                <PiChartPieSliceFill />
                            </span>
                        </button>
                    ))}
                </section>
            </main>
        </div>
    );
}

export default SubDepartmentDirectory;
