import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          "flex h-10 w-full rounded-xl border bg-warm-white px-3 py-2 text-sm text-coffee transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest focus-visible:border-forest disabled:cursor-not-allowed disabled:opacity-50",
          error ? "border-terra focus-visible:ring-terra" : "border-sage/40",
          className
        )}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';
