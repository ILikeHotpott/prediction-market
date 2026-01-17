"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { Timer, ChevronRight, Bookmark, MessageCircle, Flame, Droplet, SlidersHorizontal, Search as SearchIcon, X, Sparkles, TrendingUp, Clock, CircleDot } from "lucide-react";
import Navigation from "@/components/Navigation";

const backendBase =
  typeof window !== "undefined"
    ? process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"
    : "";

function SearchContent() {
  const searchParams = useSearchParams();
  const query = searchParams.get("q") || "";
  const router = useRouter();

  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterQuery, setFilterQuery] = useState("");
  const [categories, setCategories] = useState([]);
  const [searchInput, setSearchInput] = useState(query);
  const [activeTab, setActiveTab] = useState("markets");

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

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchInput.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchInput.trim())}`);
    }
  };

  const clearSearch = () => {
    setSearchInput("");
    router.push("/search");
  };

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

  // Mobile Browse View (no search query)
  if (!query) {
    return (
      <div className="min-h-screen bg-background pb-20 md:pb-0">
        <Suspense fallback={<div className="h-20" />}>
          <Navigation />
        </Suspense>

        {/* Desktop: Keep original behavior */}
        <div className="hidden md:block max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="text-center py-12 text-muted-foreground">
            Enter a search query to see results
          </div>
        </div>

        {/* Mobile: Browse View */}
        <div className="md:hidden px-4 py-6">
          {/* Mobile Search Bar */}
          <form onSubmit={handleSearch} className="relative mb-6">
            <SearchIcon className="w-5 h-5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search markets..."
              className="w-full bg-card border border-border rounded-lg pl-10 pr-10 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#1a3d2e]"
            />
            {searchInput && (
              <button
                type="button"
                onClick={clearSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2"
              >
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            )}
          </form>

          <h2 className="text-lg font-bold text-foreground mb-4">BROWSE</h2>

          {/* Browse Filters */}
          <div className="flex flex-wrap gap-3 mb-8">
            <button className="flex items-center gap-2 px-4 py-2 rounded-full border border-border text-foreground text-sm font-medium">
              <Sparkles className="w-4 h-4" />
              New
            </button>
            <button className="flex items-center gap-2 px-4 py-2 rounded-full border border-border text-foreground text-sm font-medium">
              <TrendingUp className="w-4 h-4" />
              Trending
            </button>
            <button className="flex items-center gap-2 px-4 py-2 rounded-full border border-border text-foreground text-sm font-medium">
              <Flame className="w-4 h-4" />
              Popular
            </button>
            <button className="flex items-center gap-2 px-4 py-2 rounded-full border border-border text-foreground text-sm font-medium">
              <Droplet className="w-4 h-4" />
              Liquid
            </button>
            <button className="flex items-center gap-2 px-4 py-2 rounded-full border border-border text-foreground text-sm font-medium">
              <Clock className="w-4 h-4" />
              Ending Soon
            </button>
            <button className="flex items-center gap-2 px-4 py-2 rounded-full border border-border text-foreground text-sm font-medium">
              <CircleDot className="w-4 h-4" />
              Competitive
            </button>
          </div>

          <h2 className="text-lg font-bold text-foreground mb-4">TOPICS</h2>

          {/* Topics Grid */}
          <div className="grid grid-cols-2 gap-3">
            <Link href="/?category=crypto" className="flex items-center gap-3 p-4 rounded-lg border border-border bg-card">
              <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center text-2xl">📈</div>
              <span className="text-foreground font-semibold">Live Crypto</span>
            </Link>
            <Link href="/?category=politics" className="flex items-center gap-3 p-4 rounded-lg border border-border bg-card">
              <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center text-2xl">🏛️</div>
              <span className="text-foreground font-semibold">Politics</span>
            </Link>
            <Link href="/?category=middle-east" className="flex items-center gap-3 p-4 rounded-lg border border-border bg-card">
              <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center text-2xl">🌍</div>
              <span className="text-foreground font-semibold">Middle East</span>
            </Link>
            <Link href="/?category=crypto" className="flex items-center gap-3 p-4 rounded-lg border border-border bg-card">
              <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center text-2xl">₿</div>
              <span className="text-foreground font-semibold">Crypto</span>
            </Link>
            <Link href="/?category=sports" className="flex items-center gap-3 p-4 rounded-lg border border-border bg-card">
              <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center text-2xl">🏀</div>
              <span className="text-foreground font-semibold">Sports</span>
            </Link>
            <Link href="/?category=pop-culture" className="flex items-center gap-3 p-4 rounded-lg border border-border bg-card">
              <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center text-2xl">🎭</div>
              <span className="text-foreground font-semibold">Pop Culture</span>
            </Link>
            <Link href="/?category=tech" className="flex items-center gap-3 p-4 rounded-lg border border-border bg-card">
              <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center text-2xl">💻</div>
              <span className="text-foreground font-semibold">Tech</span>
            </Link>
            <Link href="/?category=ai" className="flex items-center gap-3 p-4 rounded-lg border border-border bg-card">
              <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center text-2xl">🤖</div>
              <span className="text-foreground font-semibold">AI</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <Suspense fallback={<div className="h-20" />}>
        <Navigation />
      </Suspense>

      {/* Desktop Header */}
      <div className="hidden md:block max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex items-center gap-2 mb-6">
          <span className="text-2xl text-foreground">
            {loading ? "Searching..." : `${filteredResults.length} results for`}
          </span>
          {!loading && (
            <span className="text-2xl font-bold text-foreground">{query}</span>
          )}
        </div>
      </div>

      {/* Mobile Search Bar */}
      <div className="md:hidden px-4 py-4">
        <form onSubmit={handleSearch} className="relative">
          <SearchIcon className="w-5 h-5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search markets..."
            className="w-full bg-card border border-border rounded-lg pl-10 pr-10 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#1a3d2e]"
          />
          {searchInput && (
            <button
              type="button"
              onClick={clearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2"
            >
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
          )}
        </form>

        {/* Tabs */}
        <div className="flex gap-4 mt-4">
          <button
            onClick={() => setActiveTab("markets")}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              activeTab === "markets"
                ? "bg-foreground text-background"
                : "text-muted-foreground"
            }`}
          >
            Markets
          </button>
          <button
            onClick={() => setActiveTab("profiles")}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              activeTab === "profiles"
                ? "bg-foreground text-background"
                : "text-muted-foreground"
            }`}
          >
            Profiles
          </button>
        </div>
      </div>

      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
        {/* Desktop Category Tabs */}
        {categories.length > 0 && (
          <div className="hidden md:flex gap-3 mb-4 overflow-x-auto scrollbar-hide pb-2">
            <button className="px-4 py-2 rounded-full bg-foreground text-background text-sm font-medium whitespace-nowrap border-b-2 border-foreground">
              All
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                className="px-4 py-2 text-muted-foreground text-sm font-medium whitespace-nowrap hover:text-foreground transition-colors border-b-2 border-transparent"
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {/* Results List */}
        <div className="divide-y divide-border md:divide-y-0">
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
                  {/* Desktop Card */}
                  <div className="hidden md:flex items-center gap-4 py-4 hover:bg-white/5 transition-colors group px-2">
                    <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-muted">
                      {event.cover_url ? (
                        <img src={event.cover_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-muted flex items-center justify-center text-muted-foreground text-xs">
                          No img
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      {event.category && (
                        <div className="text-xs text-muted-foreground mb-1">{event.category}</div>
                      )}
                      <h3 className="text-foreground font-semibold mb-1 line-clamp-1">{event.title}</h3>
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
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {prob !== null && (
                        <div className="text-right">
                          <div className="text-xl font-bold text-foreground">{prob}%</div>
                        </div>
                      )}
                      <ChevronRight className="w-5 h-5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>

                  {/* Mobile Card - Simplified */}
                  <div className="md:hidden flex gap-3 py-4">
                    <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-muted">
                      {event.cover_url ? (
                        <img src={event.cover_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-muted flex items-center justify-center text-muted-foreground text-xs">
                          No img
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-foreground font-semibold mb-1 line-clamp-2 leading-tight">{event.title}</h3>
                      {event.status === "resolved" && (
                        <div className="text-xs text-muted-foreground">
                          {event.resolved_option_index === 0 ? "Yes ✓" : "No ✓"}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end justify-center flex-shrink-0">
                      {prob !== null && (
                        <div className="text-2xl font-bold text-foreground">{prob}%</div>
                      )}
                      {event.category && (
                        <div className="text-xs text-muted-foreground mt-1">{event.category}</div>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })
          )}
        </div>

        {/* See all results link */}
        {!loading && filteredResults.length > 0 && (
          <div className="md:hidden mt-6 mb-4">
            <button className="text-[#1a3d2e] font-medium flex items-center gap-2">
              See all results <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background"><div className="h-20" /></div>}>
      <SearchContent />
    </Suspense>
  );
}