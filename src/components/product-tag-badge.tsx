type ProductTagBadgeProps = {
  label: string;
};

export function ProductTagBadge({ label }: ProductTagBadgeProps) {
  return (
    <span
      className="absolute left-2 top-2 z-10 max-w-[calc(100%-1rem)] truncate rounded-full bg-white px-2 py-0.5 text-xs font-medium text-black shadow-sm"
    >
      {label}
    </span>
  );
}
