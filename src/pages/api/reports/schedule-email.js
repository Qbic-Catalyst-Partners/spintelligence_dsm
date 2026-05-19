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

const TABLE_CELL_PADDING_X = 2.5;
const TABLE_CELL_PADDING_Y = 0.8;
const TABLE_LINE_GAP = 0;
const TABLE_FONT_SIZE = 8;
const TABLE_MIN_FONT_SIZE = 1.2;
const TABLE_HEADER_HEIGHT_RATIO = 1.1;
const TABLE_STROKE_COLOR = "#9ca3af";
const TABLE_MAX_ROW_HEIGHT = 17;
const TABLE_META_TABLE_GAP = 10;

const normalizePdfText = (value) => {
  if (value === null || typeof value === "undefined" || value === "") return "-";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return text.replace(/\s+/g, " ").trim() || "-";
};

const drawCellText = (doc, value, x, y, width, options = {}) => {
  doc.text(normalizePdfText(value), x, y, {
    width,
    lineBreak: true,
    ellipsis: true,
    lineGap: TABLE_LINE_GAP,
    ...options,
  });
};

const getCenteredTextY = (rowTop, rowHeight, fontSize) =>
  rowTop + Math.max(TABLE_CELL_PADDING_Y, (rowHeight - fontSize * 1.12) / 2);

const getSinglePageTableLayout = ({ availableHeight, rowCount, columnCount }) => {
  const totalUnits = TABLE_HEADER_HEIGHT_RATIO + Math.max(rowCount, 1);
  const rowHeight = Math.min(TABLE_MAX_ROW_HEIGHT, availableHeight / totalUnits);
  const headerHeight = rowHeight * TABLE_HEADER_HEIGHT_RATIO;
  const columnPressure = Math.max(0, columnCount - 8) * 0.16;
  const rowPressure = Math.max(0, rowCount - 30) * 0.035;
  const cellPaddingY = Math.min(TABLE_CELL_PADDING_Y, Math.max(0, rowHeight * 0.18));
  const fontSize = Math.max(
    TABLE_MIN_FONT_SIZE,
    Math.min(TABLE_FONT_SIZE, rowHeight * 0.72, TABLE_FONT_SIZE - columnPressure - rowPressure)
  );

  return {
    fontSize,
    headerFontSize: Math.max(TABLE_MIN_FONT_SIZE, Math.min(TABLE_FONT_SIZE, fontSize + 0.4)),
    headerHeight,
    rowHeight,
    cellPaddingY,
  };
};

const drawTableRule = (doc, y, color = TABLE_STROKE_COLOR) => {
  doc.lineWidth(0.45).strokeColor(color);
  doc
    .moveTo(doc.page.margins.left, y)
    .lineTo(doc.page.width - doc.page.margins.right, y)
    .stroke();
};

const getTableColumnWidths = ({ columns, rows, usableWidth }) => {
  if (!columns.length) return [];

  const sampleRows = rows.slice(0, 25);
  const weights = columns.map((column) => {
    const headerLength = normalizePdfText(column).length;
    const valueLength = sampleRows.reduce(
      (longest, row) => Math.max(longest, normalizePdfText(row?.[column]).length),
      0
    );
    return Math.min(18, Math.max(4, headerLength, Math.ceil(valueLength * 0.65)));
  });
  const totalWeight = weights.reduce((total, weight) => total + weight, 0) || 1;
  const evenWidth = usableWidth / columns.length;
  const minWidth = Math.min(34, evenWidth * 0.82);
  const widths = weights.map((weight) => Math.max(minWidth, (usableWidth * weight) / totalWeight));
  const widthTotal = widths.reduce((total, width) => total + width, 0);

  return widths.map((width) => (width / widthTotal) * usableWidth);
};

const getColumnLeft = (columnWidths, index) =>
  docSafeSum(columnWidths.slice(0, index));

const docSafeSum = (values) => values.reduce((total, value) => total + value, 0);

const addReportTableHeader = (doc, { columns, columnWidths, tableTop, headerHeight, headerFontSize }) => {
  drawTableRule(doc, tableTop, "#d1d5db");

  doc.font("Helvetica-Bold").fontSize(headerFontSize).fillColor("#111827");
  columns.forEach((column, index) => {
    const columnLeft = doc.page.margins.left + getColumnLeft(columnWidths, index);
    drawCellText(doc, column, columnLeft + TABLE_CELL_PADDING_X, getCenteredTextY(tableTop, headerHeight, headerFontSize), columnWidths[index] - TABLE_CELL_PADDING_X * 2, {
      height: Math.max(0.5, headerHeight - TABLE_CELL_PADDING_Y),
      continued: false,
      align: "center",
    });
  });

  drawTableRule(doc, tableTop + headerHeight, "#d1d5db");

  return tableTop + headerHeight;
};

const buildReportPdfBuffer = ({ schedule = {}, report = {} }) =>
  new Promise((resolve, reject) => {
    const rows = Array.isArray(report.rows) ? report.rows : [];
    const columns = getReportColumns(report);
    const landscape = shouldUseLandscape(columns, rows);
    const doc = new PDFDocument({
      size: "A4",
      layout: landscape ? "landscape" : "portrait",
      margin: 24,
      bufferPages: true,
    });
    const buffers = [];

    doc.on("data", (chunk) => buffers.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(buffers)));

    doc.fontSize(14).fillColor("#111827").text(schedule.name || "Scheduled Report", {
      align: "center",
    });
    doc.moveDown(0.08);
    doc.fontSize(8).fillColor("#374151");
    const metaLeft = doc.page.margins.left;
    const metaTop = doc.y;
    const metaWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const metaRows = [
      `Department: ${report.department || "-"}`,
      `Sub Department: ${report.subDepartment || "-"}`,
      `Type: ${report.reportType || "-"}`,
      `Date Range: ${report.dateRange?.from || "-"} to ${report.dateRange?.to || "-"}`,
      `Total Rows: ${report.totalRows ?? rows.length}`,
    ];

    metaRows.forEach((text, index) => {
      const y = metaTop + index * 9;
      doc.text(text, metaLeft, y, { width: metaWidth, lineBreak: false, align: "left" });
    });
    doc.y = metaTop + metaRows.length * 9 + TABLE_META_TABLE_GAP;

    if (!columns.length) {
      doc.fontSize(11).fillColor("#6b7280").text("No report fields selected.");
      doc.end();
      return;
    }

    const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const tableTop = doc.y;
    const bottom = doc.page.height - doc.page.margins.bottom;
    const availableTableHeight = Math.max(80, bottom - tableTop);
    const pdfRows = rows;
    const columnWidths = getTableColumnWidths({ columns, rows: pdfRows, usableWidth });
    const { fontSize, headerFontSize, headerHeight, rowHeight, cellPaddingY } = getSinglePageTableLayout({
      availableHeight: availableTableHeight,
      rowCount: pdfRows.length || 1,
      columnCount: columns.length,
    });
    const rowTextHeight = Math.max(0.5, rowHeight - cellPaddingY * 2);

    if (!rows.length) {
      const y = addReportTableHeader(doc, {
          columns,
          columnWidths,
          tableTop,
          headerHeight,
          headerFontSize,
      });
      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor("#6b7280")
        .text("No report rows found for the selected filters.", doc.page.margins.left, y + 12);
      doc.end();
      return;
    }

    let y = addReportTableHeader(doc, {
      columns,
      columnWidths,
      tableTop,
      headerHeight,
      headerFontSize,
    });

    pdfRows.forEach((row) => {
      doc.font("Helvetica").fontSize(fontSize).fillColor("#111827");
      columns.forEach((column, index) => {
        const columnLeft = doc.page.margins.left + getColumnLeft(columnWidths, index);
        drawCellText(
          doc,
          row?.[column] ?? "-",
          columnLeft + TABLE_CELL_PADDING_X,
          getCenteredTextY(y, rowHeight, fontSize),
          columnWidths[index] - TABLE_CELL_PADDING_X * 2,
          {
            height: rowTextHeight,
            align: "center",
          }
        );
      });

      y += rowHeight;
      drawTableRule(doc, y, "#e5e7eb");
    });

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
    const greetingName = recipientProfiles.length === 1 ? recipientProfiles[0].name : "Team";
    await transporter.sendMail({
      from,
      to: recipients,
      subject,
      html: (payload.html || buildReportHtml({ schedule, report, recipientName: greetingName })).replace(
        /Dear\s+Team,/i,
        `Dear ${escapeHtml(greetingName)},`
      ),
      text: `Please find attached the scheduled report PDF: ${schedule.name || "Scheduled Report"}.`,
      attachments: [pdfAttachment],
    });

    return res.status(200).json({ message: "Scheduled report email sent.", to: recipients, attachment: filename });
  } catch (error) {
    return res.status(502).json({
      message: error?.message || "Unable to send scheduled report email.",
    });
  }
}
