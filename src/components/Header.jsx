import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import { FiBell, FiMoon } from "react-icons/fi";
import styles from "../styles/header.module.css";

const defaultNavLinks = [];

const Header = ({ navLinks = defaultNavLinks }) => {
    const router = useRouter();
    const isActiveLink = (href) => {
        if (href === "/dashboard") {
            return router.pathname === "/dashboard";
        }

        return router.pathname === href || router.pathname.startsWith(`${href}/`);
    };

    return (
        <header className={styles["top-navbar"]}>
            <div className={styles["nav-left"]}>
                <div className={styles["spintel-logo"]}>
                    <Image src="/spintel.svg" alt="spintel" width={50} height={40} style={{ height: "70px" }} />
                </div>
                {navLinks.length > 0 && <nav className={styles["nav-links"]}>
                    {navLinks.map((link, index) => (
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

                <button type="button" className={styles["profile-chip"]} aria-label="Profile">
                    HB
                </button>

                <Image src="/logo.png" alt="logo" width={100} height={80} priority />
            </div>
        </header>
    );
};

export default Header;
