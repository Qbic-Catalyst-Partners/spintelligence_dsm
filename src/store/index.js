import { configureStore } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice';
// Configure the core Redux Store for the application
export const store = configureStore({
    reducer: {
        auth: authReducer,
        users: userReducer, 
    },
    middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({
            serializableCheck: false,
        }),
});
