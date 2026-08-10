import TicketResolutionSlaSettings from "@/views/settings/TicketResolutionSlaSettings";
import styles from "@/styles/SubmissionThreshold.module.css";

export default function TicketResolutionSlaPage() {
    return (
        <div className={styles.page}>
            <div className={styles.shell}>
                <div className={styles.intro}>
                    <h1>Ticket Resolution SLA</h1>
                    <p>Set the ticket submission target by level</p>
                </div>

                <TicketResolutionSlaSettings />
            </div>
        </div>
    );
}
