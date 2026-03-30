import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { useDispatch, useSelector } from "react-redux";
import { FaInfoCircle } from "react-icons/fa";
import styles from "../../styles/createrole.module.css";
import { fetchScreens, fetchDepartments, createRole } from "../../store/slices/rolesSlice";
import Header from "../../components/Header";

export default function CreateRole() {
  const router = useRouter();
  const dispatch = useDispatch();
  const { role } = router.query; 

  const { screens, departments, loading, error } = useSelector(state => state.roles);

  const [deptSearch, setDeptSearch] = useState("");
  const [showDeptDropdown, setShowDeptDropdown] = useState(false);
  const [selectedDepartments, setSelectedDepartments] = useState([]);
  const [selectedScreens, setSelectedScreens] = useState([]);
  const [roleName, setRoleName] = useState("");
  const [description, setDescription] = useState("");

  const dropdownRef = useRef(null);

  /* ================= FETCH ================= */
  useEffect(() => {
    dispatch(fetchScreens());
    dispatch(fetchDepartments());
  }, [dispatch]);

  /* ================= LOGIC ================= */
  const filteredDepartments = departments.filter((dept) =>
    dept.name.toLowerCase().includes(deptSearch.toLowerCase())
  );

  const toggleDepartment = (dept) => {
    if (selectedDepartments.find((d) => d.id === dept.id)) {
      setSelectedDepartments(selectedDepartments.filter((d) => d.id !== dept.id));
    } else {
      setSelectedDepartments([...selectedDepartments, dept]);
    }
    setShowDeptDropdown(false);
  };

  const handleScreenChange = (id) => {
    if (selectedScreens.includes(id)) {
      setSelectedScreens(selectedScreens.filter((i) => i !== id));
    } else {
      setSelectedScreens([...selectedScreens, id]);
    }
  };

  const handleSelectAll = () => {
    if (selectedScreens.length === screens.length) {
      setSelectedScreens([]);
    } else {
      setSelectedScreens(screens.map((s) => s.id));
    }
  };

  const handleCreateRole = async () => {
    const newRole = {
      name: roleName,
      description,
      status: true,
      department_ids: selectedDepartments.map((d) => d.id),
      screen_ids: selectedScreens,
    };

    if (!newRole.name) {
      alert("Role name is required");
      return;
    }

    try {
      await dispatch(createRole(newRole)).unwrap();
      router.push("/rolespermission");
    } catch (error) {
      console.error("CREATE ROLE ERROR:", error.message);
      alert(error.message);
    }
  };

  /* ================= OUTSIDE CLICK ================= */
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDeptDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);



  /* ================= UI ================= */
  return (
    <div className={styles["role"]}>
      {/* HEADER */}
      <Header navLinks={[
        { href: "/", label: "Home" },
        { href: "/usermanagement", label: "User Management" },
        { href: "/rolespermissions", label: "Roles & Permissions" }
    ]}/>

      <div className={styles["rolepage-wrapper"]}>

        <div className={styles["rolepage-cardswrap"]}>
          {/* CARD 1 */}
          <div className={styles["rolepage-cardinfo"]}>
            <div className={styles["rolepage-cardtitle"]}>
              <FaInfoCircle className={styles["rolepage-infoicon"]} />
              Role Information
            </div>
            <div className={styles["rolepage-formgrid"]}>
              <div className={styles["rolepage-field"]}>
                <label>Role Name *</label>
                <input
                  value={roleName}
                  onChange={(e) => setRoleName(e.target.value)}
                  placeholder="Enter role name"
                />
              </div>
              <div className={styles["rolepage-field"]}>
                <label>Description</label>
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe responsibilities"
                />
              </div>
            </div>
          </div>

          {/* CARD 2 */}
          <div className={styles["rolepage-cardscreen"]}>
            <div className={styles["rolepage-screenheader"]}>
              <div className={styles["rolepage-screentitle"]}>
                <img src="/Screen.png" />
                Screen Access
              </div>
              <div className={styles["rolepage-selectallrow"]}>
                <input
                  type="checkbox"
                  className={styles["checkbox"]}
                  checked={selectedScreens.length === screens.length}
                  onChange={handleSelectAll}
                />
                <span>Select all Screens</span>
              </div>
            </div>

            <div className={styles["rolepage-checkboxgrid"]}>
              {screens.map((screen) => (
                <label className={styles["rolepage-checkboxcard"]} key={screen.id}>
                  <input
                    type="checkbox"
                    className={styles["checkbox"]}
                    checked={selectedScreens.includes(screen.id)}
                    onChange={() => handleScreenChange(screen.id)}
                  />
                  {screen.name}
                </label>
              ))}
            </div>
          </div>

          {/* CARD 3 */}
          <div className={styles["rolepage-carddept"]}>
            <div className={styles["rolepage-depttitle"]}>
              <img src="/Dept.png" />
              Department Access
            </div>
            <label className={styles["rolepage-sublabel"]}>Select Accessible Departments</label>
            <div className={styles["rolepage-dropdownwrap"]} ref={dropdownRef}>
              <div className={styles["rolepage-inputwrap"]}>
                <input
                  className={styles["rolepage-searchinput"]}
                  placeholder="Search and select departments..."
                  value={
                    deptSearch.length > 0
                      ? deptSearch
                      : selectedDepartments.map((d) => d.name).join(", ")
                  }
                  onChange={(e) => setDeptSearch(e.target.value)}
                  onClick={() => setShowDeptDropdown(true)}
                />
                <span
                  className={styles["rolepage-dropdownicon"]}
                  onClick={() => setShowDeptDropdown(!showDeptDropdown)}
                >
                  ▼
                </span>
              </div>

              {showDeptDropdown && (
                <div className={styles["rolepage-dropdownlist"]}>
                  {filteredDepartments.map((dept) => (
                    <div
                      key={dept.id}
                      className={styles["rolepage-dropdownitem"]}
                      onClick={() => toggleDepartment(dept)}
                    >
                      <input
                        type="checkbox"
                        className={styles["checkbox"]}
                        checked={selectedDepartments.some((d) => d.id === dept.id)}
                        readOnly
                      />
                      {dept.name}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <div className={styles["rolepage-footer"]}>
          <button className={styles["rolepage-btncancel"]} onClick={() => router.push("/rolespermission")}>
            Cancel
          </button>
          <button className={styles["rolepage-btnsave"]} onClick={handleCreateRole}>
            Create Role
          </button>
        </div>
      </div>
    </div>
  );
}