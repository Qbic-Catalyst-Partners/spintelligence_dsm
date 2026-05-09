import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import {
  fetchUsersAPI,
  fetchRolesAPI,
  fetchDepartmentsAPI,
  addUserAPI,
  updateUserAPI,
  changePasswordAPI,
  exportUsersAPI,
} from "../../apis/userApi";

/* ================= FETCH USERS ================= */
export const fetchUsers = createAsyncThunk("users/fetch", async () => {
  const data = await fetchUsersAPI();

  return data.map((user) => ({
    id: user.id,
    employeeId: user.employee_id,
    name: user.full_name,
    email: user.email,
    phone: user.phone,
    level: user.level,
    role: user.role,
    dept: user.department,
    status: user.account_status,
  }));
});

/* ================= FETCH ROLES ================= */
export const fetchRoles = createAsyncThunk("roles/fetch", async () => {
  const data = await fetchRolesAPI();
  return data.roles || [];
});

/* ================= FETCH DEPARTMENTS ================= */
export const fetchDepartments = createAsyncThunk("dept/fetch", async () => {
  return await fetchDepartmentsAPI();
});

/* ================= ADD USER ================= */
export const addUser = createAsyncThunk(
  "users/addUser",
  async (userData, { rejectWithValue }) => {
    try {
      const res = await addUserAPI(userData);
      return res;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

/* ================= UPDATE USER ================= */
export const updateUser = createAsyncThunk(
  "users/updateUser",
  async ({ id, data }, { rejectWithValue }) => {
    try {
      const res = await updateUserAPI(id, data);
      return res;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

/* ================= CHANGE PASSWORD ================= */
export const changePassword = createAsyncThunk(
  "users/changePassword",
  async ({ id, data }, { rejectWithValue }) => {
    try {
      const res = await changePasswordAPI(id, data);
      return res;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);
/* ================= EXPORT USERS ================= */
export const exportUsers = createAsyncThunk(
  "users/export",
  async (_, { rejectWithValue }) => {
    try {
      await exportUsersAPI();
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

/* ================= SLICE ================= */
const userSlice = createSlice({
  name: "users",
  initialState: {
    users: [],
    roles: [],
    departments: [],
    loading: false,
    error: null,

    actionLoading: false,
    actionSuccess: false,
  },

  reducers: {
    clearActionState: (state) => {
      state.error = null;
      state.actionSuccess = false;
    },
  },

  extraReducers: (builder) => {
    builder

      /* ===== FETCH USERS ===== */
      .addCase(fetchUsers.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchUsers.fulfilled, (state, action) => {
        state.users = action.payload;
        state.loading = false;
      })
      .addCase(fetchUsers.rejected, (state) => {
        state.loading = false;
      })

      /* ===== FETCH ROLES ===== */
      .addCase(fetchRoles.fulfilled, (state, action) => {
        state.roles = action.payload;
      })

      /* ===== FETCH DEPARTMENTS ===== */
      .addCase(fetchDepartments.fulfilled, (state, action) => {
        state.departments = action.payload;
      })

      /* ===== ADD USER ===== */
      .addCase(addUser.pending, (state) => {
        state.actionLoading = true;
        state.error = null;
      })
      .addCase(addUser.fulfilled, (state) => {
        state.actionLoading = false;
        state.actionSuccess = true;
      })
      .addCase(addUser.rejected, (state, action) => {
        state.actionLoading = false;
        state.error = action.payload;
      })

      /* ===== UPDATE USER ===== */
      .addCase(updateUser.pending, (state) => {
        state.actionLoading = true;
        state.error = null;
      })
      .addCase(updateUser.fulfilled, (state) => {
        state.actionLoading = false;
        state.actionSuccess = true;
      })
      .addCase(updateUser.rejected, (state, action) => {
        state.actionLoading = false;
        state.error = action.payload;
      })

      /* ===== CHANGE PASSWORD ===== */
      .addCase(changePassword.pending, (state) => {
        state.actionLoading = true;
        state.error = null;
      })
      .addCase(changePassword.fulfilled, (state) => {
        state.actionLoading = false;
        state.actionSuccess = true;
      })
      .addCase(changePassword.rejected, (state, action) => {
        state.actionLoading = false;
        state.error = action.payload;
      })

      .addCase(exportUsers.pending, (state) => {
        state.actionLoading = true;
      })

      .addCase(exportUsers.fulfilled, (state) => {
        state.actionLoading = false;
      })

      .addCase(exportUsers.rejected, (state, action) => {
        state.actionLoading = false;
        state.error = action.payload;
      });


  },

});

export const { clearActionState } = userSlice.actions;

export default userSlice.reducer;
