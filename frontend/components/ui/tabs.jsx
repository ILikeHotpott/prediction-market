"use client";

import * as React from "react";

const TabsContext = React.createContext();

export function Tabs({ defaultValue, value, onValueChange, children, className = "" }) {
  const [selectedValue, setSelectedValue] = React.useState(defaultValue || "");

  const currentValue = value !== undefined ? value : selectedValue;

  const handleValueChange = (newValue) => {
    if (value === undefined) {
      setSelectedValue(newValue);
    }
    onValueChange?.(newValue);
  };

  return (
    <TabsContext.Provider value={{ value: currentValue, onValueChange: handleValueChange }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

export const TabsList = React.forwardRef(({ children, className = "", ...props }, ref) => (
  <div
    ref={ref}
    className={`inline-flex h-10 items-center justify-start rounded-lg bg-popover p-1 text-foreground opacity-70 ${className}`}
    {...props}
  >
    {children}
  </div>
));
TabsList.displayName = "TabsList";

export const TabsTrigger = React.forwardRef(({ value, children, className = "", ...props }, ref) => {
  const context = React.useContext(TabsContext);
  const isActive = context?.value === value;

  return (
    <button
      ref={ref}
      type="button"
      className={`inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ${
        isActive
          ? "bg-card text-foreground shadow-sm"
          : "text-foreground opacity-60 hover:opacity-90"
      } ${className}`}
      onClick={() => context?.onValueChange?.(value)}
      {...props}
    >
      {children}
    </button>
  );
});
TabsTrigger.displayName = "TabsTrigger";

export const TabsContent = React.forwardRef(({ value, children, className = "", ...props }, ref) => {
  const context = React.useContext(TabsContext);

  if (context?.value !== value) return null;

  return (
    <div
      ref={ref}
      className={`mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
});
TabsContent.displayName = "TabsContent";
