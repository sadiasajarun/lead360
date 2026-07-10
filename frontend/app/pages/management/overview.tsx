import { useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '~/redux/store/hooks';
import { fetchOverview } from '~/services/httpServices/analyticsService';
import { formatMoneyWhole } from '~/enums/currency.enum';
import type { FunnelRow } from '~/types/analytics';

// Stage → dot/bar colour (mirrors design/html/management/overview.page.html).
const STAGE_COLOR: Record<string, string> = {
  generated: '#1D4ED8',
  pending_approval: '#B54708',
  approved: '#0E7C5A',
  sent: '#EA5400',
  locked: '#0E7C5A',
};
const STAGE_LABEL: Record<string, string> = {
  generated: 'Generated',
  pending_approval: 'Pending Approval',
  approved: 'Approved',
  sent: 'Sent',
  locked: 'Locked',
};

const RANGES = ['This month', 'Last month', 'Last 3 months', 'Last 6 months', 'Last year'];

// Org-wide analytics are reported in USD. Whole units — these are headline KPI figures, not
// reconciling budget rows.
const money = (cents: number) => formatMoneyWhole(cents, 'USD');

/** One KPI card. `value` is null when the backend can't compute it yet — we show an em-dash + caption
 *  rather than an invented number (RULE-F6). */
function Kpi({
  testId,
  label,
  value,
  unit,
}: {
  testId: string;
  label: string;
  value: string | null;
  unit?: string;
}) {
  return (
    <div data-testid={testId} className="rounded-xl border border-[#E8E6E3] bg-white p-6">
      <div className="mb-2.5 border-b border-[#E8E6E3] pb-3 text-[12px] font-semibold uppercase tracking-[0.06em] text-[#9A948E]">
        {label}
      </div>
      {value === null ? (
        <>
          <div className="text-[32px] font-semibold leading-none text-[#9A948E]">—</div>
          <div className="mt-2 text-[12px] text-[#9A948E]">Not enough data yet</div>
        </>
      ) : (
        <div className="text-[32px] font-semibold leading-none">
          {value}
          {unit && <span className="ml-1 text-[16px] font-medium text-[#6B6660]">{unit}</span>}
        </div>
      )}
    </div>
  );
}

function FunnelRowView({ row, isFirst }: { row: FunnelRow; isFirst: boolean }) {
  const color = STAGE_COLOR[row.status] ?? '#6B6660';
  // Min 2% so a 0-count stage still draws a visible track segment.
  const width = Math.max(row.pct, row.count > 0 ? 4 : 2);
  return (
    <div data-testid={`overview-funnel-${row.status}`} className="flex items-center gap-3.5">
      <div className="flex w-[150px] flex-none items-center gap-2 text-[13px] font-medium">
        <span className="h-[7px] w-[7px] flex-none rounded-full" style={{ background: color }} />
        {STAGE_LABEL[row.status] ?? row.status}
      </div>
      <div className="relative h-[34px] flex-1 overflow-hidden rounded-[5px] bg-[#F4F4F2]">
        <div
          className="flex h-full items-center rounded-[5px] px-3 text-[13px] font-semibold text-white"
          style={{ width: `${width}%`, background: color }}
        >
          {row.pct >= 12 && row.count > 0 ? row.count : ''}
        </div>
      </div>
      <div className="w-[120px] flex-none text-right text-[13px] text-[#6B6660]">
        {isFirst ? (
          <>
            <b className="font-semibold text-[#0F0F0F]">{row.count}</b> leads
          </>
        ) : (
          <>
            <b className="font-semibold text-[#0F0F0F]">{row.count}</b> · {row.pct}%
          </>
        )}
      </div>
    </div>
  );
}

export default function Overview() {
  const dispatch = useAppDispatch();
  const { data, status, error } = useAppSelector((s) => s.analytics);

  useEffect(() => {
    dispatch(fetchOverview());
  }, [dispatch]);

  const k = data?.kpis;
  const maxLoss = data ? Math.max(1, ...data.lossReasons.map((l) => l.count)) : 1;

  return (
    <div data-testid="overview-page">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.01em]">Overview</h1>
          <p className="mt-1 text-[14px] text-[#6B6660]">Organisation-wide pipeline analytics.</p>
        </div>
        {/* Backend has no date filtering yet — render the control but disable it (never fake a filter). */}
        <div className="relative" title="Date filtering isn't implemented yet.">
          <select
            data-testid="overview-range"
            disabled
            defaultValue={RANGES[0]}
            aria-label="Date range (not available yet)"
            className="h-9 cursor-not-allowed appearance-none rounded-md border border-[#D4D1CC] bg-white py-0 pl-3 pr-9 text-[13px] font-medium text-[#9A948E] opacity-60"
          >
            {RANGES.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
          <ChevronDown size={16} className="pointer-events-none absolute right-2.5 top-2.5 text-[#9A948E]" />
        </div>
      </div>

      {status === 'loading' && (
        <div data-testid="overview-loading" className="animate-pulse">
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-[118px] rounded-xl border border-[#E8E6E3] bg-white" />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.35fr_1fr]">
            <div className="h-[320px] rounded-xl border border-[#E8E6E3] bg-white" />
            <div className="h-[320px] rounded-xl border border-[#E8E6E3] bg-white" />
          </div>
        </div>
      )}

      {status === 'failed' && (
        <div data-testid="overview-error" className="rounded-lg border border-[#E8E6E3] bg-white p-8 text-center text-sm text-[#B42318]">
          {error ?? 'Failed to load analytics.'}
        </div>
      )}

      {status === 'succeeded' && data && k && (
        <>
          {/* KPIs */}
          <section aria-label="Key metrics" className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi
              testId="overview-kpi-conversion"
              label="Conversion Rate"
              value={`${(k.conversionRate * 100).toFixed(1)}%`}
            />
            <Kpi
              testId="overview-kpi-cycle"
              label="Avg Cycle Time"
              value={k.avgCycleDays === null ? null : k.avgCycleDays.toFixed(1)}
              unit="days"
            />
            <Kpi
              testId="overview-kpi-turnaround"
              label="Approval Turnaround"
              value={k.approvalTurnaroundHours === null ? null : k.approvalTurnaroundHours.toFixed(1)}
              unit="hrs"
            />
            <Kpi testId="overview-kpi-revenue" label="Revenue at Stake" value={money(k.revenueAtStakeCents)} />
          </section>

          {/* Funnel + Loss reasons */}
          <section className="grid grid-cols-1 gap-4 lg:grid-cols-[1.35fr_1fr]">
            {/* Pipeline by stage */}
            <div className="rounded-xl border border-[#E8E6E3] bg-white">
              <div className="flex items-center justify-between border-b border-[#E8E6E3] px-5 py-[18px]">
                <span className="text-[15px] font-semibold">Pipeline by stage</span>
                <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-[#9A948E]">
                  Leads currently in each stage
                </span>
              </div>
              <div className="p-5">
                <div data-testid="overview-funnel" className="flex flex-col gap-2.5">
                  {data.funnel.map((f, i) => (
                    <FunnelRowView key={f.status} row={f} isFirst={i === 0} />
                  ))}
                  {/* Lost side-branch ("leaked") */}
                  <div
                    data-testid="overview-funnel-lost"
                    className="ml-[164px] mt-1.5 flex items-center gap-3 border-t border-dashed border-[#D4D1CC] pt-3"
                  >
                    <span className="text-[12px] font-medium text-[#B42318]">↳ Lost</span>
                    <div className="h-[26px] flex-1 overflow-hidden rounded-[5px] bg-[#F4F4F2]">
                      <div
                        className="flex h-full items-center rounded-[5px] px-3 text-[12px] font-semibold text-[#7A1D14]"
                        style={{ width: `${Math.max(data.lost.pct, data.lost.count > 0 ? 4 : 2)}%`, background: '#E4A6A0' }}
                      >
                        {data.lost.pct >= 12 && data.lost.count > 0 ? data.lost.count : ''}
                      </div>
                    </div>
                    <div className="w-[120px] flex-none text-right text-[13px] text-[#6B6660]">
                      <b className="font-semibold text-[#0F0F0F]">{data.lost.count}</b> leaked
                    </div>
                  </div>
                  {/* Rejected side-branch — leads bounced back to the rep for revision. Not a funnel
                      stage (they re-enter as Generated), so it renders off-funnel like Lost. */}
                  {data.rejected && (
                    <div
                      data-testid="overview-funnel-rejected"
                      className="ml-[164px] mt-1.5 flex items-center gap-3 border-t border-dashed border-[#D4D1CC] pt-3"
                    >
                      <span className="text-[12px] font-medium text-[#B42318]">↳ Rejected</span>
                      <div className="h-[26px] flex-1 overflow-hidden rounded-[5px] bg-[#F4F4F2]">
                        <div
                          className="flex h-full items-center rounded-[5px] px-3 text-[12px] font-semibold text-white"
                          style={{ width: `${Math.max(data.rejected.pct, data.rejected.count > 0 ? 4 : 2)}%`, background: '#B42318' }}
                        >
                          {data.rejected.pct >= 12 && data.rejected.count > 0 ? data.rejected.count : ''}
                        </div>
                      </div>
                      <div className="w-[120px] flex-none text-right text-[13px] text-[#6B6660]">
                        <b className="font-semibold text-[#0F0F0F]">{data.rejected.count}</b> returned
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Loss reasons */}
            <div className="rounded-xl border border-[#E8E6E3] bg-white">
              <div className="flex items-center justify-between border-b border-[#E8E6E3] px-5 py-[18px]">
                <span className="text-[15px] font-semibold">Loss reasons</span>
              </div>
              <div className="p-5">
                {data.lossReasons.length === 0 ? (
                  <div data-testid="overview-loss-empty" className="py-8 text-center text-[13px] text-[#6B6660]">
                    No losses recorded.
                  </div>
                ) : (
                  data.lossReasons.map((l) => (
                    <div
                      key={l.reason}
                      data-testid={`overview-loss-${l.reason}`}
                      className="flex items-center gap-3 border-b border-[#E8E6E3] py-2.5 last:border-b-0"
                    >
                      <span className="w-[130px] flex-none text-[13px] capitalize text-[#0F0F0F]">{l.reason}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#F4F4F2]">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${Math.round((l.count / maxLoss) * 100)}%`, background: '#C0392B' }}
                        />
                      </div>
                      <span className="w-[70px] flex-none text-right text-[13px] font-semibold tabular-nums">{l.count}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
