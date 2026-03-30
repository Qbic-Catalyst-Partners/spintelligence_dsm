import { useRouter } from "next/router";
import { FaTools } from "react-icons/fa";
import { MdElectricalServices } from "react-icons/md";
import { PiChartPieSliceFill } from "react-icons/pi";

import Header from "@/components/Header";
import styles from "@/styles/departmentDirectory.module.css";
import { departmentDirectory } from "./data";

const departmentIcons = {
    "quality-control": PiChartPieSliceFill,
    electrical: MdElectricalServices,
    mechanical: FaTools,
};

const departmentCountLabels = {
    "quality-control": "8 Departments",
    electrical: "0 Departments",
    mechanical: "1 Departments",
};

function DepartmentDirectory() {
    const router = useRouter();

    return (
        <div className={styles.page}>
            <Header navLinks={[
                { href: "/dashboard", label: "Home" },
                { href: "/operatordash", label: "Ticketing System" },
            ]} />

            <main className={styles.shell}>
                <section className={styles.hero}>
                    <h1>Welcome Back, Hency belix</h1>
                    <p>Select the Department you need to access</p>
                </section>

                <h2 className={styles.sectionTitle}>Departments</h2>
                <section className={styles.grid}>
                    {departmentDirectory.map((department) => {
                        const Icon = departmentIcons[department.slug];
                        const countLabel = `${department.subDepartments.length} Departments`;

                        return (
                            <button
                                key={department.slug}
                                type="button"
                                className={`${styles.card} ${department.enabled ? styles.activeCard : styles.disabledCard}`}
                                onClick={() => department.enabled && router.push(`/departments/${department.slug}`)}
                                disabled={!department.enabled}
                            >
                                <span className={styles.cardContent}>
                                    <span className={styles.cardLabel}>{department.name}</span>
                                    <span className={styles.cardMeta}>
                                        {departmentCountLabels[department.slug] || countLabel}
                                    </span>
                                </span>
                                <span className={`${styles.iconWrap} ${styles[department.slug]}`}>
                                    <Icon className={styles.icon} />
                                </span>
                            </button>
                        );
                    })}
                </section>
            </main>
        </div>
    );
}

export default DepartmentDirectory;
