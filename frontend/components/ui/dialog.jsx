"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

const Dialog = ({ open, onClose, children }) => {
  React.useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    if (open) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-50 w-full max-w-lg max-h-[90vh] overflow-auto">
        {children}
      </div>
    </div>
  );
};

const DialogContent = React.forwardRef(({ className, children, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "bg-[#1f2937] border border-[#334155] rounded-xl shadow-xl p-6 animate-in fade-in-0 zoom-in-95",
      className
    )}
    {...props}
  >
    {children}
  </div>
));
DialogContent.displayName = "DialogContent";

const DialogHeader = ({ className, children, ...props }) => (
  <div className={cn("mb-4", className)} {...props}>
    {children}
  </div>
);

const DialogTitle = ({ className, children, ...props }) => (
  <h2
    className={cn("text-xl font-semibold text-white", className)}
    {...props}
  >
    {children}
  </h2>
);

const DialogDescription = ({ className, children, ...props }) => (
  <p className={cn("text-sm text-gray-400 mt-1", className)} {...props}>
    {children}
  </p>
);

const DialogFooter = ({ className, children, ...props }) => (
  <div
    className={cn("mt-6 flex justify-end gap-3", className)}
    {...props}
  >
    {children}
  </div>
);

export { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter };
