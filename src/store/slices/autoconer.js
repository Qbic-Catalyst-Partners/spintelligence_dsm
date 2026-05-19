import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import {
  fetchAutoconerCountWiseCuts,
  fetchAutoconerConeDensity,
  fetchAutoconerConePackingAudit,
  fetchAutoconerDrumWise,
  fetchAutoconerLycraChecking,
  fetchAutoconerPendingCspParameterEntries,
  fetchAutoconerPendingQualityParameterEntries,
  fetchAutoconerParameterEntries,
  fetchAutoconerRewindingStudy,
  fetchAutoconerSpliceStrength,
  submitAutoconerConeDensity,
  submitAutoconerConePackingAudit,
  submitAutoconerCountWiseCuts,
  submitAutoconerDrumWise,
  submitAutoconerLycraChecking,
  submitAutoconerParameterEntry,
  submitAutoconerRewindingStudy,
  submitAutoconerSpliceStrength,
  updateAutoconerParameterEntry,
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

export const getAutoconerPendingCspParameterEntries = createAsyncThunk(
  "autoconer/getPendingCspParameterEntries",
  async (_, { rejectWithValue }) => {
    try {
      return await fetchAutoconerPendingCspParameterEntries();
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const getAutoconerPendingQualityParameterEntries = createAsyncThunk(
  "autoconer/getPendingQualityParameterEntries",
  async (_, { rejectWithValue }) => {
    try {
      return await fetchAutoconerPendingQualityParameterEntries();
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const saveAutoconerParameterEntriesCsp = createAsyncThunk(
  "autoconer/saveParameterEntriesCsp",
  async (payload, { rejectWithValue }) => {
    try {
      if (payload?.id) {
        return await updateAutoconerParameterEntry(payload.id, payload);
      }
      return await submitAutoconerParameterEntry(payload);
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const saveAutoconerParameterEntriesOther = createAsyncThunk(
  "autoconer/saveParameterEntriesOther",
  async (payload, { rejectWithValue }) => {
    try {
      if (payload?.id) {
        return await updateAutoconerParameterEntry(payload.id, payload);
      }
      return await submitAutoconerParameterEntry(payload);
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
  pendingCspParameterEntries: [],
  pendingQualityParameterEntries: [],
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

const getEntryId = (entry) => entry?.id ?? entry?._id ?? entry?.entry_id ?? null;

const normalizeParameterEntry = (entry) => {
  if (!entry) return null;

  const payloadValues = entry?.payload?.values ?? entry?.values ?? {};
  const normalizedValues = {
    actCount:
      payloadValues.actCount ?? entry?.actCount ?? entry?.act_count ?? "",
    strength:
      payloadValues.strength ?? entry?.strength ?? "",
    countCv:
      payloadValues.countCv ?? entry?.countCv ?? entry?.count_cv ?? "",
    strengthCv:
      payloadValues.strengthCv ?? entry?.strengthCv ?? entry?.strength_cv ?? "",
    cv1:
      payloadValues.cv1 ??
      payloadValues.countCv ??
      entry?.cv1 ??
      entry?.countCv ??
      entry?.count_cv ??
      "",
    cv2:
      payloadValues.cv2 ??
      payloadValues.strengthCv ??
      entry?.cv2 ??
      entry?.strengthCv ??
      entry?.strength_cv ??
      "",
    csp:
      payloadValues.csp ?? entry?.csp ?? "",
    coneColor:
      payloadValues.coneColor ?? entry?.coneColor ?? entry?.cone_color ?? "",
    uPercent:
      payloadValues.uPercent ?? entry?.uPercent ?? entry?.u ?? "",
    cvm:
      payloadValues.cvm ?? entry?.cvm ?? "",
    oneMtrCv:
      payloadValues.oneMtrCv ?? entry?.oneMtrCv ?? entry?.cv_1m ?? "",
    threeMtrCv:
      payloadValues.threeMtrCv ?? entry?.threeMtrCv ?? entry?.cv_3m ?? "",
    tenMtrCv:
      payloadValues.tenMtrCv ?? entry?.tenMtrCv ?? entry?.cv_10m ?? "",
    brOnePointFive:
      payloadValues.brOnePointFive ?? entry?.brOnePointFive ?? entry?.br_1_5mm ?? "",
    cvb:
      payloadValues.cvb ?? entry?.cvb ?? "",
    thinMinus50:
      payloadValues.thinMinus50 ?? entry?.thinMinus50 ?? entry?.thin_minus_50 ?? "",
    thickPlus50:
      payloadValues.thickPlus50 ?? entry?.thickPlus50 ?? entry?.thick_plus_50 ?? "",
    nepsPlus200:
      payloadValues.nepsPlus200 ?? entry?.nepsPlus200 ?? entry?.neps_plus_200 ?? "",
    totalOne:
      payloadValues.totalOne ?? entry?.totalOne ?? entry?.total_1 ?? "",
    thinMinus40:
      payloadValues.thinMinus40 ?? entry?.thinMinus40 ?? entry?.thin_minus_40 ?? "",
    thickPlus35:
      payloadValues.thickPlus35 ?? entry?.thickPlus35 ?? entry?.thick_plus_35 ?? "",
    thickPlus70:
      payloadValues.thickPlus70 ?? entry?.thickPlus70 ?? entry?.thick_plus_70 ?? "",
    nepsPlus140:
      payloadValues.nepsPlus140 ?? entry?.nepsPlus140 ?? entry?.neps_plus_140 ?? "",
    totalTwo:
      payloadValues.totalTwo ?? entry?.totalTwo ?? entry?.total_2 ?? "",
    thinMinus30:
      payloadValues.thinMinus30 ?? entry?.thinMinus30 ?? entry?.thin_minus_30 ?? "",
    nepsPlus400:
      payloadValues.nepsPlus400 ?? entry?.nepsPlus400 ?? entry?.neps_plus_400 ?? "",
  };

  return {
    ...entry,
    id: getEntryId(entry) ?? entry?.id ?? `temp-${Date.now()}`,
    values: normalizedValues,
    payload: {
      ...(entry?.payload ?? {}),
      values: {
        ...normalizedValues,
      },
    },
  };
};

const upsertEntry = (entries = [], entry) => {
  const normalizedEntry = normalizeParameterEntry(entry);
  if (!normalizedEntry) return entries;

  const nextEntries = Array.isArray(entries) ? [...entries] : [];
  const normalizedId = getEntryId(normalizedEntry);

  if (!normalizedId) {
    return [normalizedEntry, ...nextEntries];
  }

  const existingIndex = nextEntries.findIndex(
    (currentEntry) => String(getEntryId(currentEntry)) === String(normalizedId)
  );

  if (existingIndex === -1) {
    return [normalizedEntry, ...nextEntries];
  }

  nextEntries[existingIndex] = {
    ...nextEntries[existingIndex],
    ...normalizedEntry,
    payload: {
      ...(nextEntries[existingIndex]?.payload ?? {}),
      ...(normalizedEntry?.payload ?? {}),
      values: {
        ...(nextEntries[existingIndex]?.payload?.values ?? {}),
        ...(nextEntries[existingIndex]?.values ?? {}),
        ...(normalizedEntry?.payload?.values ?? {}),
        ...(normalizedEntry?.values ?? {}),
      },
    },
    values: {
      ...(nextEntries[existingIndex]?.values ?? {}),
      ...(nextEntries[existingIndex]?.payload?.values ?? {}),
      ...(normalizedEntry?.values ?? {}),
      ...(normalizedEntry?.payload?.values ?? {}),
    },
  };

  return nextEntries;
};

const mergeEntryCollections = (existingEntries = [], incomingEntries = []) => {
  let mergedEntries = Array.isArray(existingEntries) ? [...existingEntries] : [];

  (incomingEntries || []).forEach((entry) => {
    mergedEntries = upsertEntry(mergedEntries, entry);
  });

  return mergedEntries;
};

const isParameterEntryLike = (entry) =>
  Boolean(
    entry &&
    (
      getEntryId(entry) ||
      entry.entry_date ||
      entry.count_name ||
      entry.inspection_type ||
      entry.act_count !== undefined ||
      entry.count_cv !== undefined ||
      entry.cv1 !== undefined ||
      entry.u !== undefined
    )
  );

const getSavedEntryPayload = (action) => {
  const responseData = action.payload?.data;
  if (isParameterEntryLike(responseData)) {
    return normalizeParameterEntry(responseData);
  }

  if (isParameterEntryLike(action.payload)) {
    return normalizeParameterEntry(action.payload);
  }

  return normalizeParameterEntry(action.meta?.arg || null);
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
        state.parameterEntries = mergeEntryCollections(
          state.parameterEntries,
          (action.payload?.data || []).map(normalizeParameterEntry).filter(Boolean)
        );
      })
      .addCase(getAutoconerParameterEntries.rejected, (state, action) => {
        state.isFetching = false;
        state.error = action.payload;
      })
      .addCase(getAutoconerPendingCspParameterEntries.pending, (state) => {
        state.isFetching = true;
        state.error = null;
      })
      .addCase(getAutoconerPendingCspParameterEntries.fulfilled, (state, action) => {
        state.isFetching = false;
        state.pendingCspParameterEntries = (action.payload?.data || action.payload || [])
          .map(normalizeParameterEntry)
          .filter(Boolean);
      })
      .addCase(getAutoconerPendingCspParameterEntries.rejected, (state, action) => {
        state.isFetching = false;
        state.error = action.payload;
      })
      .addCase(getAutoconerPendingQualityParameterEntries.pending, (state) => {
        state.isFetching = true;
        state.error = null;
      })
      .addCase(getAutoconerPendingQualityParameterEntries.fulfilled, (state, action) => {
        state.isFetching = false;
        state.pendingQualityParameterEntries = (action.payload?.data || action.payload || [])
          .map(normalizeParameterEntry)
          .filter(Boolean);
      })
      .addCase(getAutoconerPendingQualityParameterEntries.rejected, (state, action) => {
        state.isFetching = false;
        state.error = action.payload;
      })
      .addCase(saveAutoconerParameterEntriesCsp.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(saveAutoconerParameterEntriesCsp.fulfilled, (state, action) => {
        state.isLoading = false;
        state.lastSaved = action.payload;
        const savedEntry = getSavedEntryPayload(action);
        state.parameterEntries = upsertEntry(state.parameterEntries, savedEntry);
        state.pendingCspParameterEntries = state.pendingCspParameterEntries.filter(
          (entry) => String(getEntryId(entry)) !== String(getEntryId(savedEntry))
        );
        state.pendingQualityParameterEntries = upsertEntry(
          state.pendingQualityParameterEntries,
          savedEntry
        );
      })
      .addCase(saveAutoconerParameterEntriesCsp.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
      })
      .addCase(saveAutoconerParameterEntriesOther.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(saveAutoconerParameterEntriesOther.fulfilled, (state, action) => {
        state.isLoading = false;
        state.lastSaved = action.payload;
        const savedEntry = getSavedEntryPayload(action);
        state.parameterEntries = upsertEntry(state.parameterEntries, savedEntry);
        state.pendingQualityParameterEntries = state.pendingQualityParameterEntries.filter(
          (entry) => String(getEntryId(entry)) !== String(getEntryId(savedEntry))
        );
        state.pendingCspParameterEntries = upsertEntry(
          state.pendingCspParameterEntries,
          savedEntry
        );
      })
      .addCase(saveAutoconerParameterEntriesOther.rejected, (state, action) => {
        state.isLoading = false;
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
