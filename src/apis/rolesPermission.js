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
  try {
    const response = await apiConfig.get("/roles/screens");
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || "Failed to fetch screens.");
    }
    throw new Error(error.message || "Server error occurred");
  }
};

/* ================== GET DEPARTMENTS ================== */
export const getDepartmentsAPI = async () => {
  try {
    const response = await apiConfig.get("/roles/departments");
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || "Failed to fetch departments.");
    }
    throw new Error(error.message || "Server error occurred");
  }
};

/* ================== GET ALL ROLES ================== */
export const getAllRolesAPI = async (params = {}) => {
  try {
    const response = await apiConfig.get("/roles", params);
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || "Failed to fetch roles.");
    }
    throw new Error(error.message || "Server error occurred");
  }
};

/* ================== CREATE ROLE ================== */
export const createRoleAPI = async (payload) => {
  try {
    const response = await apiConfig.post("/roles", payload);
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || "Failed to create role.");
    }
    throw new Error(error.message || "Server error occurred");
  }
};

/* ================== DELETE ROLE ================== */
export const deleteRoleAPI = async (id) => {
  try {
    const response = await apiConfig.delete(`/roles/${id}`);
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || "Failed to delete role.");
    }
    throw new Error(error.message || "Server error occurred");
  }
};
