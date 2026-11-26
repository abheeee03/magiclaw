import { PublicKey } from "@solana/web3.js";
import { PRIZE_TIERS } from "./constants";
import { getDefaultPrizeSlots } from "./solana";
import { MachineConfigData } from "./types";

export type DistributionMode = "tier_weighted" | "inverse_odds" | "equal";
export type RoundingMode = "clean" | "exact";
export type BuybackConfigMode = "price_per_token" | "per_tier_usd";

export const DEFAULT_TIER_WEIGHTS: [number, number, number, number] = [1, 2.5, 6, 15];

export interface RewardDistributionInput {
  machine: MachineConfigData;
  machinePda: PublicKey;
  mint: string;
  decimals: number;
  symbol?: string;
  walletBalanceRaw: bigint;
  totalDepositInput: string;
  tierCounts: [number, number, number, number];
  distributionMode: DistributionMode;
  tierWeights: [number, number, number, number];
  roundingMode: RoundingMode;
  buybackMode: BuybackConfigMode;
  tokenPriceUsd: string;
  manualTierBuybacksUsd: [string, string, string, string];
  priceFeed: string;
  overwriteStocked: boolean;
  randomizeCoords: boolean;
}

export interface PlannedSlotAllocation {
  slotId: number;
  tier: number;
  x: number;
  z: number;
  prizeAmountRaw: bigint;
  prizeAmountUi: string;
  fallbackBuybackUsdc: bigint;
  fallbackBuybackUsdFormatted: string;
  wasAlreadyInStock: boolean;
}

export interface TierSummary {
  tier: number;
  name: string;
  color: string;
  oddsLabel: string;
  slotCount: number;
  perSlotUi: string;
  totalTierRaw: bigint;
  totalTierUi: string;
  buybackUsdFormatted: string;
}

export interface RewardDistributionPlan {
  valid: boolean;
  errors: string[];
  warnings: string[];
  totalDepositRaw: bigint;
  totalAllocatedRaw: bigint;
  totalSlots: number;
  allocations: PlannedSlotAllocation[];
  tierSummaries: TierSummary[];
  batchCount: number;
}

export function formatBaseUnits(raw: bigint, decimals: number): string {
  if (decimals === 0) return raw.toString();
  const div = BigInt(10) ** BigInt(decimals);
  const whole = raw / div;
  const frac = (raw % div).toString().padStart(decimals, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

export function toBaseUnits(amountStr: string, decimals: number): bigint {
  const cleaned = amountStr.trim().replace(/,/g, "");
  if (!cleaned || !/^\d+(\.\d*)?$/.test(cleaned)) return BigInt(0);
  const [whole, frac = ""] = cleaned.split(".");
  const padded = frac.padEnd(decimals, "0").slice(0, decimals);
  return (
    BigInt(whole || "0") * BigInt(10) ** BigInt(decimals) +
    BigInt(padded || "0")
  );
}

/**
 * Splits `totalSlots` across the 4 tiers using relative slot count weights,
 * guaranteeing the returned 4 counts sum exactly to `totalSlots`.
 */
export function autoDistributeTierCounts(
  totalSlots: number,
  ratios: [number, number, number, number] = [0.5, 0.25, 0.15, 0.1]
): [number, number, number, number] {
  const target = Math.max(0, Math.min(16, Math.round(totalSlots)));
  if (target === 0) return [0, 0, 0, 0];

  const sumRatios = ratios.reduce((acc, r) => acc + Math.max(0, r), 0);
  if (sumRatios <= 0) return [target, 0, 0, 0];

  const raw = ratios.map((r) => (Math.max(0, r) / sumRatios) * target);
  const counts: [number, number, number, number] = [
    Math.floor(raw[0]),
    Math.floor(raw[1]),
    Math.floor(raw[2]),
    Math.floor(raw[3]),
  ];

  // For >= 4 slots with balanced preset, ensure Grail/Epic get at least 1 slot if ratios > 0
  let assigned = counts[0] + counts[1] + counts[2] + counts[3];
  const remainders = raw
    .map((val, idx) => ({ idx, rem: val - counts[idx], ratio: ratios[idx] }))
    .sort((a, b) => b.rem - a.rem || b.ratio - a.ratio);

  let ptr = 0;
  while (assigned < target && ptr < remainders.length) {
    counts[remainders[ptr].idx] += 1;
    assigned += 1;
    ptr += 1;
  }

  // Fallback if still under target
  while (assigned < target) {
    counts[0] += 1;
    assigned += 1;
  }

  return counts;
}

function isInsideChutePlayfield(x: number, z: number): boolean {
  // Chute occupies front-left corner in 3D space (x < ~340, z > ~600)
  return x < 340 && z > 600;
}

function generateRandomizedCoords(
  count: number,
  occupiedCoords: Array<{ x: number; z: number }>
): Array<{ x: number; z: number }> {
  const placed: Array<{ x: number; z: number }> = [...occupiedCoords];
  const result: Array<{ x: number; z: number }> = [];

  for (let i = 0; i < count; i++) {
    let bestCandidate = { x: 500, z: 500 };
    let bestMinDistSq = -1;

    for (let attempt = 0; attempt < 40; attempt++) {
      const x = Math.round(160 + Math.random() * 680);
      const z = Math.round(160 + Math.random() * 660);
      if (isInsideChutePlayfield(x, z)) continue;

      let minDistSq = Number.MAX_SAFE_INTEGER;
      for (const p of placed) {
        const dx = p.x - x;
        const dz = p.z - z;
        const dSq = dx * dx + dz * dz;
        if (dSq < minDistSq) minDistSq = dSq;
      }

      if (minDistSq > bestMinDistSq) {
        bestMinDistSq = minDistSq;
        bestCandidate = { x, z };
      }
      if (minDistSq >= 110 * 110) break;
    }

    placed.push(bestCandidate);
    result.push(bestCandidate);
  }

  return result;
}

function computeSlotStepUnit(
  shareRaw: bigint,
  decimals: number
): bigint {
  if (decimals === 0) return BigInt(1);
  const oneToken = BigInt(10) ** BigInt(decimals);
  if (shareRaw >= oneToken * BigInt(10)) return oneToken; // round to whole tokens
  if (shareRaw >= oneToken) {
    // round to 0.1 tokens
    return BigInt(10) ** BigInt(Math.max(0, decimals - 1));
  }
  // small fractional packs: round to 0.01 tokens if possible
  return BigInt(10) ** BigInt(Math.max(0, decimals - 2));
}

export function computeRewardDistributionPlan(
  input: RewardDistributionInput
): RewardDistributionPlan {
  const errors: string[] = [];
  const warnings: string[] = [];

  const {
    machine,
    machinePda,
    mint,
    decimals,
    walletBalanceRaw,
    totalDepositInput,
    tierCounts,
    distributionMode,
    tierWeights,
    roundingMode,
    buybackMode,
    tokenPriceUsd,
    manualTierBuybacksUsd,
    priceFeed,
    overwriteStocked,
    randomizeCoords,
  } = input;

  let mintValid = false;
  try {
    if (mint.trim()) {
      new PublicKey(mint.trim());
      mintValid = true;
    }
  } catch {
    mintValid = false;
  }
  if (!mintValid) {
    errors.push("Select or enter a valid SPL token mint address.");
  }

  if (priceFeed.trim()) {
    try {
      new PublicKey(priceFeed.trim());
    } catch {
      errors.push("Invalid Pyth price feed public key.");
    }
  }

  const sanitizedTierCounts: [number, number, number, number] = [
    Math.max(0, Math.floor(tierCounts[0] || 0)),
    Math.max(0, Math.floor(tierCounts[1] || 0)),
    Math.max(0, Math.floor(tierCounts[2] || 0)),
    Math.max(0, Math.floor(tierCounts[3] || 0)),
  ];
  const totalSlots =
    sanitizedTierCounts[0] +
    sanitizedTierCounts[1] +
    sanitizedTierCounts[2] +
    sanitizedTierCounts[3];

  if (totalSlots <= 0) {
    errors.push("Configure at least 1 slot across the tiers.");
  }
  if (totalSlots > 16) {
    errors.push("A machine has at most 16 slots.");
  }

  const emptySlots = machine.slots.filter((s) => !s.inStock);
  const stockedSlots = machine.slots.filter((s) => s.inStock);
  const candidatePool = overwriteStocked
    ? [...emptySlots, ...stockedSlots]
    : emptySlots;

  if (totalSlots > candidatePool.length) {
    errors.push(
      overwriteStocked
        ? `Requested ${totalSlots} slots, but machine only has ${candidatePool.length} total slots.`
        : `Only ${emptySlots.length} empty slot(s) available. Reduce slots or enable "Overwrite stocked slots".`
    );
  }

  const totalDepositRaw = toBaseUnits(totalDepositInput, decimals);
  if (totalDepositRaw <= BigInt(0)) {
    errors.push("Enter a total token deposit amount greater than 0.");
  }
  if (mintValid && totalDepositRaw > walletBalanceRaw) {
    errors.push(
      `Deposit (${formatBaseUnits(totalDepositRaw, decimals)}) exceeds wallet balance (${formatBaseUnits(walletBalanceRaw, decimals)}).`
    );
  }
  if (totalDepositRaw > BigInt(0) && totalSlots > 0 && totalDepositRaw < BigInt(totalSlots)) {
    errors.push(
      `Deposit base units (${totalDepositRaw.toString()}) must be at least ${totalSlots} so each slot receives > 0 units.`
    );
  }

  // Compute weights per tier
  const gripBps =
    machine.gripBps.length === 4 ? machine.gripBps : [6500, 3200, 1200, 400];
  const effectiveWeights: [number, number, number, number] = (() => {
    if (distributionMode === "equal") return [1, 1, 1, 1];
    if (distributionMode === "inverse_odds") {
      const base = Math.max(1, gripBps[0] || 6500);
      return [
        1,
        Number((base / Math.max(1, gripBps[1] || 3200)).toFixed(2)),
        Number((base / Math.max(1, gripBps[2] || 1200)).toFixed(2)),
        Number((base / Math.max(1, gripBps[3] || 400)).toFixed(2)),
      ];
    }
    return [
      Math.max(0.01, Number(tierWeights[0]) || 1),
      Math.max(0.01, Number(tierWeights[1]) || 1),
      Math.max(0.01, Number(tierWeights[2]) || 1),
      Math.max(0.01, Number(tierWeights[3]) || 1),
    ];
  })();

  // Build ordered list of requested tier assignments (highest tier first for prime placement)
  const requestedTiers: number[] = [];
  for (let t = 3; t >= 0; t--) {
    for (let c = 0; c < sanitizedTierCounts[t]; c++) {
      requestedTiers.push(t);
    }
  }

  // Match requested tiers to available slots using curated playfield layout
  const defaultLayout = getDefaultPrizeSlots(machinePda);
  const remainingPool = [...candidatePool];
  const matchedSlots: Array<{ slotId: number; tier: number; wasAlreadyInStock: boolean }> = [];

  for (const tier of requestedTiers) {
    if (remainingPool.length === 0) break;

    // Prefer empty slots first, then matching defaultLayout tier, then closeness to center for higher tiers
    let bestIdx = 0;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (let i = 0; i < remainingPool.length; i++) {
      const candidate = remainingPool[i];
      const layout = defaultLayout[candidate.slotId];
      let score = 0;
      if (!candidate.inStock) score += 10_000;
      if (layout && layout.tier === tier) score += 1_000;
      if (layout) {
        const dx = layout.x - 500;
        const dz = layout.z - 500;
        const dist = Math.sqrt(dx * dx + dz * dz);
        // Grail/Epic prefer center; Common prefers outer ring
        score += tier >= 2 ? -dist : dist * 0.25;
        // Penalize tier distance
        score -= Math.abs(layout.tier - tier) * 120;
      }
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    const picked = remainingPool.splice(bestIdx, 1)[0];
    matchedSlots.push({
      slotId: picked.slotId,
      tier,
      wasAlreadyInStock: picked.inStock,
    });
  }

  const overwritingCount = matchedSlots.filter((m) => m.wasAlreadyInStock).length;
  if (overwritingCount > 0) {
    warnings.push(
      `${overwritingCount} currently stocked slot(s) will be overwritten (existing vault tokens remain in vault).`
    );
  }

  // Distribute totalDepositRaw across matchedSlots
  const SCALE = 10_000;
  const scaledSlotWeights = matchedSlots.map((m) =>
    BigInt(Math.max(1, Math.round(effectiveWeights[m.tier] * SCALE)))
  );
  const totalWeight = scaledSlotWeights.reduce((acc, w) => acc + w, BigInt(0));

  const slotAmounts: bigint[] = new Array(matchedSlots.length).fill(BigInt(0));

  if (matchedSlots.length > 0 && totalDepositRaw > BigInt(0) && totalWeight > BigInt(0)) {
    // Base proportional allocation
    const exactShares = scaledSlotWeights.map(
      (w) => (totalDepositRaw * w) / totalWeight
    );

    if (roundingMode === "clean") {
      // Round each slot down to clean step size while ensuring >= 1 base unit
      for (let i = 0; i < matchedSlots.length; i++) {
        const step = computeSlotStepUnit(exactShares[i], decimals);
        const rounded = (exactShares[i] / step) * step;
        slotAmounts[i] = rounded > BigInt(0) ? rounded : exactShares[i];
      }
      // Make sure every slot with identical tier gets the same clean base pack before remainder
      // and ensure all slots have >= 1 base unit
      let allocated = slotAmounts.reduce((a, b) => a + b, BigInt(0));
      let remainder = totalDepositRaw - allocated;

      if (remainder > BigInt(0)) {
        // First, try boosting slots evenly within tiers using step units if remainder allows
        for (let i = 0; i < matchedSlots.length && remainder > BigInt(0); i++) {
          if (slotAmounts[i] === BigInt(0)) {
            slotAmounts[i] = BigInt(1);
            remainder -= BigInt(1);
          }
        }
        // Put remaining dust into the highest-tier slot (index 0 since sorted tier 3 -> 0)
        slotAmounts[0] += remainder;
      }
      allocated = slotAmounts.reduce((a, b) => a + b, BigInt(0));
      if (allocated > totalDepositRaw) {
        // Safety fallback to exact
        roundingFallbackExact();
      }
    } else {
      roundingFallbackExact();
    }

    function roundingFallbackExact() {
      let allocated = BigInt(0);
      for (let i = 0; i < matchedSlots.length; i++) {
        slotAmounts[i] = exactShares[i] > BigInt(0) ? exactShares[i] : BigInt(1);
        allocated += slotAmounts[i];
      }
      const diff = totalDepositRaw - allocated;
      if (diff >= BigInt(0)) {
        slotAmounts[0] += diff;
      } else {
        // Trim excess from largest slot
        let excess = -diff;
        for (let i = 0; i < slotAmounts.length && excess > BigInt(0); i++) {
          const reducible = slotAmounts[i] - BigInt(1);
          if (reducible > BigInt(0)) {
            const take = reducible < excess ? reducible : excess;
            slotAmounts[i] -= take;
            excess -= take;
          }
        }
      }
    }
  }

  // Zero-pack guard
  if (totalDepositRaw >= BigInt(matchedSlots.length) && slotAmounts.some((a) => a <= BigInt(0))) {
    errors.push("One or more slots would receive 0 tokens. Increase deposit or reduce slots.");
  }

  // Coordinates
  const occupiedCoords = machine.slots
    .filter(
      (s) =>
        s.inStock &&
        !matchedSlots.some((m) => m.slotId === s.slotId)
    )
    .map((s) => ({ x: s.x, z: s.z }));

  const randomCoords = randomizeCoords
    ? generateRandomizedCoords(matchedSlots.length, occupiedCoords)
    : null;

  // Buyback calculation
  const parsedPriceUsd = Math.max(0, Number(tokenPriceUsd) || 0);
  const buybackBps =
    machine.buybackBps.length === 4
      ? machine.buybackBps
      : [9000, 9200, 9500, 9500];

  const allocations: PlannedSlotAllocation[] = matchedSlots
    .map((m, idx) => {
      const layout = defaultLayout[m.slotId];
      const coord = randomCoords
        ? randomCoords[idx]
        : { x: layout?.x ?? 500, z: layout?.z ?? 500 };

      const prizeAmountRaw = slotAmounts[idx] ?? BigInt(0);
      let fallbackBuybackUsdc = BigInt(0);

      if (buybackMode === "price_per_token") {
        const uiNumeric =
          Number(prizeAmountRaw) / Math.pow(10, Math.min(decimals, 12));
        const grossUsd = uiNumeric * parsedPriceUsd;
        const rate = (buybackBps[m.tier] ?? 9000) / 10_000;
        const microUsdc = Math.round(grossUsd * rate * 1_000_000);
        fallbackBuybackUsdc = BigInt(Math.max(0, microUsdc));
      } else {
        fallbackBuybackUsdc = toBaseUnits(
          manualTierBuybacksUsd[m.tier] || "0",
          6
        );
      }

      return {
        slotId: m.slotId,
        tier: m.tier,
        x: coord.x,
        z: coord.z,
        prizeAmountRaw,
        prizeAmountUi: formatBaseUnits(prizeAmountRaw, decimals),
        fallbackBuybackUsdc,
        fallbackBuybackUsdFormatted: (
          Number(fallbackBuybackUsdc) / 1_000_000
        ).toFixed(2),
        wasAlreadyInStock: m.wasAlreadyInStock,
      };
    })
    .sort((a, b) => a.slotId - b.slotId);

  const totalAllocatedRaw = allocations.reduce(
    (acc, a) => acc + a.prizeAmountRaw,
    BigInt(0)
  );

  // Build per-tier summary
  const tierSummaries: TierSummary[] = [0, 1, 2, 3].map((tier) => {
    const cfg = PRIZE_TIERS[tier];
    const items = allocations.filter((a) => a.tier === tier);
    const totalTierRaw = items.reduce((acc, a) => acc + a.prizeAmountRaw, BigInt(0));
    const minPack = items.reduce(
      (min, a) => (a.prizeAmountRaw < min ? a.prizeAmountRaw : min),
      items[0]?.prizeAmountRaw ?? BigInt(0)
    );
    const maxPack = items.reduce(
      (max, a) => (a.prizeAmountRaw > max ? a.prizeAmountRaw : max),
      BigInt(0)
    );
    const perSlotUi =
      items.length === 0
        ? "0"
        : minPack === maxPack
        ? formatBaseUnits(minPack, decimals)
        : `${formatBaseUnits(minPack, decimals)}–${formatBaseUnits(maxPack, decimals)}`;
    const avgBuyback =
      items.length === 0
        ? "0.00"
        : (
            items.reduce(
              (acc, a) => acc + Number(a.fallbackBuybackUsdc),
              0
            ) /
            items.length /
            1_000_000
          ).toFixed(2);

    return {
      tier,
      name: cfg.name,
      color: cfg.color,
      oddsLabel: cfg.oddsLabel,
      slotCount: items.length,
      perSlotUi,
      totalTierRaw,
      totalTierUi: formatBaseUnits(totalTierRaw, decimals),
      buybackUsdFormatted: avgBuyback,
    };
  });

  const batchSize = 5;
  const batchCount =
    allocations.length > 0 ? Math.ceil(allocations.length / batchSize) : 0;

  return {
    valid: errors.length === 0 && allocations.length > 0,
    errors,
    warnings,
    totalDepositRaw,
    totalAllocatedRaw,
    totalSlots: allocations.length,
    allocations,
    tierSummaries,
    batchCount,
  };
}
