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
<<<<<<< HEAD
=======
            // By rejecting with value, this payload is sent to the 'rejected' reducer block
>>>>>>> 9520038087bdf8bd59e0db750d4d32857fe2449e
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
<<<<<<< HEAD
                state.user = action.payload.user || action.payload; 
                
=======
                // Save user metadata if it is returned from your API payloads
                state.user = action.payload.user || action.payload; 
                
                // localStorage is also updated locally in the views but handling here enforces robustness
>>>>>>> 9520038087bdf8bd59e0db750d4d32857fe2449e
                if (typeof window !== 'undefined' && action.payload.token) {
                    localStorage.setItem('token', action.payload.token);
                }
            })
            .addCase(loginUser.rejected, (state, action) => {
                state.isLoading = false;
<<<<<<< HEAD
                state.error = action.payload; 
=======
                state.error = action.payload; // Pulled directly from `rejectWithValue` in the thunk
>>>>>>> 9520038087bdf8bd59e0db750d4d32857fe2449e
            });
    },
});

export const { logout, clearError } = authSlice.actions;
export default authSlice.reducer;
