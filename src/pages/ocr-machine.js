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
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const readTheme = () => {
      const rootTheme = document.documentElement.getAttribute("data-theme");
      const bodyTheme = document.body?.getAttribute("data-theme");
      setIsDark(rootTheme === "dark" || bodyTheme === "dark");
    };
    readTheme();
    const observer = new MutationObserver(readTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    observer.observe(document.body, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

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

  const stepColor = (idx) => (step === idx ? "#3f56a9" : "#cfd4dd");
  const stepTextColor = (idx) => (step === idx ? "#3f56a9" : "#94a3b8");
  const colors = isDark
    ? {
        pageBg: "#0b1220",
        cardBg: "#111827",
        cardBorder: "#374151",
        heading: "#f8fafc",
        muted: "#94a3b8",
        panelBg: "#0f172a",
        panelBorder: "#475569",
        fieldBg: "#1f2937",
        fieldBorder: "#4b5563",
        fieldText: "#f8fafc",
        cancelBg: "#111827",
        cancelBorder: "#6b7280",
        cancelText: "#f3f4f6",
        success: "#22c55e",
      }
    : {
        pageBg: "rgba(100, 116, 139, 0.65)",
        cardBg: "#ffffff",
        cardBorder: "#e2e8f0",
        heading: "#0f172a",
        muted: "#94a3b8",
        panelBg: "transparent",
        panelBorder: "#94a3b8",
        fieldBg: "#f8fafc",
        fieldBorder: "#d1d5db",
        fieldText: "#0f172a",
        cancelBg: "#ffffff",
        cancelBorder: "#9ca3af",
        cancelText: "#111827",
        success: "#166534",
      };

  return (
    <div style={{ minHeight: "100vh", background: colors.pageBg, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, paddingTop: 0, fontFamily: "Segoe UI, sans-serif" }}>
      <div style={{ width: "min(680px, calc(100vw - 24px))", background: colors.cardBg, borderRadius: 10, border: `1px solid ${colors.cardBorder}`, padding: "22px 24px", transform: "translateY(-36px)" }}>
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

        <div style={{ marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 36 / 2.2, fontWeight: 700, color: colors.heading }}>{rows.length > 0 ? "Review & Edit" : "Upload Report PDF"}</h2>
          <div style={{ marginTop: 2, fontWeight: 700, fontSize: 18, color: colors.heading }}>
            {DOC_TYPES.find((d) => d.value === docType)?.label || "HVI Data Entry"}
          </div>
        </div>

        <div style={{ background: colors.panelBg, border: `1px dashed ${colors.panelBorder}`, borderRadius: 10, minHeight: rows.length > 0 ? 270 : 220, padding: 20 }}>
          {!file ? (
            <label style={{ display: "grid", placeItems: "center", textAlign: "center", cursor: "pointer", minHeight: 175 }}>
              <div style={{ marginBottom: 8, color: "#9aa5b5" }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M12 16V4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                  <path d="M7 11L12 16L17 11" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M5 19H19" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                </svg>
              </div>
              <div style={{ fontSize: 38 / 2.2, fontWeight: 700, color: colors.heading }}>Drop or Select the PDF from Computer</div>
              <span style={{ background: "#445bb2", color: "#fff", borderRadius: 8, padding: "10px 22px", display: "inline-block", fontWeight: 700, fontSize: 14 }}>Browse File</span>
              <input hidden type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </label>
          ) : rows.length === 0 ? (
            <div style={{ textAlign: "center", minHeight: 175, display: "grid", alignContent: "center" }}>
              <div style={{ color: "#9aa5b5", display: "grid", placeItems: "center" }}>
                <svg width="34" height="34" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M12 16V4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                  <path d="M7 11L12 16L17 11" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M5 19H19" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                </svg>
              </div>
              <div style={{ fontWeight: 700, marginTop: 8 }}>{file.name}</div>
              <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 16 }}>
                <button onClick={() => { setFile(null); setLogs([]); }} style={{ border: `1px solid ${colors.cancelBorder}`, background: colors.cancelBg, color: colors.cancelText, borderRadius: 8, padding: "8px 20px", fontWeight: 600 }}>Cancel</button>
                <button onClick={runOcr} disabled={loading} style={{ border: "none", background: "#445bb2", color: "#fff", borderRadius: 8, padding: "8px 22px", fontWeight: 700 }}>
                  {loading ? "Running..." : "Run OCR"}
                </button>
              </div>
              {logs.length > 0 ? <div style={{ marginTop: 10, fontSize: 12, color: colors.muted }}>{logs[logs.length - 1]}</div> : null}
            </div>
          ) : (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
                {Object.keys(formValues).map((key) => (
                  <label key={key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ fontSize: 11, color: colors.muted, fontWeight: 600 }}>{key}</span>
                    <input
                      value={formValues[key] ?? ""}
                      onChange={(e) => setFormValues((prev) => ({ ...prev, [key]: e.target.value }))}
                      style={{ height: 32, borderRadius: 6, border: `1px solid ${colors.fieldBorder}`, background: colors.fieldBg, color: colors.fieldText, padding: "0 8px", fontSize: 12 }}
                    />
                  </label>
                ))}
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 14 }}>
                <button onClick={() => { setRows([]); setFormValues({}); }} style={{ border: `1px solid ${colors.cancelBorder}`, background: colors.cancelBg, color: colors.cancelText, borderRadius: 8, padding: "8px 20px", fontWeight: 600 }}>Cancel</button>
                <button
                  onClick={() => {
                    const fallbackTarget = docType === "afis" ? "/mixing?type=AFIS%20Data%20Entry" : "/mixing?type=Cotton%20HVI%20Data%20Entry";
                    const target = returnTo || fallbackTarget;
                    const normalizedScreen = target.replace(/^\/+/, "").toLowerCase();
                    window.localStorage.setItem(
                      "ocr_prefill",
                      JSON.stringify({
                        screen: normalizedScreen,
                        docType,
                        values: formValues,
                        result: { json_output: rows },
                      })
                    );
                    router.push(target);
                  }}
                  style={{ border: "none", background: "#445bb2", color: "#fff", borderRadius: 8, padding: "8px 18px", fontWeight: 700 }}
                >
                  Use as Input Screen
                </button>
              </div>
              {saved ? <div style={{ marginTop: 8, color: colors.success, fontWeight: 600, fontSize: 12 }}>Saved successfully.</div> : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

