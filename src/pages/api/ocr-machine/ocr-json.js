import { Readable } from "node:stream";
import zlib from "node:zlib";

const getBackendBaseUrl = () =>
  String(
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.OCR_API_URL ||
    process.env.API_URL ||
      ""
  )
    .trim()
    .replace(/\/+$/, "");

const ROW_SOURCE_KEYS = [
  ["raw_tables"],
  ["extracted_tables"],
  ["data"],
  ["json_output"],
  ["result", "raw_tables"],
  ["result", "extracted_tables"],
  ["result", "data"],
  ["result", "json_output"],
];

const getPath = (value, path) => path.reduce((acc, key) => acc?.[key], value);

const hasAnyRowArray = (payload) =>
  ROW_SOURCE_KEYS.some((path) => {
    const value = getPath(payload, path);
    return Array.isArray(value) && value.length > 0;
  });

const readRequestBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
};

const parseMultipartBody = (body, contentType = "") => {
  const boundary = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i)?.[1] || contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i)?.[2];
  if (!boundary) return {};

  const fields = {};
  const files = {};
  const parts = body.toString("binary").split(`--${boundary}`);

  parts.forEach((part) => {
    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd === -1) return;

    const rawHeaders = part.slice(0, headerEnd);
    let content = part.slice(headerEnd + 4);
    if (content.endsWith("\r\n")) content = content.slice(0, -2);
    if (!content || content === "--") return;

    const name = rawHeaders.match(/name="([^"]+)"/i)?.[1];
    if (!name) return;

    const filename = rawHeaders.match(/filename="([^"]*)"/i)?.[1];
    if (filename !== undefined) {
      files[name] = {
        filename,
        buffer: Buffer.from(content, "binary"),
      };
    } else {
      fields[name] = content.trim();
    }
  });

  return { fields, files };
};

const decodePdfString = (value = "") => {
  let output = "";
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char !== "\\") {
      output += char;
      continue;
    }

    const next = value[index + 1];
    if (next === "n") output += "\n";
    else if (next === "r") output += "\r";
    else if (next === "t") output += "\t";
    else if (next === "b") output += "\b";
    else if (next === "f") output += "\f";
    else if (next === "(" || next === ")" || next === "\\") output += next;
    else if (/[0-7]/.test(next || "")) {
      const octal = value.slice(index + 1).match(/^[0-7]{1,3}/)?.[0] || "";
      output += String.fromCharCode(parseInt(octal, 8));
      index += octal.length - 1;
    } else if (next) {
      output += next;
    }
    index += 1;
  }
  return output.replace(/\s+/g, " ").trim();
};

const extractPdfTextItems = (pdfBuffer) => {
  const textItems = [];
  const streamPattern = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  const pdfText = pdfBuffer.toString("binary");
  let streamMatch;

  while ((streamMatch = streamPattern.exec(pdfText))) {
    const prefix = pdfText.slice(Math.max(0, streamMatch.index - 400), streamMatch.index);
    let streamBuffer = Buffer.from(streamMatch[1], "binary");

    if (/FlateDecode/.test(prefix)) {
      try {
        streamBuffer = zlib.inflateSync(streamBuffer);
      } catch {
        continue;
      }
    }

    const stream = streamBuffer.toString("latin1");
    const textBlocks = stream.split(/(BT|ET)/);
    let inTextBlock = false;

    textBlocks.forEach((block) => {
      if (block === "BT") {
        inTextBlock = true;
        return;
      }
      if (block === "ET") {
        inTextBlock = false;
        return;
      }
      if (!inTextBlock) return;

      let x = 0;
      let y = 0;
      let dx = 0;
      let dy = 0;
      const tokenPattern = /([-.0-9]+\s+[-.0-9]+\s+[-.0-9]+\s+[-.0-9]+\s+[-.0-9]+\s+[-.0-9]+\s+Tm)|([-.0-9]+\s+[-.0-9]+\s+Td)|\(((?:\\.|[^\\)])*)\)\s*(?:'|Tj)/g;
      let token;

      while ((token = tokenPattern.exec(block))) {
        if (token[1]) {
          const nums = token[1].match(/[-.0-9]+/g).map(Number);
          x = nums[4] || 0;
          y = nums[5] || 0;
          dx = 0;
          dy = 0;
        } else if (token[2]) {
          const nums = token[2].match(/[-.0-9]+/g).map(Number);
          dx += nums[0] || 0;
          dy += nums[1] || 0;
        } else {
          const text = decodePdfString(token[3]);
          if (text) textItems.push({ x: x + dx, y: y + dy, text });
        }
      }
    });
  }

  return textItems;
};

const groupPdfLines = (items) => {
  const lines = [];
  [...items]
    .sort((a, b) => b.y - a.y || a.x - b.x)
    .forEach((item) => {
      const line = lines.find((candidate) => Math.abs(candidate.y - item.y) <= 2);
      if (line) {
        line.items.push(item);
      } else {
        lines.push({ y: item.y, items: [item] });
      }
    });

  return lines.map((line) => ({
    y: line.y,
    cells: line.items.sort((a, b) => a.x - b.x).map((item) => item.text),
  }));
};

const valueAfterLabel = (cells, label) => {
  const pattern = new RegExp(`^\\s*${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:\\s*(.*)$`, "i");
  const cell = cells.find((item) => pattern.test(item));
  return cell?.match(pattern)?.[1]?.trim() || "";
};

const firstValueAfterLabels = (cells, labels) => {
  for (const label of labels) {
    const value = valueAfterLabel(cells, label);
    if (value) return value;
  }
  return "";
};

const parseNoilsPdfRows = (lines) => {
  const rows = [];
  const allCells = lines.flatMap((line) => line.cells);
  const totalTest = valueAfterLabel(allCells, "Total Test");
  const stdNoils = valueAfterLabel(allCells, "Std. Noils%") || valueAfterLabel(allCells, "Std. Noils %");
  const noilsPercent = valueAfterLabel(allCells, "Noils%");
  const tester = firstValueAfterLabels(allCells, ["Tester", "Tester Name", "User"]);

  rows.push({
    "Row Type": "Meta",
    "Total Test": totalTest,
    "Number of Entries (N)": totalTest,
    Tester: tester,
    "Std. Noils %": stdNoils,
    "Noils %": noilsPercent,
  });

  lines.forEach((line) => {
    const [label, sliverWt, noilsWt, noilsPct] = line.cells;
    if (/^\d+$/.test(label || "") && sliverWt && noilsWt && noilsPct) {
      rows.push({
        "Row Type": "Sample",
        "Sample No": label,
        "Sliver Wt": sliverWt,
        "Noils Wt": noilsWt,
        "Noils %": noilsPct,
      });
    }

    if (/^(Average Weight|Weight \(Max\)|Weight \(Min\)|Range|SD|CV)$/i.test(label || "") && sliverWt && noilsWt && noilsPct) {
      rows.push({
        "Row Type": "Summary",
        Label: label,
        "Sliver Wt": sliverWt,
        "Noils Wt": noilsWt,
        "Noils %": noilsPct,
      });
    }
  });

  return rows.filter((row) => Object.values(row).some(Boolean));
};

const parseStretchPdfRows = (lines) => {
  const rows = [];
  const testStarts = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.cells.some((cell) => /^Test ID:/i.test(cell)));

  testStarts.forEach(({ index, line }, tableIndex) => {
    const nextStart = testStarts[tableIndex + 1]?.index ?? lines.length;
    const section = lines.slice(index, nextStart);
    const allCells = section.flatMap((item) => item.cells);
    const tableNo = String(tableIndex + 1);
    const totalTest = valueAfterLabel(allCells, "Total Test");
    const tester = firstValueAfterLabels(allCells, ["Tester", "Tester Name", "User"]);

    rows.push({
      "Row Type": "Meta",
      "Table No": tableNo,
      "Test ID": valueAfterLabel(line.cells, "Test ID"),
      "Total Test": totalTest,
      "Number of Entries (N)": totalTest,
      Length: valueAfterLabel(allCells, "Length"),
      Tester: tester,
      "Std. Stretch %": valueAfterLabel(allCells, "Std. Stretch %"),
      "Stretch %": valueAfterLabel(allCells, "Stretch %"),
      Remark: valueAfterLabel(allCells, "Remark"),
    });

    section.forEach((sectionLine) => {
      const [label, initialBobbin, fullBobbin] = sectionLine.cells;
      if (/^\d+$/.test(label || "") && initialBobbin && fullBobbin) {
        rows.push({
          "Row Type": "Sample",
          "Table No": tableNo,
          "Sample No": label,
          "Initial Bobbin": initialBobbin,
          "Full Bobbin": fullBobbin,
        });
      }

      if (/^(Hank|SD|CV)$/i.test(label || "") && initialBobbin && fullBobbin) {
        rows.push({
          "Row Type": "Summary",
          "Table No": tableNo,
          Label: label,
          "Initial Bobbin": initialBobbin,
          "Full Bobbin": fullBobbin,
        });
      }
    });
  });

  return rows.filter((row) => Object.values(row).some(Boolean));
};

const parseAPercentPdfRows = (lines) => {
  const rows = [];
  const allCells = lines.flatMap((line) => line.cells);
  const reportTitle = allCells.find((cell) => /A%\s*Report/i.test(cell)) || "";

  rows.push({
    "Row Type": "Meta",
    Report: reportTitle,
    "Test ID": valueAfterLabel(allCells, "Test ID"),
    Machine: valueAfterLabel(allCells, "Machine"),
    "Count System": valueAfterLabel(allCells, "Count System"),
    "Length Unit": valueAfterLabel(allCells, "Length Unit"),
    Length: valueAfterLabel(allCells, "Length"),
    "Total Test": valueAfterLabel(allCells, "Total Test"),
    "Standard A%": valueAfterLabel(allCells, "Standard A%"),
    "A% (N-1)": valueAfterLabel(allCells, "A% (N-1)"),
    "A% (N+1)": valueAfterLabel(allCells, "A% (N+1)"),
    Date: valueAfterLabel(allCells, "Date"),
    Tester: firstValueAfterLabels(allCells, ["Tester", "Tester Name", "User"]),
    Shift: valueAfterLabel(allCells, "Shift"),
    Process: valueAfterLabel(allCells, "Process"),
    Remark: valueAfterLabel(allCells, "Remark"),
  });

  lines.forEach((line) => {
    const [label, nMinus1, n, nPlus1] = line.cells;
    if (/^\d+$/.test(label || "") && nMinus1 && n && nPlus1) {
      rows.push({
        "Row Type": "Sample",
        "Sample No": label,
        "N-1": nMinus1,
        N: n,
        "N+1": nPlus1,
      });
    }

    if (/^(Average Weight|Weight \(Max\)|Weight \(Min\)|Range|Hank|SD|CV)$/i.test(label || "") && nMinus1 && n && nPlus1) {
      rows.push({
        "Row Type": "Summary",
        Label: label,
        "N-1": nMinus1,
        N: n,
        "N+1": nPlus1,
      });
    }
  });

  return rows.filter((row) => Object.values(row).some(Boolean));
};

const extractRowsFromPdf = (pdfBuffer, docType) => {
  if (!pdfBuffer || !["noils", "strech", "a_percent"].includes(docType)) return [];

  const lines = groupPdfLines(extractPdfTextItems(pdfBuffer));
  if (docType === "noils") return parseNoilsPdfRows(lines);
  if (docType === "a_percent") return parseAPercentPdfRows(lines);
  return parseStretchPdfRows(lines);
};

export const config = {
  api: {
    bodyParser: false,
    responseLimit: false,
  },
  maxDuration: 120,
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ message: "Method not allowed" });
  }

  const backendBaseUrl = getBackendBaseUrl();
  if (!backendBaseUrl) {
    return res.status(500).json({
      message: "OCR backend URL is not configured. Set NEXT_PUBLIC_API_URL.",
    });
  }

  const targetUrl = `${backendBaseUrl}/ocr-machine/api/ocr-json`;
  const contentType = req.headers["content-type"] || "application/octet-stream";
  const requestBody = await readRequestBody(req);

  try {
    const upstream = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "content-type": contentType,
      },
      body: requestBody,
    });

    const upstreamBody = Buffer.from(await upstream.arrayBuffer());
    const upstreamContentType = upstream.headers.get("content-type") || "";

    if (upstreamContentType.includes("application/json")) {
      const payload = JSON.parse(upstreamBody.toString("utf8") || "{}");
      const { fields = {}, files = {} } = parseMultipartBody(requestBody, contentType);
      const fallbackRows = hasAnyRowArray(payload) ? [] : extractRowsFromPdf(files.file?.buffer, fields.doc_type || payload.doc_type);

      if (fallbackRows.length) {
        return res.status(upstream.status).json({
          ...payload,
          data: fallbackRows,
          raw_tables: fallbackRows,
          fallback_source: "embedded_pdf_text",
        });
      }

      return res.status(upstream.status).json(payload);
    }

    res.status(upstream.status);
    upstream.headers.forEach((value, key) => {
      if (["connection", "content-encoding", "content-length", "content-type", "transfer-encoding"].includes(key.toLowerCase())) {
        return;
      }
      res.setHeader(key, value);
    });

    return Readable.from(upstreamBody).pipe(res);
  } catch (error) {
    return res.status(502).json({
      message: `Unable to reach OCR backend at ${targetUrl}.`,
      error: error?.message || "Fetch failed",
    });
  }
}
