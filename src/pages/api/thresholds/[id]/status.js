const getBackendBaseUrl = () =>
  String(process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "").trim().replace(/\/+$/, "");

const readJsonBody = (req) => {
  if (!req.body) {
    return {};
  }

  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }

  return req.body;
};

const buildBackendAttempts = ({ baseUrl, thresholdId, payload }) => [
  {
    method: "PATCH",
    url: `${baseUrl}/operator-tickets/thresholds/${encodeURIComponent(thresholdId)}/status`,
    body: {
      is_active: payload.is_active,
      isActive: payload.isActive,
      status: payload.status,
    },
  },
  {
    method: "PATCH",
    url: `${baseUrl}/operator-tickets/thresholds/${encodeURIComponent(thresholdId)}`,
    body: {
      is_active: payload.is_active,
      isActive: payload.isActive,
      status: payload.status,
    },
  },
  {
    method: "PUT",
    url: `${baseUrl}/operator-tickets/thresholds/${encodeURIComponent(thresholdId)}`,
    body: {
      ...(payload.threshold && typeof payload.threshold === "object" ? payload.threshold : {}),
      is_active: payload.is_active,
      isActive: payload.isActive,
      status: payload.status,
    },
  },
];

export default async function handler(req, res) {
  if (req.method !== "PATCH") {
    res.setHeader("Allow", "PATCH");
    return res.status(405).json({ message: "Method not allowed" });
  }

  const backendBaseUrl = getBackendBaseUrl();
  const thresholdId = req.query?.id;
  const payload = readJsonBody(req);

  if (!backendBaseUrl) {
    return res.status(500).json({
      message: "Backend API URL is not configured. Set API_URL or NEXT_PUBLIC_API_URL.",
    });
  }

  if (!thresholdId) {
    return res.status(400).json({ message: "Threshold id is required." });
  }

  const authorization = req.headers.authorization || "";
  const attempts = buildBackendAttempts({
    baseUrl: backendBaseUrl,
    thresholdId,
    payload,
  });

  let lastErrorPayload = null;
  let lastStatus = 500;

  for (const attempt of attempts) {
    try {
      const response = await fetch(attempt.url, {
        method: attempt.method,
        headers: {
          "Content-Type": "application/json",
          ...(authorization ? { Authorization: authorization } : {}),
        },
        body: JSON.stringify(attempt.body),
      });

      let data = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }

      if (response.ok) {
        return res.status(response.status).json(data || {
          id: thresholdId,
          is_active: Boolean(payload.is_active),
        });
      }

      lastErrorPayload = data;
      lastStatus = response.status;

      if (response.status !== 404 && response.status !== 405) {
        return res.status(response.status).json(
          data || { message: "Threshold status update failed." }
        );
      }
    } catch (error) {
      lastErrorPayload = { message: error.message || "Unable to reach backend threshold API." };
      lastStatus = 502;
    }
  }

  return res.status(lastStatus).json(
    lastErrorPayload || {
      message: "No supported threshold status update endpoint was available on the backend.",
    }
  );
}
