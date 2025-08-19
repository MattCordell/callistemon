import React, { useMemo, useState } from "react";
import QrScanner from "react-qr-barcode-scanner";

/**
 * Patient Reception — React App (v7)
 * - Replaced QR lib with react-qr-barcode-scanner (works with React 18)
 * - Keeps: photo handling (Attachment.data/url), auto $everything, history picker,
 *   outstanding ServiceRequests (code, status, notes, authoredOn, requester)
 */

const DEFAULT_BASE = "https://server.fire.ly";

export default function App() {
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE);
  const [mode, setMode] = useState("fullUri"); // "fullUri" | "patientId" | "qr"
  const [input, setInput] = useState("");
  const [historyBundle, setHistoryBundle] = useState(null);
  const [selectedVersionUrl, setSelectedVersionUrl] = useState("");
  const [resolvedBundle, setResolvedBundle] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showScanner, setShowScanner] = useState(false);

  // -------------------- Fetch --------------------
  async function doFetch(url, init) {
    const res = await fetch(url, init);
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (e) {}
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return json ?? text;
  }

  // -------------------- Parse input --------------------
  const isProbablyUrl = (s) => /^(https?:)?\/\//i.test(s);
  const parsed = useMemo(() => {
    const raw = input.trim();
    if (!raw) return { kind: "empty" };
    if (isProbablyUrl(raw)) return { kind: "url", url: raw };
    return { kind: "id", id: raw };
  }, [input]);

  // -------------------- Resolve --------------------
  const handleResolve = async () => {
    setError(null);
    setResolvedBundle(null);
    setHistoryBundle(null);
    setSelectedVersionUrl("");
    try {
      setLoading(true);
      if (mode === "fullUri") {
        if (parsed.kind !== "url") throw new Error("Please enter a full URL (starts with http).");
        await resolveFromUrl(parsed.url);
      } else if (mode === "patientId") {
        if (parsed.kind !== "id") throw new Error("Please enter just a Patient ID (uuid).");
        const url = `${baseUrl.replace(/\/$/, "")}/Patient/${encodeURIComponent(parsed.id)}/_history`;
        const bundle = await doFetch(url);
        if (!bundle || bundle.resourceType !== "Bundle") throw new Error("Expected a Bundle from _history.");
        setHistoryBundle(bundle);
      } else if (mode === "qr") {
        if (parsed.kind === "url") {
          await resolveFromUrl(parsed.url);
        } else if (parsed.kind === "id") {
          const url = `${baseUrl.replace(/\/$/, "")}/Patient/${encodeURIComponent(parsed.id)}/_history`;
          const bundle = await doFetch(url);
          if (!bundle || bundle.resourceType !== "Bundle") throw new Error("Expected a Bundle from _history.");
          setHistoryBundle(bundle);
        } else {
          throw new Error("Scan a QR or paste its contents first.");
        }
      }
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const resolveFromUrl = async (url) => {
    const json = await doFetch(url);
    setSelectedVersionUrl(url);
    if (json?.resourceType === "Bundle") { setResolvedBundle(json); return; }
    if (json?.resourceType === "Patient") { await handlePatientEverything(json.id); return; }
    const subjectRef = json?.subject?.reference; // e.g., "Patient/{id}"
    if (subjectRef?.startsWith("Patient/")) {
      const patientId = subjectRef.split("/")[1];
      await handlePatientEverything(patientId);
    } else {
      throw new Error("Resolved resource is not a Bundle/Patient and has no Patient subject to load details.");
    }
  };

  const handlePickHistoryEntry = async (entry) => {
    try {
      setError(null);
      setLoading(true);
      let url = entry.fullUrl;
      const r = entry.resource;
      if (!url && r && r.resourceType && r.id && r.meta?.versionId) {
        url = `${baseUrl.replace(/\/$/, "")}/${r.resourceType}/${r.id}/_history/${r.meta.versionId}`;
      }
      if (!url) throw new Error("Cannot derive version URL from entry.");
      await resolveFromUrl(url);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const handlePatientEverything = async (patientId) => {
    const url = `${baseUrl.replace(/\/$/, "")}/Patient/${encodeURIComponent(patientId)}/$everything`;
    const bundle = await doFetch(url);
    setResolvedBundle(bundle);
    setSelectedVersionUrl(url);
  };

  // -------------------- UI helpers --------------------
  const Section = ({ title, children, right }) => (
    <div className="border rounded-2xl p-4 mb-4 shadow-sm bg-white/60 dark:bg-zinc-900/60">
      <div className="flex items-center justify-between gap-4 mb-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        {right}
      </div>
      {children}
    </div>
  );
  const PrettyJson = ({ value }) => (
    <pre className="text-xs overflow-auto max-h-96 bg-black/5 dark:bg-white/5 p-3 rounded-lg"><code>{JSON.stringify(value, null, 2)}</code></pre>
  );
  const humanName = (name) => {
    if (!name) return "";
    const n = Array.isArray(name) ? name[0] : name;
    const given = (n.given ?? []).join(" ");
    return [n.prefix?.join(" ") , given, n.family, n.suffix?.join(" ")].filter(Boolean).join(" ");
  };
  const addrLine = (a) => a ? [a.line?.join(", "), a.city, a.state, a.postalCode, a.country].filter(Boolean).join(" · ") : "";
  const cc = (codeable) => {
    if (!codeable) return "";
    if (Array.isArray(codeable)) return codeable.map(cc).filter(Boolean).join(", ");
    return codeable.text || codeable.coding?.[0]?.display || codeable.coding?.[0]?.code || "";
  };
  const calcAge = (dob) => {
    if (!dob) return null;
    const d = new Date(dob);
    if (isNaN(d.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - d.getFullYear();
    const m = today.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
    return age;
  };
  const Chip = ({children}) => (<span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs border">{children}</span>);

  // -------------------- Cards --------------------
  const PatientCard = ({ patient, outstandingSRs }) => {
    // Build image src from Attachment (url or inline base64 data)
    const firstPhoto = patient.photo?.[0];
    let imgSrc = null;
    if (firstPhoto) {
      if (firstPhoto.data) {
        const ct = firstPhoto.contentType || "image/*";
        imgSrc = `data:${ct};base64,${firstPhoto.data}`;
      } else if (firstPhoto.url) {
        imgSrc = firstPhoto.url;
        if (!/^https?:/i.test(imgSrc) && !imgSrc.startsWith("data:")) {
          imgSrc = `${baseUrl.replace(/\/$/, "")}/${imgSrc}`;
        }
      }
    }
    const age = calcAge(patient.birthDate);
    return (
      <div className="border rounded-2xl p-4 grid md:grid-cols-3 gap-4 items-start">
        <div className="flex items-start gap-3 md:col-span-2">
          {imgSrc && (
            <img src={imgSrc} alt="Patient" className="w-20 h-20 rounded-xl object-cover border" onError={(e)=>{e.currentTarget.style.display='none';}} />
          )}
          <div>
            <div className="text-xl font-semibold">{humanName(patient.name)}</div>
            <div className="mt-1 flex flex-wrap gap-2">
              {patient.gender && <Chip>{patient.gender}</Chip>}
              {patient.birthDate && <Chip>DOB {patient.birthDate}</Chip>}
              {age != null && <Chip>{age} yrs</Chip>}
            </div>
            {patient.telecom && <div className="mt-2 text-sm opacity-80">{patient.telecom.map(t=>`${t.system}:${t.value}`).join(" · ")}</div>}
          </div>
        </div>
        <div className="text-sm opacity-80">
          {patient.address?.length ? (
            <div>
              <div className="font-medium opacity-100">Address</div>
              <div>{addrLine(patient.address[0])}</div>
            </div>
          ) : null}
        </div>
        <div className="md:col-span-3 mt-2">
          <div className="font-medium mb-1">Outstanding ServiceRequests</div>
          {outstandingSRs.length === 0 ? (
            <div className="text-sm opacity-70">None</div>
          ) : (
            <ul className="space-y-1">
              {outstandingSRs.map((sr,i)=> (
                <li key={i} className="border rounded-xl px-3 py-2 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="truncate mr-3">{cc(sr.code) || <i className="opacity-70">(no code)</i>}</span>
                    <span className="text-xs border rounded-full px-2 py-0.5">{sr.status}</span>
                  </div>
                  {sr.note?.length > 0 && (
                    <div className="text-xs opacity-80">{sr.note.map(n=>n.text).filter(Boolean).join(" · ")}</div>
                  )}
                  <div className="text-xs opacity-80">
                    {sr.authoredOn && <span>Authored: {new Date(sr.authoredOn).toLocaleString()} · </span>}
                    {sr.requester && (sr.requester.display || sr.requester.reference)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  };

  const ObsRow = ({ o }) => (
    <div className="border rounded-xl p-3">
      <div className="text-sm"><b>{cc(o.code)}</b>{o.effectiveDateTime?` · ${o.effectiveDateTime}`:""}</div>
      {o.valueQuantity && (<div className="text-sm">{o.valueQuantity.value} {o.valueQuantity.unit}</div>)}
      {o.valueString && (<div className="text-sm">{o.valueString}</div>)}
    </div>
  );
  const DRCard = ({ dr }) => (
    <div className="border rounded-xl p-3 space-y-1">
      <div className="text-sm font-medium">{cc(dr.code)}</div>
      <div className="text-xs opacity-80">Status: {dr.status}{dr.effectiveDateTime?` · ${dr.effectiveDateTime}`:""}</div>
    </div>
  );
  const ImagingRow = ({ is }) => (
    <div className="border rounded-xl p-3">
      <div className="text-sm font-medium">ImagingStudy · {is.id}</div>
      <div className="text-xs opacity-80">{is.modality?.map(m=>cc(m)).join(", ")}</div>
    </div>
  );

  const HistoryList = ({ bundle }) => (
    <div className="space-y-2">
      {(bundle.entry ?? []).map((e, i) => {
        const r = e.resource;
        const when = r?.meta?.lastUpdated || e.response?.lastModified || "";
        const vid = r?.meta?.versionId || e.request?.ifNoneMatch || e.response?.etag || "";
        const fullUrl = e.fullUrl;
        return (
          <div key={i} className="border rounded-xl p-3 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-sm"><span className="font-mono">v{vid}</span> · <span className="opacity-70">{new Date(when).toLocaleString()}</span></div>
              {fullUrl && <div className="text-xs opacity-70 truncate max-w-[60ch]">{fullUrl}</div>}
            </div>
            <button className="btn" onClick={() => handlePickHistoryEntry(e)}>Open</button>
          </div>
        );
      })}
    </div>
  );

  const BundleNiceView = ({ bundle }) => {
    const entries = bundle.entry ?? [];
    const resources = entries.map(e=>e.resource).filter(Boolean);
    const patient = resources.find(r => r.resourceType === "Patient");
    const ofType = (t) => resources.filter(r => r.resourceType === t);

    const srs = ofType("ServiceRequest");
    const drs = ofType("DiagnosticReport");
    const obss = ofType("Observation");
    const imgs = ofType("ImagingStudy");

    const OUT_DONE = new Set(["completed", "revoked", "entered-in-error", "stopped"]);
    const outstanding = srs.filter(sr => !OUT_DONE.has((sr.status||"").toLowerCase()));

    return (
      <div className="space-y-4">
        {patient && <PatientCard patient={patient} outstandingSRs={outstanding} />}

        {drs.length > 0 && (
          <Section title={`Diagnostic Reports (${drs.length})`}>
            <div className="grid md:grid-cols-2 gap-2">
              {drs.map((dr,i)=> <DRCard key={i} dr={dr} />)}
            </div>
          </Section>
        )}

        {imgs.length > 0 && (
          <Section title={`Imaging Studies (${imgs.length})`}>
            <div className="grid md:grid-cols-2 gap-2">
              {imgs.map((is,i)=> <ImagingRow key={i} is={is} />)}
            </div>
          </Section>
        )}

        {obss.length > 0 && (
          <Section title={`Observations (${obss.length})`}>
            <div className="grid md:grid-cols-2 gap-2">
              {obss.slice(0,10).map((o,i)=> <ObsRow key={i} o={o} />)}
            </div>
            {obss.length>10 && <div className="text-xs opacity-70 mt-1">Showing first 10</div>}
          </Section>
        )}

        <details className="mt-2">
          <summary className="cursor-pointer text-sm">Bundle JSON</summary>
          <PrettyJson value={bundle} />
        </details>
      </div>
    );
  };

  // -------------------- Page --------------------
  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-slate-50 to-slate-100 dark:from-zinc-900 dark:to-zinc-950 text-slate-900 dark:text-slate-100">
      <div className="max-w-5xl mx-auto px-4 py-6">
        <header className="mb-6">
          <h1 className="text-2xl font-bold">Patient Reception</h1>
          <p className="opacity-80 text-sm">Paste a full location URL, enter a Patient ID, or scan a QR. We auto‑pull full details and show the dashboard view.</p>
        </header>

        <Section title="Server">
          <div className="flex gap-2 items-center">
            <label className="text-sm opacity-70">Base URL</label>
            <input className="input flex-1" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://server.fire.ly" />
          </div>
        </Section>

        <Section
          title="Input"
          right={
            <div className="flex items-center gap-2">
              {[
                ["fullUri", "Full Location URI"],
                ["patientId", "Patient ID"],
                ["qr", "Scan QR"],
              ].map(([k, label]) => (
                <button key={k} onClick={() => setMode(k)} className={`px-3 py-1 rounded-full text-sm border ${mode===k?"bg-blue-600 text-white":""}`}>{label}</button>
              ))}
            </div>
          }
        >
          {mode !== "qr" && (
            <div className="flex gap-2">
              <input
                className="input flex-1"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={mode === "fullUri" ? "https://server.fire.ly/Patient/{id}/_history/{vid}" : "Patient UUID (e.g. d5719bdc-...)"}
              />
              <button className="btn" disabled={loading || !input.trim()} onClick={handleResolve}>Resolve</button>
            </div>
          )}

          {mode === "qr" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <button className="btn" onClick={() => setShowScanner((s) => !s)}>{showScanner ? "Stop" : "Start"} scanner</button>
                <input className="input flex-1" value={input} onChange={(e)=>setInput(e.target.value)} placeholder="QR result (auto-filled)" />
                <button className="btn" disabled={loading || !input.trim()} onClick={handleResolve}>Resolve</button>
              </div>
              {showScanner && (
                <QrScanner
                  onUpdate={(err, result) => {
                    if (result) {
                      const t = result?.text?.trim();
                      if (t) {
                        setInput(t);
                        setShowScanner(false);
                      }
                    }
                  }}
                  style={{ width: "100%" }}
                />
              )}
            </div>
          )}

          {error && (
            <div className="mt-3 text-sm text-red-600 dark:text-red-400">{String(error)}</div>
          )}
        </Section>

        {historyBundle && (
          <Section title="Patient History (select a version)">
            <HistoryList bundle={historyBundle} />
            <details className="mt-3">
              <summary className="cursor-pointer text-sm">Show history bundle JSON</summary>
              <PrettyJson value={historyBundle} />
            </details>
          </Section>
        )}

        {selectedVersionUrl && resolvedBundle && (
          <Section
            title="Resolved Resource"
            right={<a className="text-sm underline" href={selectedVersionUrl} target="_blank" rel="noreferrer">Open on server</a>}
          >
            {loading && <div className="text-sm">Loading…</div>}
            {!loading && (
              <div className="space-y-3">
                <BundleNiceView bundle={resolvedBundle} />
              </div>
            )}
          </Section>
        )}

        <footer className="mt-10 text-xs opacity-60">
          Built for FHIR Connectathons · Auto‑expanded patient details with outstanding ServiceRequests.
        </footer>
      </div>

      {/* Minimal styles if Tailwind isn’t wired up */}
      <style>{`
        .input { border: 1px solid rgba(0,0,0,.15); border-radius: 12px; padding: .5rem .75rem; background: rgba(255,255,255,.8); color: inherit; }
        .btn { border: 1px solid rgba(0,0,0,.15); border-radius: 9999px; padding: .5rem .9rem; }
        @media (prefers-color-scheme: dark) {
          .input { background: rgba(0,0,0,.2); }
          .btn { border-color: rgba(255,255,255,.2); }
        }
      `}</style>
    </div>
  );
}
