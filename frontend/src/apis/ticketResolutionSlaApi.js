import apiConfig, { resolvedBaseUrl } from "./apiConfig";

const normalizeSlaList = (data) => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  return [];
};

export const fetchTicketResolutionSlaAPI = async () => {
  try {
    const response = await apiConfig.get("/operator-tickets/ticket-resolution-sla", {}, { skipGlobalSuccessModal: true });
    return normalizeSlaList(response?.data);
  } catch (error) {
    if (error.request) {
      throw new Error(`Network Error: unable to reach ${resolvedBaseUrl}/operator-tickets/ticket-resolution-sla.`);
    }
    throw error;
  }
};

export const saveTicketResolutionSlaAPI = async (payload) => {
  const response = await apiConfig.post("/operator-tickets/ticket-resolution-sla", payload);
  return response?.data;
};

export const updateTicketResolutionSlaStatusAPI = async (level, is_active) => {
  const response = await apiConfig.patch(
    `/operator-tickets/ticket-resolution-sla/${encodeURIComponent(level)}/status`,
    { is_active }
  );
  return response?.data;
};
