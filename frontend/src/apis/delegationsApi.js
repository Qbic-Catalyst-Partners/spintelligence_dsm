import apiConfig from "./apiConfig";

const extractApiError = (error, fallbackMessage) => {
  if (error?.response?.data?.message) return error.response.data.message;
  if (error?.response?.data?.error) return error.response.data.error;
  return error?.message || fallbackMessage;
};

export const assignDelegationAPI = async ({ ownerUserId, delegateUserId, fromDate, toDate }) => {
  try {
    const response = await apiConfig.post("/delegations", {
      owner_user_id: ownerUserId,
      delegate_user_id: delegateUserId,
      from_date: fromDate,
      to_date: toDate,
    });
    return response.data;
  } catch (error) {
    throw new Error(extractApiError(error, "Unable to assign delegation."));
  }
};

export const fetchDelegationsAPI = async (page = 1, limit = 10) => {
  try {
    const response = await apiConfig.get(
      "/delegations",
      { page, limit },
      { skipGlobalErrorModal: true }
    );
    return {
      delegations: Array.isArray(response.data?.delegations) ? response.data.delegations : [],
      total: response.data?.total || 0,
      page: response.data?.page || page,
      limit: response.data?.limit || limit,
    };
  } catch (error) {
    throw new Error(extractApiError(error, "Unable to load delegations."));
  }
};
