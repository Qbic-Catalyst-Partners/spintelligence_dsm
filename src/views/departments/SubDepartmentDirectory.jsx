import { useRouter } from "next/router";
import { useEffect } from "react";
import { useSelector } from "react-redux";
import { PiChartPieSliceFill } from "react-icons/pi";

import styles from "@/styles/departmentDirectory.module.css";
import { getDepartmentBySlug } from "./data";
import { hasAnyQualityControlAccess, hasSubDepartmentAccess } from "@/utils/accessControl";
import { MIXING_INPUT_SCREEN_COUNT } from "@/views/mixing";
import { BLOWROOM_INPUT_SCREEN_COUNT } from "@/views/blowroom";
import { CARDING_INPUT_SCREEN_COUNT } from "@/views/carding";
import { COMBER_INPUT_SCREEN_COUNT } from "@/views/comber";
import { DRAW_FRAME_INPUT_SCREEN_COUNT } from "@/views/draw-frame";
import { SIMPLEX_INPUT_SCREEN_COUNT } from "@/views/simplex";
import { SPINNING_INPUT_SCREEN_COUNT } from "@/views/spinning";
import { AUTOCONER_INPUT_SCREEN_COUNT } from "@/views/autoconer";
import { getDepartmentScreenCount } from "@/utils/screenAccess";

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

const qualityControlDepartmentNames = {
    mixing: "Mixing",
    "blow-room": "Blow Room",
    carding: "Carding",
    comber: "Comber",
    "draw-frame": "Draw Frame",
    simplex: "Simplex",
    spinning: "Spinning",
    autoconer: "Autoconer",
};

function SubDepartmentDirectory() {
    const router = useRouter();
    const user = useSelector((state) => state.auth?.user);
    const accessByDepartment = useSelector((state) => state.auth?.accessByDepartment);
    const department =
        typeof router.query.department === "string"
            ? router.query.department
            : router.pathname === "/departments/quality-control"
                ? "quality-control"
                : undefined;

    const departmentData = router.isReady ? getDepartmentBySlug(department) : null;
    const hasQualityControlAccess = hasAnyQualityControlAccess(accessByDepartment, user);

    useEffect(() => {
        if (!router.isReady) {
            return;
        }

        if (departmentData?.slug === "quality-control" && !hasQualityControlAccess) {
            router.replace("/departments/quality-control");
        }
    }, [departmentData?.slug, hasQualityControlAccess, router]);

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
                        <button type="button" className={styles.breadcrumbLink} onClick={() => router.push("/")}>
                            Home
                        </button>
                        <span>&rsaquo;</span>
                        <button type="button" className={styles.breadcrumbLink} onClick={() => router.push("/departments")}>
                            Dashboard
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
                    {departmentData?.subDepartments.map((subDepartment) => {
                        const isEnabled =
                            departmentData.slug === "quality-control"
                                ? hasSubDepartmentAccess(accessByDepartment, subDepartment.name, user)
                                : subDepartment.enabled;
                        const screenCount =
                            departmentData.slug === "quality-control"
                                ? getDepartmentScreenCount(
                                      accessByDepartment,
                                      user,
                                      qualityControlDepartmentNames[subDepartment.slug],
                                      subDepartmentScreenCounts[subDepartment.slug]
                                  )
                                : subDepartmentScreenCounts[subDepartment.slug];

                        return (
                            <button
                                key={subDepartment.slug}
                                type="button"
                                className={`${styles.subCard} ${isEnabled ? styles.subCardEnabled : styles.disabledCard}`}
                                onClick={() => isEnabled && router.push(subDepartment.href)}
                                disabled={!isEnabled}
                            >
                                <span className={styles.subCardTop}>
                                    <span className={styles.cardContent}>
                                        <span className={styles.subCardLabel}>{subDepartment.name}</span>
                                        <span className={styles.subCardStats}>
                                            <span>{formatInputScreenLabel(screenCount)}</span>
                                        </span>
                                    </span>
                                    <span className={styles.subCardArrow}>
                                        <PiChartPieSliceFill />
                                    </span>
                                </span>
                            </button>
                        );
                    })}
                </section>
            </main>
        </div>
    );
}

export default SubDepartmentDirectory;
