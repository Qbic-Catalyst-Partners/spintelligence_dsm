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

  if (isFullAccessUser(user)) {
    return options.map((option) => withDisplayName(option));
  }

  const departmentEntry = getDepartmentAccessEntry(accessByDepartment, departmentName);
  const screens = Array.isArray(departmentEntry?.screens) ? departmentEntry.screens : [];

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
  if (isFullAccessUser(user)) {
    return fallbackCount;
  }

  const departmentEntry = getDepartmentAccessEntry(accessByDepartment, departmentName);
  const screens = Array.isArray(departmentEntry?.screens) ? departmentEntry.screens : [];
  return screens.length;
};
