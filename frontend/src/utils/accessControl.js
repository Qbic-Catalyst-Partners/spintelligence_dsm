const normalizeName = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\s+/g, " ")
    .replace(/-/g, " ");

const FULL_ACCESS_ROLE_NAMES = ["admin"].map((value) => normalizeName(value));
const FULL_ACCESS_USER_NAMES = ["fazal"].map((value) => normalizeName(value));

const getEmployeeKey = (user) =>
  normalizeName(user?.employee_id || user?.employeeId || user?.emp_id || "");

const isSupervisorEmployeeKey = (employeeKey) => /^sup\s*0*\d+$/.test(employeeKey);
const isAdminEmployeeKey = (employeeKey) => /^admin\s*0*\d+$/.test(employeeKey);

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
  getRoleKeys(user).some((role) => FULL_ACCESS_ROLE_NAMES.includes(role)) ||
  getNameKeys(user).some((name) => FULL_ACCESS_USER_NAMES.includes(name)) ||
  isAdminEmployeeKey(getEmployeeKey(user));

export const isSupervisorNavUser = (user) =>
  isSupervisorEmployeeKey(getEmployeeKey(user));

export const isSubmittedNotebookManagerUser = (user) =>
  isFullAccessUser(user) || isSupervisorNavUser(user);

const getUserLevelKey = (user) =>
  String(user?.level ?? user?.user_details?.level ?? "").trim().toUpperCase();

// Levels: L1 entry operator, L2 supervisor, L3 sub manager (no role in
// approvals), L4 Quality/Department Head (approves PP ids), L5 Admin/MD
// (unrestricted - this is what L3 used to be responsible for). Gates
// visibility of the WC/PP Approvals pages in general; each page's own
// backend endpoint further scopes what an L2 vs L4 vs L5 actually sees.
export const isWheelChangeApproverUser = (user) =>
  isFullAccessUser(user) || ["L2", "L4", "L5"].includes(getUserLevelKey(user));

export const isPpApproverUser = (user) =>
  isFullAccessUser(user) || ["L4", "L5"].includes(getUserLevelKey(user));

export const isDashboardManagerUser = (user) =>
  getRoleKeys(user).some((role) => FULL_ACCESS_ROLE_NAMES.includes(role));

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
  "/departments/quality-control/wrapping": "Wrapping",
  "/departments/quality-control/individual-card-performance": "Individual Card Performance",
};

export const buildAccessibleDepartmentSet = (accessByDepartment) => {
  const accessList = Array.isArray(accessByDepartment) ? accessByDepartment : [];
  const departmentSet = new Set(
    accessList
      .map((entry) => normalizeName(entry?.department_name))
      .filter(Boolean)
  );

  // A role granted ONLY a "Process Parameter" screen (e.g. "Autoconer - PP",
  // not plain "Autoconer") has a "Process Parameter" bucket but no entry for
  // the department that PP screen actually belongs to — without this, the
  // department's whole route would be blocked even though a PP screen under
  // it was explicitly granted. Mirrors PP_SCREEN_OWNING_DEPARTMENT in
  // screenAccess.js (duplicated, not imported, to avoid a circular import —
  // screenAccess.js already imports from this file).
  const ppEntry = accessList.find(
    (entry) => normalizeName(entry?.department_name) === normalizeName("Process Parameter")
  );
  const ppScreens = Array.isArray(ppEntry?.screens) ? ppEntry.screens : [];
  const ppScreenOwningDepartment = {
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
  ppScreens.forEach((screen) => {
    // normalizeName collapses whitespace BEFORE turning "-" into " ", so
    // "Autoconer - PP" comes out as "autoconer   pp" (extra spaces) rather
    // than a clean single-spaced key — collapse again before the lookup.
    const screenKey = normalizeName(screen?.name).replace(/\s+/g, " ").trim();
    const owningDepartment = ppScreenOwningDepartment[screenKey];
    if (owningDepartment) departmentSet.add(owningDepartment);
  });

  return departmentSet;
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
