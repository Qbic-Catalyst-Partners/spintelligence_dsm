import apiConfig from "./apiConfig";

export const submitSimplexUqcEntry = async (payload) => {
  try {
    const response = await apiConfig.post("/simplex/uqc", payload);
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || "Invalid payload data.");
    }
    throw new Error(error.message || "Server error occurred");
  }
};

export const fetchSimplexUqcEntries = async ({ page = 1, limit = 10 } = {}) => {
  try {
    const response = await apiConfig.get("/simplex/uqc", { page, limit });
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || "Unable to fetch entries.");
    }
    throw new Error(error.message || "Server error occurred");
  }
};
