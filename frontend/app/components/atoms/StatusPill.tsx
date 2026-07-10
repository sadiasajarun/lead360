import { LeadStatus } from '~/enums/lead.enum';

/**
 * The single source of truth for lead-status colour + label.
 *
 * Dot colours are the design tokens from `design/html/management/leads.page.html`:
 * --info #175CD3 · --warn #B8710A · --success #0E7C5A · --primary #EA5400 · --steel #475467 ·
 * --danger #B42318. Locked deliberately uses steel (not success) so it never reads as Approved.
 * Rejected takes the danger red; Lost goes a shade darker (#7A271A) so the two never blur —
 * Rejected is recoverable (the rep revises and resubmits), Lost is final.
 * The pill chrome stays neutral — colour is carried by the dot alone.
 */
export const STATUS_LABEL: Record<string, string> = {
  [LeadStatus.GENERATED]: 'Generated',
  [LeadStatus.PENDING_APPROVAL]: 'Awaiting Approval',
  [LeadStatus.APPROVED]: 'Approved',
  [LeadStatus.REJECTED]: 'Rejected',
  [LeadStatus.SENT]: 'Sent to Client',
  [LeadStatus.LOCKED]: 'Locked',
  [LeadStatus.LOST]: 'Lost',
};

export const STATUS_DOT: Record<string, string> = {
  [LeadStatus.GENERATED]: 'bg-[#175CD3]',
  [LeadStatus.PENDING_APPROVAL]: 'bg-[#B8710A]',
  [LeadStatus.APPROVED]: 'bg-[#0E7C5A]',
  [LeadStatus.REJECTED]: 'bg-[#B42318]',
  [LeadStatus.SENT]: 'bg-[#EA5400]',
  [LeadStatus.LOCKED]: 'bg-[#475467]',
  [LeadStatus.LOST]: 'bg-[#7A271A]',
};

interface StatusPillProps {
  status: string;
  /** Appended after a middot — used for the loss reason on Lost leads ("Lost · budget"). */
  suffix?: string | null;
  size?: 'sm' | 'md';
  'data-testid'?: string;
}

export default function StatusPill({ status, suffix, size = 'sm', ...rest }: StatusPillProps) {
  const pad = size === 'md' ? 'px-2.5 py-1 text-[13px]' : 'px-2.5 py-1 text-[12px]';
  return (
    <span
      data-testid={rest['data-testid']}
      className={`inline-flex items-center gap-[7px] rounded-md border border-[#E8E6E3] bg-white font-semibold text-[#0F0F0F] ${pad}`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[status] ?? 'bg-[#9A948E]'}`} />
      {STATUS_LABEL[status] ?? status.replace(/_/g, ' ')}
      {suffix ? ` · ${suffix.replace(/_/g, ' ')}` : ''}
    </span>
  );
}
