import tls from "tls";

const defaultSenderEmail = "otpdemoin@gmail.com";
const defaultReceiverEmail = "sivadharshini2807@gmail.com";

const getSmtpConfig = () => ({
  host: process.env.REPORT_SMTP_HOST || process.env.SMTP_HOST || "smtp.gmail.com",
  port: Number(process.env.REPORT_SMTP_PORT || process.env.SMTP_PORT || 465),
  user: process.env.REPORT_SMTP_USER || process.env.SMTP_USER || defaultSenderEmail,
  pass: process.env.REPORT_SMTP_PASS || process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || "",
});

const normalizeRecipients = (value) => {
  const recipients = Array.isArray(value) ? value : [value || defaultReceiverEmail];
  return Array.from(new Set(recipients.map((item) => String(item || "").trim()).filter(Boolean)));
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const dotStuff = (value) =>
  String(value || "")
    .split(/\r?\n/)
    .map((line) => (line.startsWith(".") ? `.${line}` : line))
    .join("\r\n");

const buildReportHtml = ({ schedule = {}, report = {} }) => {
  const rows = Array.isArray(report.rows) ? report.rows : [];
  const columns = rows.length ? Object.keys(rows[0]) : [];

  const tableRows = rows.slice(0, 50).map((row) => `
    <tr>
      ${columns.map((column) => `<td>${escapeHtml(row[column])}</td>`).join("")}
    </tr>
  `);

  return `
    <div style="font-family: Arial, sans-serif; color: #111827;">
      <h2 style="margin: 0 0 12px;">${escapeHtml(schedule.name || "Scheduled Report")}</h2>
      <p><strong>Department:</strong> ${escapeHtml(report.department)}</p>
      <p><strong>Report:</strong> ${escapeHtml(report.subDepartment)} - ${escapeHtml(report.reportType)}</p>
      <p><strong>Schedule:</strong> ${escapeHtml(schedule.frequency)} ${escapeHtml(schedule.weekday || "")} at ${escapeHtml(schedule.time)}</p>
      <p><strong>Total rows:</strong> ${escapeHtml(report.totalRows ?? rows.length)}</p>
      ${
        rows.length
          ? `<table border="1" cellpadding="6" cellspacing="0" style="border-collapse: collapse; margin-top: 16px; font-size: 12px;">
              <thead>
                <tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr>
              </thead>
              <tbody>${tableRows.join("")}</tbody>
            </table>`
          : "<p>No report rows found for the selected filters.</p>"
      }
    </div>
  `;
};

const buildMessage = ({ from, to, subject, html }) => [
  `From: ${from}`,
  `To: ${to.join(", ")}`,
  `Subject: ${subject}`,
  "MIME-Version: 1.0",
  "Content-Type: text/html; charset=UTF-8",
  "",
  html,
].join("\r\n");

const sendSmtpMail = ({ smtp, from, to, subject, html }) =>
  new Promise((resolve, reject) => {
    const socket = tls.connect(
      {
        host: smtp.host,
        port: smtp.port,
        servername: smtp.host,
      },
      () => {}
    );

    let buffer = "";
    const pending = [];

    const fail = (error) => {
      socket.destroy();
      reject(error);
    };

    const readResponse = () =>
      new Promise((responseResolve, responseReject) => {
        pending.push({ resolve: responseResolve, reject: responseReject });
      });

    const flush = () => {
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";

      const completeLines = [];
      for (const line of lines) {
        completeLines.push(line);
        if (/^\d{3} /.test(line) && pending.length) {
          const current = pending.shift();
          const response = completeLines.join("\n");
          completeLines.length = 0;

          if (/^[45]\d{2} /.test(line)) {
            current.reject(new Error(response));
          } else {
            current.resolve(response);
          }
        }
      }
    };

    const command = async (line) => {
      socket.write(`${line}\r\n`);
      return readResponse();
    };

    socket.setTimeout(20000, () => fail(new Error("SMTP request timed out.")));
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      flush();
    });
    socket.on("error", fail);

    socket.on("secureConnect", async () => {
      try {
        await readResponse();
        await command("EHLO localhost");
        await command("AUTH LOGIN");
        await command(Buffer.from(smtp.user).toString("base64"));
        await command(Buffer.from(smtp.pass).toString("base64"));
        await command(`MAIL FROM:<${from}>`);

        for (const recipient of to) {
          await command(`RCPT TO:<${recipient}>`);
        }

        await command("DATA");
        socket.write(`${dotStuff(buildMessage({ from, to, subject, html }))}\r\n.\r\n`);
        await readResponse();
        await command("QUIT");
        socket.end();
        resolve();
      } catch (error) {
        fail(error);
      }
    });
  });

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ message: "Method not allowed" });
  }

  const smtp = getSmtpConfig();
  if (!smtp.pass) {
    return res.status(500).json({
      message: "SMTP app password missing. Add REPORT_SMTP_PASS in .env.local.",
    });
  }

  const recipients = normalizeRecipients(req.body?.to || req.body?.receiverEmail);
  const subject = req.body?.subject || "Scheduled Report";
  const from = req.body?.from || smtp.user || defaultSenderEmail;
  const html = req.body?.html || buildReportHtml(req.body || {});

  try {
    await sendSmtpMail({
      smtp,
      from,
      to: recipients,
      subject,
      html,
    });

    return res.status(200).json({ message: "Scheduled report email sent.", to: recipients });
  } catch (error) {
    return res.status(502).json({
      message: error?.message || "Unable to send scheduled report email.",
    });
  }
}
