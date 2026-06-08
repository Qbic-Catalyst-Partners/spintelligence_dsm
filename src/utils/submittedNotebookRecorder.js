import { createSubmittedNotebookApi } from "@/apis/submittedNotebooksApi";
import { fetchNotebookAcknowledgementThresholdsAPI } from "@/apis/notebookAcknowledgementThresholdApi";
import { fetchSubmissionFrequencyConfigsAPI } from "@/apis/submissionFrequencyApi";
import { enrichSubmittedNotebookWithAssignment } from "@/utils/submittedNotebookAssignment";

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

const fetchSubmittedNotebookAssignmentThresholds = async () => {
  const results = await Promise.allSettled([
    fetchNotebookAcknowledgementThresholdsAPI(),
    fetchSubmissionFrequencyConfigsAPI(),
  ]);

  return results.flatMap((result) => (
    result.status === "fulfilled" && Array.isArray(result.value) ? result.value : []
  ));
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

  const cleanedFields = cleanObject(submittedFields);
  const operatorName = user?.full_name || user?.fullName || user?.name || user?.username || user?.email || "";
  const resolvedEntryId = entryId || cleanedFields.entry_id || cleanedFields.entryId || "";
  const resolvedLotNo = lotNo || cleanedFields.lot_no || cleanedFields.lotNo || "";

  try {
    const basePayload = {
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
      ...extra,
    };
    const thresholds = await fetchSubmittedNotebookAssignmentThresholds();
    return await createSubmittedNotebookApi(enrichSubmittedNotebookWithAssignment(basePayload, thresholds));
  } catch (error) {
    console.warn("Submitted notebook record could not be created.", error?.response?.data || error?.message);
    return null;
  }
};
