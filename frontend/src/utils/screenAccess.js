import { isFullAccessUser } from "@/utils/accessControl";

const normalizeScreenKey = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/%/g, " percent ")
    .replace(/-/g, " ")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ");

const getDepartmentAccessEntry = (accessByDepartment, departmentName) => {
  const departmentKey = normalizeScreenKey(departmentName);
  const accessList = Array.isArray(accessByDepartment) ? accessByDepartment : [];

  return (
    accessList.find(
      (entry) => normalizeScreenKey(entry?.department_name) === departmentKey
    ) || null
  );
};

// "Process Parameter" (PP) screens — e.g. "Autoconer - PP", "PP - Autoconer Q2",
// "PP - Breaker Drawing" — are registered in the backend under their own
// department_id/department_name ("Process Parameter"), separate from the
// department they functionally belong to (Autoconer, Draw Frame, ...). A role
// granted only "Autoconer - PP" access (not plain "Autoconer") ends up with an
// accessByDepartment that has a "Process Parameter" entry but no "Autoconer"
// entry — so filtering Autoconer's own type list only against the "Autoconer"
// bucket would silently drop the PP-named type option the role WAS granted.
// Mirrors ScreenAccessPanel.jsx's HARDCODED_DEPARTMENTS "Process Parameter"
// group — each PP screen name maps to exactly the one department it belongs
// to, so a grant never leaks into an unrelated department's type list.
const PROCESS_PARAMETER_DEPARTMENT_NAME = "Process Parameter";

const PP_SCREEN_OWNING_DEPARTMENT = {
  "mixing pp": "mixing",
  "blow room pp": "blow room",
  "carding pp": "carding",
  "simplex pp": "simplex",
  "spinning pp": "spinning",
  "autoconer pp": "autoconer",
  "pp breaker drawing": "draw frame",
  "pp finisher drawing": "draw frame",
  "pp autoconer q2": "autoconer",
  "pp autoconer q3": "autoconer",
};

const getMatchCandidateScreens = (accessByDepartment, departmentName) => {
  const ownEntry = getDepartmentAccessEntry(accessByDepartment, departmentName);
  const ownScreens = Array.isArray(ownEntry?.screens) ? ownEntry.screens : [];

  if (normalizeScreenKey(departmentName) === normalizeScreenKey(PROCESS_PARAMETER_DEPARTMENT_NAME)) {
    return ownScreens;
  }

  const ppEntry = getDepartmentAccessEntry(accessByDepartment, PROCESS_PARAMETER_DEPARTMENT_NAME);
  const ppScreens = Array.isArray(ppEntry?.screens) ? ppEntry.screens : [];
  const departmentKey = normalizeScreenKey(departmentName);
  const ownedPpScreens = ppScreens.filter(
    (screen) => PP_SCREEN_OWNING_DEPARTMENT[normalizeScreenKey(screen?.name)] === departmentKey
  );

  return ownedPpScreens.length ? [...ownScreens, ...ownedPpScreens] : ownScreens;
};

const getOptionMatchers = (option) => {
  const aliases = Array.isArray(option?.aliases) ? option.aliases : [];
  return [option?.name, ...aliases].map(normalizeScreenKey).filter(Boolean);
};

const normalizeScreenId = (value) => String(value ?? "").trim();

const findMatchingScreen = (option, screens) => {
  const optionId = normalizeScreenId(option?.id);
  const idMatch = optionId
    ? screens.find((screen) => normalizeScreenId(screen?.id) === optionId)
    : null;

  if (idMatch) {
    return idMatch;
  }

  const matchers = getOptionMatchers(option);

  return screens.find((screen) => {
    const screenKey = normalizeScreenKey(screen?.name);

    return matchers.some(
      (matcher) =>
        matcher === screenKey ||
        matcher.includes(screenKey) ||
        screenKey.includes(matcher)
    );
  });
};

export const filterOptionsByDepartmentAccess = (
  options,
  accessByDepartment,
  user,
  departmentName
) => {
  const withDisplayName = (option, matchedScreen = null) => ({
    ...option,
    accessScreenId: normalizeScreenId(matchedScreen?.id) || normalizeScreenId(option?.id),
    displayName: matchedScreen?.name || option?.name || "",
  });

  if (!user && !Array.isArray(accessByDepartment)) {
    return options.map((option) => withDisplayName(option));
  }

  if (isFullAccessUser(user)) {
    return options.map((option) => withDisplayName(option));
  }

  const screens = getMatchCandidateScreens(accessByDepartment, departmentName);

  return options
    .map((option) => {
      const matchedScreen = findMatchingScreen(option, screens);
      return matchedScreen ? withDisplayName(option, matchedScreen) : null;
    })
    .filter(Boolean);
};

export const getDepartmentScreenCount = (
  accessByDepartment,
  user,
  departmentName,
  fallbackCount = 0
) => {
  if (!user && !Array.isArray(accessByDepartment)) {
    return fallbackCount;
  }

  if (isFullAccessUser(user)) {
    return fallbackCount;
  }

  return getMatchCandidateScreens(accessByDepartment, departmentName).length;
};
