import { forwardRef, type ButtonHTMLAttributes } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils/cn";
import { Spinner } from "./spinner";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors " +
  "disabled:cursor-not-allowed disabled:opacity-50 select-none whitespace-nowrap";

const variants: Record<Variant, string> = {
  primary:
    "bg-gradient-to-b from-violet-500 to-violet-600 text-white shadow-[var(--shadow-glow)] hover:from-violet-400 hover:to-violet-500",
  secondary: "bg-surface-2 text-ink border border-line hover:bg-surface-3 hover:border-line-strong",
  outline: "border border-primary/60 text-primary-bright hover:bg-primary-soft",
  ghost: "text-muted hover:text-ink hover:bg-surface-2",
  danger: "bg-red-500/15 text-red-300 border border-red-500/30 hover:bg-red-500/25",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading, className, children, disabled, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(base, variants[variant], sizes[size], className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Spinner className="size-4" />}
      {children}
    </button>
  );
});

export function ButtonLink({
  href,
  variant = "secondary",
  size = "md",
  className,
  children,
  ...rest
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  children: React.ReactNode;
  title?: string;
  prefetch?: boolean;
}) {
  return (
    <Link href={href} className={cn(base, variants[variant], sizes[size], className)} {...rest}>
      {children}
    </Link>
  );
}
