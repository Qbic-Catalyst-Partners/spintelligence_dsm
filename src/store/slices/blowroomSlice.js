import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import {
  fetchBlowroomDataApi,
  saveBlowroomDataApi,
} from "../../apis/blowroom";

// ✅ GET
export const fetchBlowroomData = createAsyncThunk(
  "blowroom/fetchData",
  async (_, { rejectWithValue }) => {
    try {
      return await fetchBlowroomDataApi();
    } catch (err) {
      return rejectWithValue(err.message);
    }
  }
);

// ✅ POST
export const saveBlowroomData = createAsyncThunk(
  "blowroom/saveData",
  async (payload, { rejectWithValue }) => {
    try {
      return await saveBlowroomDataApi(payload);
    } catch (err) {
      return rejectWithValue(err.message);
    }
  }
);

const blowroomSlice = createSlice({
  name: "blowroom",
  initialState: {
    data: [],
    loading: false,
    success: false,
    message: "",
    error: null,
  },
  reducers: {
    resetState: (state) => {
      state.success = false;
      state.message = "";
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder

      // GET
      .addCase(fetchBlowroomData.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchBlowroomData.fulfilled, (state, action) => {
        state.loading = false;
        state.data = action.payload;
      })
      .addCase(fetchBlowroomData.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      // POST
      .addCase(saveBlowroomData.pending, (state) => {
        state.loading = true;
      })
      .addCase(saveBlowroomData.fulfilled, (state, action) => {
        state.loading = false;
        state.success = true;
        state.message = action.payload.message; // "Sync created"
      })
      .addCase(saveBlowroomData.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  },
});

export const { resetState } = blowroomSlice.actions;
export default blowroomSlice.reducer;