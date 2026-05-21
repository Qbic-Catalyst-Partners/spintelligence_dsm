import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/+$/, "");

const DOC_TYPES = [
  { label: "HVI Data Entry", value: "hvi" },
  { label: "AFIS Data Entry", value: "afis" },
];

export default function OcrMachinePage() {
  const router = useRouter();
  const [docType, setDocType] = useState("hvi");
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState([]);
  const [rows, setRows] = useState([]);
  const [formValues, setFormValues] = useState({});
  const [saved, setSaved] = useState(false);
  const returnTo = typeof router.query.returnTo === "string" ? router.query.returnTo : "";
  const requestedDocType = typeof router.query.docType === "string" ? router.query.docType.toLowerCase() : "";

  useEffect(() => {
    if (requestedDocType === "afis" || requestedDocType === "hvi") setDocType(requestedDocType);
  }, [requestedDocType]);

  const step = useMemo(() => {
    if (rows.length > 0) return 3;
    if (loading || file) return 2;
    return 1;
  }, [file, loading, rows.length]);

  const runOcr = async () => {
    if (!file) return;
    setSaved(false);
    setLoading(true);
    setLogs([]);
    setRows([]);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("doc_type", docType);
      const res = await fetch(`${API_BASE}/ocr-machine/api/ocr`, { method: "POST", body: form });
      if (!res.ok) throw new Error(await res.text());
      if (!res.body) throw new Error("No stream returned");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalResult = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";
        for (const evt of events) {
          if (!evt.startsWith("data:")) continue;
          const payload = JSON.parse(evt.slice(5).trim());
          if (payload?.msg) setLogs((prev) => [...prev, payload.msg]);
          if (payload?.result) finalResult = payload.result;
        }
      }

      const parsed = Array.isArray(finalResult?.json_output) ? finalResult.json_output : [];
      setRows(parsed);
      setFormValues(parsed[0] || {});
    } catch (e) {
      setLogs((prev) => [...prev, e.message || "OCR failed"]);
    } finally {
      setLoading(false);
    }
  };

  const saveResult = async () => {
    if (!Object.keys(formValues).length) return;
    const payload = { filename: file?.name || "", doc_type: docType, ocr_json: rows, manual_json: [formValues] };
    const res = await fetch(`${API_BASE}/ocr-machine/api/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await res.text());
    setSaved(true);
  };

  const stepColor = (idx) => (step === idx ? "#3f56a9" : "#cfd4dd");
  const stepTextColor = (idx) => (step === idx ? "#3f56a9" : "#94a3b8");

  return (
    <div style={{ minHeight: "100vh", background: "rgba(100, 116, 139, 0.65)", display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 16, fontFamily: "Segoe UI, sans-serif" }}>
      <div style={{ width: "min(680px, calc(100vw - 24px))", background: "#fff", borderRadius: 10, border: "1px solid #e2e8f0", padding: "22px 24px" }}>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 14, marginBottom: 22 }}>
          {["Upload", "Extract", "Review"].map((label, i) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 17, fontWeight: 700, color: stepTextColor(i + 1) }}>
                <span style={{ width: 28, height: 28, borderRadius: 999, display: "grid", placeItems: "center", background: stepColor(i + 1), color: step === i + 1 ? "#fff" : "#64748b", fontSize: 14, fontWeight: 700 }}>
                  {i + 1}
                </span>
                {label}
              </div>
              {i < 2 ? (
                <span
                  style={{
                    width: 36,
                    height: 2,
                    background: step >= i + 2 ? "#3f56a9" : "#cfd4dd",
                    borderRadius: 99,
                  }}
                />
              ) : null}
            </div>
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 36/2.2, fontWeight: 700, color: "#0f172a" }}>{rows.length > 0 ? "Review & Edit" : "Upload Report PDF"}</h2>
          <div style={{ width: 238, borderRadius: 6, background: "#445bb2", color: "#fff", padding: "10px 14px" }}>
            <div style={{ fontSize: 9, opacity: 0.8, textTransform: "uppercase", letterSpacing: 0.6 }}>Type</div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{DOC_TYPES.find((d) => d.value === docType)?.label || "HVI Data Entry"}</div>
          </div>
        </div>

        <div style={{ border: "1px dashed #94a3b8", borderRadius: 10, minHeight: rows.length > 0 ? 270 : 220, padding: 20 }}>
          {!file ? (
            <label style={{ display: "grid", placeItems: "center", textAlign: "center", cursor: "pointer", minHeight: 175 }}>
              <div style={{ fontSize: 56, lineHeight: 1, color: "#9aa5b5", marginBottom: 4 }}>⤓</div>
              <div style={{ fontSize: 38/2.2, fontWeight: 700, color: "#0f172a" }}>Drop or Select the PDF from Computer</div>
              <div style={{ color: "#94a3b8", marginTop: 8, marginBottom: 14, fontSize: 16 }}>max 20 MB</div>
              <span style={{ background: "#445bb2", color: "#fff", borderRadius: 8, padding: "10px 22px", display: "inline-block", fontWeight: 700, fontSize: 14 }}>Browse File</span>
              <input hidden type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </label>
          ) : rows.length === 0 ? (
            <div style={{ textAlign: "center", minHeight: 175, display: "grid", alignContent: "center" }}>
              <div style={{ fontSize: 50, lineHeight: 1, color: "#9aa5b5" }}>⤓</div>
              <div style={{ fontWeight: 700, marginTop: 8 }}>{file.name}</div>
              <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 16 }}>
                <button onClick={() => { setFile(null); setLogs([]); }} style={{ border: "1px solid #9ca3af", background: "#fff", borderRadius: 8, padding: "8px 20px", fontWeight: 600 }}>Cancel</button>
                <button onClick={runOcr} disabled={loading} style={{ border: "none", background: "#445bb2", color: "#fff", borderRadius: 8, padding: "8px 22px", fontWeight: 700 }}>
                  {loading ? "Running..." : "Run OCR"}
                </button>
              </div>
              {logs.length > 0 ? <div style={{ marginTop: 10, fontSize: 12, color: "#64748b" }}>{logs[logs.length - 1]}</div> : null}
            </div>
          ) : (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
                {Object.keys(formValues).map((key) => (
                  <label key={key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ fontSize: 11, color: "#334155", fontWeight: 600 }}>{key}</span>
                    <input
                      value={formValues[key] ?? ""}
                      onChange={(e) => setFormValues((prev) => ({ ...prev, [key]: e.target.value }))}
                      style={{ height: 32, borderRadius: 6, border: "1px solid #d1d5db", background: "#f8fafc", padding: "0 8px", fontSize: 12 }}
                    />
                  </label>
                ))}
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 14 }}>
                <button onClick={() => { setRows([]); setFormValues({}); }} style={{ border: "1px solid #9ca3af", background: "#fff", borderRadius: 8, padding: "8px 20px", fontWeight: 600 }}>Cancel</button>
                {returnTo ? (
                  <button
                    onClick={() => {
                      const normalizedScreen = returnTo.replace(/^\/+/, "").toLowerCase();
                      window.localStorage.setItem(
                        "ocr_prefill",
                        JSON.stringify({
                          screen: normalizedScreen,
                          docType,
                          values: formValues,
                          result: { json_output: rows },
                        })
                      );
                      router.push(returnTo);
                    }}
                    style={{ border: "none", background: "#445bb2", color: "#fff", borderRadius: 8, padding: "8px 18px", fontWeight: 700 }}
                  >
                    Use as Input Screen
                  </button>
                ) : (
                  <button onClick={saveResult} style={{ border: "none", background: "#445bb2", color: "#fff", borderRadius: 8, padding: "8px 18px", fontWeight: 700 }}>
                    Save to Database
                  </button>
                )}
              </div>
              {saved ? <div style={{ marginTop: 8, color: "#166534", fontWeight: 600, fontSize: 12 }}>Saved successfully.</div> : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
