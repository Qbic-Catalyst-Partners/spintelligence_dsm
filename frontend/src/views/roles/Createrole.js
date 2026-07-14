import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { useDispatch, useSelector } from "react-redux";
import { FaInfoCircle } from "react-icons/fa";
import styles from "../../styles/createrole.module.css";
import { fetchScreens, createRole } from "../../store/slices/rolesSlice";
import ScreenAccessPanel, { isUnregisteredScreenId } from "@/components/ScreenAccessPanel";

export default function CreateRole() {
  const router = useRouter();
  const dispatch = useDispatch();
  const { screens } = useSelector((state) => state.roles);

  const [selectedScreens, setSelectedScreens] = useState([]);
  const [roleName, setRoleName] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    dispatch(fetchScreens());
  }, [dispatch]);

  const handleSelectAll = () => {
    if (selectedScreens.length === screens.length) {
      setSelectedScreens([]);
    } else {
      setSelectedScreens(screens.map((screen) => screen.id));
    }
  };

  const handleCreateRole = async () => {
    const screenIds = selectedScreens.filter((id) => !isUnregisteredScreenId(id));

    // Derive the departments from the selected screens' backend department_id.
    const selectedSet = new Set(screenIds.map(String));
    const departmentIds = [
      ...new Set(
        screens
          .filter((screen) => selectedSet.has(String(screen.id)))
          .map((screen) => screen.department_id)
          .filter((id) => id != null)
      ),
    ];

    const newRole = {
      name: roleName,
      description,
      status: true,
      screen_ids: screenIds,
      department_ids: departmentIds,
    };

    if (!newRole.name) {
      alert("Role name is required");
      return;
    }

    if (!newRole.screen_ids.length) {
      alert("Please select at least one screen");
      return;
    }

    if (!newRole.department_ids.length) {
      alert("Selected screens are not linked to any department");
      return;
    }

    try {
      await dispatch(createRole(newRole)).unwrap();
      router.push("/rolespermission");
    } catch (error) {
      const message =
        typeof error === "string" ? error : error?.message || "Failed to create role.";
      console.error("CREATE ROLE ERROR:", message);
      alert(message);
    }
  };

  return (
    <div className={styles["role"]}>
      <div className={styles["rolepage-wrapper"]}>
        <div className={styles["rolepage-header"]}>
          <button
            type="button"
            className={styles["rolepage-backbtn"]}
            onClick={() => {
              if (window.history.length > 1) router.back();
              else router.push("/rolespermission");
            }}
          >
            ← Back
          </button>
          <h1>Create Role</h1>
        </div>
        <div className={styles["rolepage-cardswrap"]}>
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

          <div className={styles["rolepage-cardscreen"]}>
            <div className={`${styles["rolepage-screenheader"]} ${styles["rolepage-accessbar"]}`}>
              <div className={`${styles["rolepage-screentitle"]} ${styles["rolepage-accesslabel"]}`}>
                <img src="/Screen.png" />
                Screen Access
              </div>
              <div className={styles["rolepage-allaccessrow"]}>
                <input
                  type="checkbox"
                  className={styles["checkbox"]}
                  checked={selectedScreens.length === screens.length}
                  onChange={handleSelectAll}
                />
                <span>Select all Screens</span>
              </div>
            </div>

            <ScreenAccessPanel
              screens={screens}
              selectedScreenIds={selectedScreens}
              onChange={setSelectedScreens}
            />
          </div>
        </div>

        <div className={styles["rolepage-footer"]}>
          <button
            className={styles["rolepage-btncancel"]}
            onClick={() => router.push("/rolespermission")}
          >
            Cancel
          </button>
          <button
            className={`${styles["rolepage-btnsave"]} create-role-submit-button`}
            onClick={handleCreateRole}
          >
            Create Role
          </button>
        </div>
      </div>
    </div>
  );
}
