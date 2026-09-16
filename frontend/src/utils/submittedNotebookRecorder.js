import { createSubmittedNotebookApi } from "@/apis/submittedNotebooksApi";
import { fetchNotebookAcknowledgementThresholdsAPI } from "@/apis/notebookAcknowledgementThresholdApi";

// Slugifying "Lap Weight (KGs)" down to a key like lap_weight_kgs is one-way - reconstructing a
// display label from that key later can only guess ("Lap Weight Kgs"), losing the exact
// punctuation/casing the entry screen actually shows. Carrying the original label alongside the
// slug lets the submitted-notebook view show the field exactly as it appears on screen, for any
// notebook that goes through this generic (non-getPayload) capture path.
export const previewItemsToPayload = (items = []) => {
  const payload = {};
  const fieldLabels = {};

  items.forEach((item) => {
    if (!item || typeof item !== "object") return;
    const rawKey = String(item.key || item.name || item.label || "").trim();
    if (!rawKey) return;
    const slug = rawKey.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    payload[slug] = item.value;
    if (item.label) fieldLabels[slug] = String(item.label);
  });

  if (Object.keys(fieldLabels).length) payload.__field_labels = fieldLabels;
  return payload;
};

const slugify = (value) =>
  String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

// Screens that were converted to show their preview as PreviewModal `groups` (real per-section
// tables) instead of one flat `items` list still need every field captured in submitted_notebooks
// for screens with no dedicated getPayload() - otherwise only the trimmed top-level `items` (Type/
// Entry ID/date/etc.) would be recorded and every field that moved into a group would be silently
// dropped from the submitted-notebook record. Flattens each group's rows into
// "<group>_<row>_<column>" keys (row segment omitted when a group has exactly one row), matching
// the "row_<n>_<field>" convention several SubmittedNotebooksPage.jsx custom-section detectors
// already key off (e.g. getCardingBetweenWithinSections's row_<n>_hank/row_<n>_sample_weight).
const groupsToPayload = (groups = []) => {
  const payload = {};
  const fieldLabels = {};

  groups.forEach((group) => {
    if (!group || !Array.isArray(group.columns) || !Array.isArray(group.rows)) return;
    const groupSlug = slugify(group.title || group.key);
    const multiRow = group.rows.length > 1;

    group.rows.forEach((row, rowIndex) => {
      group.columns.forEach((column) => {
        const columnSlug = slugify(column.label || column.key);
        if (!columnSlug) return;
        const slug = multiRow
          ? `${groupSlug}_${rowIndex + 1}_${columnSlug}`
          : `${groupSlug}_${columnSlug}`;
        payload[slug] = row?.[column.key];
        fieldLabels[slug] = multiRow ? `${group.title} ${rowIndex + 1} - ${column.label}` : `${group.title} - ${column.label}`;
      });
    });
  });

  if (Object.keys(fieldLabels).length) payload.__field_labels = fieldLabels;
  return payload;
};

const cleanPayloadValue = (value) => {
  if (value === undefined || value === null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return JSON.stringify(value);
  return value;
};

const cleanObject = (value = {}) =>
  Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => String(key || "").trim())
      .map(([key, item]) => [key, cleanPayloadValue(item)])
  );

const L1_APPROVAL_KEYS = new Set([
  "approval_l1",
  "approval_l1_name",
  "approval_l1_names",
  "approval_l1_id",
  "approval_l1_ids",
  "approval_l1_user_id",
  "approval_l1_user_ids",
  "l1_approver",
  "l1_approver_name",
  "l1_approver_names",
  "l1_approver_user_id",
  "l1_approver_user_ids",
]);

const normalizePayloadKey = (key) =>
  String(key || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

const removeL1ApprovalFields = (value = {}) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;

  return Object.fromEntries(
    Object.entries(value).filter(([key]) => !L1_APPROVAL_KEYS.has(normalizePayloadKey(key)))
  );
};

// Threshold rows are matched by punctuation/whitespace-insensitive comparison so entry-screen
// labels ("Cotton HVI Data Entry") still match config rows saved with slightly different
// spacing/casing/punctuation ("cotton-hvi data entry").
const normalizeLooseMatchValue = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

const getActiveValue = (item) => item?.is_active ?? item?.isActive ?? true;

const getThresholdScreenName = (item) =>
  item?.screen_name ||
  item?.screenName ||
  item?.notebook ||
  item?.input_screen ||
  item?.inputScreen ||
  item?.notebook_name ||
  item?.notebookName ||
  "";

const findAcknowledgementThreshold = async ({ department, subDepartment, notebookName, inputScreen }) => {
  try {
    const thresholds = await fetchNotebookAcknowledgementThresholdsAPI();
    const activeThresholds = thresholds.filter(getActiveValue);

    const departmentKey = normalizeLooseMatchValue(department);
    const subDepartmentKey = normalizeLooseMatchValue(subDepartment);
    const screenKeys = [notebookName, inputScreen].map(normalizeLooseMatchValue).filter(Boolean);

    const matchesScreen = (item) => screenKeys.includes(normalizeLooseMatchValue(getThresholdScreenName(item)));
    const itemDepartmentKey = (item) => normalizeLooseMatchValue(item?.department);
    const itemSubDepartmentKey = (item) =>
      normalizeLooseMatchValue(
        item?.sub_department || item?.subDepartment || item?.sub_department_name || item?.subDepartmentName
      );

    // Exact department + sub-department + screen match first, then progressively relax:
    // a threshold row left with no department/sub-department configured is treated as
    // applying to any department/sub-department for that screen, rather than never matching.
    const exactMatch = activeThresholds.find(
      (item) =>
        matchesScreen(item) &&
        itemDepartmentKey(item) === departmentKey &&
        itemSubDepartmentKey(item) === subDepartmentKey
    );
    if (exactMatch) return exactMatch;

    const departmentOnlyMatch = activeThresholds.find(
      (item) => matchesScreen(item) && itemDepartmentKey(item) === departmentKey && !itemSubDepartmentKey(item)
    );
    if (departmentOnlyMatch) return departmentOnlyMatch;

    const screenOnlyMatch = activeThresholds.find(
      (item) => matchesScreen(item) && !itemDepartmentKey(item) && !itemSubDepartmentKey(item)
    );
    return screenOnlyMatch || null;
  } catch (error) {
    console.warn("Submitted notebook acknowledgement threshold could not be resolved.", error?.message);
    return null;
  }
};

export const recordSubmittedNotebook = async ({
  department,
  subDepartment,
  notebookName,
  inputScreen,
  entryId,
  lotNo,
  childRef,
  registeredActions,
  previewItems,
  previewGroups = [],
  user,
  // Fields that live on the container screen rather than the active sub-component (e.g. Blow
  // Room's "Number of Sample Entries", which drives the Lap CV screens but is its own header
  // input, not part of any child's getPreviewData()/getPayload()) - pass as [{label, value}] so
  // they still end up in submitted_fields, without touching the child's own preview construction.
  extraFields = [],
  extra = {},
}) => {
  try {
    const mergePayloads = (a, b) => {
      const merged = { ...a, ...b };
      const combinedLabels = { ...(a.__field_labels || {}), ...(b.__field_labels || {}) };
      if (Object.keys(combinedLabels).length) merged.__field_labels = combinedLabels;
      return merged;
    };

    const submittedFields =
      childRef?.current?.getPayload?.() ||
      registeredActions?.getPayload?.() ||
      (previewGroups.length
        ? mergePayloads(previewItemsToPayload(previewItems), groupsToPayload(previewGroups))
        : previewItemsToPayload(previewItems));

    if (!submittedFields || typeof submittedFields !== "object" || !Object.keys(submittedFields).length) {
      return null;
    }

    const extraFieldsPayload = extraFields.length ? previewItemsToPayload(extraFields) : {};
    const mergedFieldLabels = {
      ...(submittedFields.__field_labels || {}),
      ...(extraFieldsPayload.__field_labels || {}),
    };
    const combinedFields = { ...submittedFields, ...extraFieldsPayload };
    if (Object.keys(mergedFieldLabels).length) combinedFields.__field_labels = mergedFieldLabels;

    const cleanedFields = removeL1ApprovalFields(cleanObject(combinedFields));
    const cleanedExtra = removeL1ApprovalFields(extra);
    const operatorName = user?.full_name || user?.fullName || user?.name || user?.username || user?.email || "";
    const resolvedEntryId = entryId || cleanedFields.entry_id || cleanedFields.entryId || "";
    const resolvedLotNo = lotNo || cleanedFields.lot_no || cleanedFields.lotNo || "";
    const acknowledgementThreshold = await findAcknowledgementThreshold({
      department,
      subDepartment,
      notebookName,
      inputScreen: inputScreen || notebookName,
    });
    const approvalL2 = acknowledgementThreshold?.approval_l2 || acknowledgementThreshold?.approvalL2 || "";
    const approvalL2Name =
      acknowledgementThreshold?.approval_l2_name ||
      acknowledgementThreshold?.approvalL2Name ||
      acknowledgementThreshold?.l2_approver_name ||
      acknowledgementThreshold?.l2ApproverName ||
      "";

    return await createSubmittedNotebookApi({
      department,
      sub_department: subDepartment,
      notebook: notebookName,
      notebook_name: notebookName,
      input_screen: inputScreen || notebookName,
      entry_id: resolvedEntryId,
      lot_no: resolvedLotNo,
      operator_name: operatorName,
      submitted_by_name: operatorName,
      submitted_by_user_id: user?.id || user?.employee_id || user?.employeeId || "",
      submitted_fields: {
        entry_id: resolvedEntryId,
        lot_no: resolvedLotNo,
        ...cleanedFields,
      },
      approval_l2: approvalL2,
      approval_l2_name: approvalL2Name,
      approval_l2_employee_id: approvalL2,
      l2_approver_employee_id: approvalL2,
      l2_approver_user_id: approvalL2,
      l2_approver_name: approvalL2Name,
      assigned_l2: approvalL2,
      approval_l1: "",
      approval_l1_name: "",
      approval_l1_user_id: "",
      ...cleanedExtra,
    });
  } catch (error) {
    console.warn("Submitted notebook record could not be created.", error?.response?.data || error?.message);
    return null;
  }
};
