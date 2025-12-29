"use client"

import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }) {
  // Uses global shimmer animation for clearer motion feedback on dark backgrounds.
  return <div className={cn("skeleton rounded-md", className)} {...props} />
}

export { Skeleton }

