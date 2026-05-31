type BadgeColor = "teal" | "amber" | "slate";

interface BadgeProps {
  children: React.ReactNode;
  color?: BadgeColor;
}

const colorClasses: Record<BadgeColor, string> = {
  teal: "bg-teal-100 text-teal-800",
  amber: "bg-amber-100 text-amber-800",
  slate: "bg-slate-100 text-slate-700",
};

export function Badge({ children, color = "teal" }: BadgeProps) {
  return (
    <span
      className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${colorClasses[color]}`}
    >
      {children}
    </span>
  );
}
