// Riseup Labs brand mark: the orange gradient "L" tile + optional "RISEUP LABS" wordmark.
// Matches the proposal hero so every branded surface (proposal, pitch deck, brief) reads as one system.
export function RiseupMark({ size = 'md', wordmark = true, className = '' }: { size?: 'sm' | 'md' | 'lg'; wordmark?: boolean; className?: string }) {
  const tile = size === 'lg' ? 'h-9 w-9 text-[16px] rounded-[10px]' : size === 'sm' ? 'h-5 w-5 text-[10px] rounded-md' : 'h-7 w-7 text-[13px] rounded-lg';
  const word = size === 'lg' ? 'text-[16px]' : size === 'sm' ? 'text-[11px]' : 'text-[13px]';
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span className={`grid place-items-center font-bold text-white ${tile}`} style={{ background: 'linear-gradient(120deg,#EA5400,#FF8A3D)' }}>L</span>
      {wordmark && <span className={`font-extrabold tracking-wide text-white ${word}`}>RISEUP&nbsp;LABS</span>}
    </span>
  );
}
