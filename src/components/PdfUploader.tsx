"use client";

import { useState, useTransition, type FormEvent } from "react";

import type { UploadSuccessPayload } from "@/lib/pdf/upload-schemas";

type UploadState =
  | { kind: "idle" }
  | { kind: "success"; data: UploadSuccessPayload }
  | { kind: "error"; message: string };

export function PdfUploader() {
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<UploadState>({ kind: "idle" });
  const [isPending, startTransition] = useTransition();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setState({ kind: "error", message: "Choose a PDF file first." });
      return;
    }

    const formData = new FormData();
    formData.set("file", file);

    startTransition(async () => {
      setState({ kind: "idle" });
      try {
        const response = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });
        const json: unknown = await response.json();

        if (!response.ok) {
          const message =
            typeof json === "object" &&
            json !== null &&
            "error" in json &&
            typeof (json as { error: unknown }).error === "string"
              ? (json as { error: string }).error
              : typeof json === "object" &&
                  json !== null &&
                  "errorMessage" in json &&
                  typeof (json as { errorMessage: unknown }).errorMessage ===
                    "string" &&
                  (json as { errorMessage: string }).errorMessage
                ? (json as { errorMessage: string }).errorMessage
                : "Upload failed.";

          // FAILED lessons still return structured payload with lessonId.
          if (
            typeof json === "object" &&
            json !== null &&
            "ok" in json &&
            (json as { ok: unknown }).ok === true &&
            "lessonId" in json
          ) {
            setState({
              kind: "success",
              data: json as UploadSuccessPayload,
            });
            return;
          }

          setState({ kind: "error", message });
          return;
        }

        setState({
          kind: "success",
          data: json as UploadSuccessPayload,
        });
      } catch (error) {
        setState({
          kind: "error",
          message:
            error instanceof Error ? error.message : "Network error during upload.",
        });
      }
    });
  }

  return (
    <section className="flex w-full flex-col gap-4">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-2 text-sm text-stone-700">
          <span className="font-medium">Upload a PDF</span>
          <input
            type="file"
            accept="application/pdf,.pdf"
            disabled={isPending}
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setState({ kind: "idle" });
            }}
            className="block w-full text-sm text-stone-600 file:mr-4 file:rounded-md file:border-0 file:bg-teal-800 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-teal-700"
          />
        </label>
        <button
          type="submit"
          disabled={isPending || !file}
          className="w-fit rounded-md bg-teal-800 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 hover:bg-teal-700"
        >
          {isPending ? "Uploading…" : "Upload & parse"}
        </button>
      </form>

      {state.kind === "error" ? (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {state.message}
        </p>
      ) : null}

      {state.kind === "success" ? (
        <div
          className={
            state.data.status === "PARSED"
              ? "rounded-md border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-stone-800"
              : "rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-stone-800"
          }
        >
          <p className="font-medium">
            {state.data.status === "PARSED"
              ? "PDF parsed successfully"
              : "Upload saved but parsing failed"}
          </p>
          <dl className="mt-2 grid gap-1 text-stone-700">
            <div>
              <dt className="inline text-stone-500">Lesson ID: </dt>
              <dd className="inline font-mono text-xs">{state.data.lessonId}</dd>
            </div>
            <div>
              <dt className="inline text-stone-500">Status: </dt>
              <dd className="inline font-medium">{state.data.status}</dd>
            </div>
            <div>
              <dt className="inline text-stone-500">File: </dt>
              <dd className="inline">{state.data.originalName}</dd>
            </div>
            <div>
              <dt className="inline text-stone-500">Pages: </dt>
              <dd className="inline">{state.data.pageCount ?? "—"}</dd>
            </div>
            <div>
              <dt className="inline text-stone-500">Text length: </dt>
              <dd className="inline">{state.data.textLength}</dd>
            </div>
          </dl>
          {state.data.textPreview ? (
            <p className="mt-2 text-stone-600">
              <span className="text-stone-500">Preview: </span>
              {state.data.textPreview}
            </p>
          ) : null}
          {state.data.errorMessage ? (
            <p className="mt-2 text-amber-900">{state.data.errorMessage}</p>
          ) : null}
          {state.data.status === "PARSED" ? (
            <p className="mt-3">
              <a
                href={`/lessons/${state.data.lessonId}`}
                className="font-medium text-teal-800 underline-offset-4 hover:underline"
              >
                Continue to lesson plan →
              </a>
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
