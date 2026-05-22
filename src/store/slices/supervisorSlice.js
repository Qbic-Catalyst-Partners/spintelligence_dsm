import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import {
  fetchSupervisorTicketsApi,
  fetchTicketDetailsApi,
  approveTicketApi,
  rejectTicketApi,
} from "../../apis/supervisorApi";

// ✅ FETCH ALL TICKETS
export const fetchSupervisorTickets = createAsyncThunk(
  "supervisor/fetchTickets",
  async (_, { rejectWithValue }) => {
    try {
      const data = await fetchSupervisorTicketsApi();
      return data;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

// ✅ FETCH SINGLE TICKET DETAILS
export const fetchTicketDetails = createAsyncThunk(
  "supervisor/fetchTicketDetails",
  async (ticketId, { rejectWithValue }) => {
    try {
      const data = await fetchTicketDetailsApi(ticketId);
      return data;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

// ✅ APPROVE TICKET
export const approveTicket = createAsyncThunk(
  "supervisor/approveTicket",
  async (ticketId, { rejectWithValue }) => {
    try {
      const data = await approveTicketApi(ticketId);
      return data;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

// ✅ REJECT TICKET
export const rejectTicket = createAsyncThunk(
  "supervisor/rejectTicket",
  async ({ ticketId, reason }, { rejectWithValue }) => {
    try {
      const data = await rejectTicketApi(ticketId, reason);
      return data;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

const initialState = {
  tickets: [],       // dashboard list
  ticket: null,      // single ticket details

  isLoading: false,  // for fetch
  actionLoading: false, // for approve/reject

  error: null,
};

const supervisorSlice = createSlice({
  name: "supervisor",
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    clearTicket: (state) => {
      state.ticket = null;
    },
  },
  extraReducers: (builder) => {
    builder

      // 🔹 FETCH ALL TICKETS
      .addCase(fetchSupervisorTickets.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchSupervisorTickets.fulfilled, (state, action) => {
        state.isLoading = false;
        const payload = action.payload;
        const normalizedTickets = Array.isArray(payload)
          ? payload
          : payload?.data || payload?.tickets || [];
        state.tickets = Array.isArray(normalizedTickets) ? normalizedTickets : [];
      })
      .addCase(fetchSupervisorTickets.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
      })

      // 🔹 FETCH SINGLE TICKET
      .addCase(fetchTicketDetails.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchTicketDetails.fulfilled, (state, action) => {
        state.isLoading = false;
        state.ticket = action.payload;
      })
      .addCase(fetchTicketDetails.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
      })

      // 🔹 APPROVE
      .addCase(approveTicket.pending, (state) => {
        state.actionLoading = true;
        state.error = null;
      })
      .addCase(approveTicket.fulfilled, (state) => {
        state.actionLoading = false;

        // update detail page
        if (state.ticket) {
          state.ticket.status = "APPROVED";
        }

        // update list page
        const currentTickets = Array.isArray(state.tickets) ? state.tickets : [];
        state.tickets = currentTickets.map((t) =>
          t.ticket_id === state.ticket?.ticket_id
            ? { ...t, status: "APPROVED" }
            : t
        );
      })
      .addCase(approveTicket.rejected, (state, action) => {
        state.actionLoading = false;
        state.error = action.payload;
      })

      // 🔹 REJECT
      .addCase(rejectTicket.pending, (state) => {
        state.actionLoading = true;
        state.error = null;
      })
      .addCase(rejectTicket.fulfilled, (state) => {
        state.actionLoading = false;

        if (state.ticket) {
          state.ticket.status = "Reopened";
        }

        const currentTickets = Array.isArray(state.tickets) ? state.tickets : [];
        state.tickets = currentTickets.map((t) =>
          t.ticket_id === state.ticket?.ticket_id
            ? { ...t, status: "Reopened" }
            : t
        );
      })
      .addCase(rejectTicket.rejected, (state, action) => {
        state.actionLoading = false;
        state.error = action.payload;
      });
  },
});

export const { clearError, clearTicket } = supervisorSlice.actions;

export default supervisorSlice.reducer;
