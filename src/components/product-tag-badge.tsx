type ProductTagBadgeProps = {
  label: string;
  color: string | null;
};

export function ProductTagBadge({ label, color }: ProductTagBadgeProps) {
  return (
    <span
      className="absolute bottom-2 left-2 z-10 max-w-[calc(100%-1rem)] truncate rounded-full bg-white/90 px-2 py-0.5 text-xs font-medium text-foreground shadow-sm backdrop-blur-sm"
      style={color ? { color, backgroundColor: `${color}1a` } : undefined}
    >
      {label}
    </span>
  );
}
