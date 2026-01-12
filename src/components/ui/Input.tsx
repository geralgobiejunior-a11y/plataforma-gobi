import { InputHTMLAttributes, forwardRef } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, className = '', ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-200 mb-1.5">
            {label}
            {props.required && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}

        <input
          ref={ref}
          className={[
            'w-full px-3 py-2.5 rounded-xl text-sm outline-none',
            // Base
            'border bg-white text-gray-900 border-gray-200',
            'placeholder:text-gray-400',
            // Dark
            'dark:bg-slate-900 dark:text-slate-100 dark:border-slate-800',
            'dark:placeholder:text-slate-500',
            // Focus
            'focus:ring-2 focus:ring-[#0B4F8A]/30 focus:border-transparent',
            'dark:focus:ring-[#0B4F8A]/35',
            // Disabled
            'disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed',
            'dark:disabled:bg-slate-900/60 dark:disabled:text-slate-500',
            // Error
            error
              ? 'border-red-300 focus:ring-red-500/30 dark:border-red-500/50 dark:focus:ring-red-500/25'
              : '',
            className,
          ].join(' ')}
          {...props}
        />

        {error && <p className="mt-1.5 text-sm text-red-600 dark:text-red-400">{error}</p>}
        {helperText && !error && (
          <p className="mt-1.5 text-sm text-gray-500 dark:text-slate-400">{helperText}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
