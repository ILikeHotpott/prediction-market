import Navigation from "@/components/Navigation";
import MarketGrid from "@/components/MarketGrid";

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <MarketGrid />
    </div>
  );
}
