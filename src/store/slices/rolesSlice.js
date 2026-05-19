import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import {
  getRoleByIdAPI,
  updateRoleAPI,
  getScreensAPI,
  getDepartmentsAPI,
  getAllRolesAPI,
  createRoleAPI,
  deleteRoleAPI
} from "../../apis/rolesPermission";

// Helper for async thunks
const createAsyncThunkHelper = (type, apiCall) => createAsyncThunk(
  `roles/${type}`,
  async (args, { rejectWithValue }) => {
    try {
      return await apiCall(args);
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

// Async thunks
export const fetchRoles = createAsyncThunkHelper("fetchRoles", (params = {}) => getAllRolesAPI(params));
export const fetchRoleById = createAsyncThunkHelper("fetchRoleById", getRoleByIdAPI);
export const createRole = createAsyncThunkHelper("createRole", createRoleAPI);
export const updateRole = createAsyncThunkHelper("updateRole", ({ id, payload }) => updateRoleAPI(id, payload));
export const deleteRole = createAsyncThunkHelper("deleteRole", deleteRoleAPI);
export const fetchScreens = createAsyncThunkHelper("fetchScreens", () => getScreensAPI());
export const fetchDepartments = createAsyncThunkHelper("fetchDepartments", () => getDepartmentsAPI());

// Helper for common reducer patterns
const createReducerHelpers = (builder, thunk, onFulfilled) => {
  builder
    .addCase(thunk.pending, (state) => {
      state.loading = true;
      state.error = null;
    })
    .addCase(thunk.fulfilled, (state, action) => {
      state.loading = false;
      onFulfilled(state, action);
    })
    .addCase(thunk.rejected, (state, action) => {
      state.loading = false;
      state.error = action.payload;
    });
};

const rolesSlice = createSlice({
  name: "roles",
  initialState: {
    roles: [],
    currentRole: null,
    screens: [],
    departments: [],
    loading: false,
    error: null,
    role: null,
  },
  reducers: {
    clearError: (state) => { state.error = null; },
    setCurrentRole: (state, action) => { state.currentRole = action.payload; },
  },
  extraReducers: (builder) => {
    createReducerHelpers(builder, fetchRoles, (state, action) => {
      state.roles = action.payload.roles || action.payload;
    });

    createReducerHelpers(builder, fetchRoleById, (state, action) => {
      state.currentRole = action.payload;
    });

    createReducerHelpers(builder, createRole, (state, action) => {
      state.roles.push(action.payload);
    });

    createReducerHelpers(builder, updateRole, (state, action) => {
      const index = state.roles.findIndex(role => role.id === action.payload.id);
      if (index !== -1) state.roles[index] = action.payload;
      if (state.currentRole?.id === action.payload.id) state.currentRole = action.payload;
    });

    createReducerHelpers(builder, deleteRole, (state, action) => {
      state.roles = state.roles.filter(role => role.id !== action.meta.arg);
    });

    createReducerHelpers(builder, fetchScreens, (state, action) => {
      state.screens = action.payload;
    });

    createReducerHelpers(builder, fetchDepartments, (state, action) => {
      state.departments = action.payload;
    });
  },
});

export const { clearError, setCurrentRole } = rolesSlice.actions;
export default rolesSlice.reducer;