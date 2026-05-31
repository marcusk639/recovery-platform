import Link from "next/link";

type Variant = "primary" | "secondary" | "ghost";

interface ButtonProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  variant?: Variant;
  href: string;
}

const variantClasses: Record<Variant, string> = {
  primary: "bg-teal-700 text-white hover:bg-teal-800 focus:ring-teal-500",
  secondary:
    "border-2 border-teal-700 text-teal-700 hover:bg-teal-50 focus:ring-teal-500",
  ghost: "text-teal-700 underline hover:text-teal-900 focus:ring-teal-500",
};

export function Button({
  variant = "primary",
  href,
  children,
  className = "",
  ...props
}: ButtonProps) {
  return (
    <Link
      href={href}
      className={`inline-block rounded-md px-6 py-3 text-sm font-semibold transition-colors
        focus:outline-none focus:ring-2 focus:ring-offset-2 ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {children}
    </Link>
  );
}
