import { configureStore } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice';
import rolesReducer from './slices/rolesSlice';
import operatorReducer from './slices/operatorSlice';
import mixingReducer from './slices/mixing';
import comberReducer from './slices/comber';
import cardingReducer from './slices/carding';

import spinningReducer from "./slices/spinSlice";
import userReducer from "./slices/userSlice"; 
import supervisorReducer from "./slices/supervisorSlice";
import drawFrameReducer from "./slices/draw-frame";
import simplexReducer from "./slices/simplex";

export const store = configureStore({
  reducer: {
    auth: authReducer,
    roles: rolesReducer,
    mixing: mixingReducer,
    comber: comberReducer,
     carding: cardingReducer,
    drawFrame: drawFrameReducer,
    operator: operatorReducer,
    spinning: spinningReducer,
    users: userReducer,
    supervisor: supervisorReducer,
    drawFrame: drawFrameReducer,
    simplex: simplexReducer,

  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
    }),
});
