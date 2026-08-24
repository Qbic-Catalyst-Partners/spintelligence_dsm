// Ticket ids used to be minted by embedding nextval('ticketing_system.ticket_seq')
// directly inside each INSERT statement's VALUES() list, AND a BEFORE INSERT
// trigger (ticketing_system.generate_ticket_id, defined directly on the
// Supabase database - not in any migration in this repo) unconditionally
// overwrote NEW.ticket_id with its own separate nextval() call regardless of
// what the INSERT supplied. Every insert was therefore calling nextval()
// twice and only ever keeping the trigger's value, permanently burning one
// sequence number per ticket. The trigger has been altered (directly on the
// database) to only generate when ticket_id isn't already supplied, so
// generating it once here and passing it in as a bound parameter now
// actually takes effect. Format must match the trigger's own format exactly
// ('#TK-####') since existing rows and every notifications/ticket_logs
// reference already use that prefix.
const db = require('../connection');

const generateTicketId = async (dbClient = db) => {
  const result = await dbClient.query(
    `SELECT nextval('"ticketing_system"."ticket_seq"') AS n`
  );
  const n = Number(result.rows[0]?.n);
  return `#TK-${String(n).padStart(4, '0')}`;
};

module.exports = { generateTicketId };
