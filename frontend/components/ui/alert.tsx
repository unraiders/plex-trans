import * as React from 'react'
import { cn } from '../../lib/utils'

function Alert({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      role="alert"
      className={cn(
        'relative w-full rounded-lg border px-4 py-3 text-sm grid gap-1',
        '[&>svg]:absolute [&>svg]:left-4 [&>svg]:top-3.5 [&>svg+*]:pl-7',
        className
      )}
      {...props}
    />
  )
}

function AlertTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div className={cn('font-semibold leading-snug tracking-tight', className)} {...props} />
  )
}

function AlertDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div className={cn('text-sm leading-relaxed [&_p]:leading-relaxed', className)} {...props} />
  )
}

export { Alert, AlertTitle, AlertDescription }
