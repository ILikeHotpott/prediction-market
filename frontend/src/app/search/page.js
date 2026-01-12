"use client";

import { useSearchParams } from "next/navigation";
import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { Timer, ChevronRight } from "lucide-react";
import Navigation from "@/components/Navigation";

const backendBase =
  typeof window !== "undefined"
    ? process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"
    : "";

function SearchContent() {
  const searchParams = useSearchParams();
  const query = searchParams.get("_q") || "";

  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterQuery, setFilterQuery] = useState("");
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    if (!query) return;
    setLoading(true);
    const params = new URLSearchParams({
      q: query,
      status: "all",
      limit: "50",
    });
    fetch(`${backendBase}/api/search/?${params}`)
      .then((res) => res.json())
      .then((data) => {
        const events = data.results || [];
        setResults(events);
        const cats = [...new Set(events.map((e) => e.category).filter(Boolean))];
        setCategories(cats);
      })
      .catch(() => setResults([]))
      .finally(() => setLoading(false));
  }, [query]);

  const filteredResults = results.filter((event) => {
    if (filterQuery && !event.title?.toLowerCase().includes(filterQuery.toLowerCase())) {
      return false;
    }
    return true;
  });

  const formatVolume = (vol) => {
    if (!vol) return "$0";
    const n = Number(vol);
    if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}m`;
    if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
    return `$${n.toFixed(0)}`;
  };

  const getYesProb = (event) => {
    const outcomes = event.outcomes || [];
    const yesOption = outcomes.find((o) => o.name?.toLowerCase() === "yes");
    if (yesOption?.probability_bps != null) return Math.round(yesOption.probability_bps / 100);
    return null;
  };

  return (
    <div className="min-h-screen bg-background">
      <Suspense fallback={<div className="h-20" />}>
        <Navigation />
      </Suspense>
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Header */}
        <div className="flex items-center gap-2 mb-6">
          <span className="text-2xl text-foreground">
            {loading ? "Searching..." : `${filteredResults.length} results for`}
          </span>
          {!loading && (
            <span className="text-2xl font-bold text-foreground">{query}</span>
          )}
        </div>

        {/* Category Tabs */}
        {categories.length > 0 && (
          <div className="flex gap-3 mb-6 overflow-x-auto scrollbar-hide pb-2 border-b border-border">
            <button className="px-4 py-2 rounded-full bg-foreground text-background text-sm font-medium whitespace-nowrap">
              All
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                className="px-4 py-2 text-muted-foreground text-sm font-medium whitespace-nowrap hover:text-foreground transition-colors"
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {/* Results List */}
        <div className="divide-y divide-border">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-24 bg-white/5 animate-pulse" />
            ))
          ) : filteredResults.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No results found for "{query}"
            </div>
          ) : (
            filteredResults.map((event) => {
              const prob = getYesProb(event);
              return (
                <Link
                  key={event.id}
                  href={`/market/${event.id}`}
                  className="block"
                >
                  <div className="flex items-center gap-4 py-4 hover:bg-white/5 transition-colors group px-2">
                    {/* Cover Image */}
                    <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-muted">
                      {event.cover_url ? (
                        <img
                          src={event.cover_url}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-muted flex items-center justify-center text-muted-foreground text-xs">
                          No img
                        </div>
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      {event.category && (
                        <div className="text-xs text-muted-foreground mb-1">
                          {event.category}
                        </div>
                      )}
                      <h3 className="text-foreground font-semibold mb-1 line-clamp-1">
                        {event.title}
                      </h3>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{formatVolume(event.volume_total)} Vol.</span>
                        {event.trading_deadline > 0 && (
                          <span className="flex items-center gap-1">
                            <Timer className="w-3 h-3" />
                            {new Date(event.trading_deadline * 1000).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Probability */}
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {prob !== null && (
                        <div className="text-right">
                          <div className="text-xl font-bold text-foreground">{prob}%</div>
                        </div>
                      )}
                      <ChevronRight className="w-5 h-5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background"><Navigation /></div>}>
      <SearchContent />
    </Suspense>
  );
}
