import { createSubmittedNotebookApi } from "@/apis/submittedNotebooksApi";

const previewItemsToPayload = (items = []) =>
  items.reduce((acc, item) => {
    if (!item || typeof item !== "object") return acc;
    const key = String(item.key || item.name || item.label || "").trim();
    if (!key) return acc;
    acc[key.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")] = item.value;
    return acc;
  }, {});

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

  return createSubmittedNotebookApi({
    department,
    sub_department: subDepartment,
    notebook_name: notebookName,
    input_screen: inputScreen || notebookName,
    entry_id: entryId || submittedFields.entry_id || submittedFields.entryId,
    lot_no: lotNo || submittedFields.lot_no || submittedFields.lotNo,
    operator_name: user?.full_name || user?.fullName || user?.name || user?.username || user?.email,
    submitted_by_name: user?.full_name || user?.fullName || user?.name || user?.username || user?.email,
    submitted_by_user_id: user?.id || user?.employee_id || user?.employeeId,
    submitted_fields: {
      entry_id: entryId || submittedFields.entry_id || submittedFields.entryId,
      lot_no: lotNo || submittedFields.lot_no || submittedFields.lotNo,
      ...submittedFields,
    },
    ...extra,
  });
};
