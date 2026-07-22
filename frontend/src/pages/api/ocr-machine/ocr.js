import { Readable } from "node:stream";

// Mirrors apiConfig.js's hardcoded backend host. This fetch runs server-side in the
// Next.js Node process, not the browser, so there's no mixed-content concern about
// using plain HTTP here even when the page itself is served over HTTPS.
const OCR_BACKEND_FALLBACK_URL = "http://187.127.135.236:4000";

const getBackendBaseUrl = () =>
  String(
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.OCR_API_URL ||
    process.env.API_URL ||
    OCR_BACKEND_FALLBACK_URL
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
      message: "OCR backend URL is not configured. Set NEXT_PUBLIC_API_URL.",
    });
  }

  const targetUrl = `${backendBaseUrl}/ocr-machine/api/ocr`;

  try {
    const upstream = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "content-type": req.headers["content-type"] || "application/octet-stream",
        ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}),
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
