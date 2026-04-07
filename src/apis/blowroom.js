import apiConfig from "./apiConfig";

const BLOWROOM_SYNC_ENDPOINT = "/blowroom/sync";
const BLOWROOM_DROP_TEST_ENDPOINT = "/blowroom/drop-test";
const BLOWROOM_BR_WASTE_ENDPOINT = "/blowroom/br-waste-study";

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
