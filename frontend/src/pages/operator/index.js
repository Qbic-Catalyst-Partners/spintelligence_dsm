import SupervisorDashboard from "../../views/tickets/SupervisorDashboard";

// L1 uses the exact same dashboard shell/table/filters as L2-L5 (mode="L2"
// through mode="L5") for full visual and structural consistency - only the
// Owned/Mapped tab set differs (L1 shows Owned Tickets only, since nothing
// escalates to it from below). Ticket clicks route to /operatordetail
// (not /supervisordetails) so L1 keeps its own correction-submission flow.
export default function OperatorPage() {
  return <SupervisorDashboard mode="L1" detailRoute="/operatordetail" />;
}
