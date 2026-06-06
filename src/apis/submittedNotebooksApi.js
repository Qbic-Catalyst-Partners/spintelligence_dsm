import apiConfig from "@/apis/apiConfig";

const buildSubmittedNotebookPayload = (payload = {}) => {
    const submittedFields =
        payload.submitted_fields ||
        payload.submittedFields ||
        payload.fields ||
        payload.form_data ||
        payload.formData ||
        payload.payload ||
        null;

    if (!submittedFields || typeof submittedFields !== "object") {
        return payload;
    }

    return {
        ...payload,
        screen_name: payload.screen_name || payload.screenName || payload.input_screen || payload.notebook_name,
        submitted_fields: submittedFields,
        submittedFields,
    };
};

export const createSubmittedNotebookApi = async (payload = {}) => {
    try {
        const response = await apiConfig.post("/submitted-notebooks", buildSubmittedNotebookPayload(payload), {
            skipGlobalSuccessModal: true,
            skipGlobalErrorModal: true,
        });
        return response.data;
    } catch (error) {
        const status = error?.response?.status;
        const message =
            error?.response?.data?.message ||
            error?.response?.data?.error ||
            "Failed to create submitted notebook.";
        throw new Error(status ? `${message} (${status})` : message);
    }
};

export const fetchSubmittedNotebooksApi = async (params = {}) => {
    const response = await apiConfig.get("/submitted-notebooks", params, {
        skipGlobalErrorModal: true,
    });
    return response.data;
};

export const fetchSubmittedNotebookDetailApi = async (id) => {
    const response = await apiConfig.get(`/submitted-notebooks/${id}`, {}, {
        skipGlobalErrorModal: true,
    });
    return response.data;
};

export const acknowledgeSubmittedNotebookApi = async (id) => {
    const response = await apiConfig.patch(`/submitted-notebooks/${id}/acknowledge`, {}, {
        skipGlobalSuccessModal: true,
    });
    return response.data;
};
