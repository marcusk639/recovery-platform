interface SectionProps {
  children: React.ReactNode;
  className?: string;
  id?: string;
}

export function Section({ children, className = "", id }: SectionProps) {
  return (
    <section id={id} className={`py-16 px-4 ${className}`}>
      <div className="mx-auto max-w-5xl">{children}</div>
    </section>
  );
}
