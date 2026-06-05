import { FiCalendar, FiMoreVertical, FiSearch } from "react-icons/fi";
import styles from "@/styles/activityLog.module.css";

const activityRows = [
    {
        subDepartment: "Spinning",
        notebookType: "COTS Checking",
        user: "Hency Belix",
        activity: "Submitted the Notebook",
    },
    {
        subDepartment: "Spinning",
        notebookType: "Count Change",
        user: "Hency Belix",
        activity: "Reopened ticket for John Doe",
    },
    {
        subDepartment: "Spinning",
        notebookType: "Ring Frame Log Book",
        user: "Hency Belix",
        activity: "Approved the Notebook submitted by John Doe",
    },
    {
        subDepartment: "Spinning",
        notebookType: "Speed Checking",
        user: "Hency Belix",
        activity: "Submitted the Notebook",
    },
    {
        subDepartment: "Spinning",
        notebookType: "COTS Checking",
        user: "Hency Belix",
        activity: "Reopened ticket for John Doe",
    },
    {
        subDepartment: "Spinning",
        notebookType: "COTS Checking",
        user: "Hency Belix",
        activity: "Approved the Notebook submitted by John Doe",
    },
];

function ActivityLogs() {
    return (
        <div className={styles.page}>
            <h1 className={styles.title}>Activity Logs</h1>

            <section className={styles.filters} aria-labelledby="activity-log-filters">
                <h2 id="activity-log-filters" className={styles.filterTitle}>
                    Filters
                </h2>

                <div className={styles.filterGrid}>
                    <label className={styles.field}>
                        <span>Actions</span>
                        <span className={`${styles.control} ${styles.searchControl}`}>
                            <FiSearch aria-hidden="true" />
                            <input type="search" placeholder="Search" aria-label="Search activity logs" />
                        </span>
                    </label>

                    <label className={styles.field}>
                        <span>Actions</span>
                        <select defaultValue="submitted-notebooks">
                            <option value="submitted-notebooks">Submitted Notebooks</option>
                            <option value="approved-notebooks">Approved Notebooks</option>
                            <option value="reopened-tickets">Reopened Tickets</option>
                        </select>
                    </label>

                    <label className={styles.field}>
                        <span>User</span>
                        <select defaultValue="all-users">
                            <option value="all-users">All Users</option>
                            <option value="hency-belix">Hency Belix</option>
                        </select>
                    </label>

                    <label className={styles.field}>
                        <span>From Date</span>
                        <span className={`${styles.control} ${styles.dateControl}`}>
                            <input type="text" defaultValue="04-06-2026" aria-label="From date" />
                            <FiCalendar aria-hidden="true" />
                        </span>
                    </label>

                    <label className={styles.field}>
                        <span>To Date</span>
                        <span className={`${styles.control} ${styles.dateControl}`}>
                            <input type="text" defaultValue="07-06-2026" aria-label="To date" />
                            <FiCalendar aria-hidden="true" />
                        </span>
                    </label>
                </div>
            </section>

            <section className={styles.timeline} aria-labelledby="activity-log-timeline">
                <h2 id="activity-log-timeline" className={styles.timelineTitle}>
                    Activity Timeline
                </h2>

                <div className={styles.tableWrap}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Sub Department</th>
                                <th>Notebook Type</th>
                                <th>User</th>
                                <th>Activity</th>
                                <th>Date &amp; Time</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {activityRows.map((row, index) => (
                                <tr key={`${row.notebookType}-${index}`}>
                                    <td>{row.subDepartment}</td>
                                    <td>{row.notebookType}</td>
                                    <td>{row.user}</td>
                                    <td>{row.activity}</td>
                                    <td>28/04/26, 14:32</td>
                                    <td>
                                        <button type="button" className={styles.actionButton} aria-label="More actions">
                                            <FiMoreVertical />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
}

export default ActivityLogs;
