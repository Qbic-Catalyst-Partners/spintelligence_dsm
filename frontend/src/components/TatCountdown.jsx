import { useEffect, useState } from "react";

const LEVEL_DUE_FIELDS = {
  L1: ["l1_tat_due_at", "l1TatDueAt"],
  L2: ["l2_tat_due_at", "l2TatDueAt"],
  L3: ["l3_tat_due_at", "l3TatDueAt"],
};

const pickField = (ticket, keys) => keys.map((key) => ticket?.[key]).find(Boolean);

const formatRemaining = (ms) => {
  const totalMinutes = Math.floor(Math.abs(ms) / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours || days) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  return parts.join(" ");
};

// Shows a live countdown against whichever TAT level is currently active on
// the ticket (tat_current_level -> l1/l2/l3_tat_due_at). Renders nothing if
// the ticket doesn't carry TAT fields (older/unmigrated ticket types).
export default function TatCountdown({ ticket }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  const level = String(
    ticket?.tat_current_level ?? ticket?.tatCurrentLevel ?? ticket?.current_tat_level ?? ""
  )
    .trim()
    .toUpperCase();

  const dueFields = LEVEL_DUE_FIELDS[level];
  const dueAtRaw = dueFields ? pickField(ticket, dueFields) : null;
  if (!dueAtRaw) return null;

  const dueAt = new Date(dueAtRaw).getTime();
  if (Number.isNaN(dueAt)) return null;

  const remainingMs = dueAt - now;
  const isOverdue = remainingMs <= 0;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        background: isOverdue ? "#fde2e2" : "#e6f4ea",
        color: isOverdue ? "#b3261e" : "#1e7d3c",
        whiteSpace: "nowrap",
      }}
    >
      {level} TAT: {isOverdue ? `Overdue by ${formatRemaining(remainingMs)}` : formatRemaining(remainingMs)}
    </span>
  );
}
