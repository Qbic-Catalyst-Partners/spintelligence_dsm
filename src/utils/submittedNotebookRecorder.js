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

  try {
    return await createSubmittedNotebookApi({
      department,
      sub_department: subDepartment,
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
      approval_l1: "",
      approval_l1_name: "",
      approval_l1_user_id: "",
    });
  } catch (error) {
    console.warn("Submitted notebook record could not be created.", error?.response?.data || error?.message);
    return null;
  }
};
