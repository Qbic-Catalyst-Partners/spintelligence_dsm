import { useState, useEffect } from "react";
import styles from "../../styles/UmAddUser.module.css";
import { useRouter } from "next/router";
import Link from "next/link";

// ICONS
import { IoPersonSharp } from "react-icons/io5";
import { BsBuildingsFill } from "react-icons/bs";
import { FaLock, FaEye, FaEyeSlash, FaCheckCircle } from "react-icons/fa";
import { MdOutlinePersonAdd } from "react-icons/md";
import { FiCircle } from "react-icons/fi";

// REDUX
import { useDispatch, useSelector } from "react-redux";
import {
  fetchRoles,
  fetchDepartments,
  addUser,
  clearActionState,
} from "../../store/slices/userSlice";

export default function UmAddUser() {
  const dispatch = useDispatch();
  const router = useRouter();

  const { roles, departments, actionLoading, error, actionSuccess } =
    useSelector((state) => state.users);

  const [localError, setLocalError] = useState("");

  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    employee_id: "",
    role: "",
    department: "",
  });

  // FETCH DROPDOWN DATA
  useEffect(() => {
    dispatch(fetchRoles());
    dispatch(fetchDepartments());
  }, [dispatch]);

  // SUCCESS REDIRECT
  useEffect(() => {
    if (actionSuccess) {
      alert("User created successfully!");

      dispatch(clearActionState());
      router.push("/usermanagement");
    }
  }, [actionSuccess]);

  useEffect(() => {
    if (error) {
      alert(error);
    }
  }, [error]);

  const displayError = localError || error;

  // HANDLE INPUT
  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });

    if (localError) setLocalError("");
    if (error) dispatch(clearActionState());
  };

  // PASSWORD VALIDATION
  const validations = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[!@#$%^&*(),.?":{}|<>]/.test(password),
  };

  // SUBMIT
  const handleSubmit = (e) => {
    e.preventDefault();

    if (
      !formData.first_name ||
      !formData.last_name ||
      !formData.email ||
      !formData.phone ||
      !formData.employee_id ||
      !formData.role ||
      !formData.department ||
      !password
    ) {
      setLocalError("All fields are required");
      return;
    }

    dispatch(addUser({ ...formData, password }));
  };

  return (
    <div className={styles.container}>
      {/* NAVBAR */}
      <header className={styles.topNavbar}>
        <div className={styles.navLeft}>
          <img src="/spintel.svg" className={styles.spintelLogo} />

          <nav className={styles.navLinks}>
            <Link href="/">Home</Link>
            <Link href="/usermanagement">User Management</Link>
            <Link href="/rolespermissions">Roles & Permissions</Link>
          </nav>
        </div>

        <img src="/logo.png" className={styles.mainLogo} />
      </header>

      <div className={styles.wrapper}>
        {/* HEADER */}
        <div className={styles.content}>
          <div className={styles.header}>
            <div>
              <h1>Create Employee Account</h1>
              <p>Create Employee Account</p>
            </div>
          </div>

          {/* PERSONAL */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <IoPersonSharp />
              <span>Personal Information</span>
            </div>

            <div className={styles.grid}>
              <div className={styles.formGroup}>
                <label>First Name <span>*</span></label>
                <input
                  name="first_name"
                  placeholder="Enter first name"
                  onChange={handleChange}
                />
              </div>

              <div className={styles.formGroup}>
                <label>Last Name <span>*</span></label>
                <input name="last_name" placeholder="Enter last name" onChange={handleChange} />
              </div>
              <div className={styles.formGroup}>
                <label>Email Address <span>*</span></label>
                <input name="email" placeholder="Enter email address" onChange={handleChange} />
              </div>

              <div className={styles.formGroup}>
                <label>Mobile Number <span>*</span></label>
                <input name="phone" placeholder="Enter mobile number" onChange={handleChange} />
              </div>

              <div className={`${styles.formGroup} ${styles.full}`}>
                <label>Employee ID <span>*</span></label>
                <input name="employee_id" placeholder="Enter Employee ID" onChange={handleChange} />
              </div>
            </div>
          </div>

          {/* ORGANIZATION */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <BsBuildingsFill />
              <span>Organization</span>
            </div>

            <div className={styles.grid}>
              <div className={styles.formGroup}>
                <label>Role Selection <span>*</span></label>
                <select name="role" onChange={handleChange}>
                  <option value="">Select user role</option>
                  {roles.map((r) => (
                    <option key={r.id}>{r.role_name}</option>
                  ))}
                </select>
              </div>

              <div className={styles.formGroup}>
                <label>Department <span>*</span></label>
                <select name="department" onChange={handleChange}>
                  <option value="">Select Department</option>
                  {departments.map((d) => (
                    <option key={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* PASSWORD */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <FaLock />
              <span>Account</span>
            </div>

            <div className={styles.grid}>
              <div className={styles.passwordField}>
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Password"
                  onChange={(e) => setPassword(e.target.value)}
                />

                {showPassword ? (
                  <FaEyeSlash onClick={() => setShowPassword(false)} />
                ) : (
                  <FaEye onClick={() => setShowPassword(true)} />
                )}
              </div>
            </div>

            {/* VALIDATION */}
            <div className={styles.security}>

              <p className={styles.securityTitle}>SECURITY REQUIREMENTS</p>

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

                <li className={validations.uppercase && validations.lowercase ? styles.valid : ""}>
                  {validations.uppercase && validations.lowercase ? <FaCheckCircle /> : <FiCircle />}
                  Include uppercase & lowercase letters
                </li>
              </ul>
            </div>
          </div>


        </div>

      </div>
      {/* FOOTER */}
      <div className={styles.footer}>
        <button onClick={() => router.push("/usermanagement")}>
          Cancel
        </button>

        <button onClick={handleSubmit} className={styles.primary}>
          <MdOutlinePersonAdd />
          Add User
        </button>
      </div>
    </div>
  );
}