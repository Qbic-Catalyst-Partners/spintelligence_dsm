import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import {
  fetchAutoconerCountWiseCuts,
  fetchAutoconerConeDensity,
  fetchAutoconerConePackingAudit,
  fetchAutoconerDrumWise,
  fetchAutoconerLycraChecking,
  fetchAutoconerParameterEntries,
  fetchAutoconerRewindingStudy,
  fetchAutoconerSpliceStrength,
  submitAutoconerConeDensity,
  submitAutoconerConePackingAudit,
  submitAutoconerCountWiseCuts,
  submitAutoconerDrumWise,
  submitAutoconerLycraChecking,
  submitAutoconerParameterEntries,
  submitAutoconerRewindingStudy,
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

export const saveAutoconerRewindingStudy = createAsyncThunk(
  "autoconer/saveRewindingStudy",
  async (payload, { rejectWithValue }) => {
    try {
      return await submitAutoconerRewindingStudy(payload);
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const getAutoconerParameterEntries = createAsyncThunk(
  "autoconer/getParameterEntries",
  async (_, { rejectWithValue }) => {
    try {
      return await fetchAutoconerParameterEntries();
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const getAutoconerRewindingStudy = createAsyncThunk(
  "autoconer/getRewindingStudy",
  async ({ page = 1, limit = 10 } = {}, { rejectWithValue }) => {
    try {
      return await fetchAutoconerRewindingStudy({ page, limit });
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const saveAutoconerConeDensity = createAsyncThunk(
  "autoconer/saveConeDensity",
  async (payload, { rejectWithValue }) => {
    try {
      return await submitAutoconerConeDensity(payload);
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const getAutoconerConeDensity = createAsyncThunk(
  "autoconer/getConeDensity",
  async ({ page = 1, limit = 10 } = {}, { rejectWithValue }) => {
    try {
      return await fetchAutoconerConeDensity({ page, limit });
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const saveAutoconerConePackingAudit = createAsyncThunk(
  "autoconer/saveConePackingAudit",
  async (payload, { rejectWithValue }) => {
    try {
      return await submitAutoconerConePackingAudit(payload);
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const saveAutoconerParameterEntries = createAsyncThunk(
  "autoconer/saveParameterEntries",
  async (payload, { rejectWithValue }) => {
    try {
      return await submitAutoconerParameterEntries(payload);
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const getAutoconerConePackingAudit = createAsyncThunk(
  "autoconer/getConePackingAudit",
  async ({ page = 1, limit = 10 } = {}, { rejectWithValue }) => {
    try {
      return await fetchAutoconerConePackingAudit({ page, limit });
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
  parameterEntries: [],
  spliceStrength: [],
  spliceStrengthMeta: { page: 1, limit: 10, total: 0, totalPages: 0 },
  drumWise: [],
  drumWiseMeta: { page: 1, limit: 10, total: 0, totalPages: 0 },
  rewindingStudy: [],
  rewindingStudyMeta: { page: 1, limit: 10, total: 0, totalPages: 0 },
  coneDensity: [],
  coneDensityMeta: { page: 1, limit: 10, total: 0, totalPages: 0 },
  conePackingAudit: [],
  conePackingAuditMeta: { page: 1, limit: 10, total: 0, totalPages: 0 },
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
      .addCase(getAutoconerParameterEntries.pending, (state) => {
        state.isFetching = true;
        state.error = null;
      })
      .addCase(getAutoconerParameterEntries.fulfilled, (state, action) => {
        state.isFetching = false;
        state.parameterEntries = action.payload?.data || [];
      })
      .addCase(getAutoconerParameterEntries.rejected, (state, action) => {
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
      })
      .addCase(saveAutoconerRewindingStudy.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(saveAutoconerRewindingStudy.fulfilled, (state, action) => {
        state.isLoading = false;
        state.lastSaved = action.payload;
      })
      .addCase(saveAutoconerRewindingStudy.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
      })
      .addCase(getAutoconerRewindingStudy.pending, (state) => {
        state.isFetching = true;
        state.error = null;
      })
      .addCase(getAutoconerRewindingStudy.fulfilled, (state, action) => {
        state.isFetching = false;
        state.rewindingStudy = action.payload?.data || [];
        state.rewindingStudyMeta = {
          page: action.payload?.page || 1,
          limit: action.payload?.limit || 10,
          total: action.payload?.total || 0,
          totalPages: action.payload?.totalPages || 0,
        };
      })
      .addCase(getAutoconerRewindingStudy.rejected, (state, action) => {
        state.isFetching = false;
        state.error = action.payload;
      })
      .addCase(saveAutoconerConeDensity.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(saveAutoconerConeDensity.fulfilled, (state, action) => {
        state.isLoading = false;
        state.lastSaved = action.payload;
      })
      .addCase(saveAutoconerConeDensity.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
      })
      .addCase(getAutoconerConeDensity.pending, (state) => {
        state.isFetching = true;
        state.error = null;
      })
      .addCase(getAutoconerConeDensity.fulfilled, (state, action) => {
        state.isFetching = false;
        state.coneDensity = action.payload?.data || [];
        state.coneDensityMeta = {
          page: action.payload?.page || 1,
          limit: action.payload?.limit || 10,
          total: action.payload?.total || 0,
          totalPages: action.payload?.totalPages || 0,
        };
      })
      .addCase(getAutoconerConeDensity.rejected, (state, action) => {
        state.isFetching = false;
        state.error = action.payload;
      })
      .addCase(saveAutoconerConePackingAudit.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(saveAutoconerConePackingAudit.fulfilled, (state, action) => {
        state.isLoading = false;
        state.lastSaved = action.payload;
      })
      .addCase(saveAutoconerConePackingAudit.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
      })
      .addCase(saveAutoconerParameterEntries.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(saveAutoconerParameterEntries.fulfilled, (state, action) => {
        state.isLoading = false;
        state.lastSaved = action.payload;
      })
      .addCase(saveAutoconerParameterEntries.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
      })
      .addCase(getAutoconerConePackingAudit.pending, (state) => {
        state.isFetching = true;
        state.error = null;
      })
      .addCase(getAutoconerConePackingAudit.fulfilled, (state, action) => {
        state.isFetching = false;
        state.conePackingAudit = action.payload?.data || [];
        state.conePackingAuditMeta = {
          page: action.payload?.page || 1,
          limit: action.payload?.limit || 10,
          total: action.payload?.total || 0,
          totalPages: action.payload?.totalPages || 0,
        };
      })
      .addCase(getAutoconerConePackingAudit.rejected, (state, action) => {
        state.isFetching = false;
        state.error = action.payload;
      });
  },
});

export const { clearAutoconerState } = autoconerSlice.actions;
export default autoconerSlice.reducer;
