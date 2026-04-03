import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { fetchComberUqcEntries, submitComberUqcEntry, submitNatiDataEntry, submitRibbonLapCVDataEntry } from "@/apis/comber";

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

export const submitComberUqcDataEntry = createAsyncThunk(
    "comber/submitUqcDataEntry",
    async (payload, { rejectWithValue }) => {
        try {
            const data = await submitComberUqcEntry(payload);
            return data;
        } catch (error) {
            return rejectWithValue(error.message);
        }
    }
);

export const fetchComberUqcDataEntries = createAsyncThunk(
    "comber/fetchUqcDataEntries",
    async (_, { rejectWithValue }) => {
        try {
            return await fetchComberUqcEntries();
        } catch (error) {
            return rejectWithValue(error.message);
        }
    }
);

const initialState = {
    data: null,
    uqcEntries: [],
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
            state.isLoading = false;
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
            .addCase(submitComberUqcDataEntry.pending, (state) => {
                state.isLoading = true;
                state.error = null;
            })
            .addCase(submitComberUqcDataEntry.fulfilled, (state, action) => {
                state.isLoading = false;
                state.data = action.payload;
            })
            .addCase(submitComberUqcDataEntry.rejected, (state, action) => {
                state.isLoading = false;
                state.error = action.payload;
            })
            .addCase(fetchComberUqcDataEntries.pending, (state) => {
                state.listLoading = true;
                state.error = null;
            })
            .addCase(fetchComberUqcDataEntries.fulfilled, (state, action) => {
                state.listLoading = false;
                state.uqcEntries = action.payload;
            })
            .addCase(fetchComberUqcDataEntries.rejected, (state, action) => {
                state.listLoading = false;
                state.error = action.payload;
            });
    },
});

export const { clearComberState } = comberSlice.actions;
export default comberSlice.reducer;
