import Image from 'next/image';
import styles from '../styles/header.module.css'; // Assuming the CSS file is created

const Header = ({navLinks = []}) => {

    // const navLinks = [
    //     { href: "/", label: "Home" },
    //     { href: "/usermanagement", label: "User Management" },
    //     { href: "/rolespermissions", label: "Roles & Permissions" }
    // ];

    return (
        <header className={styles["top-navbar"]}>
            <div className={styles["nav-left"]}>
                <div className={styles["spintel-logo"]}>
                    <Image src="/spintel.svg" alt="spintel" width={50} height={50} style={{ height: "auto" }} />
                </div>
                {navLinks.length > 0 && <nav className={styles["nav-links"]}>
                    {navLinks.map((link, index) => (
                        <a key={index} href={link.href} className={styles["nav-link"]}>
                            {link.label}
                        </a>
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
