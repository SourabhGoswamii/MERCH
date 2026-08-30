"use client";

import { useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type UploadStatus = "pending" | "processing" | "completed" | "failed";

type UploadFile = {
  id: string;
  file: File;
  status: UploadStatus;
  error?: string;
};

const ICONS: Record<string, string> = {
  file: '<path d="M3.5 1.8h6l3 3v9.4h-9z"/><path d="M9.5 1.8v3h3"/>',
  spark: '<path d="M8 1.5 9.6 6.4 14.5 8 9.6 9.6 8 14.5 6.4 9.6 1.5 8 6.4 6.4z" fill="currentColor" stroke="none"/>',
  check: '<path d="M3 8.5l3.2 3L13 4.5"/>',
  x: '<path d="M3.5 3.5l9 9m0-9-9 9"/>',
  warn: '<circle cx="8" cy="8" r="6.3"/><path d="M8 4.8v3.8M8 11.3v.1"/>',
  lock: '<rect x="3" y="7" width="10" height="7" rx="1.5"/><path d="M5 7V5a3 3 0 0 1 6 0v2"/>',
};

export default function UploadPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const [files, setFiles] = useState<UploadFile[]>([]);
  const [uploadError, setUploadError] = useState("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4200);
  }, []);

  function handleFiles(selectedFiles: FileList | null) {
    if (!selectedFiles) return;

    const newFiles: UploadFile[] = Array.from(selectedFiles)
      .filter((file) => file.name.toLowerCase().endsWith(".csv"))
      .map((file) => ({
        id: crypto.randomUUID(),
        file,
        status: "pending",
      }));

    if (newFiles.length === 0) {
      setUploadError("Please select CSV files only.");
      return;
    }

    setUploadError("");
    setFiles((current) => [...current, ...newFiles]);
    showToast(`Added ${newFiles.length} file(s) to queue.`);
  }

  function removeFile(id: string) {
    setFiles((current) => current.filter((file) => file.id !== id));
    showToast("Removed file from queue.");
  }

  async function confirmFile(id: string) {
    const item = files.find((file) => file.id === id);
    if (!item) return;

    setUploadError("");

    setFiles((current) =>
      current.map((file) =>
        file.id === id ? { ...file, status: "processing" } : file
      ),
    );

    try {
      const formData = new FormData();
      formData.append("files", item.file);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Upload failed");
      }

      setFiles((current) =>
        current.map((file) =>
          file.id === id ? { ...file, status: "completed" } : file
        ),
      );
      // The semantic pass is deliberately detached from ingestion. This makes
      // the dashboard usable as soon as the database has the file.
      void fetch(`/api/datasets/${data.dataset.id}/analyze`, { method: "POST" });
      showToast(`${item.file.name} uploaded. AI understanding is in progress.`);
    } catch (error) {
      setFiles((current) =>
        current.map((file) =>
          file.id === id
            ? {
                ...file,
                status: "failed",
                error: error instanceof Error ? error.message : "Upload failed",
              }
            : file
        ),
      );
      showToast(`Failed to analyze ${item.file.name}.`);
    }
  }

  async function confirmPendingFiles() {
    const pendingIds = files.filter((file) => file.status === "pending").map((file) => file.id);
    // A small worker pool provides fast multi-file ingestion without exhausting
    // the Neon/Prisma connection pool.
    const workers = Array.from({ length: Math.min(3, pendingIds.length) }, async () => {
      while (pendingIds.length) {
        const id = pendingIds.shift();
        if (id) await confirmFile(id);
      }
    });
    await Promise.all(workers);
  }

  function goToDashboard() {
    router.push("/dashboard");
  }

  const hasCompletedFiles = files.some((file) => file.status === "completed");
  const completedCount = files.filter((file) => file.status === "completed").length;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        :root{
          --paper:#F5F3ED; --surface:#FBFAF6; --surface-2:#FDFCF8;
          --ink:#1F231D; --ink-2:#4E5349; --ink-3:#8B8F82;
          --line:#E2DED2; --line-2:#D2CDC0;
          --sage:#5F7355; --sage-deep:#33463A; --sage-mid:#8FA07E; --sage-pale:#E9EEDD;
          --clay-deep:#9C5B33;
          --serif:'Fraunces',Georgia,serif; --sans:'Instrument Sans',sans-serif; --mono:'Spline Sans Mono',ui-monospace,monospace;
        }
        *{margin:0;padding:0;box-sizing:border-box}
        body{font:400 16px/1.6 var(--sans);background:var(--paper);color:var(--ink);-webkit-font-smoothing:antialiased;overflow-x:hidden}
        body::after{content:"";position:fixed;inset:0;z-index:200;pointer-events:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.12 0 0 0 0 0.13 0 0 0 0 0.10 0 0 0 0.05 0'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E")}
        ::selection{background:#D8E0C8}
        :focus-visible{outline:2px solid #6B7F5C;outline-offset:2px;border-radius:4px}
        .container{max-width:1040px;margin:0 auto;padding:0 28px}
        h1,h2,h3{font-family:var(--serif);font-weight:500;letter-spacing:-.015em;color:var(--ink)}
        h1 em{font-style:italic;font-weight:500;color:var(--sage-deep)}
        .mono{font-family:var(--mono)}
        svg{display:block}
        button{font-family:var(--sans)}

        .btn{display:inline-flex;align-items:center;gap:10px;font:500 15px/1 var(--sans);border-radius:999px;padding:15px 28px;cursor:pointer;border:1px solid transparent;text-decoration:none;transition:background .25s ease,border-color .25s ease,transform .25s ease,color .25s ease}
        .btn svg{width:15px;height:15px;transition:transform .25s ease}
        .btn-primary{background:var(--sage-deep);color:#F4F2E9}
        .btn-primary:hover{background:#28392E;transform:translateY(-1px)}
        .btn-primary:hover svg{transform:translateX(3px)}
        .btn-ghost{color:var(--sage-deep);border-color:#CFC9B8;background:transparent}
        .btn-ghost:hover{border-color:var(--sage);background:#EFEDE2}
        .btn-small{padding:11px 20px;font-size:14px}
        .icon-btn{width:34px;height:34px;flex:none;border-radius:50%;border:1px solid var(--line);background:transparent;color:var(--ink-2);display:grid;place-items:center;cursor:pointer;transition:background .2s,border-color .2s,color .2s}
        .icon-btn:hover{background:#EFEDE2;border-color:var(--line-2);color:var(--ink)}
        .icon-btn svg{width:13px;height:13px}
        .icon-btn.sm{width:30px;height:30px}

        .kicker{font:500 12px var(--mono);letter-spacing:.18em;text-transform:uppercase;color:#6B7A5E}
        .lede{margin-top:22px;max-width:600px;font-size:17px;line-height:1.68;color:var(--ink-2)}

        .topbar{position:sticky;top:0;z-index:50;background:rgba(245,243,237,.86);backdrop-filter:blur(12px) saturate(1.2);border-bottom:1px solid var(--line)}
        .topbar-inner{max-width:1040px;margin:0 auto;padding:14px 28px;display:flex;align-items:center;gap:30px}
        .brand{display:flex;align-items:center;gap:10px;color:var(--sage-deep);text-decoration:none}
        .brand-mark{width:24px;height:24px}
        .brand-name{font:500 18px var(--serif);letter-spacing:-.01em}
        .brand-ctx{font:400 11px var(--mono);color:var(--ink-3);margin-left:2px;letter-spacing:.08em}
        .topbar-action{margin-left:auto}

        .view{padding-bottom:60px}
        .page-head{display:grid;grid-template-columns:1fr auto;align-items:end;gap:30px;padding:76px 0 46px}
        .page-title{font-size:clamp(2.4rem,4.4vw,3.5rem);line-height:1.06;letter-spacing:-.02em;margin-top:20px}

        .dropzone{border:1.5px dashed #C4BEAA;border-radius:16px;background:var(--surface);padding:56px 24px;text-align:center;cursor:pointer;transition:border-color .25s,background .25s;width:100%}
        .dropzone:hover{border-color:var(--sage-mid);background:#F8F7F2}
        .dz-icon{width:34px;height:34px;margin:0 auto 16px;color:var(--sage);font-size:28px;line-height:1}
        .dz-title{font:500 17px var(--sans);color:var(--ink)}
        .dz-sub{font:500 10.5px var(--mono);letter-spacing:.16em;text-transform:uppercase;color:var(--ink-3);margin:13px 0 17px}

        .queue-panel{margin-top:44px;border:1px solid var(--line);border-radius:18px;background:var(--surface);overflow:hidden;box-shadow:0 1px 2px rgba(31,35,29,.04),0 28px 56px -40px rgba(31,35,29,.22)}
        .panel-bar{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:14px 22px;border-bottom:1px solid var(--line);font:500 11px var(--mono);letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3)}
        .panel-bar span{display:inline-flex;align-items:center;gap:9px}
        .panel-bar svg{width:14px;height:14px;color:var(--sage)}
        .q-list{list-style:none}
        .q-row{border-top:1px solid #EBE7DB;transition:background .2s;padding:18px 22px}
        .q-row:first-child{border-top:none}
        .q-main{display:grid;grid-template-columns:1fr auto;gap:16px;align-items:center}
        .q-file{min-width:0}
        .q-name{display:block;font:500 14px var(--mono);color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .q-meta{display:block;margin-top:3px;font:400 11px var(--mono);color:var(--ink-3)}
        .q-status{display:flex;align-items:center;gap:12px}

        .pill{display:inline-flex;align-items:center;gap:7px;font:500 10.5px var(--mono);letter-spacing:.1em;text-transform:uppercase;border-radius:6px;padding:6px 10px}
        .pill-done{color:#3E4A38;background:var(--sage-pale)}
        .spinner{width:16px;height:16px;flex:none;border-radius:50%;border:1.5px dashed var(--sage);animation:spin 2.2s linear infinite}
        @keyframes spin{to{transform:rotate(360deg)}}

        .err-box{margin-top:20px;border-radius:12px;border:1px solid rgba(156,91,51,.2);background:rgba(156,91,51,.05);padding:12px 16px;font-size:13.5px;color:var(--clay-deep)}
        .dash-card{margin-top:38px;border:1px solid var(--line);border-radius:18px;background:var(--surface);padding:24px 28px;display:flex;align-items:center;justify-content:between;gap:24px;flex-wrap:wrap}

        .privacy-note{margin-top:56px;padding-top:18px;border-top:1px solid var(--line);display:flex;gap:9px;align-items:center;font:400 12px var(--mono);color:var(--ink-3)}
        .privacy-note svg{width:14px;height:14px;color:var(--sage);flex:none}

        .site-foot{border-top:1px solid var(--line);margin-top:80px;padding:26px 0 36px}
        .foot-inner{display:flex;justify-content:space-between;align-items:center;gap:18px;flex-wrap:wrap}
        .foot-right{font:400 11.5px var(--mono);color:var(--ink-3)}

        .toast{position:fixed;bottom:28px;left:50%;transform:translate(-50%,16px);z-index:300;background:#242B22;color:#F1EFE5;border-radius:999px;padding:13px 22px;display:flex;align-items:center;gap:10px;font-size:14px;box-shadow:0 18px 40px -14px rgba(20,24,18,.55);opacity:0;visibility:hidden;transition:opacity .35s ease,transform .35s ease,visibility .35s;max-width:min(92vw,560px)}
        .toast.show{opacity:1;visibility:visible;transform:translate(-50%,0)}
        .toast svg{width:15px;height:15px;color:#B9C7A6;flex:none}
      `}} />

      <header className="topbar">
        <div className="topbar-inner">
          <Link className="brand" href="/" aria-label="MerchMind home">
            <svg className="brand-mark" viewBox="0 0 26 26" aria-hidden="true">
              <circle cx="13" cy="13" r="11.2" fill="none" stroke="currentColor" strokeWidth="1.4" opacity=".5"/>
              <path d="M13 6.6 7.4 16.2M13 6.6l5.6 9.6M7.4 16.2h11.2" stroke="currentColor" strokeWidth="1.1" fill="none" opacity=".8"/>
              <circle cx="13" cy="6.6" r="2.1" fill="currentColor"/><circle cx="7.4" cy="16.2" r="2.1" fill="currentColor"/><circle cx="18.6" cy="16.2" r="2.1" fill="currentColor"/>
            </svg>
            <span className="brand-name">MerchMind</span>
            <span className="brand-ctx">/ upload</span>
          </Link>
          {hasCompletedFiles && (
            <button className="btn btn-ghost btn-small topbar-action" onClick={goToDashboard}>
              Open Dashboard →
            </button>
          )}
        </div>
      </header>

      <main className="view">
        <div className="container">
          <div className="page-head">
            <div>
              <p className="kicker">Workspace · step 01 of 03</p>
              <h1 className="page-title">Upload your <em>business data</em></h1>
              <p className="lede">
                Add your CSV files. Confirm each file when you&apos;re ready and MerchMind will start understanding your data in the background.
              </p>
            </div>
            {hasCompletedFiles && (
              <button className="btn btn-ghost" onClick={goToDashboard}>
                Open Dashboard →
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files) handleFiles(e.dataTransfer.files);
            }}
            className="dropzone"
          >
            <div className="dz-icon">+</div>
            <p className="dz-title">Add CSV files</p>
            <p className="dz-sub">You can upload multiple files</p>
            <span className="btn btn-primary btn-small">Browse files</span>
          </button>

          <input
            ref={inputRef}
            type="file"
            accept=".csv"
            multiple
            className="hidden"
            style={{ display: "none" }}
            onChange={(event) => {
              handleFiles(event.target.files);
              event.target.value = "";
            }}
          />

          {uploadError && (
            <div className="err-box">
              {uploadError}
            </div>
          )}

          {files.length > 0 && (
            <div className="queue-panel">
              <div className="panel-bar">
                <span>
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" aria-hidden="true"><path d="M1.8 3.6h4.4l1.4 1.9h6.6v7H1.8z"/></svg>
                  Upload Queue
                </span>
                <span>{files.length} file{files.length === 1 ? "" : "s"} · {completedCount} uploaded</span>
              </div>
              {files.some((file) => file.status === "pending") && files.filter((file) => file.status === "pending").length > 1 && (
                <div className="flex justify-end border-b border-[var(--line)] px-5 py-3">
                  <button type="button" onClick={confirmPendingFiles} className="btn btn-ghost btn-small">
                    Upload all files
                  </button>
                </div>
              )}
              <ul className="q-list">
                {files.map((item) => (
                  <li key={item.id} className="q-row">
                    <div className="q-main">
                      <div className="q-file">
                        <span className="q-name">{item.file.name}</span>
                        <span className="q-meta">{(item.file.size / 1024).toFixed(1)} KB</span>
                      </div>

                      <div className="q-status">
                        {item.status === "pending" && (
                          <>
                            <span className="text-sm opacity-60">Ready to analyze</span>
                            <button
                              type="button"
                              onClick={() => confirmFile(item.id)}
                              className="btn btn-primary btn-small"
                            >
                              Confirm &amp; Analyze
                            </button>
                            <button
                              type="button"
                              onClick={() => removeFile(item.id)}
                              className="icon-btn sm"
                              aria-label="Remove file"
                            >
                              <span dangerouslySetInnerHTML={{ __html: ICONS.x }} />
                            </button>
                          </>
                        )}

                        {item.status === "processing" && (
                          <div className="flex items-center gap-2">
                            <div className="spinner" />
                            <span className="text-sm opacity-60">Analyzing...</span>
                          </div>
                        )}

                        {item.status === "completed" && (
                          <div className="flex items-center gap-2">
                            <span className="pill pill-done">
                              <span dangerouslySetInnerHTML={{ __html: ICONS.check }} /> Uploaded
                            </span>
                            <span className="text-sm opacity-40">AI analyzing in background</span>
                          </div>
                        )}

                        {item.status === "failed" && (
                          <>
                            <span className="text-sm text-red-600">Analysis failed</span>
                            <button
                              type="button"
                              onClick={() => confirmFile(item.id)}
                              className="btn btn-ghost btn-small"
                            >
                              Retry
                            </button>
                            <button
                              type="button"
                              onClick={() => removeFile(item.id)}
                              className="icon-btn sm"
                              aria-label="Remove file"
                            >
                              <span dangerouslySetInnerHTML={{ __html: ICONS.x }} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {item.status === "processing" && (
                      <div className="mt-4 rounded-xl bg-black/[0.03] px-4 py-3">
                        <p className="text-sm">We&apos;re getting this file ready for you.</p>
                        <p className="mt-1 text-xs opacity-50">Your data is being saved and MerchMind is understanding the dataset in the background.</p>
                      </div>
                    )}

                    {item.status === "failed" && item.error && (
                      <div className="mt-3 text-xs text-red-600">
                        {item.error}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          
            <div className="dash-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p className="font-medium" style={{ fontFamily: 'var(--serif)', fontSize: '18px' }}>Your data is uploaded</p>
                <p className="mt-1 text-sm opacity-50">MerchMind can continue preparing your data in the background.</p>
              </div>
              <button
                type="button"
                onClick={goToDashboard}
                className="btn btn-primary"
              >
                Go to Dashboard →
              </button>
            </div>
            <div className="mt-8 text-center text-sm opacity-40 mono">
              No files added yet.
            </div>

          <p className="privacy-note">
            <span dangerouslySetInnerHTML={{ __html: ICONS.lock }} /> Analysis runs entirely in your browser.
          </p>
        </div>
      </main>

      <footer className="site-foot">
        <div className="container foot-inner">
          <div className="brand" style={{ color: 'var(--sage-deep)' }}>
            <span className="brand-name">MerchMind</span>
          </div>
          <p className="foot-right">© {new Date().getFullYear()} MerchMind — AI merchant intelligence</p>
        </div>
      </footer>

      <div className={`toast ${toastMessage ? "show" : ""}`} role="status" aria-live="polite">
        <span dangerouslySetInnerHTML={{ __html: ICONS.spark }} />
        <span>{toastMessage}</span>
      </div>
    </>
  );
}
