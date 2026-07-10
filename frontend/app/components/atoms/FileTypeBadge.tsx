/** Colored file-type tile (file-manager style): the extension IS the icon — instantly
 *  recognizable without a separate written file-type column. */
const TYPE_STYLE: Record<string, { label: string; cls: string }> = {
  pdf: { label: 'PDF', cls: 'bg-[#D92D20]/[0.09] text-[#D92D20] border-[#D92D20]/25' },
  doc: { label: 'DOC', cls: 'bg-[#175CD3]/[0.09] text-[#175CD3] border-[#175CD3]/25' },
  docx: { label: 'DOC', cls: 'bg-[#175CD3]/[0.09] text-[#175CD3] border-[#175CD3]/25' },
  xls: { label: 'XLS', cls: 'bg-[#0E7C5A]/[0.09] text-[#0E7C5A] border-[#0E7C5A]/25' },
  xlsx: { label: 'XLS', cls: 'bg-[#0E7C5A]/[0.09] text-[#0E7C5A] border-[#0E7C5A]/25' },
  ppt: { label: 'PPT', cls: 'bg-[#EA5400]/[0.10] text-[#EA5400] border-[#EA5400]/25' },
  pptx: { label: 'PPT', cls: 'bg-[#EA5400]/[0.10] text-[#EA5400] border-[#EA5400]/25' },
  txt: { label: 'TXT', cls: 'bg-[#6B6660]/[0.08] text-[#6B6660] border-[#6B6660]/25' },
  md: { label: 'MD', cls: 'bg-[#6B6660]/[0.08] text-[#6B6660] border-[#6B6660]/25' },
};

interface FileTypeBadgeProps {
  /** File extension, e.g. "pdf", "docx" (case-insensitive). */
  fileType: string;
}

export default function FileTypeBadge({ fileType }: FileTypeBadgeProps) {
  const t = TYPE_STYLE[fileType.toLowerCase()] ?? {
    label: fileType.slice(0, 4).toUpperCase() || 'FILE',
    cls: 'bg-[#F4F4F2] text-[#6B6660] border-[#E8E6E3]',
  };
  return (
    <span
      title={fileType.toUpperCase()}
      className={`grid h-[30px] w-[38px] shrink-0 select-none place-items-center rounded-md border text-[10px] font-bold tracking-wide ${t.cls}`}
    >
      {t.label}
    </span>
  );
}
