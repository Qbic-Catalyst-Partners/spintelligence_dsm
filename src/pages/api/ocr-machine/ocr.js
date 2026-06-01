import { Readable } from "node:stream";

const getBackendBaseUrl = () =>
  String(
    process.env.OCR_API_URL ||
      process.env.API_URL ||
      process.env.NEXT_PUBLIC_OCR_API_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      ""
  )
    .trim()
    .replace(/\/+$/, "");

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
      message: "OCR backend URL is not configured. Set OCR_API_URL, API_URL, or NEXT_PUBLIC_API_URL.",
    });
  }

  const targetUrl = `${backendBaseUrl}/ocr-machine/api/ocr`;

  try {
    const upstream = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "content-type": req.headers["content-type"] || "application/octet-stream",
      },
      body: req,
      duplex: "half",
    });

    res.status(upstream.status);
    upstream.headers.forEach((value, key) => {
      if (["connection", "content-encoding", "content-length", "transfer-encoding"].includes(key.toLowerCase())) {
        return;
      }
      res.setHeader(key, value);
    });

    if (!upstream.body) {
      return res.end();
    }

    return Readable.fromWeb(upstream.body).pipe(res);
  } catch (error) {
    return res.status(502).json({
      message: `Unable to reach OCR backend at ${targetUrl}.`,
      error: error?.message || "Fetch failed",
    });
  }
}
