import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
    FiBell,
    FiCalendar,
    FiChevronDown,
    FiChevronLeft,
    FiFileText,
    FiGrid,
    FiHeadphones,
    FiHome,
    FiLogOut,
    FiMoon,
    FiSettings,
    FiShield,
    FiSliders,
    FiSun,
    FiUsers,
} from "react-icons/fi";
import { fetchUsersAPI } from "@/apis/userApi";
import { logout, setAuthUser } from "../store/slices/authSlice";
import {
    getDefaultTicketingRoute,
    hasAnyQualityControlAccess,
    hasReportAccess,
    hasSubDepartmentAccess,
    isFullAccessUser,
    isSupervisorNavUser,
    routeDepartmentMap,
} from "@/utils/accessControl";
import styles from "../styles/header.module.css";

const defaultNavLinks = [];

const sidebarLinks = [
    { href: "/", label: "Dashboard", icon: FiHome },
    { href: "/departments", label: "Department", icon: FiGrid },
    { href: "/departments/quality-control", label: "Sub-department", icon: FiGrid, section: "departments" },
    { href: "/usermanagement", label: "User Management", icon: FiUsers, admin: true },
    { href: "/rolespermission", label: "Roles & Permissions", icon: FiShield, admin: true },
    { href: "/operator", label: "Ticketing System", icon: FiHeadphones, section: "tickets" },
    { href: "/ticket-calendar", label: "Insights & Analytics", icon: FiCalendar, section: "calendars" },
    { href: "/reports", label: "Reports", icon: FiFileText, section: "reports" },
    { href: "/threshold-values", label: "Threshold", icon: FiSliders, admin: true, section: "thresholds" },
    { href: "/settings", label: "Settings", icon: FiSettings, admin: true, section: "settings" },
];

const departmentLinks = [
    { href: "/mixing", label: "Mixing", department: "Mixing" },
    { href: "/blowroom", label: "Blow Room", department: "Blow Room" },
    { href: "/carding", label: "Carding", department: "Carding" },
    { href: "/comber", label: "Comber", department: "Comber" },
    { href: "/draw-frame", label: "Draw Frame", department: "Draw Frame" },
    { href: "/simplex", label: "Simplex", department: "Simplex" },
    { href: "/spinning", label: "Spinning", department: "Spinning" },
    { href: "/autoconer", label: "Autoconer", department: "Autoconer" },
];

const settingsLinks = [
    { href: "/settings", label: "Dash Builder" },
];
const ticketingLinks = [
    { href: "/operator", label: "L1 Ticketing System" },
    { href: "/supervisordashboard", label: "L2 Ticketing System" },
];
const analyticsHubLinks = [
    {
        subheading: "Calendar",
        key: "calendar",
        children: [
            { href: "/ticket-calendar", label: "L1 Calendar" },
            { href: "/ticket-calendar-l2", label: "L2 Calendar" },
        ],
    },
    {
        subheading: "Analysis",
        key: "analysis",
        children: [
            { href: "/l1-analysis", label: "L1 Analysis" },
            { href: "/l2-analysis", label: "L2 Analysis" },
        ],
    },
];
const thresholdLinks = [
    { href: "/threshold-values", label: "Values Threshold" },
    { href: "/submission-threshold", label: "Submission Threshold" },
];

const Header = ({ navLinks = defaultNavLinks }) => {
    const router = useRouter();
    const dispatch = useDispatch();
    const profileMenuRef = useRef(null);
    const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [isDepartmentMenuOpen, setIsDepartmentMenuOpen] = useState(false);
    const [isTicketsMenuOpen, setIsTicketsMenuOpen] = useState(false);
    const [isCalendarMenuOpen, setIsCalendarMenuOpen] = useState(false);
    const [isThresholdMenuOpen, setIsThresholdMenuOpen] = useState(false);
    const [isSettingsMenuOpen, setIsSettingsMenuOpen] = useState(false);
    const [openAnalyticsHub, setOpenAnalyticsHub] = useState(false);
    const [openCalendar, setOpenCalendar] = useState(true);
    const [openAnalysis, setOpenAnalysis] = useState(false);
    const { isDarkMode, toggleTheme } = useThemeMode();
    const user = useSelector((state) => state.auth?.user);
    const accessByDepartment = useSelector((state) => state.auth?.accessByDepartment);
    const hasFullAccess = isFullAccessUser(user);
    const hasSupervisorNavAccess = isSupervisorNavUser(user);
    const hasTicketingHubAccess = hasFullAccess || hasSupervisorNavAccess;
    const hasAnalyticsHubAccess = hasFullAccess || hasSupervisorNavAccess;
    const defaultTicketingRoute = getDefaultTicketingRoute(user);
    const fullName = user?.full_name || user?.name || "User";
    const employeeId = user?.employee_id || user?.employeeId || "No ID";
    const initials = fullName
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join("") || employeeId.slice(0, 2).toUpperCase();
    const visibleNavLinks = !user || hasFullAccess
        ? navLinks
        : navLinks.filter((link) =>
            link.href !== "/usermanagement" && link.href !== "/rolespermission"
        );
    const visibleHrefSet = new Set(visibleNavLinks.map((link) => link.href));
    const hasDashboardNav = visibleHrefSet.has("/");
    const hasDepartmentNav = visibleHrefSet.has("/departments");
    const canSeeDepartmentDropdown = hasAnyQualityControlAccess(accessByDepartment, user);
    const visibleSidebarLinks = sidebarLinks
        .map((link) => (
            link.section === "tickets"
                ? { ...link, href: defaultTicketingRoute }
                : link
        ))
        .filter((link) => {
        if (link.admin) {
            return hasFullAccess || Boolean(link.href && visibleHrefSet.has(link.href));
        }

        if (link.section === "departments") {
            return canSeeDepartmentDropdown;
        }

        if (link.section === "tickets") {
            return hasTicketingHubAccess || visibleHrefSet.has("/operator");
        }
        if (link.section === "calendars") {
            return hasAnalyticsHubAccess || visibleHrefSet.has("/ticket-calendar") || visibleHrefSet.has("/ticket-calendar-l2");
        }

        if (link.section === "settings") {
            return hasFullAccess;
        }

        if (link.section === "thresholds") {
            return hasFullAccess;
        }

        if (link.section === "reports") {
            return hasReportAccess(accessByDepartment, user) || visibleHrefSet.has("/reports");
        }

        return hasDashboardNav || hasDepartmentNav || visibleHrefSet.has(link.href) || hasFullAccess;
    });
    const visibleDepartmentLinks = departmentLinks.filter((link) =>
        hasSubDepartmentAccess(accessByDepartment, link.department, user)
    );
    const visibleTicketingLinks = hasSupervisorNavAccess
        ? ticketingLinks.filter((link) => link.href === "/supervisordashboard")
        : ticketingLinks;

    const isActiveLink = (href) => {
        if (!href) {
            return false;
        }

        if (href === "/departments") {
            return currentPath === "/departments";
        }

        if (href === "/departments/quality-control") {
            return (
                currentPath.startsWith("/departments/") ||
                Boolean(routeDepartmentMap[router.pathname])
            );
        }

        if (href === "/operator") {
            return (
                currentPath === "/operator" ||
                currentPath.startsWith("/operator/") ||
                currentPath === "/operatordash" ||
                currentPath.startsWith("/operatordetail")
            );
        }

        if (href === "/supervisordashboard") {
            return currentPath === "/supervisordashboard" || currentPath === "/supervisordetails";
        }

        if (href === "/settings") {
            return currentPath === "/settings" || currentPath.startsWith("/settings/");
        }

        return currentPath === href || currentPath.startsWith(`${href}/`);
    };

    const handleLogout = () => {
        setIsProfileMenuOpen(false);
        dispatch(logout());
        router.replace("/");
    };

    const handleDepartmentsClick = () => {
        setIsDepartmentMenuOpen((isOpen) => !isOpen);
    };

    const handleSettingsClick = () => {
        setIsSettingsMenuOpen((isOpen) => {
            const nextIsOpen = !isOpen;
            if (nextIsOpen && router.asPath?.split("?")[0] !== "/settings") {
                router.push("/settings");
            }
            return nextIsOpen;
        });
    };
    const handleThresholdClick = () => {
        setIsThresholdMenuOpen((isOpen) => {
            const nextIsOpen = !isOpen;
            if (nextIsOpen && router.asPath?.split("?")[0] !== "/threshold-values") {
                router.push("/threshold-values");
            }
            return nextIsOpen;
        });
    };
    const handleTicketsClick = () => {
        setIsTicketsMenuOpen((isOpen) => {
            const nextIsOpen = !isOpen;
            if (nextIsOpen && router.asPath?.split("?")[0] !== defaultTicketingRoute) {
                router.push(defaultTicketingRoute);
            }
            return nextIsOpen;
        });
    };
    const handleCalendarClick = () => {
        setIsCalendarMenuOpen((isOpen) => {
            const nextIsOpen = !isOpen;
            if (nextIsOpen && router.asPath?.split("?")[0] !== "/ticket-calendar") {
                router.push("/ticket-calendar");
            }
            return nextIsOpen;
        });
    };

    useEffect(() => {
        const handlePointerDown = (event) => {
            if (!profileMenuRef.current?.contains(event.target)) {
                setIsProfileMenuOpen(false);
            }
        };

        document.addEventListener("mousedown", handlePointerDown);
        return () => document.removeEventListener("mousedown", handlePointerDown);
    }, []);

    useEffect(() => {
        document.documentElement.style.setProperty(
            "--app-sidebar-width",
            isSidebarCollapsed ? "76px" : "250px"
        );

        return () => document.documentElement.style.removeProperty("--app-sidebar-width");
    }, [isSidebarCollapsed]);

    useEffect(() => {
        const currentPath = router.asPath?.split("?")[0] || router.pathname;
        setIsDepartmentMenuOpen(
            currentPath.startsWith("/departments/quality-control") || Boolean(routeDepartmentMap[router.pathname])
        );
        setIsTicketsMenuOpen(
            currentPath === "/operator" ||
            currentPath.startsWith("/operator/") ||
            currentPath === "/operatordash" ||
            currentPath.startsWith("/operatordetail") ||
            currentPath === "/supervisordashboard" ||
            currentPath === "/supervisordetails"
        );
        setIsCalendarMenuOpen(
            currentPath === "/ticket-calendar" ||
            currentPath === "/ticket-calendar-l2" ||
            currentPath === "/l1-analysis" ||
            currentPath === "/l2-analysis"
        );
        setOpenAnalyticsHub(
            currentPath === "/ticket-calendar" ||
            currentPath === "/ticket-calendar-l2" ||
            currentPath === "/l1-analysis" ||
            currentPath === "/l2-analysis"
        );
        setOpenCalendar(
            currentPath === "/ticket-calendar" ||
            currentPath === "/ticket-calendar-l2"
        );
        setOpenAnalysis(
            currentPath === "/l1-analysis" ||
            currentPath === "/l2-analysis"
        );
        setIsThresholdMenuOpen(
            currentPath === "/threshold-values" ||
            currentPath.startsWith("/threshold-values/") ||
            currentPath === "/submission-threshold" ||
            currentPath.startsWith("/submission-threshold/")
        );
        setIsSettingsMenuOpen(currentPath === "/settings" || currentPath.startsWith("/settings/"));
    }, [router.asPath, router.pathname]);

    return (
        <>
            <aside className={`${styles.sidebar} ${isSidebarCollapsed ? styles["sidebar-collapsed"] : ""}`}>
                <div className={styles["sidebar-logo"]}>
                    <Image
                        src="/logo.png"
                        alt="DSM"
                        width={140}
                        height={100}
                        priority
                        style={{ width: "var(--sidebar-logo-width, 120px)", height: "auto" }}
                    />
                </div>

                <button
                    type="button"
                    className={styles["sidebar-toggle"]}
                    aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                    onClick={() => setIsSidebarCollapsed((isCollapsed) => !isCollapsed)}
                >
                    <FiChevronLeft />
                </button>
                {backTarget ? (
                    <button
                        type="button"
                        className={styles["sidebar-back"]}
                        aria-label="Back"
                        onClick={() => router.push(backTarget)}
                    >
                        <FiChevronLeft />
                        <span>Back</span>
                    </button>
                ) : null}

                <nav className={styles["side-nav"]} aria-label="Primary navigation">
                    {visibleSidebarLinks.map((link) => {
                        const Icon = link.icon;
                        const content = (
                            <>
                                <Icon className={styles["side-nav-icon"]} />
                                <span className={styles["side-nav-label"]}>{link.label}</span>
                            </>
                        );
                        const currentPath = router.asPath?.split("?")[0] || router.pathname;
                        const isThresholdGroup = link.section === "thresholds";
                        const isThresholdGroupActive = isThresholdGroup && (
                            currentPath === "/threshold-values" ||
                            currentPath.startsWith("/threshold-values/") ||
                            currentPath === "/submission-threshold" ||
                            currentPath.startsWith("/submission-threshold/")
                        );
                        const linkClassName = `${styles["side-nav-link"]} ${
                            (isThresholdGroup ? isThresholdGroupActive : isActiveLink(link.href))
                                ? styles["side-nav-active"]
                                : ""
                        }`;

                        if (link.section === "departments") {
                            return (
                                <div key={link.href} className={styles["side-nav-group"]}>
                                    <button
                                        type="button"
                                        className={`${linkClassName} ${styles["side-nav-button"]}`}
                                        aria-expanded={isDepartmentMenuOpen}
                                        title={isSidebarCollapsed ? link.label : undefined}
                                        onClick={handleDepartmentsClick}
                                    >
                                        {content}
                                        <FiChevronDown className={`${styles["department-chevron"]} ${isDepartmentMenuOpen ? styles["department-chevron-open"] : ""}`} />
                                    </button>
                                    <div className={`${styles["side-subnav"]} ${isDepartmentMenuOpen ? styles["side-subnav-open"] : ""}`}>
                                        {visibleDepartmentLinks.map((departmentLink) => (
                                            <Link
                                                key={departmentLink.href}
                                                href={departmentLink.href}
                                                className={`${styles["side-subnav-link"]} ${isActiveLink(departmentLink.href) ? styles["side-subnav-active"] : ""}`}
                                            >
                                                {departmentLink.label}
                                            </Link>
                                        ))}
                                    </div>
                                </div>
                            );
                        }

                        if (link.section === "settings") {
                            return (
                                <div key={link.href} className={styles["side-nav-group"]}>
                                    <button
                                        type="button"
                                        className={`${linkClassName} ${styles["side-nav-button"]}`}
                                        aria-expanded={isSettingsMenuOpen}
                                        title={isSidebarCollapsed ? link.label : undefined}
                                        onClick={handleSettingsClick}
                                    >
                                        {content}
                                        <FiChevronDown className={`${styles["department-chevron"]} ${isSettingsMenuOpen ? styles["department-chevron-open"] : ""}`} />
                                    </button>
                                    <div className={`${styles["side-subnav"]} ${isSettingsMenuOpen ? styles["side-subnav-open"] : ""}`}>
                                        {settingsLinks.map((settingsLink) => (
                                            <Link
                                                key={settingsLink.href}
                                                href={settingsLink.href}
                                                className={`${styles["side-subnav-link"]} ${isActiveLink(settingsLink.href) ? styles["side-subnav-active"] : ""}`}
                                            >
                                                {settingsLink.label}
                                            </Link>
                                        ))}
                                    </div>
                                </div>
                            );
                        }

                        if (link.section === "thresholds") {
                            return (
                                <div key={link.href} className={styles["side-nav-group"]}>
                                    <button
                                        type="button"
                                        className={`${linkClassName} ${styles["side-nav-button"]}`}
                                        aria-expanded={isThresholdMenuOpen}
                                        title={isSidebarCollapsed ? link.label : undefined}
                                        onClick={handleThresholdClick}
                                    >
                                        {content}
                                        <FiChevronDown className={`${styles["department-chevron"]} ${isThresholdMenuOpen ? styles["department-chevron-open"] : ""}`} />
                                    </button>
                                    <div className={`${styles["side-subnav"]} ${isThresholdMenuOpen ? styles["side-subnav-open"] : ""}`}>
                                        {thresholdLinks.map((thresholdLink) => (
                                            <Link
                                                key={thresholdLink.href}
                                                href={thresholdLink.href}
                                                className={`${styles["side-subnav-link"]} ${isActiveLink(thresholdLink.href) ? styles["side-subnav-active"] : ""}`}
                                            >
                                                {thresholdLink.label}
                                            </Link>
                                        ))}
                                    </div>
                                </div>
                            );
                        }

                        if (link.section === "tickets" && hasTicketingHubAccess) {
                            return (
                                <div key={link.href} className={styles["side-nav-group"]}>
                                    <button
                                        type="button"
                                        className={`${linkClassName} ${styles["side-nav-button"]}`}
                                        aria-expanded={isTicketsMenuOpen}
                                        title={isSidebarCollapsed ? link.label : undefined}
                                        onClick={handleTicketsClick}
                                    >
                                        {content}
                                        <FiChevronDown className={`${styles["department-chevron"]} ${isTicketsMenuOpen ? styles["department-chevron-open"] : ""}`} />
                                    </button>
                                    <div className={`${styles["side-subnav"]} ${isTicketsMenuOpen ? styles["side-subnav-open"] : ""}`}>
                                        {visibleTicketingLinks.map((ticketingLink) => (
                                            <Link
                                                key={ticketingLink.href}
                                                href={ticketingLink.href}
                                                className={`${styles["side-subnav-link"]} ${isActiveLink(ticketingLink.href) ? styles["side-subnav-active"] : ""}`}
                                            >
                                                {ticketingLink.label}
                                            </Link>
                                        ))}
                                    </div>
                                </div>
                            );
                        }
                        if (link.section === "calendars" && hasFullAccess) {
                            return (
                                <div key={link.href} className={styles["side-nav-group"]}>
                                    <button
                                        type="button"
                                        className={`${linkClassName} ${styles["side-nav-button"]}`}
                                        aria-expanded={openAnalyticsHub}
                                        title={isSidebarCollapsed ? "Analytics Hub" : undefined}
                                        onClick={() => setOpenAnalyticsHub((v) => !v)}
                                    >
                                        <FiCalendar className={styles["side-nav-icon"]} />
                                        <span className={styles["side-nav-label"]}>Analytics Hub</span>
                                        <FiChevronDown className={`${styles["department-chevron"]} ${openAnalyticsHub ? styles["department-chevron-open"] : ""}`} />
                                    </button>
                                    <div className={`${styles["side-subnav"]} ${openAnalyticsHub ? styles["side-subnav-open"] : ""}`}>
                                        {analyticsHubLinks.map((group) => (
                                            <div key={group.subheading} className={styles["side-subnav-group"]}>
                                                <button
                                                    type="button"
                                                    className={styles["side-subnav-heading"]}
                                                    aria-expanded={group.key === "calendar" ? openCalendar : openAnalysis}
                                                    onClick={() => {
                                                        if (group.key === "calendar") setOpenCalendar((v) => !v);
                                                        if (group.key === "analysis") setOpenAnalysis((v) => !v);
                                                    }}
                                                >
                                                    {group.subheading}
                                                    <FiChevronDown className={`${styles["department-chevron"]} ${(group.key === "calendar" ? openCalendar : openAnalysis) ? styles["department-chevron-open"] : ""}`} style={{marginLeft: 6}} />
                                                </button>
                                                <div style={{ display: (group.key === "calendar" ? openCalendar : openAnalysis) ? 'block' : 'none', marginLeft: 8 }}>
                                                    {group.children.map((item) => (
                                                        <Link
                                                            key={item.href}
                                                            href={item.href}
                                                            className={`${styles["side-subnav-link"]} ${isActiveLink(item.href) ? styles["side-subnav-active"] : ""}`}
                                                        >
                                                            {item.label}
                                                        </Link>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        }

                        return (
                            <Link
                                key={link.href}
                                href={link.href}
                                className={linkClassName}
                                title={isSidebarCollapsed ? link.label : undefined}
                            >
                                {content}
                            </Link>
                        );
                    })}
                </nav>
            </aside>

            <header className={styles["top-actions"]}>
                <div className={styles["nav-left"]}>
                    <span>Welcome Back, {fullName}</span>
                </div>

                <div className={styles["nav-right"]}>
                <button type="button" className={styles["icon-button"]} aria-label="Notifications">
                    <FiBell />
                    <span className={styles["notification-badge"]}>4</span>
                </button>

                <button
                    type="button"
                    className={styles["icon-button"]}
                    aria-label={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
                    title={isDarkMode ? "Light mode" : "Dark mode"}
                    aria-pressed={isDarkMode}
                    onClick={toggleTheme}
                >
                    {isDarkMode ? <FiSun /> : <FiMoon />}
                </button>

                <div className={styles["profile-menu"]} ref={profileMenuRef}>
                    <button
                        type="button"
                        className={styles["profile-summary"]}
                        aria-label="Profile menu"
                        aria-expanded={isProfileMenuOpen}
                        onClick={() => setIsProfileMenuOpen((isOpen) => !isOpen)}
                    >
                        <span className={styles["profile-chip"]}>{initials}</span>
                        <span className={styles["profile-meta"]}>
                            <span className={styles["profile-name"]}>{fullName}</span>
                            <span className={styles["profile-id"]}>{employeeId}</span>
                        </span>
                        <FiChevronDown className={`${styles["profile-chevron"]} ${isProfileMenuOpen ? styles["profile-chevron-open"] : ""}`} />
                    </button>

                    {isProfileMenuOpen && (
                        <div className={styles["profile-dropdown"]}>
                            <button type="button" className={styles["logout-button"]} onClick={handleLogout}>
                                <FiLogOut />
                                <span>Logout</span>
                            </button>
                        </div>
                    )}
                </div>

                </div>
            </header>
        </>
    );
};

export default Header;
