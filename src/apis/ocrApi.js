const OCR_BASE_URL = (
  process.env.NEXT_PUBLIC_OCR_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  ""
).replace(/\/+$/, "");

export const runOcrForDocument = async ({ file, docType }) => {
  const form = new FormData();
  form.append("file", file);
  form.append("doc_type", docType);

  const res = await fetch(`${OCR_BASE_URL}/ocr-machine/api/ocr`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(msg || "OCR request failed");
  }

  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return res.json();
  }

  if (!res.body) {
    throw new Error("No OCR stream returned");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let lastResult = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() || "";

    for (const evt of events) {
      if (!evt.startsWith("data:")) continue;
      const raw = evt.slice(5).trim();
      if (!raw || raw === "[DONE]") continue;
      try {
        const payload = JSON.parse(raw);
        if (payload?.result) lastResult = payload.result;
      } catch {}
    }
  }

  return lastResult || {};
};
