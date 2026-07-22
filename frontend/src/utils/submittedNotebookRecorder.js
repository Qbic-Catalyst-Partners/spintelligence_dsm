import { createSubmittedNotebookApi } from "@/apis/submittedNotebooksApi";
import { fetchNotebookAcknowledgementThresholdsAPI } from "@/apis/notebookAcknowledgementThresholdApi";

const previewItemsToPayload = (items = []) =>
  items.reduce((acc, item) => {
    if (!item || typeof item !== "object") return acc;
    const key = String(item.key || item.name || item.label || "").trim();
    if (!key) return acc;
    acc[key.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")] = item.value;
    return acc;
  }, {});

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
  user,
  extra = {},
}) => {
  try {
    const submittedFields =
      childRef?.current?.getPayload?.() ||
      registeredActions?.getPayload?.() ||
      previewItemsToPayload(previewItems);

    if (!submittedFields || typeof submittedFields !== "object" || !Object.keys(submittedFields).length) {
      return null;
    }

    const cleanedFields = removeL1ApprovalFields(cleanObject(submittedFields));
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
