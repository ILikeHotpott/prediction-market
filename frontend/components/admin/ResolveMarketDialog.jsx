"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

const backendBase =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

/**
 * ResolveMarketDialog - A dialog for resolving and settling markets
 *
 * For standalone events: Select YES or NO for the single market
 * For exclusive events: Select which market wins (the YES option of that market)
 * For independent events: Each market can be resolved independently to YES or NO
 */
export default function ResolveMarketDialog({
  open,
  onClose,
  event,
  user,
  onSuccess,
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [mode, setMode] = useState("full");
  const [partialSelections, setPartialSelections] = useState({});

  // Pool info state
  const [poolInfo, setPoolInfo] = useState(null);
  const [poolLoading, setPoolLoading] = useState(false);
  const [addCollateralAmount, setAddCollateralAmount] = useState("");
  const [addingCollateral, setAddingCollateral] = useState(false);

  // For standalone: which option wins (option_id)
  // For exclusive: which market wins (market_id), then we pick that market's YES option
  // For independent: map of market_id -> option_id
  const [selections, setSelections] = useState({});

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setError("");
      setSuccess("");
      setSelections({});
      setPartialSelections({});
      setMode("full");
      setLoading(false);
      setPoolInfo(null);
      setAddCollateralAmount("");
      // Fetch pool info
      if (event?.id) {
        fetchPoolInfo(event.id);
      }
    }
  }, [open, event?.id]);

  // Fetch pool info
  const fetchPoolInfo = async (eventId) => {
    setPoolLoading(true);
    try {
      const res = await fetch(`${backendBase}/api/admin/events/${eventId}/pool/`, {
        headers: user ? { "X-User-Id": user.id } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setPoolInfo(data);
      }
    } catch (err) {
      console.error("Failed to fetch pool info:", err);
    } finally {
      setPoolLoading(false);
    }
  };

  // Add collateral to pool
  const handleAddCollateral = async () => {
    if (!addCollateralAmount || !event?.id) return;
    setAddingCollateral(true);
    setError("");
    try {
      const res = await fetch(
        `${backendBase}/api/admin/events/${event.id}/pool/add-collateral/`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(user ? { "X-User-Id": user.id } : {}),
          },
          body: JSON.stringify({ amount: addCollateralAmount }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to add collateral");
      }
      setPoolInfo((prev) => ({
        ...prev,
        collateral_amount: data.new_collateral_amount,
        pool_cash: data.pool_cash,
      }));
      setAddCollateralAmount("");
      setSuccess(`Successfully added ${addCollateralAmount} collateral`);
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setAddingCollateral(false);
    }
  };

  if (!event) return null;

  const groupRule = event.group_rule || "standalone";
  const markets = event.markets || [];
  const allowPartial = groupRule === "exclusive" || groupRule === "independent";
  const isPartialMode = mode === "partial";

  // Get the YES option for a market
  const getYesOption = (market) => {
    return (market.options || []).find(
      (opt) => opt.side === "yes" || opt.option_index === 1
    );
  };

  // Get the NO option for a market
  const getNoOption = (market) => {
    return (market.options || []).find(
      (opt) => opt.side === "no" || opt.option_index === 0
    );
  };

  const isMarketResolved = (market) => {
    return market.status === "resolved" || market.status === "canceled";
  };

  // Resolve and settle a single market
  const resolveMarket = async (marketId, winningOptionId, partial = false) => {
    const res = await fetch(
      `${backendBase}/api/admin/markets/${marketId}/resolve-and-settle/`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(user ? { "X-User-Id": user.id } : {}),
        },
        body: JSON.stringify({ winning_option_id: winningOptionId, partial }),
      }
    );
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || data.detail || "Resolution failed");
    }
    return data;
  };

  // Handle standalone resolution (single market, YES/NO choice)
  const handleStandaloneResolve = async () => {
    if (markets.length === 0) {
      setError("No markets found for this event");
      return;
    }
    const market = markets[0];
    const selectedOptionId = selections[market.id];
    if (!selectedOptionId) {
      setError("Please select a winning outcome (YES or NO)");
      return;
    }

    setLoading(true);
    setError("");
    try {
      await resolveMarket(market.id, selectedOptionId);
      setSuccess("Market resolved and settled successfully!");
      setTimeout(() => {
        onSuccess?.();
        onClose?.();
      }, 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Handle exclusive resolution (pick the winning market, that market's YES wins)
  const handleExclusiveResolve = async () => {
    const winningMarketId = selections.winningMarket;
    if (!winningMarketId) {
      setError("Please select the winning outcome");
      return;
    }
    const winningMarket = markets.find((m) => m.id === winningMarketId);
    if (winningMarket && isMarketResolved(winningMarket)) {
      setError("Winning market is already resolved");
      return;
    }

    setLoading(true);
    setError("");
    try {
      // For exclusive events, we resolve all markets:
      // - The winning market gets YES
      // - Other markets get NO
      for (const market of markets) {
        if (isMarketResolved(market)) {
          continue;
        }
        const isWinner = market.id === winningMarketId;
        const winningOption = isWinner ? getYesOption(market) : getNoOption(market);
        if (winningOption) {
          await resolveMarket(market.id, winningOption.id);
        }
      }
      setSuccess("All markets resolved and settled successfully!");
      setTimeout(() => {
        onSuccess?.();
        onClose?.();
      }, 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Handle independent resolution (each market resolved separately)
  const handleIndependentResolve = async () => {
    const unresolvedMarkets = markets.filter(
      (m) => !isMarketResolved(m) && !selections[m.id]
    );
    if (unresolvedMarkets.length > 0) {
      setError(
        `Please select YES or NO for all markets. Missing: ${unresolvedMarkets
          .map((m) => m.title)
          .join(", ")}`
      );
      return;
    }

    setLoading(true);
    setError("");
    try {
      for (const market of markets) {
        if (isMarketResolved(market)) {
          continue;
        }
        const selectedOptionId = selections[market.id];
        await resolveMarket(market.id, selectedOptionId);
      }
      setSuccess("All markets resolved and settled successfully!");
      setTimeout(() => {
        onSuccess?.();
        onClose?.();
      }, 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePartialExclusiveResolve = async () => {
    const targets = markets.filter(
      (m) => partialSelections[m.id] && !isMarketResolved(m)
    );
    if (targets.length === 0) {
      setError("Please select at least one market to settle as NO");
      return;
    }

    setLoading(true);
    setError("");
    try {
      for (const market of targets) {
        const noOption = getNoOption(market);
        if (!noOption) {
          throw new Error(`No NO option found for ${market.title}`);
        }
        await resolveMarket(market.id, noOption.id, true);
      }
      setSuccess("Selected markets settled successfully!");
      setTimeout(() => {
        onSuccess?.();
        onClose?.();
      }, 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePartialIndependentResolve = async () => {
    const targets = markets.filter(
      (m) => selections[m.id] && !isMarketResolved(m)
    );
    if (targets.length === 0) {
      setError("Please select at least one market to settle");
      return;
    }

    setLoading(true);
    setError("");
    try {
      for (const market of targets) {
        const selectedOptionId = selections[market.id];
        await resolveMarket(market.id, selectedOptionId, true);
      }
      setSuccess("Selected markets settled successfully!");
      setTimeout(() => {
        onSuccess?.();
        onClose?.();
      }, 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Main resolve handler
  const handleResolve = async () => {
    if (allowPartial && isPartialMode) {
      if (groupRule === "exclusive") {
        await handlePartialExclusiveResolve();
        return;
      }
      if (groupRule === "independent") {
        await handlePartialIndependentResolve();
        return;
      }
    }

    switch (groupRule) {
      case "standalone":
        await handleStandaloneResolve();
        break;
      case "exclusive":
        await handleExclusiveResolve();
        break;
      case "independent":
        await handleIndependentResolve();
        break;
      default:
        await handleStandaloneResolve();
    }
  };

  // Render standalone UI (YES/NO for single market)
  const renderStandalone = () => {
    if (markets.length === 0) {
      return <p className="text-gray-400">No markets available.</p>;
    }
    const market = markets[0];
    const yesOption = getYesOption(market);
    const noOption = getNoOption(market);

    return (
      <div className="space-y-4">
        <div className="bg-[#0f172a] border border-[#334155] rounded-lg p-4">
          <h4 className="text-white font-medium mb-3">Select winning outcome:</h4>
          <div className="flex gap-3">
            <button
              onClick={() =>
                setSelections({ ...selections, [market.id]: yesOption?.id })
              }
              className={`flex-1 py-3 px-4 rounded-lg border-2 transition-all ${
                selections[market.id] === yesOption?.id
                  ? "border-green-500 bg-green-500/20 text-green-400"
                  : "border-[#334155] bg-[#1f2937] text-gray-300 hover:border-green-500/50"
              }`}
            >
              <span className="text-lg font-semibold">YES</span>
              <span className="block text-sm opacity-75">wins</span>
            </button>
            <button
              onClick={() =>
                setSelections({ ...selections, [market.id]: noOption?.id })
              }
              className={`flex-1 py-3 px-4 rounded-lg border-2 transition-all ${
                selections[market.id] === noOption?.id
                  ? "border-red-500 bg-red-500/20 text-red-400"
                  : "border-[#334155] bg-[#1f2937] text-gray-300 hover:border-red-500/50"
              }`}
            >
              <span className="text-lg font-semibold">NO</span>
              <span className="block text-sm opacity-75">wins</span>
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Render exclusive UI (pick one winning market)
  const renderExclusive = () => {
    return (
      <div className="space-y-3">
        <p className="text-gray-400 text-sm mb-2">
          Select the winning outcome. The selected option wins (YES), all others lose (NO).
        </p>
        {markets.map((market) => (
          <button
            key={market.id}
            onClick={() =>
              setSelections({ ...selections, winningMarket: market.id })
            }
            disabled={isMarketResolved(market)}
            className={`w-full text-left py-3 px-4 rounded-lg border-2 transition-all ${
              selections.winningMarket === market.id
                ? "border-green-500 bg-green-500/20"
                : "border-[#334155] bg-[#0f172a] hover:border-green-500/50"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-white font-medium">{market.title}</span>
              {selections.winningMarket === market.id && (
                <span className="text-green-400 text-sm font-semibold">
                  WINNER
                </span>
              )}
              {isMarketResolved(market) && (
                <span className="text-xs text-gray-500">RESOLVED</span>
              )}
            </div>
          </button>
        ))}
      </div>
    );
  };

  const renderExclusivePartial = () => {
    const availableMarkets = markets.filter((m) => !isMarketResolved(m));
    return (
      <div className="space-y-3">
        <p className="text-gray-400 text-sm mb-2">
          Select eliminated outcomes to settle as NO. The event stays active.
        </p>
        {availableMarkets.length === 0 ? (
          <p className="text-gray-500 text-sm">No active markets to settle.</p>
        ) : (
          availableMarkets.map((market) => {
            const isSelected = !!partialSelections[market.id];
            return (
              <button
                key={market.id}
                onClick={() =>
                  setPartialSelections({
                    ...partialSelections,
                    [market.id]: !isSelected,
                  })
                }
                className={`w-full text-left py-3 px-4 rounded-lg border-2 transition-all ${
                  isSelected
                    ? "border-red-500 bg-red-500/20"
                    : "border-[#334155] bg-[#0f172a] hover:border-red-500/50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-white font-medium">{market.title}</span>
                  {isSelected && (
                    <span className="text-red-400 text-sm font-semibold">
                      ELIMINATED
                    </span>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>
    );
  };

  // Render independent UI (each market YES/NO)
  const renderIndependent = (partial = false) => {
    return (
      <div className="space-y-4">
        <p className="text-gray-400 text-sm mb-2">
          {partial
            ? "Select YES or NO for any markets you want to settle now."
            : "Select YES or NO for each market independently."}
        </p>
        {markets.map((market) => {
          const yesOption = getYesOption(market);
          const noOption = getNoOption(market);
          const disabled = isMarketResolved(market);
          return (
            <div
              key={market.id}
              className="bg-[#0f172a] border border-[#334155] rounded-lg p-4"
            >
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-white font-medium">{market.title}</h4>
                {disabled && (
                  <span className="text-xs text-gray-500">RESOLVED</span>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() =>
                    setSelections({ ...selections, [market.id]: yesOption?.id })
                  }
                  disabled={disabled}
                  className={`flex-1 py-2 px-3 rounded-lg border transition-all text-sm ${
                    selections[market.id] === yesOption?.id
                      ? "border-green-500 bg-green-500/20 text-green-400"
                      : "border-[#334155] bg-[#1f2937] text-gray-300 hover:border-green-500/50"
                  }`}
                >
                  YES
                </button>
                <button
                  onClick={() =>
                    setSelections({ ...selections, [market.id]: noOption?.id })
                  }
                  disabled={disabled}
                  className={`flex-1 py-2 px-3 rounded-lg border transition-all text-sm ${
                    selections[market.id] === noOption?.id
                      ? "border-red-500 bg-red-500/20 text-red-400"
                      : "border-[#334155] bg-[#1f2937] text-gray-300 hover:border-red-500/50"
                  }`}
                >
                  NO
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // Render content based on group rule
  const renderContent = () => {
    switch (groupRule) {
      case "standalone":
        return renderStandalone();
      case "exclusive":
        return isPartialMode ? renderExclusivePartial() : renderExclusive();
      case "independent":
        return renderIndependent(isPartialMode);
      default:
        return renderStandalone();
    }
  };

  // Get description based on group rule
  const getDescription = () => {
    switch (groupRule) {
      case "standalone":
        return "Select YES or NO as the winning outcome for this market.";
      case "exclusive":
        return isPartialMode
          ? "Settle eliminated outcomes as NO while keeping the event active."
          : "Select the winning option. Only one option can win.";
      case "independent":
        return isPartialMode
          ? "Resolve any subset of markets without closing the event."
          : "Resolve each market independently. Each market can result in YES or NO.";
      default:
        return "Select the winning outcome.";
    }
  };

  const actionLabel = () => {
    if (allowPartial && isPartialMode) {
      return groupRule === "exclusive" ? "Settle Eliminated" : "Settle Selected";
    }
    return "Resolve & Settle";
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogContent className="mx-4 max-w-lg">
        <DialogHeader>
          <DialogTitle>Resolve & Settle: {event.title}</DialogTitle>
          <DialogDescription>{getDescription()}</DialogDescription>
          <div className="mt-2">
            <span className="inline-block px-2 py-1 text-xs rounded bg-[#0f172a] text-gray-400">
              {groupRule.toUpperCase()}
            </span>
          </div>
        </DialogHeader>

        {allowPartial && (
          <div className="flex gap-2">
            <button
              onClick={() => setMode("full")}
              className={`flex-1 py-2 px-3 rounded-lg border text-sm transition-all ${
                !isPartialMode
                  ? "border-green-500 bg-green-500/20 text-green-400"
                  : "border-[#334155] bg-[#0f172a] text-gray-300 hover:border-green-500/50"
              }`}
            >
              Full Resolve
            </button>
            <button
              onClick={() => setMode("partial")}
              className={`flex-1 py-2 px-3 rounded-lg border text-sm transition-all ${
                isPartialMode
                  ? "border-blue-500 bg-blue-500/20 text-blue-300"
                  : "border-[#334155] bg-[#0f172a] text-gray-300 hover:border-blue-500/50"
              }`}
            >
              Partial Settle
            </button>
          </div>
        )}

        {/* Pool Info Section */}
        <div className="bg-[#0f172a] border border-[#334155] rounded-lg p-4 mb-4">
          <h4 className="text-white font-medium mb-3 flex items-center gap-2">
            💰 Pool Funds
            {poolLoading && <span className="text-xs text-gray-400">(loading...)</span>}
          </h4>
          {poolInfo ? (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Pool Cash:</span>
                <span className="text-white font-mono">{Number(poolInfo.pool_cash).toFixed(2)} {poolInfo.collateral_token}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Collateral:</span>
                <span className="text-white font-mono">{Number(poolInfo.collateral_amount).toFixed(2)} {poolInfo.collateral_token}</span>
              </div>
              <div className="flex justify-between border-t border-[#334155] pt-2 mt-2">
                <span className="text-gray-400">Total Available:</span>
                <span className="text-green-400 font-mono font-semibold">
                  {(Number(poolInfo.pool_cash) + Number(poolInfo.collateral_amount)).toFixed(2)} {poolInfo.collateral_token}
                </span>
              </div>

              {/* Add Collateral Form */}
              <div className="mt-4 pt-3 border-t border-[#334155]">
                <label className="text-gray-400 text-xs block mb-2">Add Collateral for Settlement:</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={addCollateralAmount}
                    onChange={(e) => setAddCollateralAmount(e.target.value)}
                    placeholder="Amount"
                    className="flex-1 bg-[#1f2937] border border-[#334155] rounded px-3 py-2 text-white text-sm"
                    min="0"
                    step="0.01"
                  />
                  <Button
                    size="sm"
                    onClick={handleAddCollateral}
                    disabled={!addCollateralAmount || addingCollateral}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {addingCollateral ? "Adding..." : "Add"}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-gray-400 text-sm">
              {poolLoading ? "Loading pool info..." : "Pool info not available"}
            </div>
          )}
        </div>

        <div className="max-h-[300px] overflow-y-auto">{renderContent()}</div>

        {error && (
          <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="mt-4 p-3 bg-green-500/10 border border-green-500/30 rounded-lg text-green-400 text-sm">
            {success}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleResolve} disabled={loading || success}>
            {loading ? "Processing..." : actionLabel()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
