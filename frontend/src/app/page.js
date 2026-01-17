"use client";

import { Suspense, useState } from "react";
import { useRouter } from "next/navigation";
import { Search as SearchIcon } from "lucide-react";
import Navigation from "@/components/Navigation";
import SearchDropdown from "@/components/SearchDropdown";
import MarketGrid from "@/components/MarketGrid";
import MobileBottomNav from "@/components/MobileBottomNav";
import MobileSidebar from "@/components/MobileSidebar";

export default function Home() {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const router = useRouter();

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <Suspense fallback={null}>
        <Navigation />

        {/* Mobile Search */}
        <div className="md:hidden px-4 sm:px-6 lg:px-12 py-2 border-t border-white/10">
          <form onSubmit={(e) => { e.preventDefault(); const query = e.target.search.value; if (query) router.push(`/search?q=${encodeURIComponent(query)}`); }} className="flex items-center gap-2">
            <div className="flex-1 relative">
              <SearchIcon className="w-4 h-4 text-white/40 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                name="search"
                placeholder="Search"
                className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#1a3d2e] focus:border-transparent"
              />
            </div>
            <button type="submit" className="w-9 h-9 flex items-center justify-center bg-[#1a3d2e] hover:bg-[#153426] text-white rounded-lg font-medium text-sm transition-colors">
              <SearchIcon className="w-4 h-4" />
            </button>
          </form>
        </div>

        <MarketGrid />
        <MobileBottomNav onMenuClick={() => setMobileSidebarOpen(true)} />
        <MobileSidebar
          isOpen={mobileSidebarOpen}
          onClose={() => setMobileSidebarOpen(false)}
        />
      </Suspense>
    </div>
  );
}
