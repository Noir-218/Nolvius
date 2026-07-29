import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'primary' | 'pending';
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = 'neutral', children, ...props }, ref) => {
    const variants = {
      // ── Semantic states ─────────────────────────────────────────────
      success:  "bg-[#D8EDE0] text-[#2D6A47] border border-[#A8D5B5]",
      warning:  "bg-[#F5EAD4] text-[#7A5A1A] border border-[#E7CC8A]",
      danger:   "bg-[#F3E0D8] text-[#A0463A] border border-[#D49490]",
      pending:  "bg-[#FFF3D6] text-[#8A6A25] border border-[#E7CC8A]",  // Awaiting/not done
      info:     "bg-[#D6EAF0] text-[#1E5F74] border border-[#8FBFCF]",
      neutral:  "bg-[#ECEAE4] text-[#5F6962] border border-[#D1CCC4]",
      primary:  "bg-[#DDE8D9] text-[#365542] border border-[#9DB5A0]",
    };

    return (
      <span
        ref={ref}
        className={cn(
          "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold",
          variants[variant],
          className
        )}
        {...props}
      >
        {children}
      </span>
    );
  }
);

Badge.displayName = 'Badge';
