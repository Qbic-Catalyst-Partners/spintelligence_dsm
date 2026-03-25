import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { getOperatorTickets, getOperatorTicketById } from "../../apis/operatorApi";

// Fetch all tickets
export const fetchOperatorTickets = createAsyncThunk(
  "operator/fetchTickets",
  async (_, { rejectWithValue }) => {
    try {
      const response = await getOperatorTickets();
      const ticketsArray = Array.isArray(response.data)
        ? response.data
        : response.data.data || response.data.tickets || [];
      return ticketsArray.map((ticket) => ({
        id: ticket.ticket_id,
        machine: ticket.machine_name,
        parameter: ticket.parameter_name?.[0] || "-",
        actual:
          ticket.actual_value?.[ticket.parameter_name?.[0]] || "-",
        threshold:
          ticket.threshold_value?.[ticket.parameter_name?.[0]] || "-",
        severity: ticket.severity,
        status: ticket.status,
        rawCreatedAt: ticket.created_at,
        createdAt: new Date(ticket.created_at).toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        }),
      }));
    } catch (error) {
      return rejectWithValue(error.response?.data || "Error fetching tickets");
    }
  }
);

// Fetch single ticket by ID
export const fetchOperatorTicketById = createAsyncThunk(
  "operator/fetchTicketById",
  async (ticketId, { rejectWithValue }) => {
    try {
      const response = await getOperatorTicketById(ticketId);
      const ticket = response.data;
      return {
        id: ticket.ticket_id,
        machine: ticket.machine_name,
        parameter: ticket.parameter_name?.[0] || "-",
        actual:
          ticket.actual_value?.[ticket.parameter_name?.[0]] || "-",
        threshold:
          ticket.threshold_value?.[ticket.parameter_name?.[0]] || "-",
        severity: ticket.severity,
        status: ticket.status,
        rawCreatedAt: ticket.created_at,
        createdAt: new Date(ticket.created_at).toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        }),
        description: ticket.description || "",
      };
    } catch (error) {
      return rejectWithValue(error.response?.data || "Ticket not found");
    }
  }
);

const operatorSlice = createSlice({
  name: "operator",
  initialState: {
    tickets: [],
    loading: false,
    error: null,
    ticketDetail: null,
    ticketDetailLoading: false,
    ticketDetailError: null,
  },
  reducers: {},
  extraReducers: (builder) => {
    // All tickets
    builder
      .addCase(fetchOperatorTickets.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchOperatorTickets.fulfilled, (state, action) => {
        state.loading = false;
        state.tickets = action.payload;
      })
      .addCase(fetchOperatorTickets.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });

    // Single ticket
    builder
      .addCase(fetchOperatorTicketById.pending, (state) => {
        state.ticketDetailLoading = true;
        state.ticketDetailError = null;
      })
      .addCase(fetchOperatorTicketById.fulfilled, (state, action) => {
        state.ticketDetailLoading = false;
        state.ticketDetail = action.payload;
      })
      .addCase(fetchOperatorTicketById.rejected, (state, action) => {
        state.ticketDetailLoading = false;
        state.ticketDetailError = action.payload;
      });
  },
});

export default operatorSlice.reducer;