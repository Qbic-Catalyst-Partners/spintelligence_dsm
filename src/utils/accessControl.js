const normalizeName = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\s+/g, " ")
    .replace(/-/g, " ");

const FULL_ACCESS_EMPLOYEE_IDS = ["ADMIN001"].map((value) => normalizeName(value));
  
const FULL_ACCESS_ROLE_NAMES = ["admin", "administrator", "super admin", "super administrator"].map((value) =>
  normalizeName(value)
);
const SUPERVISOR_NAV_EMPLOYEE_IDS = ["sup001"].map((value) => normalizeName(value));

const getEmployeeKey = (user) =>
  normalizeName(user?.employee_id || user?.employeeId || user?.emp_id || "");

const getRoleKeys = (user) =>
  [
    user?.role,
    user?.role_name,
    user?.roleName,
    user?.role_title,
    user?.roleTitle,
    user?.role?.name,
    user?.role?.role_name,
  ]
    .map(normalizeName)
    .filter(Boolean);

const isAnonymousDirectAccess = (accessByDepartment, user) =>
  !user && !Array.isArray(accessByDepartment);

export const isFullAccessUser = (user) =>
  (Boolean(getEmployeeKey(user)) && FULL_ACCESS_EMPLOYEE_IDS.includes(getEmployeeKey(user))) ||
  getRoleKeys(user).some((role) => FULL_ACCESS_ROLE_NAMES.includes(role));

export const isSupervisorNavUser = (user) =>
  Boolean(getEmployeeKey(user)) && SUPERVISOR_NAV_EMPLOYEE_IDS.includes(getEmployeeKey(user));

export const routeDepartmentMap = {
  "/mixing": "Mixing",
  "/blowroom": "Blow Room",
  "/carding": "Carding",
  "/comber": "Comber",
  "/draw-frame": "Draw Frame",
  "/simplex": "Simplex",
  "/spinning": "Spinning",
  "/autoconer": "Autoconer",
};

export const buildAccessibleDepartmentSet = (accessByDepartment) => {
  const accessList = Array.isArray(accessByDepartment) ? accessByDepartment : [];

  return new Set(
    accessList
      .map((entry) => normalizeName(entry?.department_name))
      .filter(Boolean)
  );
};

export const hasSubDepartmentAccess = (accessByDepartment, subDepartmentName, user) =>
  isAnonymousDirectAccess(accessByDepartment, user) ||
  isFullAccessUser(user) ||
  buildAccessibleDepartmentSet(accessByDepartment).has(normalizeName(subDepartmentName));

export const hasRouteAccess = (pathname, accessByDepartment, user) => {
  if (isAnonymousDirectAccess(accessByDepartment, user)) {
    return true;
  }

  if (isFullAccessUser(user)) {
    return true;
  }

  const requiredDepartment = routeDepartmentMap[pathname];

  if (!requiredDepartment) {
    return true;
  }

  return hasSubDepartmentAccess(accessByDepartment, requiredDepartment, user);
};

export const hasAnyQualityControlAccess = (accessByDepartment, user) =>
  isAnonymousDirectAccess(accessByDepartment, user) ||
  isFullAccessUser(user) ||
  Array.from(buildAccessibleDepartmentSet(accessByDepartment)).length > 0;
