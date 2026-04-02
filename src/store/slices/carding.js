import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import {
    submitBetweenWithinCardEntry,
    submitCardThickPlaceEntry,
    submitNatiDataEntry,
} from "@/apis/carding";

/* =======================
   THUNKS
======================= */

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

/* =======================
   INITIAL STATE
======================= */

const initialState = {
    betweenWithin: null,
    cardThickPlace: null,
    nati: null,
    isLoading: false,
    error: null,
};

/* =======================
   SLICE
======================= */

const cardingSlice = createSlice({
    name: "carding",
    initialState,
    reducers: {
        clearCardingState: (state) => {
            state.betweenWithin = null;
            state.cardThickPlace = null;
            state.nati = null;
            state.isLoading = false;
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
            });
    },
});

/* =======================
   EXPORTS
======================= */

export const { clearCardingState } = cardingSlice.actions;
export default cardingSlice.reducer;