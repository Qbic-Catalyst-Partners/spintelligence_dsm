import apiConfig from "./apiConfig";

const formatTicketId = (ticketId) => {
  const id = String(ticketId || "").trim();
  return id.startsWith("#") ? id : `#${id}`;
};

const supervisorBaseCandidates = Array.from(
  new Set(
    [
      process.env.NEXT_PUBLIC_SUPERVISOR_API_BASE,
      "/supervisor-tickets",
      "/api/supervisor-tickets",
    ]
      .map((value) => String(value || "").trim().replace(/\/+$/, ""))
      .filter(Boolean)
  )
);

const requestSupervisorApi = async (method, path, data, params) => {
  let lastError = null;

  for (const base of supervisorBaseCandidates) {
    const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
    try {
      if (method === "get") {
        return await apiConfig.get(url, params || {}, { skipGlobalErrorModal: true });
      }
      if (method === "patch") {
        return await apiConfig.patch(url, data || {}, { skipGlobalErrorModal: true });
      }
      if (method === "post") {
        return await apiConfig.post(url, data || {}, { skipGlobalErrorModal: true });
      }
      if (method === "delete") {
        return await apiConfig.delete(url, { data: data || {} }, { skipGlobalErrorModal: true });
      }
      throw new Error(`Unsupported supervisor API method: ${method}`);
    } catch (error) {
      lastError = error;
      if (error?.response?.status !== 404) {
        throw error;
      }
    }
  }

  throw lastError || new Error("Supervisor API route not found");
};

// ✅ FETCH ALL SUPERVISOR TICKETS
export const fetchSupervisorTicketsApi = async (params = {}) => {
  try {
    const response = await requestSupervisorApi("get", "/tickets", null, params);
    return response?.data || {};
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(
        error.response.data.message || "Failed to fetch tickets"
      );
    }
    throw new Error(error.message || "Server error occurred");
  }
};

// ✅ FETCH SINGLE TICKET DETAILS
export const fetchTicketDetailsApi = async (ticketId) => {
  try {
    const encodeId = encodeURIComponent(formatTicketId(ticketId));
    const response = await requestSupervisorApi("get", `/tickets/${encodeId}`);
    return response?.data || {};
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(
        error.response.data.message || "Failed to fetch ticket details"
      );
    }
    throw new Error(error.message || "Failed to fetch ticket details");
  }
};

// ✅ APPROVE TICKET
export const approveTicketApi = async (ticketId) => {
  try {
    const encodeId = encodeURIComponent(formatTicketId(ticketId));
    const response = await requestSupervisorApi(
      "patch",
      `/tickets/approve?ticketId=${encodeId}`,
      { status: "APPROVED" }
    );

    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(
        error.response.data.message || "Failed to approve ticket"
      );
    }
    throw new Error(error.message || "Server error occurred");
  }
};

// ✅ REJECT TICKET
export const rejectTicketApi = async (ticketId, reason) => {
  try {
    const encodeId = encodeURIComponent(formatTicketId(ticketId));
    const normalizedReason = String(reason || "").trim();

    const payload = {
      reason: normalizedReason,
      rejection_reason: normalizedReason,
      comments: normalizedReason,
      remark: normalizedReason,
      status: "REJECTED",
    };
    const response = await requestSupervisorApi(
      "patch",
      `/tickets/reject?ticketId=${encodeId}`,
      payload
    );

    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(
        error.response.data.message || "Failed to reject ticket"
      );
    }
    throw new Error(error.message || "Server error occurred");
  }
};

export const fetchTicketTimelineApi = async (ticketId) => {
  try {
    const encodeId = encodeURIComponent(formatTicketId(ticketId));
    const response = await requestSupervisorApi("get", `/tickets/${encodeId}/timeline`);
    return response?.data || {};
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || "Failed to fetch ticket timeline");
    }
    throw new Error(error.message || "Server error occurred");
  }
};

export const assignSupervisorEmployeeApi = async (payload) => {
  const response = await requestSupervisorApi("post", "/assign", payload || {});
  return response?.data || {};
};

export const unassignSupervisorEmployeeApi = async (payload) => {
  const response = await requestSupervisorApi("delete", "/unassign", payload || {});
  return response?.data || {};
};

export const fetchSupervisorEmployeesApi = async (supervisorId) => {
  const response = await requestSupervisorApi(
    "get",
    `/supervisor/${encodeURIComponent(String(supervisorId || ""))}/employees`
  );
  return response?.data || {};
};

export const fetchEmployeeSupervisorsApi = async (employeeId) => {
  const response = await requestSupervisorApi(
    "get",
    `/employee/${encodeURIComponent(String(employeeId || ""))}/supervisor`
  );
  return response?.data || {};
};
