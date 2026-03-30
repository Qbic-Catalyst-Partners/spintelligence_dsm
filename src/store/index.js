import { configureStore } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice';
import rolesReducer from './slices/rolesSlice';
import operatorReducer from './slices/operatorSlice';
import mixingReducer from './slices/mixing';
import spinningReducer from "./slices/spinSlice";

export const store = configureStore({
  reducer: {
    auth: authReducer,
    roles: rolesReducer,
    mixing: mixingReducer,
    operator: operatorReducer,
    spinning: spinningReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
    }),
});

