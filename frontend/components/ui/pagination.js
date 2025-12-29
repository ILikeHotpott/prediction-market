import * as React from "react"
import { cn } from "@/lib/utils"

const Pagination = React.forwardRef(({ className, ...props }, ref) => (
  <nav
    ref={ref}
    aria-label="pagination"
    className={cn("flex w-full items-center justify-between", className)}
    {...props}
  />
))
Pagination.displayName = "Pagination"

const PaginationContent = React.forwardRef(({ className, ...props }, ref) => (
  <ul ref={ref} className={cn("flex flex-wrap items-center gap-1", className)} {...props} />
))
PaginationContent.displayName = "PaginationContent"

const PaginationItem = React.forwardRef(({ className, ...props }, ref) => (
  <li ref={ref} className={cn(className)} {...props} />
))
PaginationItem.displayName = "PaginationItem"

const PaginationLink = React.forwardRef(({ className, isActive, ...props }, ref) => (
  <button
    ref={ref}
    className={cn(
      "inline-flex h-8 min-w-[2.25rem] items-center justify-center rounded-md border border-transparent px-3 text-sm font-medium transition-colors",
      "bg-[#253448] text-gray-200 hover:bg-[#304157]",
      isActive && "border-blue-500 bg-[#1e3a5f] text-white",
      "disabled:opacity-50 disabled:cursor-not-allowed",
      className,
    )}
    {...props}
  />
))
PaginationLink.displayName = "PaginationLink"

const PaginationPrevious = React.forwardRef(({ className, ...props }, ref) => (
  <PaginationLink
    ref={ref}
    aria-label="Go to previous page"
    className={cn("px-3", className)}
    {...props}
  />
))
PaginationPrevious.displayName = "PaginationPrevious"

const PaginationNext = React.forwardRef(({ className, ...props }, ref) => (
  <PaginationLink ref={ref} aria-label="Go to next page" className={cn("px-3", className)} {...props} />
))
PaginationNext.displayName = "PaginationNext"

const PaginationEllipsis = ({ className, children = "…" }) => (
  <span className={cn("px-2 text-sm text-gray-400", className)}>{children}</span>
)

export {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
}

