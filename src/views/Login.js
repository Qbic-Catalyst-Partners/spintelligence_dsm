<<<<<<< HEAD
import React, { useState, useEffect } from "react";
=======
import React, { useState, useEffect, us } from "react";
>>>>>>> 9520038087bdf8bd59e0db750d4d32857fe2449e
import { useRouter } from "next/router";
import { useDispatch, useSelector } from "react-redux";
import { loginUser, clearError } from "../store/slices/authSlice";
import styles from "../styles/login.module.css";
import { FaUserTie, FaLock, FaEye, FaEyeSlash, FaExclamationCircle } from "react-icons/fa";

const Login = () => {
    const [employee_id, setemployee_id] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [localError, setLocalError] = useState("");

    const router = useRouter();
    const dispatch = useDispatch();

    const { isLoading, error, token } = useSelector((state) => state.auth);

    const displayError = localError || error;

    useEffect(() => {
        if (token) {
            router.push("/dashboard");
        }
    }, [token, router]);

    useEffect(() => {
        dispatch(clearError());
    }, [dispatch]);

    const handleLogin = async (e) => {
        e.preventDefault();
        setLocalError("");
        dispatch(clearError());

        if (!employee_id || !password) {
            setLocalError("Please enter both Employee ID and password.");
            return;
        }
        dispatch(loginUser({ employee_id, password }));
    };

    return (
        <div className={styles['login-wrapper']}>
            <div className={`${styles.blur} ${styles['blur-left']}`}></div>
            <div className={`${styles.blur} ${styles['blur-right']}`}></div>

            <div className={styles['login-card']}>
                <div className={styles['login-top']}>
                    <div className={styles['logo-overlay']}>
                        <img src="/spintel.svg" alt="Company Logo" className={styles['logo-image']} />
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
                                value={employee_id}
                                onChange={(e) => {
                                    setemployee_id(e.target.value);
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
                        {isLoading ? "Logging in..." : "Login to Dashboard"}
                    </button>

                </form>

                <div className={styles['card-bottom-bar']}></div>
            </div>
        </div>
    );
};

export default Login;
