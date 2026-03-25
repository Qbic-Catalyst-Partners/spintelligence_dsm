import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { FaInfoCircle } from "react-icons/fa";
import styles from "../../styles/createrole.module.css";
import api from "../../apis/apiConfig";

export default function CreateRole() {
  const router = useRouter();
  const { role } = router.query; // role data passed via query or state

  const [deptSearch, setDeptSearch] = useState("");
  const [showDeptDropdown, setShowDeptDropdown] = useState(false);
  const [departments, setDepartments] = useState([]);
  const [selectedDepartments, setSelectedDepartments] = useState([]);
  const [screens, setScreens] = useState([]);
  const [selectedScreens, setSelectedScreens] = useState([]);
  const [roleName, setRoleName] = useState("");
  const [description, setDescription] = useState("");

  const dropdownRef = useRef(null);

  /* ================= FETCH ================= */
  useEffect(() => {
    fetchScreens();
    fetchDepartments();
  }, []);

  /* ================= PREFILL ================= */
  useEffect(() => {
    if (role) {
      const parsedRole = typeof role === "string" ? JSON.parse(role) : role;
      setRoleName(parsedRole.name || "");
      setDescription(parsedRole.description || "");
      setSelectedScreens(parsedRole.screens?.map((s) => s.id) || []);
      setSelectedDepartments(parsedRole.departments || []);
    }
  }, [role]);

  const fetchScreens = async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/roles/screens`);
      const data = await res.json();
      setScreens(data);
    } catch (error) {
      console.error("Error fetching screens", error);
    }
  };

  const fetchDepartments = async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/roles/departments`);
      const data = await res.json();
      setDepartments(data);
    } catch (error) {
      console.error("Error fetching departments", error);
    }
  };

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
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/roles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newRole),
      });

      const data = await res.json();

      console.log("STATUS:", res.status);
      console.log("RESPONSE:", data);
      console.log("PAYLOAD:", newRole);

      if (!res.ok) {
        throw new Error(data.error || "Failed to create role");
      }

      console.log(" Role created");

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
      <header className={styles.topNavbar}>
        <div className={styles.navLeft}>
          <img src="/spintel.svg" alt="spintel" />

          <nav className={styles.navLinks}>
            <Link href="/">Home</Link>
            <Link href="/usermanagement">User Management</Link>
            <Link href="/rolespermission">Roles & Permissions</Link>
          </nav>
        </div>

        <img src="/logo.png" alt="logo" className={styles["logo"]} />

      </header>

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