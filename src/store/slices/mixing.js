import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { mixingCottonHVIDataEntry as mixingCottonHVIDataEntryApi } from '../../apis/mixing';

// Async thunk action creator for login
export const mixingDepartment = createAsyncThunk(
    'auth/mixingCottonHVIDataEntry',
    async (payload, { rejectWithValue }) => {
        try {
            const data = await mixingCottonHVIDataEntryApi(payload);
            return data;
        } catch (error) {
            return rejectWithValue(error.message);
        }
    }
);

const initialState = {
    data: null,
    isLoading: false,
    error: null,
};

const mixingDepartmentSlice = createSlice({
    name: 'mixingCottonHVIDataEntry',
    initialState,
    reducers: {},
    extraReducers: (builder) => {
        builder
            .addCase(mixingDepartment.pending, (state) => {
                state.isLoading = true;
                state.error = null;
            })
            .addCase(mixingDepartment.fulfilled, (state, action) => {
                state.isLoading = false;
                state.data = action.payload;
            })
            .addCase(mixingDepartment.rejected, (state, action) => {
                state.isLoading = false;
                state.error = action.payload;
            });
    },
});

export default mixingDepartmentSlice.reducer;
