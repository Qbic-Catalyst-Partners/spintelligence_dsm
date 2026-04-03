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

export const fetchSimplexUqcEntries = async () => {
  try {
    const response = await apiConfig.get("/simplex/uqc");
    const data = response.data;
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.data)) return data.data;
    return [];
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || "Failed to fetch entries.");
    }

    throw new Error(error.message || "Server error occurred");
  }
};
