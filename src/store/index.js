import { configureStore } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice';
<<<<<<< HEAD
import rolesReducer from './slices/rolesSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    roles: rolesReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
    }),
});
=======

// Configure the core Redux Store for the application
export const store = configureStore({
    reducer: {
        auth: authReducer,
    },
    middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({
            serializableCheck: false,
        }),
});
>>>>>>> 9520038087bdf8bd59e0db750d4d32857fe2449e
