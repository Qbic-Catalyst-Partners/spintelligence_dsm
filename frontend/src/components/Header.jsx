import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
    FiBell,
    FiBriefcase,
    FiCalendar,
    FiChevronDown,
    FiChevronLeft,
    FiClipboard,
    FiClock,
    FiFileText,
    FiGrid,
    FiHeadphones,
    FiHelpCircle,
    FiHome,
    FiLogOut,
    FiMoon,
    FiSettings,
    FiSliders,
    FiSun,
    FiTrash2,
} from "react-icons/fi";
import { fetchUsersAPI } from "@/apis/userApi";
import { logout, setAuthUser } from "../store/slices/authSlice";
import {
    getDefaultTicketingRoute,
    hasAnyQualityControlAccess,
    hasHierarchyLevel,
    hasReportAccess,
    hasSubDepartmentAccess,
    isDelegationManagerUser,
    isFullAccessUser,
    isSubmittedNotebookManagerUser,
    isSubmittedNotebookViewerUser,
    isSupervisorNavUser,
    isUserManagementManagerUser,
    isWheelChangeApproverUser,
    routeDepartmentMap,
} from "@/utils/accessControl";
import { useThemeMode } from "@/utils/useThemeMode";
import {
    fetchAnalysisSubscriptionsApi,
    saveAnalysisSubscriptionApi,
} from "@/apis/analysisApi";
import {
    clearAllNotificationsApi,
    fetchNotificationsApi,
    markNotificationReadApi,
} from "@/apis/notificationsApi";
import styles from "../styles/header.module.css";

const defaultNavLinks = [];

// Notification link_url values are written by the backend as
// /operator-tickets/<id> or /supervisor-tickets/<id>, but no such Next.js
// pages exist - clicking them 404s. Map those to the real ticket detail
// pages (/operatordetail for L1, /supervisordetails for L2+), matching the
// ?ticketId= shape handleTicketClick uses elsewhere. Any other link_url
// (already a valid app route) is passed through untouched.
const resolveNotificationTarget = (linkUrl, user) => {
    const raw = String(linkUrl || "").trim();
    if (!raw) return "/activity-log";

    const match = raw.match(/^\/(?:operator|supervisor)-tickets\/(.+)$/);
    if (!match) return raw;

    const ticketId = decodeURIComponent(match[1]);
    const normalizedId = ticketId.startsWith("#") ? ticketId : `#${ticketId}`;
    const level = String(user?.level ?? user?.user_details?.level ?? "").trim().toUpperCase();
    const detailRoute = level === "L1" ? "/operatordetail" : "/supervisordetails";
    return `${detailRoute}?ticketId=${encodeURIComponent(normalizedId)}&ticketType=Value`;
};

const sidebarLinks = [
    { href: "/", label: "Dashboard", icon: FiHome },
    { href: "/departments", label: "Department", icon: FiGrid },
    { href: "/departments/quality-control", label: "Sub-department", icon: FiGrid, section: "departments" },
    { href: "/process-parameter", label: "Process Parameter", icon: FiClipboard },
    { href: "/statistics-analysis", label: "Analytics Hub", icon: FiCalendar, section: "calendars" },
    { href: "/operator", label: "Ticketing System", icon: FiHeadphones, section: "tickets" },
    { href: "/submitted-notebooks", label: "Management Hub", icon: FiBriefcase, section: "management" },
    { href: "/reports/custom", label: "Reports", icon: FiFileText },
    { href: "/threshold-values", label: "Threshold", icon: FiSliders, admin: true },
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
    { href: "/departments/quality-control/wrapping", label: "Wrapping", department: "Wrapping" },
    { href: "/departments/quality-control/individual-card-performance", label: "Individual Card Performance", department: "Individual Card Performance" },
];

const settingsLinks = [
    { href: "/settings", label: "Dash Builder" },
    { href: "/ticket-resolution-sla", label: "Ticket Resolution SLA" },
    { href: "/usermanagement", label: "User Management" },
    { href: "/rolespermission", label: "Roles & Permissions" },
];
const ticketingLinks = [
    { href: "__ticketingHome__", label: "Ticket System" },
    { href: "/delegation-system", label: "Delegation System", requiresLevel5: true },
    { href: "/ticket-calendar", label: "L1 Calendar" },
    { href: "/ticket-calendar-l2", label: "L2 Calendar" },
];
const managementHubLinks = [
    { href: "/submitted-notebooks", label: "Submitted Notebooks", submittedNotebookView: true },
    { href: "/new-field-creation", label: "New Field Creation" },
    { href: "/activity-log", label: "Activity Log" },
    {
        label: "WC Approvals",
        wheelChangeApproval: true,
        children: [
            { href: "/wheel-change-approvals", label: "Spinning" },
            { href: "/drawframe-wheel-change-approvals", label: "Drawframe" },
            { href: "/carding-change-control-approvals", label: "Carding" },
            { href: "/simplex-wheel-change-approvals", label: "Simplex" },
        ],
    },
    { href: "/pp-approvals", label: "PP Approvals", wheelChangeApproval: true },
];
const analyticsHubLinks = [
    { href: "/statistics-analysis", label: "Statistics Analytics" },
    {
        label: "Team Performance",
        children: [
            { href: "/l1-analysis", label: "L1 Team Performance" },
            { href: "/l2-analysis", label: "L2 Team Performance" },
        ],
    },
];

const Header = ({ navLinks = defaultNavLinks }) => {
    const router = useRouter();
    const dispatch = useDispatch();
    const profileMenuRef = useRef(null);
    const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [isDepartmentMenuOpen, setIsDepartmentMenuOpen] = useState(false);
    const [isTicketsMenuOpen, setIsTicketsMenuOpen] = useState(false);
    const [isSettingsMenuOpen, setIsSettingsMenuOpen] = useState(false);
    const [isManagementHubOpen, setIsManagementHubOpen] = useState(false);
    const [isAnalyticsHubOpen, setIsAnalyticsHubOpen] = useState(false);
    const [isTeamPerformanceOpen, setIsTeamPerformanceOpen] = useState(false);
    const [isWheelChangeApprovalsOpen, setIsWheelChangeApprovalsOpen] = useState(false);
    const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
    const [notifications, setNotifications] = useState([]);
    const [notificationUnreadCount, setNotificationUnreadCount] = useState(0);
    const [analysisSubscribed, setAnalysisSubscribed] = useState(true);
    const [notificationsLoading, setNotificationsLoading] = useState(false);
    const notificationMenuRef = useRef(null);
    const { isDarkMode, toggleTheme } = useThemeMode();
    const user = useSelector((state) => state.auth?.user);
    const accessByDepartment = useSelector((state) => state.auth?.accessByDepartment);
    const hasFullAccess = isFullAccessUser(user);
    const hasUserManagementAccess = isUserManagementManagerUser(user);
    const hasSupervisorNavAccess = isSupervisorNavUser(user);
    const hasSubmittedNotebookAccess = isSubmittedNotebookManagerUser(user);
    // Broader than hasSubmittedNotebookAccess above: the Submitted Notebooks
    // link itself is open to every L1-L5 hierarchy account (each sees a
    // different server-scoped subset of rows), while the other Management
    // Hub entries (New Field Creation, Activity Log, threshold config) stay
    // limited to admin/supervisor.
    const hasSubmittedNotebookViewAccess = isSubmittedNotebookViewerUser(user);
    const hasWheelChangeApprovalAccess = isWheelChangeApproverUser(user);
    const hasManagementHubAccess = hasSubmittedNotebookAccess || hasSubmittedNotebookViewAccess || hasWheelChangeApprovalAccess;
    // Every L1-L5 hierarchy account has some ticketing view (L1 operator
    // board, L2-L5 escalation dashboards) - this used to only check
    // isFullAccessUser/isSupervisorNavUser (from before hierarchy levels
    // existed), which hid the "Ticketing System" nav entry entirely for
    // plain L1-L4 accounts once routing started resolving by real level
    // instead of always falling back to "/operator".
    const hasTicketingHubAccess = hasFullAccess || hasSupervisorNavAccess || hasHierarchyLevel(user);
    const hasAnalyticsHubAccess = hasFullAccess || hasSupervisorNavAccess || hasHierarchyLevel(user);
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
            (link.href !== "/usermanagement" || hasUserManagementAccess) &&
            link.href !== "/rolespermission"
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
        if (link.section === "management") {
            return hasManagementHubAccess;
        }
        if (link.section === "teamPerformance") {
            return hasAnalyticsHubAccess || visibleHrefSet.has("/l1-analysis") || visibleHrefSet.has("/l2-analysis");
        }

        if (link.section === "settings") {
            return hasFullAccess;
        }

        if (link.section === "thresholds") {
            return hasFullAccess;
        }

        if (link.href === "/reports/custom") {
            return hasReportAccess(accessByDepartment, user) || visibleHrefSet.has("/reports");
        }

        return hasDashboardNav || hasDepartmentNav || visibleHrefSet.has(link.href) || hasFullAccess;
    });
    const visibleDepartmentLinks = departmentLinks.filter((link) =>
        hasSubDepartmentAccess(accessByDepartment, link.department, user)
    );
    const visibleTicketingLinks = ticketingLinks
        .filter((link) =>
            link.requiresLevel5 ? isDelegationManagerUser(user) : (!link.admin || hasFullAccess)
        )
        .map((link) =>
            link.href === "__ticketingHome__" ? { ...link, href: defaultTicketingRoute } : link
        );
    const visibleManagementHubLinks = hasFullAccess
        ? managementHubLinks
        : managementHubLinks.filter((link) => {
            if (link.wheelChangeApproval) return hasWheelChangeApprovalAccess;
            if (link.submittedNotebookView) return hasSubmittedNotebookViewAccess;
            return hasSubmittedNotebookAccess;
        });
    const currentPath = router.asPath?.split("?")[0] || router.pathname;
    const backTarget = null;

    const loadNotifications = useCallback(async ({ showLoading = false } = {}) => {
        if (!user?.id) return;
        if (showLoading) setNotificationsLoading(true);

        try {
            const notificationsRes = await fetchNotificationsApi({ page: 1, limit: 20 });
            const rows = Array.isArray(notificationsRes?.notifications) ? notificationsRes.notifications : [];
            setNotifications(rows);
            setNotificationUnreadCount(Number(notificationsRes?.unread_count) || rows.filter((item) => item?.is_unread).length);
        } catch {
            setNotifications([]);
            setNotificationUnreadCount(0);
        } finally {
            if (showLoading) setNotificationsLoading(false);
        }
    }, [user?.id]);

    const isActiveLink = (href) => {
        if (!href) {
            return false;
        }

        const [hrefPath, hrefQuery = ""] = href.split("?");
        if (hrefQuery) {
            const currentQuery = router.asPath?.split("?")[1] || "";
            return currentPath === hrefPath && decodeURIComponent(currentQuery) === decodeURIComponent(hrefQuery);
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

        if (href === "/l3-ticketing") {
            return currentPath === "/l3-ticketing";
        }

        if (href === "/l4-ticketing") {
            return currentPath === "/l4-ticketing";
        }

        if (href === "/l5-ticketing") {
            return currentPath === "/l5-ticketing";
        }

        if (href === "/ticket-calendar") {
            return currentPath === "/ticket-calendar";
        }

        if (href === "/ticket-calendar-l2") {
            return currentPath === "/ticket-calendar-l2";
        }

        if (href === "/submitted-notebooks") {
            return currentPath === "/submitted-notebooks";
        }

        if (href === "/new-field-creation") {
            return currentPath === "/new-field-creation";
        }

        if (href === "/submitted-notebook-threshold") {
            return currentPath === "/submitted-notebook-threshold";
        }

        if (href === "/activity-log") {
            return currentPath === "/activity-log";
        }

        if (href === "/wheel-change-approvals") {
            return currentPath === "/wheel-change-approvals";
        }

        if (href === "/settings") {
            return currentPath === "/settings" || currentPath.startsWith("/settings/");
        }

        if (href === "/ticket-resolution-sla") {
            return currentPath === "/ticket-resolution-sla";
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
    const handleTicketsClick = () => {
        setIsTicketsMenuOpen((isOpen) => {
            const nextIsOpen = !isOpen;
            if (nextIsOpen && router.asPath?.split("?")[0] !== defaultTicketingRoute) {
                router.push(defaultTicketingRoute);
            }
            return nextIsOpen;
        });
    };
    const handleManagementHubClick = () => {
        setIsManagementHubOpen((isOpen) => {
            const nextIsOpen = !isOpen;
            const defaultManagementRoute = hasSubmittedNotebookAccess || hasSubmittedNotebookViewAccess
                ? "/submitted-notebooks"
                : "/wheel-change-approvals";
            if (nextIsOpen && router.asPath?.split("?")[0] !== defaultManagementRoute) {
                router.push(defaultManagementRoute);
            }
            return nextIsOpen;
        });
    };
    useEffect(() => {
        const handlePointerDown = (event) => {
            if (!profileMenuRef.current?.contains(event.target)) {
                setIsProfileMenuOpen(false);
            }
            if (!notificationMenuRef.current?.contains(event.target)) {
                setIsNotificationsOpen(false);
            }
        };

        document.addEventListener("mousedown", handlePointerDown);
        return () => document.removeEventListener("mousedown", handlePointerDown);
    }, []);

    useEffect(() => {
        if (!user?.id) return;
        let mounted = true;
        setNotificationsLoading(true);

        Promise.all([fetchNotificationsApi({ page: 1, limit: 20 }), fetchAnalysisSubscriptionsApi()])
            .then(([notificationsRes, subscriptionsRes]) => {
                if (!mounted) return;
                const rows = Array.isArray(notificationsRes?.notifications) ? notificationsRes.notifications : [];
                const subscriptions = Array.isArray(subscriptionsRes?.subscriptions) ? subscriptionsRes.subscriptions : [];
                const activeSubscription = subscriptions.find(
                    (item) => String(item?.channel || "").toLowerCase() === "app_push" && item?.is_active !== false
                );
                setNotifications(rows);
                setNotificationUnreadCount(Number(notificationsRes?.unread_count) || rows.filter((item) => item?.is_unread).length);
                setAnalysisSubscribed(Boolean(activeSubscription));
            })
            .catch(() => {
                if (!mounted) return;
                setNotifications([]);
                setNotificationUnreadCount(0);
            })
            .finally(() => {
                if (mounted) setNotificationsLoading(false);
            });

        return () => {
            mounted = false;
        };
    }, [user?.id]);

    useEffect(() => {
        if (!user?.id) return undefined;
        const intervalId = window.setInterval(() => {
            loadNotifications();
        }, 30000);

        return () => window.clearInterval(intervalId);
    }, [loadNotifications, user?.id]);

    useEffect(() => {
        if (isNotificationsOpen) {
            loadNotifications({ showLoading: true });
        }
    }, [isNotificationsOpen, loadNotifications]);

    useEffect(() => {
        if (!user?.id) return undefined;

        const handleAdminNotificationCreated = () => {
            loadNotifications();
        };

        window.addEventListener("admin-notification-created", handleAdminNotificationCreated);
        return () => window.removeEventListener("admin-notification-created", handleAdminNotificationCreated);
    }, [loadNotifications, user?.id]);

    const unreadCount = notificationUnreadCount;

    const handleMarkNotificationRead = async (notification) => {
        if (!notification?.id || !notification?.source) return;
        const targetUrl = resolveNotificationTarget(notification?.link_url, user);
        try {
            await markNotificationReadApi({ source: notification.source, id: notification.id });
            setNotifications((current) =>
                current.map((item) => (
                    item.id === notification.id && item.source === notification.source
                        ? { ...item, is_unread: false, status: "READ", read_at: item.read_at || new Date().toISOString() }
                        : item
                ))
            );
            setNotificationUnreadCount((current) => Math.max(0, current - (notification?.is_unread ? 1 : 0)));
            setIsNotificationsOpen(false);
            router.push(targetUrl);
        } catch {
            // no-op for non-blocking UX
        }
    };

    const handleClearAllNotifications = async () => {
        try {
            await clearAllNotificationsApi();
            setNotifications([]);
            setNotificationUnreadCount(0);
        } catch {
            // no-op for non-blocking UX
        }
    };

    const handleToggleAnalysisSubscription = async () => {
        const nextValue = !analysisSubscribed;
        try {
            await saveAnalysisSubscriptionApi({
                channel: "app_push",
                target_level: "ALL",
                is_active: nextValue,
            });
            setAnalysisSubscribed(nextValue);
        } catch {
            // no-op for non-blocking UX
        }
    };

    useEffect(() => {
        document.documentElement.style.setProperty(
            "--app-sidebar-width",
            isSidebarCollapsed ? "76px" : "275px"
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
            currentPath === "/supervisordetails" ||
            currentPath === "/l3-ticketing" ||
            currentPath === "/l4-ticketing" ||
            currentPath === "/l5-ticketing" ||
            currentPath === "/ticket-calendar" ||
            currentPath === "/ticket-calendar-l2"
        );
        setIsManagementHubOpen(
            currentPath === "/submitted-notebooks" ||
            currentPath === "/new-field-creation" ||
            currentPath === "/activity-log" ||
            currentPath === "/wheel-change-approvals" ||
            currentPath === "/drawframe-wheel-change-approvals" ||
            currentPath === "/carding-change-control-approvals" ||
            currentPath === "/simplex-wheel-change-approvals"
        );
        setIsAnalyticsHubOpen(
            currentPath === "/statistics-analysis" ||
            currentPath === "/l1-analysis" ||
            currentPath === "/l2-analysis"
        );
        setIsTeamPerformanceOpen(
            currentPath === "/l1-analysis" ||
            currentPath === "/l2-analysis"
        );
        setIsSettingsMenuOpen(
            currentPath === "/settings" ||
            currentPath.startsWith("/settings/") ||
            currentPath === "/ticket-resolution-sla" ||
            currentPath === "/usermanagement" ||
            currentPath.startsWith("/umadduser") ||
            currentPath.startsWith("/umedit") ||
            currentPath.startsWith("/umchangepassword") ||
            currentPath === "/rolespermission" ||
            currentPath.startsWith("/Createrole") ||
            currentPath.startsWith("/editrole")
        );
    }, [router.asPath, router.pathname]);

    return (
        <>
            <aside className={`${styles.sidebar} ${isSidebarCollapsed ? styles["sidebar-collapsed"] : ""}`}>
                <div className={styles["sidebar-logo"]}>
                    <Image
                        src={isDarkMode ? "/spintel-dark.png" : "/spintelligence_light.png"}
                        alt="Spintelligence"
                        width={isDarkMode ? 96 : 219}
                        height={isDarkMode ? 55 : 125}
                        priority
                        className={styles["sidebar-logo-secondary"]}
                        style={{ width: "auto", height: isDarkMode ? "55px" : "125px", objectFit: "contain" }}
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
                        const isTicketingGroup = link.section === "tickets";
                        const isManagementGroup = link.section === "management";
                        const isAnalyticsHubGroup = link.section === "calendars";
                        const isSettingsGroup = link.section === "settings";
                        const isTicketingGroupActive = isTicketingGroup && (
                            currentPath === "/operator" ||
                            currentPath.startsWith("/operator/") ||
                            currentPath === "/operatordash" ||
                            currentPath.startsWith("/operatordetail") ||
                            currentPath === "/supervisordashboard" ||
                            currentPath === "/supervisordetails" ||
                            currentPath === "/l3-ticketing" ||
                            currentPath === "/l4-ticketing" ||
                            currentPath === "/l5-ticketing" ||
                            currentPath === "/ticket-calendar" ||
                            currentPath === "/ticket-calendar-l2"
                        );
                        const isManagementGroupActive = isManagementGroup && (
                            currentPath === "/submitted-notebooks" ||
                            currentPath === "/activity-log" ||
                            currentPath === "/wheel-change-approvals" ||
                            currentPath === "/drawframe-wheel-change-approvals" ||
                            currentPath === "/carding-change-control-approvals" ||
                            currentPath === "/simplex-wheel-change-approvals"
                        );
                        const isAnalyticsHubGroupActive = isAnalyticsHubGroup && (
                            currentPath === "/statistics-analysis" ||
                            currentPath === "/l1-analysis" ||
                            currentPath === "/l2-analysis"
                        );
                        const isSettingsGroupActive = isSettingsGroup && (
                            currentPath === "/settings" ||
                            currentPath.startsWith("/settings/") ||
                            currentPath === "/ticket-resolution-sla" ||
                            currentPath === "/usermanagement" ||
                            currentPath.startsWith("/umadduser") ||
                            currentPath.startsWith("/umedit") ||
                            currentPath.startsWith("/umchangepassword") ||
                            currentPath === "/rolespermission" ||
                            currentPath.startsWith("/Createrole") ||
                            currentPath.startsWith("/editrole")
                        );
                        const linkClassName = `${styles["side-nav-link"]} ${
                            (isTicketingGroup
                                ? isTicketingGroupActive
                                : isManagementGroup
                                    ? isManagementGroupActive
                                    : isAnalyticsHubGroup
                                        ? isAnalyticsHubGroupActive
                                        : isSettingsGroup
                                            ? isSettingsGroupActive
                                            : isActiveLink(link.href))
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
                        if (link.section === "management" && hasManagementHubAccess) {
                            return (
                                <div key={link.href} className={styles["side-nav-group"]}>
                                    <button
                                        type="button"
                                        className={`${linkClassName} ${styles["side-nav-button"]}`}
                                        aria-expanded={isManagementHubOpen}
                                        title={isSidebarCollapsed ? link.label : undefined}
                                        onClick={handleManagementHubClick}
                                    >
                                        {content}
                                        <FiChevronDown className={`${styles["department-chevron"]} ${isManagementHubOpen ? styles["department-chevron-open"] : ""}`} />
                                    </button>
                                    <div className={`${styles["side-subnav"]} ${isManagementHubOpen ? styles["side-subnav-open"] : ""}`}>
                                        {visibleManagementHubLinks.map((managementLink) => {
                                            if (managementLink.children) {
                                                const isWheelChangeApprovalsActive = managementLink.children.some((child) => isActiveLink(child.href));

                                                return (
                                                    <div key={managementLink.label} className={styles["side-subnav-group"]}>
                                                        <button
                                                            type="button"
                                                            className={`${styles["side-subnav-link"]} ${styles["side-subnav-button"]} ${isWheelChangeApprovalsActive ? styles["side-subnav-active"] : ""}`}
                                                            aria-expanded={isWheelChangeApprovalsOpen}
                                                            onClick={() => setIsWheelChangeApprovalsOpen((isOpen) => !isOpen)}
                                                        >
                                                            <span>{managementLink.label}</span>
                                                            <FiChevronDown className={`${styles["side-subnav-chevron"]} ${isWheelChangeApprovalsOpen ? styles["department-chevron-open"] : ""}`} />
                                                        </button>
                                                        <div className={`${styles["side-nested-subnav"]} ${isWheelChangeApprovalsOpen ? styles["side-nested-subnav-open"] : ""}`}>
                                                            {managementLink.children.map((child) => (
                                                                <Link
                                                                    key={child.href}
                                                                    href={child.href}
                                                                    className={`${styles["side-subnav-link"]} ${styles["side-nested-subnav-link"]} ${isActiveLink(child.href) ? styles["side-subnav-active"] : ""}`}
                                                                >
                                                                    {child.label}
                                                                </Link>
                                                            ))}
                                                        </div>
                                                    </div>
                                                );
                                            }

                                            return (
                                                <Link
                                                    key={managementLink.href}
                                                    href={managementLink.href}
                                                    className={`${styles["side-subnav-link"]} ${isActiveLink(managementLink.href) ? styles["side-subnav-active"] : ""}`}
                                                >
                                                    {managementLink.label}
                                                </Link>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        }
                        if (link.section === "calendars" && hasAnalyticsHubAccess) {
                            return (
                                <div key={link.href} className={styles["side-nav-group"]}>
                                    <button
                                        type="button"
                                        className={`${linkClassName} ${styles["side-nav-button"]}`}
                                        aria-expanded={isAnalyticsHubOpen}
                                        title={isSidebarCollapsed ? link.label : undefined}
                                        onClick={() => {
                                            setIsAnalyticsHubOpen((v) => !v);
                                            if (!isAnalyticsHubOpen && router.asPath?.split("?")[0] !== "/statistics-analysis") {
                                                router.push("/statistics-analysis");
                                            }
                                        }}
                                    >
                                        {content}
                                        <FiChevronDown className={`${styles["department-chevron"]} ${isAnalyticsHubOpen ? styles["department-chevron-open"] : ""}`} />
                                    </button>
                                    <div className={`${styles["side-subnav"]} ${isAnalyticsHubOpen ? styles["side-subnav-open"] : ""}`}>
                                        {analyticsHubLinks.map((item) => {
                                            if (item.children) {
                                                const isTeamPerformanceActive = item.children.some((child) => isActiveLink(child.href));

                                                return (
                                                    <div key={item.label} className={styles["side-subnav-group"]}>
                                                        <button
                                                            type="button"
                                                            className={`${styles["side-subnav-link"]} ${styles["side-subnav-button"]} ${isTeamPerformanceActive ? styles["side-subnav-active"] : ""}`}
                                                            aria-expanded={isTeamPerformanceOpen}
                                                            onClick={() => setIsTeamPerformanceOpen((isOpen) => !isOpen)}
                                                        >
                                                            <span>{item.label}</span>
                                                            <FiChevronDown className={`${styles["side-subnav-chevron"]} ${isTeamPerformanceOpen ? styles["department-chevron-open"] : ""}`} />
                                                        </button>
                                                        <div className={`${styles["side-nested-subnav"]} ${isTeamPerformanceOpen ? styles["side-nested-subnav-open"] : ""}`}>
                                                            {item.children.map((child) => (
                                                                <Link
                                                                    key={child.href}
                                                                    href={child.href}
                                                                    className={`${styles["side-subnav-link"]} ${styles["side-nested-subnav-link"]} ${isActiveLink(child.href) ? styles["side-subnav-active"] : ""}`}
                                                                >
                                                                    {child.label}
                                                                </Link>
                                                            ))}
                                                        </div>
                                                    </div>
                                                );
                                            }

                                            return (
                                                <Link
                                                    key={`${item.href}-${item.label}`}
                                                    href={item.href}
                                                    className={`${styles["side-subnav-link"]} ${isActiveLink(item.href) ? styles["side-subnav-active"] : ""}`}
                                                >
                                                    {item.label}
                                                </Link>
                                            );
                                        })}
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

                <div className={styles["sidebar-version"]} title="Version 2.1.2">
                    <span className={styles["sidebar-version-badge"]}>
                        <span className={styles["sidebar-version-dot"]} />
                        <span className={styles["sidebar-version-label"]}>Version</span>
                        <span className={styles["sidebar-version-number"]}>2.1.3</span>
                    </span>
                </div>
            </aside>

            <div className={styles["top-logo-center"]}>
                <Image
                    src={isDarkMode ? "/dsm-logo-dark.png" : "/logo.png"}
                    alt="DSM"
                    width={140}
                    height={100}
                    priority
                    style={{ width: "128px", height: "auto" }}
                />
            </div>

            <header className={styles["top-actions"]}>
                <div className={styles["nav-left"]}>
                    <span>Welcome Back, {fullName}</span>
                </div>

                <div className={styles["nav-right"]}>
                <div className={styles["notification-menu"]} ref={notificationMenuRef}>
                    <button
                        type="button"
                        className={styles["icon-button"]}
                        aria-label="Notifications"
                        aria-expanded={isNotificationsOpen}
                        onClick={() => setIsNotificationsOpen((value) => !value)}
                    >
                        <FiBell />
                        {unreadCount > 0 && (
                            <span className={styles["notification-badge"]}>
                                {unreadCount > 99 ? "99+" : unreadCount}
                            </span>
                        )}
                    </button>
                    {isNotificationsOpen && (
                        <div className={styles["notification-dropdown"]}>
                            <div className={styles["notification-header"]}>
                                <strong>Notifications</strong>
                                <div className={styles["notification-actions"]}>
                                    <button type="button" onClick={handleClearAllNotifications} disabled={!notifications.length}>
                                        <FiTrash2 />
                                        <span>Clear all</span>
                                    </button>
                                </div>
                            </div>
                            {notificationsLoading ? (
                                <p className={styles["notification-empty"]}>Loading...</p>
                            ) : notifications.length ? (
                                <div className={styles["notification-list"]}>
                                    {notifications.slice(0, 12).map((item) => (
                                        <button
                                            type="button"
                                            key={`${item.source}-${item.id}`}
                                            className={`${styles["notification-item"]} ${item?.is_unread ? "" : styles["notification-read"]}`}
                                            onClick={() => handleMarkNotificationRead(item)}
                                        >
                                            <span className={styles["notification-item-header"]}>
                                                <span className={styles["notification-title"]}>{item?.title || "Notification"}</span>
                                                <span className={styles["notification-source"]}>{item?.category || (item?.source === "ticket" ? "Tickets" : "Reports")}</span>
                                            </span>
                                            <span className={styles["notification-body"]}>{item?.body || "-"}</span>
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <p className={styles["notification-empty"]}>No notifications</p>
                            )}
                        </div>
                    )}
                </div>

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
                            <button
                                type="button"
                                className={styles["profile-dropdown-button"]}
                                onClick={() => {
                                    setIsProfileMenuOpen(false);
                                    router.push("/glossary");
                                }}
                            >
                                <FiFileText />
                                <span>Glossary</span>
                            </button>
                            <button
                                type="button"
                                className={styles["profile-dropdown-button"]}
                                onClick={() => {
                                    setIsProfileMenuOpen(false);
                                    router.push("/faqs");
                                }}
                            >
                                <FiHelpCircle />
                                <span>FAQs</span>
                            </button>
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
