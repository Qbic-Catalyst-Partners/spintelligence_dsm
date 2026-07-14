import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import {
    fetchCardingDfkPressureEntries,
    submitBetweenWithinCardEntry,
    submitCardThickPlaceEntry,
    submitCardingDfkPressureEntry,
    submitNatiDataEntry,
    submitCardingUqcEntry,
    fetchCardingUqcEntries,
    submitCardingNreEntry,
} from "@/apis/carding";



// Between & Within
export const submitCardingBetweenWithin = createAsyncThunk(
    "carding/submitBetweenWithin",
    async (payload, { rejectWithValue }) => {
        try {
            return await submitBetweenWithinCardEntry(payload);
        } catch (error) {
            return rejectWithValue(error.message);
        }
    }
);

// Card Thick Place
export const submitCardingCardThickPlace = createAsyncThunk(
    "carding/submitCardThickPlace",
    async (payload, { rejectWithValue }) => {
        try {
            return await submitCardThickPlaceEntry(payload);
        } catch (error) {
            return rejectWithValue(error.message);
        }
    }
);

// Carding NRE%
export const submitCardingNre = createAsyncThunk(
    "carding/submitNre",
    async (payload, { rejectWithValue }) => {
        try {
            return await submitCardingNreEntry(payload);
        } catch (error) {
            return rejectWithValue(error.message);
        }
    }
);

// Nati Data Entry
export const submitCardingNati = createAsyncThunk(
    "carding/submitNati",
    async (payload, { rejectWithValue }) => {
        try {
            return await submitNatiDataEntry(payload);
        } catch (error) {
            return rejectWithValue(error.message);
        }
    }
);

export const submitCardingDfkPressure = createAsyncThunk(
    "carding/submitDfkPressure",
    async (payload, { rejectWithValue }) => {
        try {
            return await submitCardingDfkPressureEntry(payload);
        } catch (error) {
            return rejectWithValue(error.message);
        }
    }
);

export const fetchCardingDfkPressure = createAsyncThunk(
    "carding/fetchDfkPressure",
    async ({ page = 1, limit = 10 } = {}, { rejectWithValue }) => {
        try {
            return await fetchCardingDfkPressureEntries({ page, limit });
        } catch (error) {
            return rejectWithValue(error.message);
        }
    }
);

export const submitCardingUqc = createAsyncThunk(
    "carding/submitUqc",
    async (payload, { rejectWithValue }) => {
        try {
            return await submitCardingUqcEntry(payload);
        } catch (error) {
            return rejectWithValue(error.message);
        }
    }
);

export const getCardingUqcEntries = createAsyncThunk(
    "carding/getUqcEntries",
    async ({ page = 1, limit = 10, global = false, department = "" } = {}, { rejectWithValue }) => {
        try {
            return await fetchCardingUqcEntries({ page, limit, global, department });
        } catch (error) {
            return rejectWithValue(error.message);
        }
    }
);


const initialState = {
    betweenWithin: null,
    cardThickPlace: null,
    nre: null,
    nati: null,
    dfkPressure: null,
    dfkPressureEntries: [],
    dfkPressureMeta: { page: 1, limit: 10, total: 0, totalPages: 0 },
    uqc: null,
    uqcEntries: [],
    uqcMeta: { page: 1, limit: 10, total: 0, totalPages: 0 },
    isLoading: false,
    listLoading: false,
    error: null,
};



const cardingSlice = createSlice({
    name: "carding",
    initialState,
    reducers: {
        clearCardingState: (state) => {
            state.betweenWithin = null;
            state.cardThickPlace = null;
            state.nre = null;
            state.nati = null;
            state.dfkPressure = null;
            state.uqc = null;
            state.isLoading = false;
            state.listLoading = false;
            state.error = null;
        },
    },
    extraReducers: (builder) => {
        builder

            /* =======================
               BETWEEN & WITHIN
            ======================= */
            .addCase(submitCardingBetweenWithin.pending, (state) => {
                state.isLoading = true;
                state.error = null;
            })
            .addCase(submitCardingBetweenWithin.fulfilled, (state, action) => {
                state.isLoading = false;
                state.betweenWithin = action.payload;
            })
            .addCase(submitCardingBetweenWithin.rejected, (state, action) => {
                state.isLoading = false;
                state.error = action.payload;
            })

            /* =======================
               CARD THICK PLACE
            ======================= */
            .addCase(submitCardingCardThickPlace.pending, (state) => {
                state.isLoading = true;
                state.error = null;
            })
            .addCase(submitCardingCardThickPlace.fulfilled, (state, action) => {
                state.isLoading = false;
                state.cardThickPlace = action.payload;
            })
            .addCase(submitCardingCardThickPlace.rejected, (state, action) => {
                state.isLoading = false;
                state.error = action.payload;
            })

            /* =======================
               CARDING NRE%
            ======================= */
            .addCase(submitCardingNre.pending, (state) => {
                state.isLoading = true;
                state.error = null;
            })
            .addCase(submitCardingNre.fulfilled, (state, action) => {
                state.isLoading = false;
                state.nre = action.payload;
            })
            .addCase(submitCardingNre.rejected, (state, action) => {
                state.isLoading = false;
                state.error = action.payload;
            })

            /* =======================
               NATI DATA ENTRY
            ======================= */
            .addCase(submitCardingNati.pending, (state) => {
                state.isLoading = true;
                state.error = null;
            })
            .addCase(submitCardingNati.fulfilled, (state, action) => {
                state.isLoading = false;
                state.nati = action.payload;
            })
            .addCase(submitCardingNati.rejected, (state, action) => {
                state.isLoading = false;
                state.error = action.payload;
            })

            /* =======================
               DFK PRESSURE
            ======================= */
            .addCase(submitCardingDfkPressure.pending, (state) => {
                state.isLoading = true;
                state.error = null;
            })
            .addCase(submitCardingDfkPressure.fulfilled, (state, action) => {
                state.isLoading = false;
                state.dfkPressure = action.payload;
            })
            .addCase(submitCardingDfkPressure.rejected, (state, action) => {
                state.isLoading = false;
                state.error = action.payload;
            })

            .addCase(fetchCardingDfkPressure.pending, (state) => {
                state.listLoading = true;
                state.error = null;
            })
            .addCase(fetchCardingDfkPressure.fulfilled, (state, action) => {
                state.listLoading = false;
                state.dfkPressureEntries = action.payload?.data || [];
                state.dfkPressureMeta = {
                    page: action.payload?.page || 1,
                    limit: action.payload?.limit || 10,
                    total: action.payload?.total || 0,
                    totalPages: action.payload?.totalPages || 0,
                };
            })
            .addCase(fetchCardingDfkPressure.rejected, (state, action) => {
                state.listLoading = false;
                state.error = action.payload;
            })

            /* =======================
               UQC DATA ENTRY
            ======================= */
            .addCase(submitCardingUqc.pending, (state) => {
                state.isLoading = true;
                state.error = null;
            })
            .addCase(submitCardingUqc.fulfilled, (state, action) => {
                state.isLoading = false;
                state.uqc = action.payload;
            })
            .addCase(submitCardingUqc.rejected, (state, action) => {
                state.isLoading = false;
                state.error = action.payload;
            })

            .addCase(getCardingUqcEntries.pending, (state) => {
                state.listLoading = true;
                state.error = null;
            })
            .addCase(getCardingUqcEntries.fulfilled, (state, action) => {
                state.listLoading = false;
                state.uqcEntries = action.payload?.data || [];
                state.uqcMeta = {
                    page: action.payload?.page || 1,
                    limit: action.payload?.limit || 10,
                    total: action.payload?.total || 0,
                    totalPages: action.payload?.totalPages || 0,
                };
            })
            .addCase(getCardingUqcEntries.rejected, (state, action) => {
                state.listLoading = false;
                state.error = action.payload;
            });
    },
});

/* =======================
   EXPORTS
======================= */

export const { clearCardingState } = cardingSlice.actions;
export default cardingSlice.reducer;
