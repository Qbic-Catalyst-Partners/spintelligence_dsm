import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import {
    mixingCottonHVIDataEntry  as cottonHVIApi,
    mixingFibreDataEntry      as fibreApi,
    mixingAfisDataEntry       as afisApi,
    mixingMoistureDataEntry   as moistureApi,
    mixingBrWasteStudyEntry   as brWasteApi,
    mixingDropTestDataEntry   as dropTestApi,
    mixingOpennessDataEntry   as opennessApi, 
} from '../../apis/mixing';

/* ================= THUNKS ================= */

export const submitCottonHVI = createAsyncThunk(
    'mixing/submitCottonHVI',
    async (payload, { rejectWithValue }) => {
        try { return await cottonHVIApi(payload); }
        catch (e) { return rejectWithValue(e.message); }
    }
);

export const submitFibre = createAsyncThunk(
    'mixing/submitFibre',
    async (payload, { rejectWithValue }) => {
        try { return await fibreApi(payload); }
        catch (e) { return rejectWithValue(e.message); }
    }
);

export const submitAfis = createAsyncThunk(
    'mixing/submitAfis',
    async (payload, { rejectWithValue }) => {
        try { return await afisApi(payload); }
        catch (e) { return rejectWithValue(e.message); }
    }
);

export const submitMoisture = createAsyncThunk(
    'mixing/submitMoisture',
    async (payload, { rejectWithValue }) => {
        try { return await moistureApi(payload); }
        catch (e) { return rejectWithValue(e.message); }
    }
);

export const submitBrWaste = createAsyncThunk(
    'mixing/submitBrWaste',
    async (payload, { rejectWithValue }) => {
        try { return await brWasteApi(payload); }
        catch (e) { return rejectWithValue(e.message); }
    }
);

/* Drop Test sends one request per tuft */
export const submitDropTest = createAsyncThunk(
    'mixing/submitDropTest',
    async ({ baseData, tufts }, { rejectWithValue }) => {
        try {
            const results = [];
            for (let i = 0; i < tufts.length; i++) {
                const result = await dropTestApi({
                    date:           baseData.date,
                    lot_no:         baseData.lotNo,
                    variety:        baseData.variety,
                    blend:          baseData.blend,
                    tuft_no:        i + 1,
                    tuft_variety:   tufts[i].tuftVariety,
                    act_display:    Number(tufts[i].actDisplay) || 0,
                    display_weight: Number(tufts[i].displayWt)  || 0,
                    actual_weight:  Number(tufts[i].actWt)      || 0,
                    difference:     Number(tufts[i].diff)       || 0,
                    ratio_percent:  Number(tufts[i].ratio)      || 0,
                });
                results.push(result);
            }
            return results;
        } catch (e) {
            return rejectWithValue(e.message);
        }
    }
);

export const submitOpenness = createAsyncThunk(
    'mixing/submitOpenness',
    async (payload, { rejectWithValue }) => {
        try {
            return await opennessApi(payload);
        } catch (e) {
            return rejectWithValue(e.message);
        }
    }
);

/* ================= SLICE ================= */

const initialState = {
    actionLoading: false,
    actionSuccess: false,
    error: null,
};

const pending   = (state)         => { state.actionLoading = true;  state.error = null; state.actionSuccess = false; };
const fulfilled = (state)         => { state.actionLoading = false; state.actionSuccess = true; };
const rejected  = (state, action) => { state.actionLoading = false; state.error = action.payload; };

const mixingSlice = createSlice({
    name: 'mixing',
    initialState,
    reducers: {
        clearMixingState: (state) => {
            state.actionLoading = false;
            state.actionSuccess = false;
            state.error = null;
        },
    },
    extraReducers: (builder) => {
        [submitCottonHVI, submitFibre, submitAfis, submitMoisture, submitBrWaste, submitDropTest, submitOpenness]
            .forEach(thunk => {
                builder
                    .addCase(thunk.pending,   pending)
                    .addCase(thunk.fulfilled, fulfilled)
                    .addCase(thunk.rejected,  rejected);
            });
    },
});

export const { clearMixingState } = mixingSlice.actions;
export default mixingSlice.reducer;
