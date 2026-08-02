"use client";

import { useRef, useState } from "react";

interface UploadResult {
  sessionId: string;
  fileName: string;
  charCount: number;
  preview: string;
}

interface PdfUploaderProps {
  onUploaded: (result: UploadResult) => void;
  disabled?: boolean;
}

export function PdfUploader({ onUploaded, disabled }: PdfUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setLoading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      onUploaded(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div
        className={`rounded-2xl border-2 border-dashed p-6 text-center transition ${
          dragging
            ? "border-teal-500 bg-teal-50"
            : "border-stone-300 bg-stone-50 hover:border-teal-400"
        } ${disabled ? "opacity-60 pointer-events-none" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) void handleFile(file);
        }}
      >
        <p className="text-sm font-medium text-stone-800">Upload a PDF lesson</p>
        <p className="mt-1 text-xs text-stone-500">
          Drag & drop or choose a file (text-based PDF, max 12MB)
        </p>
        <button
          type="button"
          className="mt-4 rounded-full bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50"
          disabled={loading || disabled}
          onClick={() => inputRef.current?.click()}
        >
          {loading ? "Parsing…" : "Choose PDF"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
      </div>
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
