import * as React from 'react'

import { cn } from '../../lib/utils'

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'flex min-h-[92px] w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-base text-zinc-900 outline-none transition placeholder:text-zinc-500 focus:border-zinc-300 focus:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-900/30 dark:text-zinc-100 dark:focus:border-zinc-700 dark:focus:bg-zinc-900/50',
        className
      )}
      {...props}
    />
  )
)
Textarea.displayName = 'Textarea'
