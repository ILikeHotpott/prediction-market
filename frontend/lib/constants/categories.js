/**
 * Centralized category definitions for the prediction market platform.
 *
 * To modify categories, only edit this file - all components will automatically update.
 */

export const MARKET_CATEGORIES = [
  { value: "trending", label: "Trending", emoji: "🔥" },
  { value: "breaking", label: "Breaking" },
  { value: "new", label: "New" },
  { value: "politics", label: "Politics" },
  { value: "sports", label: "Sports" },
  { value: "finance", label: "Finance" },
  { value: "crypto", label: "Crypto" },
  { value: "geopolitics", label: "Geopolitics" },
  { value: "earnings", label: "Earnings" },
  { value: "tech", label: "Tech" },
  { value: "culture", label: "Culture" },
  { value: "world", label: "World" },
  { value: "economy", label: "Economy" },
  { value: "elections", label: "Elections" },
];

// For navigation display (includes all categories)
export const NAV_CATEGORIES = MARKET_CATEGORIES;

// For admin dropdown (excludes special categories like "trending")
export const ADMIN_CATEGORIES = MARKET_CATEGORIES.filter(
  (c) => !["trending", "breaking", "new"].includes(c.value)
);

// Helper to get label by value
export function getCategoryLabel(value) {
  const cat = MARKET_CATEGORIES.find((c) => c.value === value);
  return cat?.label || value;
}

// Helper to get emoji by value
export function getCategoryEmoji(value) {
  const cat = MARKET_CATEGORIES.find((c) => c.value === value);
  return cat?.emoji || "";
}
