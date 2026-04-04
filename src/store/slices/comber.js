import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import {
    fetchComberUqcEntries,
    submitComberUqcEntry,
    submitNatiDataEntry,
    submitRibbonLapCVDataEntry
} from "@/apis/comber";

export const submitComberRibbonLapCV = createAsyncThunk(
    "comber/submitRibbonLapCV",
    async (payload, { rejectWithValue }) => {
        try {
            const data = await submitRibbonLapCVDataEntry(payload);
            return data;
        } catch (error) {
            return rejectWithValue(error.message);
        }
    }
);

export const submitComberNatiDataEntry = createAsyncThunk(
    "comber/submitNatiDataEntry",
    async (payload, { rejectWithValue }) => {
        try {
            const data = await submitNatiDataEntry(payload);
            return data;
        } catch (error) {
            return rejectWithValue(error.message);
        }
    }
);

export const submitComberUqc = createAsyncThunk(
    "comber/submitUqc",
    async (payload, { rejectWithValue }) => {
        try {
            return await submitComberUqcEntry(payload);
        } catch (error) {
            return rejectWithValue(error.message);
        }
    }
);

export const getComberUqcEntries = createAsyncThunk(
    "comber/getUqcEntries",
    async ({ page = 1, limit = 10 } = {}, { rejectWithValue }) => {
        try {
            return await fetchComberUqcEntries({ page, limit });
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

const comberSlice = createSlice({
    name: "comber",
    initialState,
    reducers: {
        clearComberState: (state) => {
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
            .addCase(submitComberRibbonLapCV.pending, (state) => {
                state.isLoading = true;
                state.error = null;
            })
            .addCase(submitComberRibbonLapCV.fulfilled, (state, action) => {
                state.isLoading = false;
                state.data = action.payload;
            })
            .addCase(submitComberRibbonLapCV.rejected, (state, action) => {
                state.isLoading = false;
                state.error = action.payload;
            })
            .addCase(submitComberNatiDataEntry.pending, (state) => {
                state.isLoading = true;
                state.error = null;
            })
            .addCase(submitComberNatiDataEntry.fulfilled, (state, action) => {
                state.isLoading = false;
                state.data = action.payload;
            })
            .addCase(submitComberNatiDataEntry.rejected, (state, action) => {
                state.isLoading = false;
                state.error = action.payload;
            })
            .addCase(submitComberUqc.pending, (state) => {
                state.isLoading = true;
                state.error = null;
            })
            .addCase(submitComberUqc.fulfilled, (state, action) => {
                state.isLoading = false;
                state.data = action.payload;
            })
            .addCase(submitComberUqc.rejected, (state, action) => {
                state.isLoading = false;
                state.error = action.payload;
            })
            .addCase(getComberUqcEntries.pending, (state) => {
                state.listLoading = true;
                state.error = null;
            })
            .addCase(getComberUqcEntries.fulfilled, (state, action) => {
                state.listLoading = false;
                state.uqcEntries = action.payload?.data || [];
                state.uqcMeta = {
                    page: action.payload?.page || 1,
                    limit: action.payload?.limit || 10,
                    total: action.payload?.total || 0,
                    totalPages: action.payload?.totalPages || 0,
                };
            })
            .addCase(getComberUqcEntries.rejected, (state, action) => {
                state.listLoading = false;
                state.error = action.payload;
            });
    },
});

export const { clearComberState } = comberSlice.actions;
export default comberSlice.reducer;
