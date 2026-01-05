import { Suspense } from "react";
import Navigation from "@/components/Navigation";
import MarketGrid from "@/components/MarketGrid";

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <Suspense fallback={null}>
        <Navigation />
        <MarketGrid />
      </Suspense>
    </div>
  );
}
