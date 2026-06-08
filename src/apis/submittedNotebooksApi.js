import apiConfig from "@/apis/apiConfig";

const stripL1ApprovalFields = (value = {}) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return value;

    return Object.fromEntries(
        Object.entries(value).filter(([key]) => {
            const normalizedKey = String(key || "").toLowerCase().replace(/[^a-z0-9]+/g, "_");
            return ![
                "approval_l1",
                "approval_l1_name",
                "approval_l1_names",
                "approval_l1_id",
                "approval_l1_ids",
                "approval_l1_user_id",
                "approval_l1_user_ids",
                "l1_approver",
                "l1_approver_name",
                "l1_approver_names",
                "l1_approver_user_id",
                "l1_approver_user_ids",
            ].includes(normalizedKey);
        })
    );
};

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
        return {
            ...stripL1ApprovalFields(payload),
            acknowledgement_ticket_level: payload.acknowledgement_ticket_level || "L2",
            acknowledgement_target_level: payload.acknowledgement_target_level || "L2",
            acknowledgement_ticket_type: payload.acknowledgement_ticket_type || "L2_SUBMISSION",
            create_l1_acknowledgement_ticket: false,
            create_l2_acknowledgement_ticket: true,
            skip_l1_acknowledgement_ticket: true,
            ticket_level: payload.ticket_level || "L2",
            target_level: payload.target_level || "L2",
            approval_l1: "",
            approval_l1_name: "",
            approval_l1_user_id: "",
        };
    }

    return {
        ...stripL1ApprovalFields(payload),
        screen_name: payload.screen_name || payload.screenName || payload.input_screen || payload.notebook_name,
        acknowledgement_ticket_level: payload.acknowledgement_ticket_level || "L2",
        acknowledgement_target_level: payload.acknowledgement_target_level || "L2",
        acknowledgement_ticket_type: payload.acknowledgement_ticket_type || "L2_SUBMISSION",
        create_l1_acknowledgement_ticket: false,
        create_l2_acknowledgement_ticket: true,
        skip_l1_acknowledgement_ticket: true,
        ticket_level: payload.ticket_level || "L2",
        target_level: payload.target_level || "L2",
        approval_l1: "",
        approval_l1_name: "",
        approval_l1_user_id: "",
        submitted_fields: stripL1ApprovalFields(submittedFields),
        submittedFields: stripL1ApprovalFields(submittedFields),
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
