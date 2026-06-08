import { createSubmittedNotebookApi } from "@/apis/submittedNotebooksApi";

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

const removeL1ApprovalFields = (value = {}) => {
  if (!value || typeof value !== "object") return {};

  return Object.fromEntries(
    Object.entries(value).filter(([key]) => {
      const normalizedKey = String(key || "").toLowerCase().replace(/[^a-z0-9]+/g, "_");
      return !(
        normalizedKey === "approval_l1" ||
        normalizedKey === "approval_l1_name" ||
        normalizedKey === "approval_l1_names" ||
        normalizedKey === "approval_l1_id" ||
        normalizedKey === "approval_l1_ids" ||
        normalizedKey === "approval_l1_user_id" ||
        normalizedKey === "approval_l1_user_ids" ||
        normalizedKey === "l1_approver" ||
        normalizedKey === "l1_approver_name" ||
        normalizedKey === "l1_approver_names" ||
        normalizedKey === "l1_approver_user_id" ||
        normalizedKey === "l1_approver_user_ids"
      );
    })
  );
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
      ...cleanedExtra,
      acknowledgement_ticket_level: "L2",
      acknowledgement_target_level: "L2",
      acknowledgement_ticket_type: "L2_SUBMISSION",
      create_l1_acknowledgement_ticket: false,
      create_l2_acknowledgement_ticket: true,
      skip_l1_acknowledgement_ticket: true,
      ticket_level: "L2",
      target_level: "L2",
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
