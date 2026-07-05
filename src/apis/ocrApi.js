const OCR_BASE_URL = (
  process.env.NEXT_PUBLIC_OCR_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  ""
).replace(/\/+$/, "");
const OCR_ENDPOINT = OCR_BASE_URL
  ? `${OCR_BASE_URL}/ocr-machine/api/ocr`
  : "/api/ocr-machine/ocr";
const OCR_JSON_ENDPOINT = OCR_BASE_URL
  ? `${OCR_BASE_URL}/ocr-machine/api/ocr-json`
  : "/ocr-machine/api/ocr-json";

export const runOcrForDocument = async ({ file, docType }) => {
  const form = new FormData();
  form.append("file", file);
  form.append("doc_type", docType);

  const res = await fetch(OCR_ENDPOINT, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    const error = new Error(msg || "OCR request failed");
    try {
      return await runOcrJsonForDocument({ file, docType });
    } catch {
      throw error;
    }
  }

  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const payload = await res.json();
    return payload?.result || payload || {};
  }

  if (!res.body) {
    try {
      return await runOcrJsonForDocument({ file, docType });
    } catch {
      throw new Error("No OCR stream returned");
    }
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let lastResult = null;

  const readEvent = (evt) => {
    if (!evt.startsWith("data:")) return;
    const raw = evt.slice(5).trim();
    if (!raw || raw === "[DONE]") return;
    try {
      const payload = JSON.parse(raw);
      if (payload?.result) lastResult = payload.result;
    } catch {}
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() || "";

    for (const evt of events) {
      readEvent(evt);
    }
  }

  if (buffer.trim()) {
    readEvent(buffer.trim());
  }

  if (lastResult && Object.keys(lastResult).length > 0) {
    return lastResult;
  }

  try {
    return await runOcrJsonForDocument({ file, docType });
  } catch {
    return {};
  }
};

export const runOcrJsonForDocument = async ({ file, docType }) => {
  const form = new FormData();
  form.append("file", file);
  form.append("doc_type", docType);

  const res = await fetch(OCR_JSON_ENDPOINT, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(msg || "OCR JSON request failed");
  }

  const payload = await res.json().catch(() => ({}));
  console.log("OCR JSON response", payload);
  return payload || {};
};
