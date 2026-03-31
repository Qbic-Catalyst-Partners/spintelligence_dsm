import { useRouter } from "next/router";

import styles from "@/styles/departmentDirectory.module.css";
import { getDepartmentBySlug, getSubDepartmentBySlug } from "./data";

function IndividualDepartmentPage() {
    const router = useRouter();
    const { department, subDepartment } = router.query;

    const departmentData = router.isReady ? getDepartmentBySlug(department) : null;
    const subDepartmentData = router.isReady
        ? getSubDepartmentBySlug(department, subDepartment)
        : null;

    if (router.isReady && (!departmentData || !subDepartmentData)) {
        return (
            <div className={styles.page}>
                <main className={styles.shell}>
                    <section className={styles.hero}>
                        <p className={styles.breadcrumbs}>Departments</p>
                        <h1>Page Not Found</h1>
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
                            className={styles.breadcrumbLink}
                            onClick={() => router.push(`/departments/${departmentData?.slug}`)}
                        >
                            {departmentData?.name}
                        </button>
                        <span>&rsaquo;</span>
                        <span className={styles.breadcrumbCurrent}>{subDepartmentData?.name}</span>
                    </div>
                    <h1>{subDepartmentData?.name}</h1>
                    <p>This individual page is ready for the next screen or form content.</p>
                </section>

                <section className={styles.detailCard}>
                    <h2>{subDepartmentData?.name}</h2>
                    <p>
                        You can now connect this page to the final content for the
                        <strong> {departmentData?.name}</strong> department.
                    </p>
                    <button
                        type="button"
                        className={styles.primaryButton}
                        onClick={() => router.push(`/departments/${departmentData?.slug}`)}
                    >
                        Back to Sub Departments
                    </button>
                </section>
            </main>
        </div>
    );
}

export default IndividualDepartmentPage;
