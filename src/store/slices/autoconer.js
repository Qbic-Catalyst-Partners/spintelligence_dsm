import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import {
  fetchAutoconerCountWiseCuts,
  fetchAutoconerDrumWise,
  fetchAutoconerLycraChecking,
  fetchAutoconerSpliceStrength,
  submitAutoconerCountWiseCuts,
  submitAutoconerDrumWise,
  submitAutoconerLycraChecking,
  submitAutoconerSpliceStrength,
} from "@/apis/autoconer";

export const saveAutoconerLycraChecking = createAsyncThunk(
  "autoconer/saveLycraChecking",
  async (payload, { rejectWithValue }) => {
    try {
      return await submitAutoconerLycraChecking(payload);
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const getAutoconerLycraChecking = createAsyncThunk(
  "autoconer/getLycraChecking",
  async (_, { rejectWithValue }) => {
    try {
      return await fetchAutoconerLycraChecking();
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const saveAutoconerCountWiseCuts = createAsyncThunk(
  "autoconer/saveCountWiseCuts",
  async (payload, { rejectWithValue }) => {
    try {
      return await submitAutoconerCountWiseCuts(payload);
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const getAutoconerCountWiseCuts = createAsyncThunk(
  "autoconer/getCountWiseCuts",
  async (_, { rejectWithValue }) => {
    try {
      return await fetchAutoconerCountWiseCuts();
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const saveAutoconerSpliceStrength = createAsyncThunk(
  "autoconer/saveSpliceStrength",
  async (payload, { rejectWithValue }) => {
    try {
      return await submitAutoconerSpliceStrength(payload);
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const getAutoconerSpliceStrength = createAsyncThunk(
  "autoconer/getSpliceStrength",
  async ({ page = 1, limit = 10 } = {}, { rejectWithValue }) => {
    try {
      return await fetchAutoconerSpliceStrength({ page, limit });
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const saveAutoconerDrumWise = createAsyncThunk(
  "autoconer/saveDrumWise",
  async (payload, { rejectWithValue }) => {
    try {
      return await submitAutoconerDrumWise(payload);
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const getAutoconerDrumWise = createAsyncThunk(
  "autoconer/getDrumWise",
  async ({ page = 1, limit = 10 } = {}, { rejectWithValue }) => {
    try {
      return await fetchAutoconerDrumWise({ page, limit });
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

const initialState = {
  isLoading: false,
  isFetching: false,
  error: null,
  lycraChecking: [],
  countWiseCuts: [],
  spliceStrength: [],
  spliceStrengthMeta: { page: 1, limit: 10, total: 0, totalPages: 0 },
  drumWise: [],
  drumWiseMeta: { page: 1, limit: 10, total: 0, totalPages: 0 },
  lastSaved: null,
};

const autoconerSlice = createSlice({
  name: "autoconer",
  initialState,
  reducers: {
    clearAutoconerState: (state) => {
      state.error = null;
      state.lastSaved = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(saveAutoconerLycraChecking.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(saveAutoconerLycraChecking.fulfilled, (state, action) => {
        state.isLoading = false;
        state.lastSaved = action.payload;
      })
      .addCase(saveAutoconerLycraChecking.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
      })
      .addCase(getAutoconerLycraChecking.pending, (state) => {
        state.isFetching = true;
        state.error = null;
      })
      .addCase(getAutoconerLycraChecking.fulfilled, (state, action) => {
        state.isFetching = false;
        state.lycraChecking = action.payload?.data || [];
      })
      .addCase(getAutoconerLycraChecking.rejected, (state, action) => {
        state.isFetching = false;
        state.error = action.payload;
      })
      .addCase(saveAutoconerCountWiseCuts.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(saveAutoconerCountWiseCuts.fulfilled, (state, action) => {
        state.isLoading = false;
        state.lastSaved = action.payload;
      })
      .addCase(saveAutoconerCountWiseCuts.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
      })
      .addCase(getAutoconerCountWiseCuts.pending, (state) => {
        state.isFetching = true;
        state.error = null;
      })
      .addCase(getAutoconerCountWiseCuts.fulfilled, (state, action) => {
        state.isFetching = false;
        state.countWiseCuts = Array.isArray(action.payload) ? action.payload : [];
      })
      .addCase(getAutoconerCountWiseCuts.rejected, (state, action) => {
        state.isFetching = false;
        state.error = action.payload;
      })
      .addCase(saveAutoconerSpliceStrength.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(saveAutoconerSpliceStrength.fulfilled, (state, action) => {
        state.isLoading = false;
        state.lastSaved = action.payload;
      })
      .addCase(saveAutoconerSpliceStrength.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
      })
      .addCase(getAutoconerSpliceStrength.pending, (state) => {
        state.isFetching = true;
        state.error = null;
      })
      .addCase(getAutoconerSpliceStrength.fulfilled, (state, action) => {
        state.isFetching = false;
        state.spliceStrength = action.payload?.data || [];
        state.spliceStrengthMeta = {
          page: action.payload?.page || 1,
          limit: action.payload?.limit || 10,
          total: action.payload?.total || 0,
          totalPages: action.payload?.totalPages || 0,
        };
      })
      .addCase(getAutoconerSpliceStrength.rejected, (state, action) => {
        state.isFetching = false;
        state.error = action.payload;
      })
      .addCase(saveAutoconerDrumWise.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(saveAutoconerDrumWise.fulfilled, (state, action) => {
        state.isLoading = false;
        state.lastSaved = action.payload;
      })
      .addCase(saveAutoconerDrumWise.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
      })
      .addCase(getAutoconerDrumWise.pending, (state) => {
        state.isFetching = true;
        state.error = null;
      })
      .addCase(getAutoconerDrumWise.fulfilled, (state, action) => {
        state.isFetching = false;
        state.drumWise = action.payload?.data || [];
        state.drumWiseMeta = {
          page: action.payload?.page || 1,
          limit: action.payload?.limit || 10,
          total: action.payload?.total || 0,
          totalPages: action.payload?.totalPages || 0,
        };
      })
      .addCase(getAutoconerDrumWise.rejected, (state, action) => {
        state.isFetching = false;
        state.error = action.payload;
      });
  },
});

export const { clearAutoconerState } = autoconerSlice.actions;
export default autoconerSlice.reducer;
