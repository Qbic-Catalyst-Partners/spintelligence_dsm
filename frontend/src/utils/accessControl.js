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

// Any user with a recognized L1-L5 hierarchy level has some ticketing view
// (L1 operator board, L2-L5 escalation dashboards) - used to gate whether
// the "Ticketing System" nav entry shows at all, since that used to only
// check isFullAccessUser/isSupervisorNavUser (a leftover from before the
// hierarchy levels existed) and hid the link for plain L1-L5 accounts.
export const hasHierarchyLevel = (user) => ["L1", "L2", "L3", "L4", "L5"].includes(getUserLevelKey(user));

// Levels: L1 entry operator, L2 supervisor (no role in approvals - moved to
// L4), L3 sub manager (no role in approvals), L4 Quality/Department Head
// (approves WC and PP ids), L5 Admin/MD (unrestricted - this is what L3
// used to be responsible for). Gates visibility of the WC/PP Approvals
// pages in general; each page's own backend endpoint further scopes what
// an L4 vs L5 actually sees.
export const isWheelChangeApproverUser = (user) =>
  isFullAccessUser(user) || ["L4", "L5"].includes(getUserLevelKey(user));

export const isPpApproverUser = (user) =>
  isFullAccessUser(user) || ["L4", "L5"].includes(getUserLevelKey(user));

// L5 is the super-admin level - the Delegation System is gated on level
// alone, not on the "admin" role string, so L1-L4 never see it regardless
// of their role field.
export const isDelegationManagerUser = (user) => getUserLevelKey(user) === "L5";

export const isDashboardManagerUser = (user) =>
  getRoleKeys(user).some((role) => FULL_ACCESS_ROLE_NAMES.includes(role));

// Employee-Hierarchy-and-Workflow-System_V2.pdf: each level has its own
// ticketing view (L1 operator board, L2-L5 escalation dashboards at
// /supervisordashboard, /l3-ticketing, /l4-ticketing, /l5-ticketing - these
// pages already exist and pass the right `mode` to SupervisorDashboard, but
// nothing routed users to them by their real level, so every L3/L4/L5 user
// was silently falling through to the L2 view instead. Route by level first;
// only fall back to the legacy full-access/supervisor-employee-id check for
// accounts that don't have a level set at all.
const LEVEL_TICKETING_ROUTES = {
  L1: "/operator",
  L2: "/supervisordashboard",
  L3: "/l3-ticketing",
  L4: "/l4-ticketing",
  L5: "/l5-ticketing",
};

const LEVEL_TICKETING_LABELS = {
  L1: "L1 Ticketing System",
  L2: "L2 Ticketing System",
  L3: "L3 Ticketing System",
  L4: "L4 Ticketing System",
  L5: "L5 Ticketing System",
};

export const getDefaultTicketingRoute = (user) => {
  const levelRoute = LEVEL_TICKETING_ROUTES[getUserLevelKey(user)];
  if (levelRoute) return levelRoute;
  return isFullAccessUser(user) || isSupervisorNavUser(user) ? "/supervisordashboard" : "/operator";
};

export const getDefaultTicketingLabel = (user) => {
  const levelLabel = LEVEL_TICKETING_LABELS[getUserLevelKey(user)];
  if (levelLabel) return levelLabel;
  return isFullAccessUser(user) || isSupervisorNavUser(user) ? "L2 Ticketing System" : "L1 Ticketing System";
};

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
