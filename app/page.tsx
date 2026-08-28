"use client";

import { useState } from "react";

export default function Home() {
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);

  function handleFiles(selectedFiles: FileList | null) {
    if (!selectedFiles) return;

    const csvFiles = Array.from(selectedFiles).filter(
      (file) => file.name.toLowerCase().endsWith(".csv")
    );

    setFiles((prev) => [...prev, ...csvFiles]);
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function uploadFiles() {
    if (files.length === 0) return;

    setLoading(true);

    const formData = new FormData();

    files.forEach((file) => {
      formData.append("files", file);
    });

    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      console.log(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "60px 24px",
        display: "flex",
        justifyContent: "center",
      }}
    >
      <div style={{ width: "100%", maxWidth: 700 }}>
        <h1>Merchant Data</h1>

        <p style={{ color: "#666", marginBottom: 30 }}>
          Upload your business CSV files to get started.
        </p>

        <label
          style={{
            display: "block",
            border: "2px dashed #ccc",
            borderRadius: 12,
            padding: 50,
            textAlign: "center",
            cursor: "pointer",
          }}
        >
          <div style={{ fontSize: 40, marginBottom: 10 }}>+</div>

          <div style={{ fontWeight: 600 }}>
            Upload CSV files
          </div>

          <div style={{ color: "#777", marginTop: 8 }}>
            You can upload multiple files
          </div>

          <input
            type="file"
            accept=".csv"
            multiple
            hidden
            onChange={(e) => handleFiles(e.target.files)}
          />
        </label>

        {files.length > 0 && (
          <div style={{ marginTop: 30 }}>
            <h3>Uploaded Files</h3>

            {files.map((file, index) => (
              <div
                key={`${file.name}-${index}`}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "14px 16px",
                  border: "1px solid #ddd",
                  borderRadius: 8,
                  marginTop: 10,
                }}
              >
                <div>
                  <div style={{ fontWeight: 500 }}>{file.name}</div>

                  <div style={{ color: "#777", fontSize: 13 }}>
                    {(file.size / 1024).toFixed(1)} KB
                  </div>
                </div>

                <button onClick={() => removeFile(index)}>
                  Remove
                </button>
              </div>
            ))}

            <button
              onClick={uploadFiles}
              disabled={loading}
              style={{
                width: "100%",
                marginTop: 20,
                padding: "14px",
                borderRadius: 8,
                border: "none",
                cursor: loading ? "default" : "pointer",
                fontWeight: 600,
              }}
            >
              {loading ? "Analyzing..." : "Analyze Data"}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}