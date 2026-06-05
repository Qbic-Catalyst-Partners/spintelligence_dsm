import Image from "next/image";
import { useRouter } from "next/router";
import { useState } from "react";
import { useSelector } from "react-redux";
import {
    FiBarChart2,
    FiBell,
    FiClock,
    FiFileText,
    FiHome,
    FiLayers,
    FiMoon,
    FiSettings,
    FiShield,
    FiSliders,
    FiSun,
    FiUsers,
} from "react-icons/fi";

import { hasReportAccess, isFullAccessUser } from "@/utils/accessControl";
import { useThemeMode } from "@/utils/useThemeMode";
import styles from "@/styles/departmentDirectory.module.css";

const dashboardLinks = [
    { label: "Dashboard", href: "/", icon: FiHome },
    { label: "Departments", href: "/departments", icon: FiLayers },
    { label: "User Management", href: "/usermanagement", icon: FiUsers, adminOnly: true },
    { label: "Roles & Permissions", href: "/rolespermission", icon: FiShield, adminOnly: true },
    { label: "L1 Ticketing System", href: "/operator", icon: FiFileText },
    { label: "Reports", href: "/reports", icon: FiBarChart2, adminOnly: true },
    { label: "Activity Log", href: "/activity-log", icon: FiClock },
    { label: "Threshold", href: "/threshold-values", icon: FiSliders, adminOnly: true },
    { label: "Settings", href: "/settings", icon: FiSettings },
];

function DashboardShell({ children }) {
    const router = useRouter();
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const { isDarkMode, toggleTheme } = useThemeMode();
    const user = useSelector((state) => state.auth?.user);
    const accessByDepartment = useSelector((state) => state.auth?.accessByDepartment);
    const fullName = user?.full_name || user?.name || "User";
    const canAccessManagement = isFullAccessUser(user);
    const initials =
        fullName
            .split(" ")
            .filter(Boolean)
            .slice(0, 2)
            .map((part) => part[0]?.toUpperCase())
            .join("") || "HB";

    const visibleLinks = dashboardLinks.filter((link) => {
        if (link.href === "/reports") {
            return hasReportAccess(accessByDepartment, user);
        }

        return !link.adminOnly || canAccessManagement;
    });

    return (
        <div className={`${styles.dashboardPage} ${isSidebarOpen ? styles.sidebarExpanded : styles.sidebarCollapsed}`}>
            <header className={styles.homeTopbar}>
                <div className={styles.homeBrand}>
                    <Image src="/spintel.svg" alt="DSM" width={110} height={36} />
                </div>

                <div className={styles.homeTopbarContent}>
                    <div className={styles.homeWelcome}>Welcome Back, {fullName}</div>

                    <div className={styles.homeActions}>
                        <button type="button" className={styles.topbarIconButton} aria-label="Notifications">
                            <FiBell />
                            <span className={styles.notificationBadge}>4</span>
                        </button>
                        <button
                            type="button"
                            className={styles.topbarIconButton}
                            aria-label={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
                            title={isDarkMode ? "Light mode" : "Dark mode"}
                            aria-pressed={isDarkMode}
                            onClick={toggleTheme}
                        >
                            {isDarkMode ? <FiSun /> : <FiMoon />}
                        </button>
                        <div className={styles.profileBadge}>{initials}</div>
                    </div>
                </div>
            </header>

            <aside className={styles.sidebar}>
                <button
                    type="button"
                    className={styles.sidebarToggle}
                    aria-label={isSidebarOpen ? "Collapse navigation" : "Expand navigation"}
                    onClick={() => setIsSidebarOpen((current) => !current)}
                >
                    {isSidebarOpen ? "<" : ">"}
                </button>
                <nav className={styles.sidebarNav} aria-label="Home dashboard">
                    {visibleLinks.map((link) => {
                        const Icon = link.icon;
                        const isActive = link.href === "/" ? router.pathname === "/" : router.pathname.startsWith(link.href || "");

                        return (
                            <button
                                key={link.label}
                                type="button"
                                className={`${styles.sidebarLink} ${isActive ? styles.sidebarLinkActive : ""}`}
                                onClick={() => link.href && router.push(link.href)}
                            >
                                <Icon className={styles.sidebarIcon} />
                                {isSidebarOpen && <span>{link.label}</span>}
                            </button>
                        );
                    })}
                </nav>
            </aside>

            <main className={styles.dashboardMain}>{children}</main>
        </div>
    );
}

export default DashboardShell;
