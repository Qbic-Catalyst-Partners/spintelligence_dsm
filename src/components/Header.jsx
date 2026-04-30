import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
    FiBell,
    FiChevronDown,
    FiChevronLeft,
    FiFileText,
    FiGrid,
    FiHeadphones,
    FiHome,
    FiLogOut,
    FiMoon,
    FiRepeat,
    FiSettings,
    FiShield,
    FiSliders,
    FiUsers,
} from "react-icons/fi";
import { logout } from "../store/slices/authSlice";
import { hasSubDepartmentAccess, isFullAccessUser, routeDepartmentMap } from "@/utils/accessControl";
import styles from "../styles/header.module.css";

const defaultNavLinks = [];

const sidebarLinks = [
    { href: "/", label: "Dashboard", icon: FiHome },
    { href: "/departments", label: "Department", icon: FiGrid },
    { href: "/departments/quality-control", label: "Sub-department", icon: FiGrid, section: "departments" },
    { href: "/usermanagement", label: "User Management", icon: FiUsers, admin: true },
    { href: "/rolespermission", label: "Roles & Permissions", icon: FiShield, admin: true },
    { href: "/operator", label: "Ticketing System", icon: FiHeadphones, section: "tickets" },
    { href: "/reports", label: "Reports", icon: FiFileText, admin: true },
    { href: "/threshold-values", label: "Threshold", icon: FiSliders, admin: true },
    { href: "/submission-frequency", label: "Submission Frequency", icon: FiRepeat, admin: true },
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

const Header = ({ navLinks = defaultNavLinks }) => {
    const router = useRouter();
    const dispatch = useDispatch();
    const profileMenuRef = useRef(null);
    const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [isDepartmentMenuOpen, setIsDepartmentMenuOpen] = useState(false);
    const [isSettingsMenuOpen, setIsSettingsMenuOpen] = useState(false);
    const user = useSelector((state) => state.auth?.user);
    const accessByDepartment = useSelector((state) => state.auth?.accessByDepartment);
    const hasFullAccess = isFullAccessUser(user);
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
    const visibleSidebarLinks = sidebarLinks.filter((link) => {
        if (link.admin) {
            return hasFullAccess || Boolean(link.href && visibleHrefSet.has(link.href));
        }

        if (link.section === "departments") {
            return hasDepartmentNav || hasFullAccess;
        }

        if (link.section === "tickets") {
            return hasFullAccess || visibleHrefSet.has("/operator");
        }

        if (link.section === "settings") {
            return hasFullAccess || visibleHrefSet.has("/settings");
        }

        return hasDashboardNav || hasDepartmentNav || visibleHrefSet.has(link.href) || hasFullAccess;
    });
    const visibleDepartmentLinks = departmentLinks.filter((link) =>
        hasSubDepartmentAccess(accessByDepartment, link.department, user)
    );

    const isActiveLink = (href) => {
        if (!href) {
            return false;
        }

        const currentPath = router.asPath?.split("?")[0] || router.pathname;

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
                currentPath.startsWith("/operatordetail") ||
                currentPath === "/supervisordashboard" ||
                currentPath === "/supervisordetails"
            );
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
        setIsDepartmentMenuOpen((isOpen) => {
            const nextIsOpen = !isOpen;
            if (nextIsOpen && router.asPath?.split("?")[0] !== "/departments/quality-control") {
                router.push("/departments/quality-control");
            }
            return nextIsOpen;
        });
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

                <nav className={styles["side-nav"]} aria-label="Primary navigation">
                    {visibleSidebarLinks.map((link) => {
                        const Icon = link.icon;
                        const content = (
                            <>
                                <Icon className={styles["side-nav-icon"]} />
                                <span className={styles["side-nav-label"]}>{link.label}</span>
                            </>
                        );
                        const linkClassName = `${styles["side-nav-link"]} ${isActiveLink(link.href) ? styles["side-nav-active"] : ""}`;

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

                <button type="button" className={styles["icon-button"]} aria-label="Dark mode">
                    <FiMoon />
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
