const getBackendBaseUrl = () =>
  String(process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "").trim().replace(/\/+$/, "");

const ALLOWED_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"];

const shouldSendBody = (method) => !["GET", "HEAD"].includes(String(method || "").toUpperCase());

const buildTargetUrl = (baseUrl, pathParts, query) => {
  const safePath = Array.isArray(pathParts) ? pathParts.map((part) => encodeURIComponent(String(part))).join("/") : "";
  const params = new URLSearchParams();

  Object.entries(query || {}).forEach(([key, value]) => {
    if (key === "path") return;
    if (Array.isArray(value)) {
      value.forEach((entry) => params.append(key, String(entry)));
      return;
    }
    if (typeof value !== "undefined") {
      params.append(key, String(value));
    }
  });

  const queryString = params.toString();
  return `${baseUrl}/dashboard/${safePath}${queryString ? `?${queryString}` : ""}`;
};

const readBody = (req) => {
  if (!req.body) return undefined;
  if (typeof req.body === "string") return req.body;
  return JSON.stringify(req.body);
};

const copyResponseHeaders = (upstream, res, { forceNoCache = false } = {}) => {
  upstream.headers.forEach((value, key) => {
    if (key.toLowerCase() === "transfer-encoding") return;
    res.setHeader(key, value);
  });

  if (forceNoCache) {
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
  }
};

const streamUpstreamResponse = async (upstream, req, res) => {
  if (!upstream.body) {
    res.end();
    return;
  }

  const reader = upstream.body.getReader();
  const abort = () => {
    try {
      reader.cancel();
    } catch {
      // no-op
    }
  };

  req.on("close", abort);

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        res.write(Buffer.from(value));
      }
    }
  } finally {
    req.off("close", abort);
    res.end();
  }
};

export default async function handler(req, res) {
  const method = String(req.method || "").toUpperCase();
  if (!ALLOWED_METHODS.includes(method)) {
    res.setHeader("Allow", ALLOWED_METHODS.join(", "));
    return res.status(405).json({ message: "Method not allowed" });
  }

  const backendBaseUrl = getBackendBaseUrl();
  if (!backendBaseUrl) {
    return res.status(500).json({
      message: "Backend API URL is not configured. Set API_URL or NEXT_PUBLIC_API_URL.",
    });
  }

  const pathParts = req.query?.path;
  const targetUrl = buildTargetUrl(backendBaseUrl, pathParts, req.query || {});
  const isSse = Array.isArray(pathParts) && pathParts[pathParts.length - 1] === "stream";

  const outboundHeaders = {
    ...(req.headers.authorization ? { Authorization: req.headers.authorization } : {}),
    ...(req.headers.accept ? { Accept: req.headers.accept } : {}),
    ...(req.headers["last-event-id"] ? { "Last-Event-ID": req.headers["last-event-id"] } : {}),
  };

  const payload = shouldSendBody(method) ? readBody(req) : undefined;
  if (typeof payload !== "undefined") {
    outboundHeaders["Content-Type"] = req.headers["content-type"] || "application/json";
  }

  try {
    const upstream = await fetch(targetUrl, {
      method,
      headers: outboundHeaders,
      ...(typeof payload !== "undefined" ? { body: payload } : {}),
    });

    copyResponseHeaders(upstream, res, { forceNoCache: isSse });
    res.statusCode = upstream.status;

    if (isSse) {
      await streamUpstreamResponse(upstream, req, res);
      return;
    }

    const text = await upstream.text();
    if (!text) {
      return res.end();
    }

    try {
      return res.status(upstream.status).json(JSON.parse(text));
    } catch {
      return res.status(upstream.status).send(text);
    }
  } catch (error) {
    return res.status(502).json({
      message: error?.message || "Unable to reach backend dashboard API.",
    });
  }
}
