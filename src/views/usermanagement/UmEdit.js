import { useState, useEffect } from "react";
import styles from "../../styles/UmAddUser.module.css";
import { useRouter } from "next/router";

// ICONS
import { IoPersonSharp } from "react-icons/io5";
import { BsBuildingsFill } from "react-icons/bs";
import { FaLock, FaEye, FaEyeSlash, FaCheckCircle } from "react-icons/fa";
import { HiPencil } from "react-icons/hi";
import { FiCircle } from "react-icons/fi";

// REDUX
import { useDispatch, useSelector } from "react-redux";
import { fetchRoles, clearActionState } from "../../store/slices/userSlice";

// API
import { updateUserAPI } from "../../apis/userApi";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL;

export default function EditUser() {
  const router = useRouter();
  const { id } = router.query;

  const dispatch = useDispatch();
  const { roles, actionLoading, error, actionSuccess } = useSelector(
    (state) => state.users
  );

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
  });

  // FETCH ROLES
  useEffect(() => {
    dispatch(fetchRoles());
  }, [dispatch]);

  // FETCH USER DATA
  useEffect(() => {
    if (!id) return;

    const fetchUser = async () => {
      try {
        const res = await fetch(`${BASE_URL}/users`);
        const users = await res.json();
        const user = users.find((u) => u.id === Number(id));
        if (!user) return;

        const [first, ...rest] = user.full_name.split(" ");

        setFormData({
          first_name: first || "",
          last_name: rest.join(" ") || "",
          email: user.email || "",
          phone: user.phone || "",
          employee_id: user.employee_id || "",
          role: user.role || "",
        });
      } catch (err) {
        console.error(err);
      }
    };

    fetchUser();
  }, [id]);

  // REDIRECT ON SUCCESS
  useEffect(() => {
    if (actionSuccess) {
      dispatch(clearActionState());
      router.push("/usermanagement");
    }
  }, [actionSuccess, dispatch, router]);

  useEffect(() => {
    if (error) alert(error);
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

  // HANDLE UPDATE
  const handleUpdate = async (e) => {
    e.preventDefault();

    if (
      !formData.email ||
      !formData.phone ||
      !formData.role
    ) {
      setLocalError("All fields are required");
      return;
    }

    try {
      const updatedData = {
        full_name: `${formData.first_name} ${formData.last_name}`,
        email: formData.email,
        phone: formData.phone,
        role: formData.role,
        ...(password && { password }),
      };

      await updateUserAPI(id, updatedData);
      router.push("/usermanagement");
    } catch (err) {
      console.error(err);
      alert("Update failed");
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.wrapper}>
        {/* HEADER */}
        <div className={styles.content}>
          <div className={styles.header}>
            <div>
              <h1>Edit Employee Account</h1>
              <p>Update Employee Details</p>
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
                <label>First Name</label>
                <input value={formData.first_name} disabled />
              </div>

              <div className={styles.formGroup}>
                <label>Last Name</label>
                <input value={formData.last_name} disabled />
              </div>

              <div className={styles.formGroup}>
                <label>Email Address <span>*</span></label>
                <input
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                />
              </div>

              <div className={styles.formGroup}>
                <label>Mobile Number <span>*</span></label>
                <input
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                />
              </div>

              <div className={`${styles.formGroup} ${styles.full}`}>
                <label>Employee ID</label>
                <input value={formData.employee_id} disabled />
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
                <select
                  name="role"
                  value={formData.role}
                  onChange={handleChange}
                >
                  <option value="">Select user role</option>
                  {roles.map((r) => (
                    <option key={r.id}>{r.role_name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* ACCOUNT */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <FaLock />
              <span>Account</span>
            </div>

            <div className={styles.grid}>
              <div className={styles.passwordField}>
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="New Password"
                  onChange={(e) => setPassword(e.target.value)}
                />
                {showPassword ? (
                  <FaEyeSlash onClick={() => setShowPassword(false)} />
                ) : (
                  <FaEye onClick={() => setShowPassword(true)} />
                )}
              </div>
            </div>

            {/* PASSWORD VALIDATION */}
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
        <button onClick={() => router.push("/usermanagement")}>Cancel</button>
        <button onClick={handleUpdate} className={styles.primary}>
          <HiPencil />
          Update User
        </button>
      </div>
    </div>
  );
}
