import { SelectHTMLAttributes, forwardRef } from 'react';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
  options: Array<{ value: string | number; label: string }>;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, helperText, options, className = '', ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-200 mb-1.5">
            {label}
            {props.required && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}

        <div className="relative">
          <select
            ref={ref}
            className={[
              'w-full px-3 py-2.5 rounded-xl text-sm outline-none appearance-none',
              // Base
              'border bg-white text-gray-900 border-gray-200',
              // Dark
              'dark:bg-slate-900 dark:text-slate-100 dark:border-slate-800',
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
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          {/* Chevron (para ficar com cara de select e consistente no dark) */}
          <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              className="text-gray-400 dark:text-slate-400"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M7 10l5 5 5-5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>

        {error && <p className="mt-1.5 text-sm text-red-600 dark:text-red-400">{error}</p>}
        {helperText && !error && <p className="mt-1.5 text-sm text-gray-500 dark:text-slate-400">{helperText}</p>}
      </div>
    );
  }
);

Select.displayName = 'Select';
