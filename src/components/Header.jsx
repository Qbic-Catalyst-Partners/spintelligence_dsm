import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import styles from "../styles/header.module.css";

const defaultNavLinks = [
    { href: "/dashboard", label: "Home" },
    { href: "/usermanagement", label: "User Management" },
    { href: "/rolespermission", label: "Roles & Permissions" },
];

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
                <Image src="/logo.png" alt="logo" width={80} height={30} priority />
            </div>
        </header>
    );
};

export default Header;
