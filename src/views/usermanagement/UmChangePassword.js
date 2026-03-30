import { useState, useEffect } from "react";
import styles from "../../styles/UmChangePassword.module.css";
import { useRouter } from "next/router";
import Link from "next/link";
import {
  FaLock,
  FaEye,
  FaEyeSlash,
  FaCheckCircle,
} from "react-icons/fa";
import { FiCircle } from "react-icons/fi";

import { useDispatch, useSelector } from "react-redux";
import {
  changePassword,
  clearActionState,
} from "../../store/slices/userSlice";

export default function UmChangePassword() {
  const router = useRouter();
  const { id } = router.query;

  const dispatch = useDispatch();
  const { actionSuccess, error } = useSelector(
    (state) => state.users
  );

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] =
    useState("");

  const [showPassword, setShowPassword] =
    useState(false);
  const [
    showConfirmPassword,
    setShowConfirmPassword,
  ] = useState(false);

  const validations = {
    length: password.length >= 8,
    number: /[0-9]/.test(password),
    special: /[!@#$%^&*(),.?":{}|<>]/.test(password),
    upperLower:
      /[A-Z]/.test(password) &&
      /[a-z]/.test(password),
    match:
      password === confirmPassword &&
      password !== "",
  };

  const strength =
    Object.values(validations).filter(Boolean).length;

  const handleSubmit = () => {
    if (!validations.match) {
      alert("Passwords do not match");
      return;
    }

    dispatch(
      changePassword({
        id,
        data: {
          new_password: password,
          confirm_password: confirmPassword,
        },
      })
    );
  };

  useEffect(() => {
    if (actionSuccess) {
      alert("Password Updated Successfully");
      dispatch(clearActionState());
      router.push("/usermanagement");
    }
  }, [actionSuccess]);

  useEffect(() => {
    if (error) alert(error);
  }, [error]);

  return (
    <div className={styles.container}>
      {/* NAVBAR */}
      <header className={styles.topNavbar}>
        <div className={styles.navLeft}>
          <img src="/spintel.svg" className={styles.spintelLogo} />

          <nav className={styles.navLinks}>
            <Link href="/">Home</Link>
            <Link href="/usermanagement">User Management</Link>
            <Link href="/rolespermission">Roles & Permissions</Link>
          </nav>
        </div>

        <img src="/logo.png" className={styles.mainLogo} />
      </header>

      <div className={styles.wrapper}>
        <div className={styles.header}>
          <h1>Change User Password</h1>
          <p>
            Change User Password
          </p>
        </div>

        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <FaLock /> Change Password
          </div>

          <div className={styles.grid}>
            {/* New Password */}
            <div className={styles.formGroup}>
              <label>New Password</label>

              <div className={styles.passwordField}>
                <input
                  type={
                    showPassword
                      ? "text"
                      : "password"
                  }
                  value={password}
                  onChange={(e) =>
                    setPassword(
                      e.target.value
                    )
                  }
                />

                {showPassword ? (
                  <FaEyeSlash
                    onClick={() =>
                      setShowPassword(
                        false
                      )
                    }
                  />
                ) : (
                  <FaEye
                    onClick={() =>
                      setShowPassword(
                        true
                      )
                    }
                  />
                )}
              </div>
            </div>

            {/* Confirm Password */}
            <div className={styles.formGroup}>
              <label>
                Confirm Password
              </label>

              <div className={styles.passwordField}>
                <input
                  type={
                    showConfirmPassword
                      ? "text"
                      : "password"
                  }
                  value={
                    confirmPassword
                  }
                  onChange={(e) =>
                    setConfirmPassword(
                      e.target.value
                    )
                  }
                />

                {showConfirmPassword ? (
                  <FaEyeSlash
                    onClick={() =>
                      setShowConfirmPassword(
                        false
                      )
                    }
                  />
                ) : (
                  <FaEye
                    onClick={() =>
                      setShowConfirmPassword(
                        true
                      )
                    }
                  />
                )}
              </div>
            </div>

            {/* Password Strength */}
            <div className={styles.full}>
              <div
                className={
                  styles.passwordStrength
                }
              >
                <div
                  className={
                    styles.strengthText
                  }
                >
                  Password strength:
                  <span>
                    {strength >= 4
                      ? " Strong"
                      : strength >= 2
                        ? " Medium"
                        : " Weak"}
                  </span>
                </div>

                <div
                  className={
                    styles.strengthBars
                  }
                >
                  {[1, 2, 3, 4].map(
                    (bar) => (
                      <div
                        key={bar}
                        className={
                          strength >= bar
                            ? styles.active
                            : ""
                        }
                      ></div>
                    )
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Security */}
          {/* SECURITY REQUIREMENTS */}
          <div className={styles.securityBox}>
            <p className={styles.securityTitle}>
              SECURITY REQUIREMENTS
            </p>

            <ul className={styles.securityList}>
              <li className={validations.length ? styles.valid : ""}>
                {validations.length ? <FaCheckCircle /> : <FiCircle />}
                At least 8 characters long
              </li>

              <li className={validations.number ? styles.valid : ""}>
                {validations.number ? <FaCheckCircle /> : <FiCircle />}
                Include at least one number (0-9)
              </li>

              <li className={validations.special ? styles.valid : ""}>
                {validations.special ? <FaCheckCircle /> : <FiCircle />}
                Include a special character (@#$)
              </li>

              <li
                className={
                  validations.upperLower ? styles.valid : ""
                }
              >
                {validations.upperLower ? (
                  <FaCheckCircle />
                ) : (
                  <FiCircle />
                )}
                Include uppercase & lowercase letters
              </li>
            </ul>
          </div>

        </div>

      </div>
      {/* footer */}
      <div className={styles.footer}>
        <button
          onClick={() =>
            router.push(
              "/usermanagement"
            )
          }
        >
          Cancel
        </button>

        <button
          className={
            styles.primary
          }
          onClick={handleSubmit}
        >
          Change Password
        </button>
      </div>
    </div>

  );
}
