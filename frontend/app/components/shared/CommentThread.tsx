import { Loader2 } from 'lucide-react';
import type { LeadComment } from '~/types/comment';

/**
 * Read-only rendering of a lead's comment thread — oldest → newest. Shared by the lead
 * detail rail (Sales/PM + Admin post here) and the admin Approvals review panel (read-only;
 * the decision note field is the input there). Decision notes are colour-coded and badged.
 */
interface CommentThreadProps {
  comments: LeadComment[];
  loading?: boolean;
  error?: string;
  /** Optional wrapper test id. */
  testId?: string;
  emptyLabel?: string;
}

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || '—';

const roleLabel = (role?: string): string =>
  role === 'admin' ? 'Admin' : role === 'sales_pm' ? 'Sales / PM' : role ?? '';

// "just now" / "5m ago" / "2h ago" / "3d ago" / "2mo ago" / "1y ago".
function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

export default function CommentThread({
  comments,
  loading,
  error,
  testId,
  emptyLabel = 'No comments yet.',
}: CommentThreadProps) {
  if (loading) {
    return (
      <div data-testid={testId} className="flex items-center gap-2 text-[13px] text-[#6B6660]">
        <Loader2 size={14} className="animate-spin" /> Loading comments…
      </div>
    );
  }
  if (error) {
    return (
      <div data-testid={testId} className="text-[13px] text-[#B42318]">
        {error}
      </div>
    );
  }
  if (comments.length === 0) {
    return (
      <div data-testid={testId} className="rounded-lg border border-dashed border-[#D4D1CC] px-4 py-6 text-center text-[13px] text-[#6B6660]">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div data-testid={testId} className="flex flex-col gap-3">
      {comments.map((c) => {
        const name = c.author?.name ?? 'Unknown';
        const decided = c.decision === 'approved' || c.decision === 'rejected';
        const border =
          c.decision === 'approved'
            ? 'border-l-[3px] border-l-[#0E7C5A] bg-[#0E7C5A]/[0.04]'
            : c.decision === 'rejected'
              ? 'border-l-[3px] border-l-[#B42318] bg-[#B42318]/[0.04]'
              : 'border-l-[3px] border-l-transparent';
        const absolute = new Date(c.createdAt).toLocaleString();
        return (
          <div
            key={c.id}
            data-testid={`comment-${c.id}`}
            className={`rounded-md border border-[#E8E6E3] ${border} bg-white px-3 py-2.5`}
          >
            <div className="flex items-center gap-2">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-[#E8E6E3] bg-[#F4F4F2] text-[10px] font-semibold text-[#6B6660]">
                {initials(name)}
              </span>
              <span className="truncate text-[13px] font-semibold text-[#0F0F0F]">{name}</span>
              {c.author?.role && (
                <span className="inline-flex h-[18px] shrink-0 items-center rounded border border-[#E8E6E3] bg-[#F4F4F2] px-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#6B6660]">
                  {roleLabel(c.author.role)}
                </span>
              )}
              {decided && (
                <span
                  className="inline-flex h-[18px] shrink-0 items-center rounded px-1.5 text-[10px] font-semibold uppercase tracking-wide text-white"
                  style={{ backgroundColor: c.decision === 'approved' ? '#0E7C5A' : '#B42318' }}
                >
                  {c.decision === 'approved' ? 'Approved' : 'Rejected'}
                </span>
              )}
              <span className="ml-auto shrink-0 text-[11px] text-[#9A948E]" title={absolute}>
                {relativeTime(c.createdAt)}
              </span>
            </div>
            <p className="mt-1.5 whitespace-pre-line text-[13px] leading-[1.5] text-[#0F0F0F]">{c.body}</p>
          </div>
        );
      })}
    </div>
  );
}
