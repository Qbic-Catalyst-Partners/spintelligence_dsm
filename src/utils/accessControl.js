const normalizeName = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\s+/g, " ")
    .replace(/-/g, " ");

const FULL_ACCESS_EMPLOYEE_IDS = ["ADMIN001"].map((value) => normalizeName(value));
const FULL_ACCESS_ROLE_NAMES = ["admin"].map((value) => normalizeName(value));
const FULL_ACCESS_USER_NAMES = ["fazal"].map((value) => normalizeName(value));
const DASHBOARD_MANAGER_EMPLOYEE_IDS = ["ADMIN001"].map((value) => normalizeName(value));

const getEmployeeKey = (user) =>
  normalizeName(user?.employee_id || user?.employeeId || user?.emp_id || "");

const isSupervisorEmployeeKey = (employeeKey) => /^sup\s*0*\d+$/.test(employeeKey);

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

const getNameKeys = (user) =>
  [user?.full_name, user?.fullName, user?.name, user?.user_name]
    .map(normalizeName)
    .filter(Boolean);

const isAnonymousDirectAccess = (accessByDepartment, user) =>
  !user && !Array.isArray(accessByDepartment);

export const isFullAccessUser = (user) =>
  (Boolean(getEmployeeKey(user)) && FULL_ACCESS_EMPLOYEE_IDS.includes(getEmployeeKey(user))) ||
  getRoleKeys(user).some((role) => FULL_ACCESS_ROLE_NAMES.includes(role)) ||
  getNameKeys(user).some((name) => FULL_ACCESS_USER_NAMES.includes(name));

export const isSupervisorNavUser = (user) =>
  isSupervisorEmployeeKey(getEmployeeKey(user));

export const isDashboardManagerUser = (user) =>
  Boolean(getEmployeeKey(user)) && DASHBOARD_MANAGER_EMPLOYEE_IDS.includes(getEmployeeKey(user));

export const getDefaultTicketingRoute = (user) =>
  isSupervisorNavUser(user) ? "/supervisordashboard" : "/operator";

export const getDefaultTicketingLabel = (user) =>
  isSupervisorNavUser(user) ? "L2 Ticketing System" : "L1 Ticketing System";

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

export const hasReportAccess = (accessByDepartment, user) =>
  Boolean(user);
