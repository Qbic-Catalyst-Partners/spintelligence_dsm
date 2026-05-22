import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { getOperatorTickets, getOperatorTicketById } from "../../apis/operatorApi";
import { transformTicket, transformTicketWithDescription } from "../../utils/ticketTransformer";
import { submitOperatorTicket } from "../../apis/operatorApi";

const normalizeSubmittedTicket = (ticket, fallbackTicketId) => {
  const transformedTicket = transformTicketWithDescription({
    ...ticket,
    ticket_id: ticket?.ticket_id || fallbackTicketId,
  });

  return transformedTicket;
};
// Fetch all tickets
export const fetchOperatorTickets = createAsyncThunk(
  "operator/fetchTickets",
  async (_, { rejectWithValue }) => {
    try {
      const response = await getOperatorTickets();

      const ticketsArray = Array.isArray(response)
        ? response
        : response.data || response.tickets || [];

      return ticketsArray.map(transformTicket);

    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);
//move to components and use in operator dashboard
// Fetch single ticket
export const fetchOperatorTicketById = createAsyncThunk(
  "operator/fetchTicketById",
  async (ticketId, { rejectWithValue }) => {
    try {
      const formattedId = ticketId.startsWith("#")
        ? ticketId
        : `#${ticketId}`;

      const response = await getOperatorTicketById(formattedId);
      const ticket = response.data || response;

      return transformTicketWithDescription(ticket);

    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);
export const submitTicketFix = createAsyncThunk(
  "operator/submitFix",
  async ({ ticketId, comment }, { rejectWithValue }) => {
    try {
      const response = await submitOperatorTicket(ticketId, {
        operator_comment: comment,
        comment,
      });

      return normalizeSubmittedTicket(response.ticket || response.data || response, ticketId);

    } catch (error) {
      return rejectWithValue(error.message);
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
    builder
      // 🔹 All tickets
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
      })

      // 🔹 Single ticket
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
      })
      // 🔹 Submit fix
.addCase(submitTicketFix.pending, (state) => {
  state.ticketDetailLoading = true;
})
.addCase(submitTicketFix.fulfilled, (state, action) => {
  state.ticketDetailLoading = false;
  state.ticketDetail = action.payload;
  const currentTickets = Array.isArray(state.tickets) ? state.tickets : [];
  state.tickets = currentTickets.map((ticket) =>
    ticket.ticket_id === action.payload.ticket_id
      ? { ...ticket, ...action.payload }
      : ticket
  );
})
.addCase(submitTicketFix.rejected, (state, action) => {
  state.ticketDetailLoading = false;
  state.ticketDetailError = action.payload;
});
  },
});

export default operatorSlice.reducer;
