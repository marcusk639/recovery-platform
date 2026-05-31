interface CardProps {
  children: React.ReactNode;
  className?: string;
  id?: string;
}

export function Card({ children, className = "", id }: CardProps) {
  return (
    <div
      id={id}
      className={`rounded-xl border border-slate-200 bg-white p-6 shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}
