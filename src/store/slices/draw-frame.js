import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { submitDrawFrameInspection as submitDrawFrameInspectionApi } from "@/apis/draw-frame";

export const submitDrawFrameInspection = createAsyncThunk(
  "drawFrame/submitInspection",
  async (payload, { rejectWithValue }) => {
    try {
      const response = await submitDrawFrameInspectionApi(payload);

      // ensure correct return
      return response;
    } catch (error) {
      return rejectWithValue(
        error?.message || "Something went wrong"
      );
    }
  }
);

const initialState = {
    data: null,
    actionLoading: false,
    actionSuccess: false,
    error: null,
};

const drawFrameSlice = createSlice({
    name: "drawFrame",
    initialState,
    reducers: {
        clearDrawFrameState: (state) => {
            state.data = null;
            state.actionLoading = false;
            state.actionSuccess = false;
            state.error = null;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(submitDrawFrameInspection.pending, (state) => {
                state.actionLoading = true;
                state.actionSuccess = false;
                state.error = null;
            })
            .addCase(submitDrawFrameInspection.fulfilled, (state, action) => {
                state.actionLoading = false;
                state.actionSuccess = true;
                state.data = action.payload;
            })
            .addCase(submitDrawFrameInspection.rejected, (state, action) => {
                state.actionLoading = false;
                state.actionSuccess = false;
                state.error = action.payload;
            });
    },
});

export const { clearDrawFrameState } = drawFrameSlice.actions;
export default drawFrameSlice.reducer;
