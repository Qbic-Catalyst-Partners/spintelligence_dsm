import { useMemo, useState } from "react";
import { FiChevronRight } from "react-icons/fi";
import styles from "@/styles/screenAccessPanel.module.css";

const UNASSIGNED_DEPARTMENT = "Unassigned";

const DEPARTMENT_ORDER = [
  "Mixing",
  "Blow Room",
  "Carding",
  "Comber",
  "Draw Frame",
  "Simplex",
  "Spinning",
  "Autoconer",
  "Wrapping",
  "Individual Card Performance",
  "Process Parameter",
];

const normalizeDepartmentName = (name) =>
  String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");

const DEPARTMENT_ORDER_LOOKUP = new Map(
  DEPARTMENT_ORDER.map((name, index) => [normalizeDepartmentName(name), index])
);

const getDepartmentSortIndex = (name) => {
  const index = DEPARTMENT_ORDER_LOOKUP.get(normalizeDepartmentName(name));
  return index === undefined ? DEPARTMENT_ORDER.length : index;
};

const HARDCODED_UNREGISTERED_PREFIX = "__unregistered__:";

const normalizeScreenName = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/%/g, " percent ")
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ");

// Full notebook-type list per department. Shown for visibility even when a
// screen isn't (yet) registered in the backend for this department; screens
// that DO match a real backend screen (by name) use the real id so they can
// be saved. Unmatched ones fall back to a synthetic id and are excluded from
// the save payload via isUnregisteredScreenId.
const HARDCODED_DEPARTMENTS = [
  {
    name: "Mixing",
    screens: [
      "Cotton HVI Data Entry",
      "AFIS Data Entry",
      "AFIS-6 Cotton Data Entry",
      "AFIS-6 MMF Data Entry",
      "Fibre Data Entry",
      "Moisture Data Entry",
      "Openness Data Entry",
    ],
  },
  {
    name: "Blow Room",
    screens: ["Blow Room Sync", "BR Waste Study Entry", "Drop Test Data Entry", "B/R CV1M Data Entry Within Lap", "B/R Between Lap CV%"],
  },
  {
    name: "Carding",
    screens: [
      "Between & Within Card Data Entry",
      "Thick place & CV",
      "Carding NRE%",
      "Nati Data Entry",
      "U% Data Entry",
      "Card DFK Data",
      "WheelChange",
      "Individual Card Waste Study",
    ],
  },
  {
    name: "Individual Card Performance",
    screens: ["Individual Card performance Data"],
  },
  {
    name: "Comber",
    screens: ["Ribbon Lap CV1M Data Entry", "Nati Data Entry", "U% Data Entry", "Comber Nolis %"],
  },
  {
    name: "Draw Frame",
    screens: [
      "1 Yard / Half Yard CV Entry",
      "Draw Frame Cots Data Entry",
      "U% Data Entry",
      "A%",
      "Wheel Change",
    ],
  },
  {
    name: "Simplex",
    screens: [
      "SMXCots Change Data Entry",
      "SMX Breaks Study Report",
      "U% Data Entry",
      "Wheel Change",
      "Stretch %",
    ],
  },
  {
    name: "Spinning",
    screens: [
      "COTS Checking",
      "Count Change",
      "Ring Frame Log Book",
      "Speed Checking",
      "Bottom Apron Checking",
      "Lycra out of Centering",
      "RSM & Lycrasensor Checking Online",
      "RSM & Lycrasensor Checking Offline",
      "Wheel Change",
    ],
  },
  {
    name: "Autoconer",
    screens: [
      "Rewinding Study",
      "Cone Density",
      "Cone Packing Audit",
      "Lycra% Checking",
      "Count Wise Cuts Record",
      "Splice Strength",
      "Drum wise Appearance",
      "CSP Parameter Entries",
      "U% Parameter Entries",
    ],
  },
  {
    name: "Process Parameter",
    screens: [
      "Mixing - PP",
      "Blow Room - PP",
      "Carding - PP",
      "Simplex - PP",
      "Spinning - PP",
      "Autoconer - PP",
      "PP - Breaker Drawing",
      "PP - Finisher Drawing",
      "PP - Autoconer Q2",
      "PP - Autoconer Q3",
    ],
  },
];

export const isUnregisteredScreenId = (screenId) =>
  String(screenId).startsWith(HARDCODED_UNREGISTERED_PREFIX);

// Group screens by the backend's department_id/department_name. Each screen keeps
// its real unique id, so duplicate display names across departments (e.g. "U%",
// "Wheel Change") never collide or toggle together.
const buildDepartmentGroups = (screens) => {
  const availableScreens = Array.isArray(screens) ? screens : [];
  const groupsByKey = new Map();

  availableScreens.forEach((screen) => {
    const departmentId = screen.department_id ?? null;
    const departmentName = screen.department_name || UNASSIGNED_DEPARTMENT;
    const key = departmentId != null ? `id:${departmentId}` : `name:${departmentName}`;

    if (!groupsByKey.has(key)) {
      groupsByKey.set(key, {
        departmentId,
        name: departmentName,
        screens: [],
      });
    }

    groupsByKey.get(key).screens.push({ id: screen.id, name: screen.name });
  });

  const backendGroups = Array.from(groupsByKey.values()).filter((group) => group.screens.length > 0);
  const backendGroupByKey = new Map(
    backendGroups.map((group) => [normalizeDepartmentName(group.name), group])
  );
  const consumedBackendIds = new Set();

  const mergedGroups = HARDCODED_DEPARTMENTS.map((department) => {
    const backendGroup = backendGroupByKey.get(normalizeDepartmentName(department.name));
    const backendScreens = backendGroup?.screens || [];

    const screens = department.screens.map((screenName) => {
      const key = normalizeScreenName(screenName);
      const match = backendScreens.find(
        (screen) => !consumedBackendIds.has(String(screen.id)) && normalizeScreenName(screen.name) === key
      );
      if (match) {
        consumedBackendIds.add(String(match.id));
        return { id: match.id, name: screenName };
      }
      return { id: `${HARDCODED_UNREGISTERED_PREFIX}${department.name}:${screenName}`, name: screenName };
    });

    return {
      departmentId: backendGroup?.departmentId ?? null,
      name: department.name,
      screens,
    };
  });

  const hardcodedKeys = new Set(HARDCODED_DEPARTMENTS.map((department) => normalizeDepartmentName(department.name)));
  const extraBackendGroups = backendGroups.filter(
    (group) => !hardcodedKeys.has(normalizeDepartmentName(group.name))
  );

  return [...mergedGroups, ...extraBackendGroups]
    .filter((group) => group.screens.length > 0)
    .sort((a, b) => getDepartmentSortIndex(a.name) - getDepartmentSortIndex(b.name));
};

export default function ScreenAccessPanel({ screens, selectedScreenIds, onChange }) {
  const departmentGroups = useMemo(() => buildDepartmentGroups(screens), [screens]);
  const [activeDepartment, setActiveDepartment] = useState(departmentGroups[0]?.name || "");

  const activeGroup =
    departmentGroups.find((group) => group.name === activeDepartment) || departmentGroups[0];

  const selectedSet = useMemo(
    () => new Set((selectedScreenIds || []).map(String)),
    [selectedScreenIds]
  );

  const isDepartmentFullySelected = (group) =>
    group.screens.length > 0 && group.screens.every((screen) => selectedSet.has(String(screen.id)));
  const isDepartmentPartiallySelected = (group) =>
    !isDepartmentFullySelected(group) && group.screens.some((screen) => selectedSet.has(String(screen.id)));

  const toggleScreen = (screenId) => {
    if (selectedSet.has(String(screenId))) {
      onChange(selectedScreenIds.filter((id) => String(id) !== String(screenId)));
    } else {
      onChange([...selectedScreenIds, screenId]);
    }
  };

  const toggleDepartment = (group) => {
    const groupScreenIds = group.screens.map((screen) => screen.id);
    const groupScreenIdSet = new Set(groupScreenIds.map(String));
    if (isDepartmentFullySelected(group)) {
      onChange(selectedScreenIds.filter((id) => !groupScreenIdSet.has(String(id))));
    } else {
      const merged = [...selectedScreenIds];
      groupScreenIds.forEach((screenId) => {
        if (!merged.some((id) => String(id) === String(screenId))) {
          merged.push(screenId);
        }
      });
      onChange(merged);
    }
  };

  if (!departmentGroups.length) {
    return null;
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.departmentPanel}>
        {departmentGroups.map((group) => (
          <label
            key={group.name}
            className={`${styles.departmentRow} ${
              activeGroup?.name === group.name ? styles.departmentRowActive : ""
            }`}
          >
            <input
              type="checkbox"
              className={styles.checkbox}
              checked={isDepartmentFullySelected(group)}
              ref={(el) => {
                if (el) el.indeterminate = isDepartmentPartiallySelected(group);
              }}
              onChange={() => toggleDepartment(group)}
            />
            <span
              className={styles.departmentName}
              onClick={() => setActiveDepartment(group.name)}
            >
              {group.name}
            </span>
            <button
              type="button"
              className={styles.departmentArrow}
              aria-label={`View ${group.name} screens`}
              onClick={() => setActiveDepartment(group.name)}
            >
              <FiChevronRight />
            </button>
          </label>
        ))}
      </div>

      <div className={styles.screenPanel}>
        <div className={styles.screenPanelTitle}>{activeGroup?.name} Department</div>
        {activeGroup?.screens.map((screen) => (
          <label key={screen.id} className={styles.screenRow}>
            <input
              type="checkbox"
              className={styles.checkbox}
              checked={selectedSet.has(String(screen.id))}
              onChange={() => toggleScreen(screen.id)}
            />
            <span>{screen.name}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
