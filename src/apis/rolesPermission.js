import apiConfig from "./apiConfig";

/* ================== GET ROLE BY ID ================== */
export const getRoleByIdAPI = async (id) => {
  try {
    const response = await apiConfig.get(`/roles/${id}`);
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || "Failed to fetch role.");
    }
    throw new Error(error.message || "Server error occurred");
  }
};

/* ================== UPDATE ROLE ================== */
export const updateRoleAPI = async (id, payload) => {
  try {
    const response = await apiConfig.patch(`/roles/${id}`, payload);
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || "Failed to update role.");
    }
    throw new Error(error.message || "Server error occurred");
  }
};

/* ================== GET SCREENS ================== */
export const getScreensAPI = async () => {
  const res = await apiConfig.get("/roles/screens");
  return res.data;
};

/* ================== GET DEPARTMENTS ================== */
export const getDepartmentsAPI = async () => {
  const res = await apiConfig.get("/roles/departments");
  return res.data;
};