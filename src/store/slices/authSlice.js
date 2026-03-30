import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { loginAPI } from '../../apis/login';

// Async thunk action creator for login
export const loginUser = createAsyncThunk(
    'auth/loginUser',
    async ({ employee_id, password }, { rejectWithValue }) => {
        try {
            const data = await loginAPI(employee_id, password);
            return data;
        } catch (error) {
            return rejectWithValue(error.message);
        }
    }
);

const initialState = {
    user: null,
    token: typeof window !== 'undefined' ? localStorage.getItem('token') : null,
    isLoading: false,
    error: null,
};

const authSlice = createSlice({
    name: 'auth',
    initialState,
    reducers: {
        logout: (state) => {
            state.user = null;
            state.token = null;
            state.error = null;
            if (typeof window !== 'undefined') {
                localStorage.removeItem('token');
            }
        },
        clearError: (state) => {
            state.error = null;
        }
    },
    extraReducers: (builder) => {
        builder
            .addCase(loginUser.pending, (state) => {
                state.isLoading = true;
                state.error = null;
            })
            .addCase(loginUser.fulfilled, (state, action) => {
                state.isLoading = false;
                state.token = action.payload.token;
                state.user = action.payload.user || action.payload; 
                
                if (typeof window !== 'undefined' && action.payload.token) {
                    localStorage.setItem('token', action.payload.token);
                }
            })
            .addCase(loginUser.rejected, (state, action) => {
                state.isLoading = false;
                state.error = action.payload; 
            });
    },
});

export const { logout, clearError } = authSlice.actions;
export default authSlice.reducer;
