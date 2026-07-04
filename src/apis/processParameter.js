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
