import React, { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { useDispatch, useSelector } from "react-redux";
import { loginUser, clearError } from "../store/slices/authSlice";
import styles from "../styles/login.module.css";
import { FaUserTie, FaLock, FaEye, FaEyeSlash, FaExclamationCircle } from "react-icons/fa";

const Login = () => {
    const [loginId, setLoginId] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [localError, setLocalError] = useState("");

    const router = useRouter();
    const dispatch = useDispatch();

    const { isLoading, error, token } = useSelector((state) => state.auth);

    const displayError = localError || error;

    useEffect(() => {
        if (token) {
            router.push("/");
        }
    }, [token, router]);

    useEffect(() => {
        dispatch(clearError());
    }, [dispatch]);

    const handleLogin = async (e) => {
        e.preventDefault();
        setLocalError("");
        dispatch(clearError());

        if (!loginId || !password) {
            setLocalError("Please enter both mail ID and password.");
            return;
        }
        dispatch(loginUser({ employee_id: loginId, password, authMode: "auto" }));
    };

    return (
        <div className={styles['login-wrapper']}>
            <div className={`${styles.blur} ${styles['blur-left']}`}></div>
            <div className={`${styles.blur} ${styles['blur-right']}`}></div>

            <div className={styles['login-card']}>
                <div className={styles['login-top']}>
                    <div className={styles['logo-overlay']}>
                        <img src="/spintelligence_light.png" alt="Company Logo" className={styles['logo-image']} />
                    </div>

                    <div className={styles['heading-container']}>
                        <h1>Employee Login</h1>
                    </div>

                    <div className={styles['subheading-container']}>
                        <p>Access your workspace and tools</p>
                    </div>
                </div>

                <form className={styles['login-form']} onSubmit={handleLogin}>
                    <div className={styles.form}>
                        <label>Employee ID</label>
                                <div className={styles['i-wrapper']}>
                            <FaUserTie className={`${styles['input-icon']} ${styles.left}`} />
                            <input
                                type="text"
                                placeholder="Enter Employee ID"
                                value={loginId}
                                onChange={(e) => {
                                    setLoginId(e.target.value);
                                    if (localError) setLocalError("");
                                    if (error) dispatch(clearError());
                                }}
                            />
                        </div>
                    </div>

                    <div className={styles.form}>
                        <label>Password</label>
                        <div className={styles['i-wrapper']}>
                            <FaLock className={`${styles['input-icon']} ${styles.left}`} />
                            <input
                                type={showPassword ? "text" : "password"}
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => {
                                    setPassword(e.target.value);
                                    if (localError) setLocalError("");
                                    if (error) dispatch(clearError());
                                }}
                            />
                            <span
                                className={styles['input-icon-right']}
                                onClick={() => setShowPassword(!showPassword)}
                            >
                                {showPassword ? <FaEyeSlash /> : <FaEye />}
                            </span>
                        </div>

                        {displayError && (
                            <div className={styles['error-text']}>
                                <FaExclamationCircle className={styles['error-icon']} />
                                {displayError}
                            </div>
                        )}
                    </div>

                    <button type="submit" className={styles['login-btn']} disabled={isLoading}>
                        {isLoading ? "Logging in..." : "Login to Quality Control"}
                    </button>

                </form>

                <div className={styles['card-bottom-bar']}></div>
            </div>
        </div>
    );
};

export default Login;
