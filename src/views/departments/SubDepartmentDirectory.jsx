import { useRouter } from "next/router";
import { PiChartPieSliceFill } from "react-icons/pi";

import Header from "@/components/Header";
import styles from "@/styles/departmentDirectory.module.css";
import { getDepartmentBySlug } from "./data";

const subDepartmentScreenCounts = {
    mixing: "7 Input Screens",
    "blow-room": "2 Input Screens",
    carding: "6 Input Screens",
    comber: "2 Input Screens",
    "draw-frame": "3 Input Screens",
    simplex: "6 Input Screens",
    spinning: "7 Input Screens",
    autoconer: "2 Input Screens",
};

function SubDepartmentDirectory() {
    const router = useRouter();
    const { department } = router.query;

    const departmentData = router.isReady ? getDepartmentBySlug(department) : null;

    if (router.isReady && !departmentData) {
        return (
            <div className={styles.page}>
                <Header navLinks={[
                    { href: "/dashboard", label: "Home" },
                    { href: "/operatordash", label: "Ticketing System" },
                ]} />
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
            <Header navLinks={[
                { href: "/dashboard", label: "Home" },
                { href: "/operatordash", label: "Ticketing System" },
            ]} />

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
                                    {subDepartmentScreenCounts[subDepartment.slug] || "2 Input Screens"}
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
