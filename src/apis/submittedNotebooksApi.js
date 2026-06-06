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
        submitted_fields: submittedFields,
        submittedFields,
        input_fields: submittedFields,
        inputFields: submittedFields,
        fields: submittedFields,
        form_data: submittedFields,
        formData: submittedFields,
        payload: submittedFields,
    };
};

export const createSubmittedNotebookApi = async (payload = {}) => {
    const response = await apiConfig.post("/submitted-notebooks", buildSubmittedNotebookPayload(payload), {
        skipGlobalErrorModal: true,
        skipGlobalSuccessModal: true,
    });
    return response.data;
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
