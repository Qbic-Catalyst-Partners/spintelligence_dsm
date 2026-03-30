export const transformTicket = (ticket) => {
  const createdDate = new Date(ticket.created_at);
  const key = ticket.parameter_name?.[0]?.toLowerCase()?.trim();

  return {
    ...ticket,
    id: ticket.ticket_id,
    ticket_id: ticket.ticket_id,
    created_at: ticket.created_at,

    machine: ticket.machine_name,
    machine_name: ticket.machine_name,

    parameter: ticket.parameter_name?.[0] || "-",
    parameter_name: ticket.parameter_name,

    actual: ticket.actual_value?.[key] ?? "-",
    threshold: ticket.threshold_value?.[key] ?? "-",

    actual_value: ticket.actual_value,
    threshold_value: ticket.threshold_value,

    severity: ticket.severity,
    status: ticket.status,

    description: ticket.description || "",

    rawCreatedAt: createdDate,
    createdAt: createdDate.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }),
  };
};

export const transformTicketWithDescription = (ticket) => {
  return {
    ...transformTicket(ticket),
    description: ticket.description || "",
  };
};
