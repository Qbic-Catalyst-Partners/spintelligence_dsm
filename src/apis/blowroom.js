import apiConfig from "./apiConfig";

const BLOWROOM_SYNC_ENDPOINT = "/blowroom/sync";
const BLOWROOM_DROP_TEST_ENDPOINT = "/blowroom/drop-test";
const BLOWROOM_BR_WASTE_ENDPOINT = "/blowroom/br-waste-study";
const BLOWROOM_PROCESS_PARAMETER_ENDPOINT = "/blowroom/header";

export const fetchBlowroomDataApi = async () => {
  try {
    const res = await apiConfig.get(BLOWROOM_SYNC_ENDPOINT);
    return res.data;
  } catch (error) {
    if (error.response?.data) {
      throw new Error(error.response.data.message || "Failed to fetch data");
    }
    throw new Error(error.message || "Failed to fetch data");
  }
};

export const saveBlowroomDataApi = async (payload) => {
  try {
    const res = await apiConfig.post(BLOWROOM_SYNC_ENDPOINT, payload);
    return res.data;
  } catch (error) {
    if (error.response?.data) {
      throw new Error(error.response.data.message || "Failed to save data");
    }
    throw new Error(error.message || "Failed to save data");
  }
};

export const saveBlowroomDropTestApi = async (payload) => {
  try {
    const res = await apiConfig.post(BLOWROOM_DROP_TEST_ENDPOINT, payload);
    return res.data;
  } catch (error) {
    if (error.response?.data) {
      throw new Error(error.response.data.message || "Failed to save drop test data");
    }
    throw new Error(error.message || "Failed to save drop test data");
  }
};

export const saveBlowroomBrWasteApi = async (payload) => {
  try {
    const res = await apiConfig.post(BLOWROOM_BR_WASTE_ENDPOINT, payload);
    return res.data;
  } catch (error) {
    if (error.response?.data) {
      throw new Error(error.response.data.message || "Failed to save waste study data");
    }
    throw new Error(error.message || "Failed to save waste study data");
  }
};

export const fetchBlowroomBrWasteApi = async ({ page = 1, limit = 50 } = {}) => {
  try {
    const res = await apiConfig.get(BLOWROOM_BR_WASTE_ENDPOINT, { page, limit });
    return res.data;
  } catch (error) {
    if (error.response?.data) {
      throw new Error(error.response.data.message || "Failed to fetch waste study data");
    }
    throw new Error(error.message || "Failed to fetch waste study data");
  }
};

export const fetchBlowroomProcessParametersApi = async ({ page = 1, limit = 10 } = {}) => {
  try {
    const res = await apiConfig.get(BLOWROOM_PROCESS_PARAMETER_ENDPOINT, { page, limit });
    return res.data;
  } catch (error) {
    if (error.response?.data) {
      throw new Error(error.response.data.message || "Failed to fetch process parameter entries");
    }
    throw new Error(error.message || "Failed to fetch process parameter entries");
  }
};

export const saveBlowroomProcessParameterApi = async (payload) => {
  try {
    const res = await apiConfig.post(BLOWROOM_PROCESS_PARAMETER_ENDPOINT, payload);
    return res.data;
  } catch (error) {
    if (error.response?.data) {
      throw new Error(error.response.data.message || "Failed to save process parameter entry");
    }
    throw new Error(error.message || "Failed to save process parameter entry");
  }
};

export const updateBlowroomProcessParameterApi = async (id, payload) => {
  try {
    const res = await apiConfig.put(
      `${BLOWROOM_PROCESS_PARAMETER_ENDPOINT}/${encodeURIComponent(id)}`,
      payload
    );
    return res.data;
  } catch (error) {
    if (error.response?.data) {
      throw new Error(error.response.data.message || "Failed to update process parameter entry");
    }
    throw new Error(error.message || "Failed to update process parameter entry");
  }
};
