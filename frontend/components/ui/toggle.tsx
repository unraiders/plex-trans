import * as React from 'react'
import * as TogglePrimitive from '@radix-ui/react-toggle'
import { cn } from '../../lib/utils'

function Toggle({
  className,
  ...props
}: React.ComponentProps<typeof TogglePrimitive.Root>) {
  return (
    <TogglePrimitive.Root
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md border border-zinc-200 px-3 py-2 text-sm font-medium transition-colors',
        'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900',
        'dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100',
        'data-[state=on]:border-yellow-400 data-[state=on]:bg-yellow-50 data-[state=on]:text-yellow-700',
        'dark:data-[state=on]:border-yellow-500 dark:data-[state=on]:bg-yellow-900/20 dark:data-[state=on]:text-yellow-400',
        'focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
}

export { Toggle }
