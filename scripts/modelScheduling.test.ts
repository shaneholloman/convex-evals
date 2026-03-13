import { describe, expect, it } from "vitest";
import {
  computeTargetIntervalMs,
  getSchedulingDecision,
} from "./modelScheduling.js";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("computeTargetIntervalMs", () => {
  it("returns the minimum interval when first-seen is missing", () => {
    expect(computeTargetIntervalMs(null, 1_000_000)).toBe(DAY_MS);
  });

  it("returns the minimum interval for a brand new model", () => {
    const now = 31 * DAY_MS;
    expect(computeTargetIntervalMs(now, now)).toBe(DAY_MS);
  });

  it("linearly interpolates interval for a mid-age model", () => {
    const now = 30 * DAY_MS;
    const firstSeen = 15 * DAY_MS;
    expect(computeTargetIntervalMs(firstSeen, now)).toBe(15.5 * DAY_MS);
  });

  it("caps the interval at thirty days for older models", () => {
    const now = 100 * DAY_MS;
    expect(computeTargetIntervalMs(0, now)).toBe(30 * DAY_MS);
  });
});

describe("getSchedulingDecision", () => {
  it("marks models with no runs as due immediately", () => {
    const decision = getSchedulingDecision(null, 10 * DAY_MS, 20 * DAY_MS);
    expect(decision.isDue).toBe(true);
  });

  it("marks a model due when the elapsed time meets the target interval", () => {
    const now = 30 * DAY_MS;
    const firstSeen = 15 * DAY_MS;
    const targetIntervalMs = 15.5 * DAY_MS;
    const decision = getSchedulingDecision(now - targetIntervalMs, firstSeen, now);
    expect(decision.targetIntervalMs).toBe(targetIntervalMs);
    expect(decision.isDue).toBe(true);
  });

  it("marks a model not due when the elapsed time is below the target interval", () => {
    const now = 30 * DAY_MS;
    const firstSeen = 15 * DAY_MS;
    const targetIntervalMs = 15.5 * DAY_MS;
    const decision = getSchedulingDecision(now - targetIntervalMs + 1, firstSeen, now);
    expect(decision.isDue).toBe(false);
  });
});
