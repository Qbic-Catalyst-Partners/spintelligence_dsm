const DEFAULT_AGENT_URL = "https://bisque-snail-467435.hostingersite.com/webhook/spinny-agent";

const AGENT_URL = (process.env.NEXT_PUBLIC_N8N_AGENT_URL || DEFAULT_AGENT_URL).trim();
const AGENT_API_KEY = process.env.NEXT_PUBLIC_N8N_API_KEY || "59b49d3f8c642a9229cc59e0ac23bff0b6f665422a898684114808c366710ec6";

// The n8n webhook returns a plain-text answer (not JSON), and is authenticated
// via a static API key header rather than the app's own Bearer token, so this
// intentionally bypasses the shared apiConfig axios instance.
export const askAgent = async (question, sessionId, { signal } = {}) => {
  const response = await fetch(AGENT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": AGENT_API_KEY,
    },
    body: JSON.stringify({
      chatInput: question,
      sessionId,
    }),
    signal,
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(text || `Agent request failed with status ${response.status}`);
  }

  return text;
};
