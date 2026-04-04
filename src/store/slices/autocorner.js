import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import {
  submitAutocornerConePackingAuditEntry,
  submitAutocornerConeDensityEntry,
  submitAutocornerRewindingStudyEntry,
} from "@/apis/autocorner";

export const submitAutocornerRewindingStudy = createAsyncThunk(
  "autocorner/submitRewindingStudy",
  async (payload, { rejectWithValue }) => {
    try {
      return await submitAutocornerRewindingStudyEntry(payload);
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const submitAutocornerConeDensity = createAsyncThunk(
  "autocorner/submitConeDensity",
  async (payload, { rejectWithValue }) => {
    try {
      return await submitAutocornerConeDensityEntry(payload);
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const submitAutocornerConePackingAudit = createAsyncThunk(
  "autocorner/submitConePackingAudit",
  async (payload, { rejectWithValue }) => {
    try {
      return await submitAutocornerConePackingAuditEntry(payload);
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

const initialState = {
  data: null,
  isLoading: false,
  error: null,
};

const autocornerSlice = createSlice({
  name: "autocorner",
  initialState,
  reducers: {
    clearAutocornerState: (state) => {
      state.data = null;
      state.isLoading = false;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(submitAutocornerRewindingStudy.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(submitAutocornerRewindingStudy.fulfilled, (state, action) => {
        state.isLoading = false;
        state.data = action.payload;
      })
      .addCase(submitAutocornerRewindingStudy.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
      })
      .addCase(submitAutocornerConeDensity.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(submitAutocornerConeDensity.fulfilled, (state, action) => {
        state.isLoading = false;
        state.data = action.payload;
      })
      .addCase(submitAutocornerConeDensity.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
      })
      .addCase(submitAutocornerConePackingAudit.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(submitAutocornerConePackingAudit.fulfilled, (state, action) => {
        state.isLoading = false;
        state.data = action.payload;
      })
      .addCase(submitAutocornerConePackingAudit.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
      });
  },
});

export const { clearAutocornerState } = autocornerSlice.actions;
export default autocornerSlice.reducer;
