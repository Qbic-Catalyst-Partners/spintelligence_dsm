import apiConfig from "./apiConfig";

const extractApiError = (error, fallbackMessage) => {
  if (error?.response?.data?.message) return error.response.data.message;
  if (error?.response?.data?.error) return error.response.data.error;
  return error?.message || fallbackMessage;
};

// L1 -> L2 mapping used to scope WC/PP Approvals: an L2 only sees
// submissions from the L1 employees assigned to them here. Admin-only.
export const assignSupervisorEmployee = async (supervisorUserId, employeeUserId) => {
  try {
    const response = await apiConfig.post(
      "/supervisor-assignments/assign",
      { supervisor_user_id: supervisorUserId, employee_user_id: employeeUserId },
      { skipGlobalSuccessModal: true }
    );
    return response.data;
  } catch (error) {
    throw new Error(extractApiError(error, "Unable to assign employee to supervisor."));
  }
};

export const unassignSupervisorEmployee = async (supervisorUserId, employeeUserId) => {
  try {
    const response = await apiConfig.delete("/supervisor-assignments/unassign", {
      data: { supervisor_user_id: supervisorUserId, employee_user_id: employeeUserId },
      skipGlobalSuccessModal: true,
    });
    return response.data;
  } catch (error) {
    throw new Error(extractApiError(error, "Unable to unassign employee from supervisor."));
  }
};

export const fetchSupervisorEmployees = async (supervisorUserId) => {
  try {
    const response = await apiConfig.get(
      `/supervisor-assignments/supervisor/${supervisorUserId}/employees`,
      {},
      { skipGlobalErrorModal: true }
    );
    return Array.isArray(response.data?.employees) ? response.data.employees : [];
  } catch (error) {
    throw new Error(extractApiError(error, "Unable to load assigned employees."));
  }
};
