import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import { useDispatch, useSelector } from "react-redux";
import { FiBell, FiLogOut, FiMoon } from "react-icons/fi";
import { logout } from "../store/slices/authSlice";
import { isFullAccessUser } from "@/utils/accessControl";
import styles from "../styles/header.module.css";

const defaultNavLinks = [];

const Header = ({ navLinks = defaultNavLinks }) => {
    const router = useRouter();
    const dispatch = useDispatch();
    const user = useSelector((state) => state.auth?.user);
    const fullName = user?.full_name || user?.name || "User";
    const employeeId = user?.employee_id || user?.employeeId || "No ID";
    const initials = fullName
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join("") || employeeId.slice(0, 2).toUpperCase();
    const visibleNavLinks = !user || isFullAccessUser(user)
        ? navLinks
        : navLinks.filter((link) =>
            link.href !== "/usermanagement" && link.href !== "/rolespermission"
        );

    const isActiveLink = (href) => {
        if (href === "/dashboard") {
            return router.pathname === "/dashboard";
        }

        return router.pathname === href || router.pathname.startsWith(`${href}/`);
    };

    const handleLogout = () => {
        dispatch(logout());
        router.replace("/");
    };

    return (
        <header className={styles["top-navbar"]}>
            <div className={styles["nav-left"]}>
                <div className={styles["spintel-logo"]}>
                    <Image src="/spintel.svg" alt="spintel" width={50} height={40} style={{ width: "auto", height: "70px" }} />
                </div>
                {visibleNavLinks.length > 0 && <nav className={styles["nav-links"]}>
                    {visibleNavLinks.map((link, index) => (
                        <Link
                            key={index}
                            href={link.href}
                            className={`${styles["nav-link"]} ${isActiveLink(link.href) ? styles["nav-link-active"] : ""}`}
                        >
                            {link.label}
                        </Link>
                    ))}
                </nav>}
            </div>

            <div className={styles["nav-right"]}>
                <button type="button" className={styles["icon-button"]} aria-label="Notifications">
                    <FiBell />
                    <span className={styles["notification-badge"]}>4</span>
                </button>

                <button type="button" className={styles["icon-button"]} aria-label="Dark mode">
                    <FiMoon />
                </button>

                <div className={styles["profile-summary"]}>
                    <button type="button" className={styles["profile-chip"]} aria-label="Profile">
                        {initials}
                    </button>
                    <div className={styles["profile-meta"]}>
                        <span className={styles["profile-name"]}>{fullName}</span>
                        <span className={styles["profile-id"]}>{employeeId}</span>
                    </div>
                </div>

                <button type="button" className={styles["logout-button"]} onClick={handleLogout}>
                    <FiLogOut />
                    <span>Logout</span>
                </button>

                <Image src="/logo.png" alt="logo" width={100} height={80} priority />
            </div>
        </header>
    );
};

export default Header;
