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

const buildUpdateAttempts = ({ baseUrl, thresholdId, threshold, updates }) => [
  {
    method: "PATCH",
    url: `${baseUrl}/operator-tickets/thresholds/${encodeURIComponent(thresholdId)}`,
    body: updates,
  },
  {
    method: "PUT",
    url: `${baseUrl}/operator-tickets/thresholds/${encodeURIComponent(thresholdId)}`,
    body: {
      ...(threshold && typeof threshold === "object" ? threshold : {}),
      ...(updates && typeof updates === "object" ? updates : {}),
    },
  },
];

const buildDeleteAttempts = ({ baseUrl, thresholdId }) => [
  {
    method: "DELETE",
    url: `${baseUrl}/operator-tickets/thresholds/${encodeURIComponent(thresholdId)}`,
  },
  {
    method: "DELETE",
    url: `${baseUrl}/operator-tickets/thresholds/delete/${encodeURIComponent(thresholdId)}`,
  },
];

async function forwardAttempts(attempts, authorization) {
  let lastErrorPayload = null;
  let lastStatus = 500;

  for (const attempt of attempts) {
    try {
      const response = await fetch(attempt.url, {
        method: attempt.method,
        headers: {
          ...(attempt.body ? { "Content-Type": "application/json" } : {}),
          ...(authorization ? { Authorization: authorization } : {}),
        },
        ...(attempt.body ? { body: JSON.stringify(attempt.body) } : {}),
      });

      let data = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }

      if (response.ok) {
        return {
          ok: true,
          status: response.status,
          data,
        };
      }

      lastErrorPayload = data;
      lastStatus = response.status;

      if (response.status !== 404 && response.status !== 405) {
        return {
          ok: false,
          status: response.status,
          data,
        };
      }
    } catch (error) {
      lastErrorPayload = { message: error.message || "Unable to reach backend threshold API." };
      lastStatus = 502;
    }
  }

  return {
    ok: false,
    status: lastStatus,
    data: lastErrorPayload,
  };
}

export default async function handler(req, res) {
  if (!["PATCH", "DELETE"].includes(req.method || "")) {
    res.setHeader("Allow", "PATCH, DELETE");
    return res.status(405).json({ message: "Method not allowed" });
  }

  const backendBaseUrl = getBackendBaseUrl();
  const thresholdId = req.query?.id;

  if (!backendBaseUrl) {
    return res.status(500).json({
      message: "Backend API URL is not configured. Set API_URL or NEXT_PUBLIC_API_URL.",
    });
  }

  if (!thresholdId) {
    return res.status(400).json({ message: "Threshold id is required." });
  }

  const authorization = req.headers.authorization || "";
  const payload = readJsonBody(req);

  const result = req.method === "PATCH"
    ? await forwardAttempts(
        buildUpdateAttempts({
          baseUrl: backendBaseUrl,
          thresholdId,
          threshold: payload.threshold,
          updates: payload.updates,
        }),
        authorization
      )
    : await forwardAttempts(
        buildDeleteAttempts({
          baseUrl: backendBaseUrl,
          thresholdId,
        }),
        authorization
      );

  if (result.ok) {
    return res.status(result.status).json(
      result.data || (
        req.method === "DELETE"
          ? { success: true, id: thresholdId }
          : { id: thresholdId, ...(payload.updates || {}) }
      )
    );
  }

  return res.status(result.status).json(
    result.data || {
      message:
        req.method === "DELETE"
          ? "No supported backend threshold delete endpoint was available."
          : "No supported backend threshold update endpoint was available.",
    }
  );
}
