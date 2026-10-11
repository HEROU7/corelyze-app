import * as React from "react"
import * as ProgressPrimitive from "@radix-ui/react-progress"

import { cn } from "@/lib/utils"

function Progress({
  className,
  value,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn(
        "bg-white/[0.07] glass-highlight relative h-2 w-full overflow-hidden rounded-full",
        className
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className="h-full w-full flex-1 rounded-full transition-all duration-500 ease-out"
        style={{
          transform: `translateX(-${100 - (value || 0)}%)`,
          backgroundImage: "linear-gradient(90deg, var(--primary), var(--section-accent-2))",
          boxShadow: "0 0 16px color-mix(in srgb, var(--primary) 75%, transparent)",
        }}
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
