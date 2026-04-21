import { emitGlobalSuccessModal } from "@/utils/globalSuccessModal";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL;

const emitFetchSuccess = () => {
  emitGlobalSuccessModal({
    message: "Data Submitted",
  });
};

export const fetchUsersAPI = async () => {
  const res = await fetch(`${BASE_URL}/users`);
  return res.json();
};

export const fetchRolesAPI = async () => {
  const res = await fetch(`${BASE_URL}/roles?page=1&limit=200`);
  return res.json();
};

export const fetchDepartmentsAPI = async () => {
  const res = await fetch(`${BASE_URL}/roles/departments`);
  return res.json();
};

export const deleteUserAPI = async (id) => {
  const res = await fetch(`${BASE_URL}/users/${id}`, { method: "DELETE" });
  if (res.ok) emitFetchSuccess();
  return res;
};

export const updateStatusAPI = async (id, status) => {
  const res = await fetch(`${BASE_URL}/users/${id}/account-status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ account_status: status }),
  });
  if (res.ok) emitFetchSuccess();
  return res;
};
// apis/userApi.js

export const addUserAPI = async (data) => {
  const res = await fetch(`${BASE_URL}/users/add-user`, {  
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  const responseData = await res.json();

  if (!res.ok) {
    console.error(responseData);
    throw new Error(responseData.message || "Failed");
  }

  emitFetchSuccess();
  return responseData;
};
export const exportUsersAPI = async () => {
  const res = await fetch(`${BASE_URL}/users/export`, {
    method: "GET",
  });

  if (!res.ok) {
    throw new Error("Export failed");
  }

  const blob = await res.blob();

  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");

  a.href = url;
  a.download = "users.xlsx"; 

  document.body.appendChild(a);
  a.click();
  a.remove();
};

export const bulkUploadUsersAPI = async (file) => {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${BASE_URL}/users/bulk-upload`, {
    method: "POST",
    body: formData,
  });

  const contentType = res.headers.get("content-type") || "";
  const responseData = contentType.includes("application/json")
    ? await res.json()
    : await res.text();

  if (!res.ok) {
    const message =
      typeof responseData === "string"
        ? responseData
        : responseData?.message;

    throw new Error(message || "Bulk upload failed");
  }

  emitFetchSuccess();
  return responseData;
};
//  UPDATE USER
export const updateUserAPI = async (id, data) => {
  const res = await fetch(`${BASE_URL}/users/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  const responseData = await res.json();

  if (!res.ok) {
    console.error(responseData);
    throw new Error(responseData.message || "Update failed");
  }

  emitFetchSuccess();
  return responseData;
};


// CHANGE PASSWORD
export const changePasswordAPI = async (id, data) => {
  const res = await fetch(`${BASE_URL}/users/change-password/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  const responseData = await res.json();

  if (!res.ok) {
    console.error(responseData);
    throw new Error(responseData.message || "Password update failed");
  }

  emitFetchSuccess();
  return responseData;
};
