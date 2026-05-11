import nodemailer from "nodemailer";
import PDFDocument from "pdfkit";

const defaultSenderEmail = "otpdemoin@gmail.com";
const defaultReceiverEmail = "sivadharshini2807@gmail.com";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "10mb",
    },
  },
};

const getSmtpConfig = () => ({
  host: process.env.REPORT_SMTP_HOST || process.env.SMTP_HOST || "smtp.gmail.com",
  port: Number(process.env.REPORT_SMTP_PORT || process.env.SMTP_PORT || 465),
  secure: String(process.env.REPORT_SMTP_SECURE || process.env.SMTP_SECURE || "true") !== "false",
  user: process.env.REPORT_SMTP_USER || process.env.SMTP_USER || process.env.EMAIL_USER || defaultSenderEmail,
  pass:
    process.env.REPORT_SMTP_PASS ||
    process.env.SMTP_PASS ||
    process.env.EMAIL_PASS ||
    process.env.GMAIL_APP_PASSWORD ||
    "",
});

const normalizeRecipients = (value) => {
  const recipients = Array.isArray(value) ? value : [value || defaultReceiverEmail];
  return Array.from(new Set(recipients.map((item) => String(item || "").trim()).filter(Boolean)));
};

const sanitizeFilename = (value) =>
  String(value || "scheduled-report")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "scheduled-report";

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const getReportColumns = (report = {}) => {
  const rows = Array.isArray(report.rows) ? report.rows : [];
  const fieldColumns = Array.isArray(report.fields)
    ? report.fields
        .map((field) => String(field?.label || field?.key || field || "").trim())
        .filter(Boolean)
    : [];
  const rowColumns = rows.length ? Object.keys(rows[0] || {}) : [];
  return fieldColumns.length ? fieldColumns : rowColumns;
};

const shouldUseLandscape = (columns, rows) => {
  if (columns.length > 5) return true;
  const longestLine = rows.slice(0, 25).reduce((longest, row) => {
    const length = columns.reduce((total, column) => total + String(row?.[column] ?? "").length + 3, 0);
    return Math.max(longest, length);
  }, columns.join(" | ").length);
  return longestLine > 95;
};

const getRecipientProfiles = (body, recipients) => {
  const explicitProfiles = Array.isArray(body?.recipientProfiles) ? body.recipientProfiles : [];
  const scheduleProfiles = Array.isArray(body?.schedule?.recipientUsers) ? body.schedule.recipientUsers : [];
  const profiles = [
    ...(body?.schedule?.sendToMe ? [{ name: body?.selfRecipientName || "there", email: body?.sendToMeEmail || defaultReceiverEmail }] : []),
    ...explicitProfiles,
    ...scheduleProfiles,
  ];

  return recipients.map((email) => {
    const matched = profiles.find((profile) => String(profile?.email || "").trim().toLowerCase() === email.toLowerCase());
    return {
      email,
      name: String(matched?.name || matched?.full_name || matched?.fullName || "there").trim() || "there",
    };
  });
};

const drawCellText = (doc, value, x, y, width, options = {}) => {
  doc.text(String(value ?? "-"), x, y, {
    width,
    ellipsis: true,
    lineBreak: false,
    ...options,
  });
};

const addReportTablePage = (doc, { title, columns, columnWidth, tableTop, showTitle = true }) => {
  if (showTitle) {
    doc.fontSize(14).fillColor("#111827").text(title, doc.page.margins.left, 28, {
      align: "center",
    });
  }

  doc
    .moveTo(doc.page.margins.left, tableTop - 8)
    .lineTo(doc.page.width - doc.page.margins.right, tableTop - 8)
    .strokeColor("#d1d5db")
    .stroke();

  doc.fontSize(8).fillColor("#111827");
  columns.forEach((column, index) => {
    drawCellText(doc, column, doc.page.margins.left + index * columnWidth, tableTop, columnWidth - 6, {
      continued: false,
    });
  });

  doc
    .moveTo(doc.page.margins.left, tableTop + 14)
    .lineTo(doc.page.width - doc.page.margins.right, tableTop + 14)
    .strokeColor("#9ca3af")
    .stroke();
};

const buildReportPdfBuffer = ({ schedule = {}, report = {} }) =>
  new Promise((resolve, reject) => {
    const rows = Array.isArray(report.rows) ? report.rows : [];
    const columns = getReportColumns(report);
    const landscape = shouldUseLandscape(columns, rows);
    const doc = new PDFDocument({
      size: "A4",
      layout: landscape ? "landscape" : "portrait",
      margin: 32,
      bufferPages: true,
    });
    const buffers = [];

    doc.on("data", (chunk) => buffers.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(buffers)));

    doc.fontSize(18).fillColor("#111827").text(schedule.name || "Scheduled Report", {
      align: "center",
    });
    doc.moveDown(0.6);
    doc.fontSize(10).fillColor("#374151");
    doc.text(`Department: ${report.department || "-"}`);
    doc.text(`Sub Department: ${report.subDepartment || "-"}`);
    doc.text(`Type: ${report.reportType || "-"}`);
    doc.text(`Date Range: ${report.dateRange?.from || "-"} to ${report.dateRange?.to || "-"}`);
    doc.text(`Total Rows: ${report.totalRows ?? rows.length}`);
    doc.moveDown();

    if (!columns.length) {
      doc.fontSize(11).fillColor("#6b7280").text("No report fields selected.");
      doc.end();
      return;
    }

    const tableTop = doc.y + 8;
    const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const columnWidth = Math.max(54, usableWidth / columns.length);
    const rowHeight = 18;
    const title = `${report.subDepartment || "-"} - ${report.reportType || "Report"}`;
    let y = tableTop + 24;

    addReportTablePage(doc, { title, columns, columnWidth, tableTop, showTitle: false });

    if (!rows.length) {
      doc.fontSize(10).fillColor("#6b7280").text("No report rows found for the selected filters.", doc.page.margins.left, y);
      doc.end();
      return;
    }

    rows.slice(0, 500).forEach((row) => {
      if (y + rowHeight > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
        addReportTablePage(doc, { title, columns, columnWidth, tableTop: doc.page.margins.top + 24 });
        y = doc.page.margins.top + 48;
      }

      doc.fontSize(8).fillColor("#111827");
      columns.forEach((column, index) => {
        drawCellText(doc, row?.[column] ?? "-", doc.page.margins.left + index * columnWidth, y, columnWidth - 6);
      });
      y += rowHeight;
    });

    if (rows.length > 500) {
      if (y + rowHeight > doc.page.height - doc.page.margins.bottom) doc.addPage();
      doc.moveDown().fontSize(9).fillColor("#6b7280").text(`Showing first 500 rows of ${rows.length}.`);
    }

    doc.end();
  });

const buildReportHtml = ({ schedule = {}, report = {}, recipientName = "there" }) => `
  <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.55;">
    <p>Dear ${escapeHtml(recipientName)},</p>
    <p>I hope you are doing well.</p>
    <p>Please find attached the scheduled report <strong>${escapeHtml(schedule.name || "Scheduled Report")}</strong> for your review.</p>
    <p>
      <strong>Department:</strong> ${escapeHtml(report.department)}<br />
      <strong>Sub Department:</strong> ${escapeHtml(report.subDepartment)}<br />
      <strong>Type:</strong> ${escapeHtml(report.reportType)}<br />
      <strong>Date Range:</strong> ${escapeHtml(report.dateRange?.from || "-")} to ${escapeHtml(report.dateRange?.to || "-")}<br />
      <strong>Total rows:</strong> ${escapeHtml(report.totalRows ?? report.rows?.length ?? 0)}
    </p>
    <p>The PDF report is attached to this email and can be downloaded for your records.</p>
    <p style="margin-top: 18px;">Warm regards,<br />Spintelligence Reports</p>
  </div>
`;

const getObject = (value) => (value && typeof value === "object" && !Array.isArray(value) ? value : {});

const normalizeScheduleEmailRequest = (body = {}) => {
  const existingReport = getObject(body.report);
  const explicitMailPayload = getObject(body.mailPayload);
  const hasExplicitMailPayload = Object.keys(explicitMailPayload).length > 0;
  const mailPayload = hasExplicitMailPayload
    ? explicitMailPayload
    : {
        to: body.to ?? body.receiverEmail,
        from: body.from,
        subject: body.subject,
        html: body.html,
        recipientProfiles: body.recipientProfiles,
        department: body.department ?? existingReport.department,
        subDepartment: body.subDepartment ?? existingReport.subDepartment,
        reportType: body.reportType ?? existingReport.reportType,
        dateRange: body.dateRange ?? existingReport.dateRange,
        fields: body.fields ?? existingReport.fields,
        rows: body.rows ?? existingReport.rows,
        totalRows: body.totalRows ?? existingReport.totalRows,
      };
  const rows = Array.isArray(mailPayload.rows) ? mailPayload.rows : [];

  return {
    ...body,
    to: mailPayload.to ?? body.to ?? body.receiverEmail,
    from: mailPayload.from ?? body.from,
    subject: mailPayload.subject ?? body.subject,
    html: mailPayload.html ?? body.html,
    recipientProfiles: mailPayload.recipientProfiles ?? body.recipientProfiles,
    schedule: getObject(body.schedule || mailPayload.schedule),
    report: {
      ...existingReport,
      department: mailPayload.department ?? existingReport.department,
      subDepartment: mailPayload.subDepartment ?? existingReport.subDepartment,
      reportType: mailPayload.reportType ?? existingReport.reportType,
      dateRange: mailPayload.dateRange ?? existingReport.dateRange,
      fields: mailPayload.fields ?? existingReport.fields,
      rows,
      totalRows: mailPayload.totalRows ?? rows.length,
    },
    hasMailPayload: hasExplicitMailPayload,
    hasReportPayload: hasExplicitMailPayload || Object.keys(existingReport).length > 0 || Array.isArray(body.rows),
  };
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ message: "Method not allowed" });
  }

  const payload = normalizeScheduleEmailRequest(req.body || {});

  if (payload.hasMailPayload && req.body?.mailPayload?.rows !== undefined && !Array.isArray(req.body.mailPayload.rows)) {
    return res.status(400).json({ message: "mailPayload.rows must be an array." });
  }

  const smtp = getSmtpConfig();
  if (!smtp.pass) {
    return res.status(500).json({
      message:
        "PDF email was not sent because SMTP app password is missing. Add EMAIL_USER and EMAIL_PASS in .env.local.",
    });
  }

  const recipients = normalizeRecipients(payload.to || payload.receiverEmail);
  const recipientProfiles = getRecipientProfiles(payload, recipients);
  const schedule = payload.schedule;
  const report = payload.report;
  const subject = payload.subject || `Scheduled Report: ${schedule.name || "Report"}`;
  const from = payload.from || smtp.user || defaultSenderEmail;
  const pdfBuffer = await buildReportPdfBuffer({ schedule, report });
  const filename = `${sanitizeFilename(schedule.name || "scheduled-report")}.pdf`;
  const pdfAttachment = {
    filename,
    content: Buffer.from(pdfBuffer),
    contentType: "application/pdf",
    contentDisposition: "attachment",
  };

  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: {
      user: smtp.user,
      pass: smtp.pass,
    },
  });

  try {
    await Promise.all(
      recipientProfiles.map((recipient) =>
        transporter.sendMail({
          from,
          to: recipient.email,
          subject,
          html: (payload.html || buildReportHtml({ schedule, report, recipientName: recipient.name })).replace(
            /Dear\s+Team,/i,
            `Dear ${escapeHtml(recipient.name)},`
          ),
          text: `Please find attached the scheduled report PDF: ${schedule.name || "Scheduled Report"}.`,
          attachments: [pdfAttachment],
        })
      )
    );

    return res.status(200).json({ message: "Scheduled report email sent.", to: recipients, attachment: filename });
  } catch (error) {
    return res.status(502).json({
      message: error?.message || "Unable to send scheduled report email.",
    });
  }
}
