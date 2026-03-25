import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { updateRoleAPI } from "../../apis/rolesPermission";

/* ================== UPDATE ROLE ================== */
export const updateRole = createAsyncThunk(
  "roles/updateRole",
  async ({ id, payload }, { rejectWithValue }) => {
    try {
      const data = await updateRoleAPI(id, payload);
      return data;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

const rolesSlice = createSlice({
  name: "roles",
  initialState: {
    loading: false,
    error: null,
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(updateRole.pending, (state) => {
        state.loading = true;
      })
      .addCase(updateRole.fulfilled, (state) => {
        state.loading = false;
      })
      .addCase(updateRole.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  },
});

export default rolesSlice.reducer;