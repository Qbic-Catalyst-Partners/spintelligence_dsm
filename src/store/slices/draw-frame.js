import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import {
  fetchDrawFrameCotsEntries as fetchDrawFrameCotsEntriesApi,
  fetchDrawFrameUqcEntries as fetchDrawFrameUqcEntriesApi,
  submitDrawFrameCotsInspection as submitDrawFrameCotsInspectionApi,
  submitDrawFrameUqcInspection as submitDrawFrameUqcInspectionApi,
  submitDrawFrameYarnCvInspection as submitDrawFrameYarnCvInspectionApi,
} from "@/apis/draw-frame";

export const submitDrawFrameYarnCvInspection = createAsyncThunk(
  "drawFrame/submitYarnCvInspection",
  async (payload, { rejectWithValue }) => {
    try {
      return await submitDrawFrameYarnCvInspectionApi(payload);
    } catch (error) {
      return rejectWithValue(error?.message || "Something went wrong");
    }
  }
);

export const submitDrawFrameCotsInspection = createAsyncThunk(
  "drawFrame/submitCotsInspection",
  async (payload, { rejectWithValue }) => {
    try {
      return await submitDrawFrameCotsInspectionApi(payload);
    } catch (error) {
      return rejectWithValue(error?.message || "Something went wrong");
    }
  }
);

export const fetchDrawFrameCotsEntries = createAsyncThunk(
  "drawFrame/fetchCotsEntries",
  async (params, { rejectWithValue }) => {
    try {
      return await fetchDrawFrameCotsEntriesApi(params);
    } catch (error) {
      return rejectWithValue(error?.message || "Something went wrong");
    }
  }
);

export const submitDrawFrameUqcInspection = createAsyncThunk(
  "drawFrame/submitUqcInspection",
  async (payload, { rejectWithValue }) => {
    try {
      return await submitDrawFrameUqcInspectionApi(payload);
    } catch (error) {
      return rejectWithValue(error?.message || "Something went wrong");
    }
  }
);

export const fetchDrawFrameUqcEntries = createAsyncThunk(
  "drawFrame/fetchUqcEntries",
  async (_, { rejectWithValue }) => {
    try {
      return await fetchDrawFrameUqcEntriesApi();
    } catch (error) {
      return rejectWithValue(error?.message || "Something went wrong");
    }
  }
);

const initialState = {
  data: null,
  cotsEntries: [],
  uqcEntries: [],
  actionLoading: false,
  actionSuccess: false,
  listLoading: false,
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
      .addCase(submitDrawFrameYarnCvInspection.pending, (state) => {
        state.actionLoading = true;
        state.actionSuccess = false;
        state.error = null;
      })
      .addCase(submitDrawFrameYarnCvInspection.fulfilled, (state, action) => {
        state.actionLoading = false;
        state.actionSuccess = true;
        state.data = action.payload;
      })
      .addCase(submitDrawFrameYarnCvInspection.rejected, (state, action) => {
        state.actionLoading = false;
        state.actionSuccess = false;
        state.error = action.payload;
      })
      .addCase(submitDrawFrameCotsInspection.pending, (state) => {
        state.actionLoading = true;
        state.actionSuccess = false;
        state.error = null;
      })
      .addCase(submitDrawFrameCotsInspection.fulfilled, (state, action) => {
        state.actionLoading = false;
        state.actionSuccess = true;
        state.data = action.payload;
      })
      .addCase(submitDrawFrameCotsInspection.rejected, (state, action) => {
        state.actionLoading = false;
        state.actionSuccess = false;
        state.error = action.payload;
      })
      .addCase(fetchDrawFrameCotsEntries.pending, (state) => {
        state.listLoading = true;
        state.error = null;
      })
      .addCase(fetchDrawFrameCotsEntries.fulfilled, (state, action) => {
        state.listLoading = false;
        state.cotsEntries = action.payload;
      })
      .addCase(fetchDrawFrameCotsEntries.rejected, (state, action) => {
        state.listLoading = false;
        state.error = action.payload;
      })
      .addCase(submitDrawFrameUqcInspection.pending, (state) => {
        state.actionLoading = true;
        state.actionSuccess = false;
        state.error = null;
      })
      .addCase(submitDrawFrameUqcInspection.fulfilled, (state, action) => {
        state.actionLoading = false;
        state.actionSuccess = true;
        state.data = action.payload;
      })
      .addCase(submitDrawFrameUqcInspection.rejected, (state, action) => {
        state.actionLoading = false;
        state.actionSuccess = false;
        state.error = action.payload;
      })
      .addCase(fetchDrawFrameUqcEntries.pending, (state) => {
        state.listLoading = true;
        state.error = null;
      })
      .addCase(fetchDrawFrameUqcEntries.fulfilled, (state, action) => {
        state.listLoading = false;
        state.uqcEntries = action.payload;
      })
      .addCase(fetchDrawFrameUqcEntries.rejected, (state, action) => {
        state.listLoading = false;
        state.error = action.payload;
      });
  },
});

export const { clearDrawFrameState } = drawFrameSlice.actions;
export default drawFrameSlice.reducer;
