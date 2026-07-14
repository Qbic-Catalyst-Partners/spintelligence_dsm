import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { saveSpinningRecord } from "../../apis/spinning";

// Async action
export const submitSpinningRecord = createAsyncThunk(
  "spinning/saveRecord",
  async ({ type, payload }, { rejectWithValue }) => {
    try {
      const data = await saveSpinningRecord(type, payload);
      return data;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

const spinSlice = createSlice({
  name: "spinning",
  initialState: {
    loading: false,
    success: false,
    error: null,
  },
  reducers: {
    resetSpinningState: (state) => {
      state.loading = false;
      state.success = false;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(submitSpinningRecord.pending, (state) => {
        state.loading = true;
        state.success = false;
      })
      .addCase(submitSpinningRecord.fulfilled, (state) => {
        state.loading = false;
        state.success = true;
      })
      .addCase(submitSpinningRecord.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  },
});

export const { resetSpinningState } = spinSlice.actions;
export default spinSlice.reducer;
