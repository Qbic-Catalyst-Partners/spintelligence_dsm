import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { useDispatch, useSelector } from "react-redux";
import { FaInfoCircle } from "react-icons/fa";
import styles from "../../styles/createrole.module.css";
import { fetchScreens, createRole } from "../../store/slices/rolesSlice";

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

  const handleScreenChange = (id) => {
    if (selectedScreens.includes(id)) {
      setSelectedScreens(selectedScreens.filter((screenId) => screenId !== id));
    } else {
      setSelectedScreens([...selectedScreens, id]);
    }
  };

  const handleSelectAll = () => {
    if (selectedScreens.length === screens.length) {
      setSelectedScreens([]);
    } else {
      setSelectedScreens(screens.map((screen) => screen.id));
    }
  };

  const handleCreateRole = async () => {
    const newRole = {
      name: roleName,
      description,
      status: true,
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

  const toTitleCase = (value = "") =>
    value
      .toLowerCase()
      .split(" ")
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");

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
                  {toTitleCase(screen.name)}
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className={styles["rolepage-footer"]}>
          <button
            className={styles["rolepage-btncancel"]}
            onClick={() => router.push("/rolespermission")}
          >
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
