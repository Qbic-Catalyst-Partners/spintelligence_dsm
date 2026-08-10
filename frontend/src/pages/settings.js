import SettingsDashboardBuilder from "@/views/settings/SettingsDashboardBuilder";
import styles from "@/styles/SubmissionThreshold.module.css";

export default function SettingsPage() {
    const introText = "Manage dashboard widgets";

    return (
        <div className={styles.page}>
            <div className={styles.shell}>
                <div className={styles.intro}>
                    <h1>Settings</h1>
                    <p suppressHydrationWarning>{introText}</p>
                </div>

                <SettingsDashboardBuilder />
            </div>
        </div>
    );
}
