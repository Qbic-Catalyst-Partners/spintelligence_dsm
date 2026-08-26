import apiConfig from "./apiConfig";

export const fetchNextProcessParameterId = async () => {
  try {
    const response = await apiConfig.get(
      "/process-parameters/next-id",
      {},
      { skipGlobalErrorModal: true }
    );
    return response.data?.entry_id || "";
  } catch (error) {
    return "";
  }
};

// process_parameters.master's lifecycle status (in_progress/pending_approval/
// active/inactive/rejected) per PP id - used by the matrix to show a
// "Rejected" badge (with the L4 reviewer's reason) on any PP id an L4
// approver has sent back, until every department resubmits and it returns
// to pending_approval.
export const fetchProcessParameterMasterStatuses = async () => {
  try {
    const response = await apiConfig.get(
      "/process-parameters/master",
      { page: 1, limit: 200 },
      { skipGlobalErrorModal: true }
    );
    return Array.isArray(response.data?.data) ? response.data.data : [];
  } catch (error) {
    return [];
  }
};
