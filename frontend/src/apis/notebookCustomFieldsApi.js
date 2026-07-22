import apiConfig from "@/apis/apiConfig";

export const createNotebookCustomFieldApi = async (payload = {}) => {
    const response = await apiConfig.post("/notebook-custom-fields", payload, {
        skipGlobalSuccessModal: true,
    });
    return response.data;
};

export const fetchNotebookCustomFieldsApi = async (params = {}) => {
    const response = await apiConfig.get("/notebook-custom-fields", params, {
        skipGlobalErrorModal: true,
    });
    return response.data;
};

export const toggleNotebookCustomFieldApi = async (id) => {
    const response = await apiConfig.patch(`/notebook-custom-fields/${id}/toggle`, {}, {
        skipGlobalSuccessModal: true,
    });
    return response.data;
};

export const updateNotebookCustomFieldApi = async (id, payload = {}) => {
    const response = await apiConfig.put(`/notebook-custom-fields/${id}`, payload, {
        skipGlobalSuccessModal: true,
    });
    return response.data;
};

export const deleteNotebookCustomFieldApi = async (id) => {
    const response = await apiConfig.delete(`/notebook-custom-fields/${id}`, {}, {
        skipGlobalSuccessModal: true,
    });
    return response.data;
};

export const fetchNotebookCustomFieldValuesApi = async (entryId) => {
    const response = await apiConfig.get("/notebook-custom-fields/values", { entry_id: entryId }, {
        skipGlobalErrorModal: true,
    });
    return response.data;
};

export const saveNotebookCustomFieldValuesApi = async (entryId, values = []) => {
    const response = await apiConfig.post("/notebook-custom-fields/values", { entry_id: entryId, values }, {
        skipGlobalSuccessModal: true,
    });
    return response.data;
};
