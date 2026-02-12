import { describe, it, expect } from "vitest";
import {
  getEnforcementTier,
  applyDiminishingReturns,
  isNewNodeGracePeriod,
} from "./credit.js";

describe("receipts/credit", () => {
  describe("getEnforcementTier", () => {
    const config = { tierThrottledBalance: -50, tierCutoffBalance: -200 };

    it("returns full for positive balance", () => {
      expect(getEnforcementTier(10, config)).toBe("full");
    });

    it("returns deprioritized for zero balance", () => {
      expect(getEnforcementTier(0, config)).toBe("deprioritized");
    });

    it("returns deprioritized for slightly negative", () => {
      expect(getEnforcementTier(-10, config)).toBe("deprioritized");
    });

    it("returns throttled at -50", () => {
      expect(getEnforcementTier(-50, config)).toBe("throttled");
    });

    it("returns throttled between -50 and -200", () => {
      expect(getEnforcementTier(-100, config)).toBe("throttled");
    });

    it("returns cutoff at -200", () => {
      expect(getEnforcementTier(-200, config)).toBe("cutoff");
    });

    it("returns cutoff below -200", () => {
      expect(getEnforcementTier(-500, config)).toBe("cutoff");
    });
  });

  describe("applyDiminishingReturns", () => {
    it("returns full credit under threshold", () => {
      expect(applyDiminishingReturns(1, 50, 100)).toBe(1);
    });

    it("reduces credit beyond threshold", () => {
      const result = applyDiminishingReturns(1, 150, 100);
      expect(result).toBe(0.5);
    });

    it("reduces further at higher counts", () => {
      const r1 = applyDiminishingReturns(1, 250, 100);
      const r2 = applyDiminishingReturns(1, 350, 100);
      expect(r1).toBe(0.25);
      expect(r2).toBe(0.125);
    });
  });

  describe("isNewNodeGracePeriod", () => {
    it("true for recently created node", () => {
      expect(isNewNodeGracePeriod(Date.now() - 1000)).toBe(true);
    });

    it("false for old node", () => {
      expect(isNewNodeGracePeriod(Date.now() - 48 * 60 * 60 * 1000)).toBe(
        false
      );
    });
  });
});
