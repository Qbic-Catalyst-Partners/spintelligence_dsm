import { useRouter } from "next/router";
import { useSelector } from "react-redux";
import { FaTools } from "react-icons/fa";
import { MdElectricalServices } from "react-icons/md";
import { PiChartPieSliceFill } from "react-icons/pi";

import styles from "@/styles/departmentDirectory.module.css";
import { departmentDirectory } from "./data";
import { hasAnyQualityControlAccess } from "@/utils/accessControl";

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
    const user = useSelector((state) => state.auth?.user);
    const accessByDepartment = useSelector((state) => state.auth?.accessByDepartment);
    const fullName = user?.full_name || user?.name || "User";
    const employeeId = user?.employee_id || user?.employeeId || "";
    const qualityControlEnabled = hasAnyQualityControlAccess(accessByDepartment, user);

    return (
        <div className={styles.page}>
            <main className={styles.shell}>
                <section className={styles.hero}>
                    <h1>Welcome Back, {fullName}</h1>
                    <p>
                        {employeeId ? `Signed in as ${employeeId}. ` : ""}
                        Select the Department you need to access
                    </p>
                </section>

                <h2 className={styles.sectionTitle}>Departments</h2>
                <section className={styles.grid}>
                    {departmentDirectory.map((department) => {
                        const Icon = departmentIcons[department.slug];
                        const countLabel = `${department.subDepartments.length} Departments`;
                        const isEnabled =
                            department.slug === "quality-control"
                                ? qualityControlEnabled
                                : department.enabled;

                        return (
                            <button
                                key={department.slug}
                                type="button"
                                className={`${styles.card} ${isEnabled ? styles.activeCard : styles.disabledCard} ${department.slug === "quality-control" ? styles.noHoverCard : ""}`}
                                onClick={() => isEnabled && router.push(
                                    department.slug === "quality-control"
                                        ? "/departments/quality-control"
                                        : `/departments/${department.slug}`
                                )}
                                disabled={!isEnabled}
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
