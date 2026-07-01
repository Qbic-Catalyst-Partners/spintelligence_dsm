import { isFullAccessUser } from "@/utils/accessControl";

const normalizeScreenKey = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/%/g, " percent ")
    .replace(/-/g, " ")
    .replace(/_/g, " ")
    .replace(/[^a-z0-9 ]+/g, "")
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
    const compactScreenKey = screenKey.replace(/\s+/g, "");

    return matchers.some((matcher) => {
      const compactMatcher = matcher.replace(/\s+/g, "");
      return (
        matcher === screenKey ||
        matcher.includes(screenKey) ||
        screenKey.includes(matcher) ||
        compactMatcher === compactScreenKey ||
        compactMatcher.includes(compactScreenKey) ||
        compactScreenKey.includes(compactMatcher)
      );
    });
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
  if (!user && !Array.isArray(accessByDepartment)) {
    return fallbackCount;
  }

  if (isFullAccessUser(user)) {
    return fallbackCount;
  }

  const departmentEntry = getDepartmentAccessEntry(accessByDepartment, departmentName);
  const screens = Array.isArray(departmentEntry?.screens) ? departmentEntry.screens : [];
  return screens.length;
};
