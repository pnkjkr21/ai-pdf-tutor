"use client";

import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";

import { relativeTime, statusMeta } from "@/components/lesson-status";
import {
  uploadDuplicateSchema,
  type UploadDuplicatePayload,
  type UploadSuccessPayload,
} from "@/lib/pdf/upload-schemas";

type UploadState =
  | { kind: "idle" }
  | { kind: "success"; data: UploadSuccessPayload }
  | { kind: "duplicate"; data: UploadDuplicatePayload }
  | { kind: "error"; message: string };

export function PdfUploader() {
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<UploadState>({ kind: "idle" });
  const [isPending, startTransition] = useTransition();

  /**
   * Shared by the form and the "upload anyway" override so both take one path.
   * The override re-sends the File already held in state — a File stays a live
   * handle for the page's lifetime, so the user never has to re-pick it.
   */
  function runUpload(target: File, allowDuplicate: boolean) {
    const formData = new FormData();
    formData.set("file", target);
    if (allowDuplicate) {
      formData.set("allowDuplicate", "true");
    }

    startTransition(async () => {
      setState({ kind: "idle" });
      try {
        const response = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });
        const json: unknown = await response.json();

        if (!response.ok) {
          if (response.status === 409) {
            const parsed = uploadDuplicateSchema.safeParse(json);
            if (parsed.success) {
              setState({ kind: "duplicate", data: parsed.data });
              return;
            }
          }

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
        // A File handle goes stale if the file is moved or edited on disk
        // between the first request and the override retry.
        const message =
          error instanceof DOMException && error.name === "NotReadableError"
            ? "The file changed on disk — please choose it again."
            : error instanceof Error
              ? error.message
              : "Network error during upload.";
        setState({ kind: "error", message });
      }
    });
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setState({ kind: "error", message: "Choose a PDF file first." });
      return;
    }
    runUpload(file, false);
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

      {state.kind === "duplicate" ? (
        <DuplicateCard
          duplicate={state.data.duplicate}
          pickedFileName={file?.name ?? null}
          isPending={isPending}
          onUploadAnyway={() => file && runUpload(file, true)}
        />
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
              <Link
                href={`/lessons/${state.data.lessonId}`}
                className="font-medium text-teal-800 underline-offset-4 hover:underline"
              >
                Continue to lesson plan →
              </Link>
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function DuplicateCard({
  duplicate,
  pickedFileName,
  isPending,
  onUploadAnyway,
}: {
  duplicate: UploadDuplicatePayload["duplicate"];
  pickedFileName: string | null;
  isPending: boolean;
  onUploadAnyway: () => void;
}) {
  const meta = statusMeta(duplicate.status);
  // Same bytes under a different filename is worth pointing out.
  const renamed =
    duplicate.originalName !== null &&
    pickedFileName !== null &&
    duplicate.originalName !== pickedFileName;

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-stone-800">
      <p className="font-medium">You&rsquo;ve already uploaded this PDF</p>
      <p className="mt-1 text-stone-600">
        These bytes match a lesson you already have, so nothing new was created.
      </p>

      <div className="mt-3 rounded-md border border-stone-200 bg-white px-3 py-2">
        <p className="font-medium text-stone-900">{duplicate.title}</p>
        {renamed ? (
          <p className="text-xs text-stone-500">
            originally uploaded as {duplicate.originalName}
          </p>
        ) : null}
        <p className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.className}`}
          >
            {meta.label}
          </span>
          {duplicate.questionCount > 0 ? (
            <span className="text-[11px] text-stone-500">
              {duplicate.questionsCompleted}/{duplicate.questionCount} questions
              answered
            </span>
          ) : null}
          <span className="text-[11px] text-stone-400">
            uploaded {relativeTime(duplicate.createdAt)}
          </span>
        </p>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Link
          href={`/lessons/${duplicate.lessonId}`}
          className="rounded-md bg-teal-800 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
        >
          Open existing lesson
        </Link>
        <button
          type="button"
          disabled={isPending}
          onClick={onUploadAnyway}
          className="rounded-md border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-800 disabled:opacity-50 hover:bg-stone-50"
        >
          {isPending ? "Uploading…" : "Upload a fresh copy anyway"}
        </button>
      </div>
      <p className="mt-2 text-xs text-stone-500">
        A fresh copy becomes a second, independent lesson with its own progress.
      </p>
    </div>
  );
}
