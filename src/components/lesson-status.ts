/** Presentation helpers shared by the sidebar and the duplicate-upload card. */

const STATUS_META: Record<string, { label: string; className: string }> = {
  UPLOADED: { label: "Uploaded", className: "bg-stone-100 text-stone-700" },
  PARSED: { label: "Parsed", className: "bg-sky-100 text-sky-900" },
  PLAN_PENDING_APPROVAL: {
    label: "Plan pending",
    className: "bg-amber-100 text-amber-900",
  },
  PLAN_APPROVED: { label: "Approved", className: "bg-indigo-100 text-indigo-900" },
  QUIZ_READY: { label: "Quiz ready", className: "bg-teal-100 text-teal-900" },
  IN_PROGRESS: { label: "In progress", className: "bg-teal-100 text-teal-900" },
  COMPLETED: { label: "Completed", className: "bg-emerald-100 text-emerald-900" },
  FAILED: { label: "Failed", className: "bg-red-100 text-red-900" },
};

export function statusMeta(status: string) {
  return (
    STATUS_META[status] ?? {
      label: status,
      className: "bg-stone-100 text-stone-700",
    }
  );
}

export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) {
    return "";
  }
  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

/**
 * Before a plan exists a lesson's title is derived from the filename, so
 * printing both would be redundant.
 */
export function shouldShowFileName(
  originalName: string | null,
  title: string,
): boolean {
  return (
    originalName !== null && originalName.replace(/\.pdf$/i, "") !== title
  );
}
