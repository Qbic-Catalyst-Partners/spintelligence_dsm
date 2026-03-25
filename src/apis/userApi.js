const BASE_URL = process.env.NEXT_PUBLIC_API_URL;

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
  return fetch(`${BASE_URL}/users/${id}`, { method: "DELETE" });
};

export const updateStatusAPI = async (id, status) => {
  return fetch(`${BASE_URL}/users/${id}/account-status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ account_status: status }),
  });
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

  return responseData;
};