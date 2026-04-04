import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import {
  fetchSimplexUqcEntries,
  submitSimplexUqcEntry,
} from "@/apis/simplex";

export const submitSimplexUqc = createAsyncThunk(
  "simplex/submitUqc",
  async (payload, { rejectWithValue }) => {
    try {
      return await submitSimplexUqcEntry(payload);
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const getSimplexUqcEntries = createAsyncThunk(
  "simplex/getUqcEntries",
  async ({ page = 1, limit = 10 } = {}, { rejectWithValue }) => {
    try {
      return await fetchSimplexUqcEntries({ page, limit });
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

const initialState = {
  data: null,
  uqcEntries: [],
  uqcMeta: { page: 1, limit: 10, total: 0, totalPages: 0 },
  isLoading: false,
  listLoading: false,
  error: null,
};

const simplexSlice = createSlice({
  name: "simplex",
  initialState,
  reducers: {
    clearSimplexState: (state) => {
      state.data = null;
      state.uqcEntries = [];
      state.uqcMeta = { page: 1, limit: 10, total: 0, totalPages: 0 };
      state.isLoading = false;
      state.listLoading = false;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(submitSimplexUqc.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(submitSimplexUqc.fulfilled, (state, action) => {
        state.isLoading = false;
        state.data = action.payload;
      })
      .addCase(submitSimplexUqc.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
      })
      .addCase(getSimplexUqcEntries.pending, (state) => {
        state.listLoading = true;
        state.error = null;
      })
      .addCase(getSimplexUqcEntries.fulfilled, (state, action) => {
        state.listLoading = false;
        state.uqcEntries = action.payload?.data || [];
        state.uqcMeta = {
          page: action.payload?.page || 1,
          limit: action.payload?.limit || 10,
          total: action.payload?.total || 0,
          totalPages: action.payload?.totalPages || 0,
        };
      })
      .addCase(getSimplexUqcEntries.rejected, (state, action) => {
        state.listLoading = false;
        state.error = action.payload;
      });
  },
});

export const { clearSimplexState } = simplexSlice.actions;
export default simplexSlice.reducer;
