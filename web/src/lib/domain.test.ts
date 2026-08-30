import { describe, expect, it } from "vitest"
import { durationMinutes, formatDuration, roundDuration } from "./domain"

describe("time calculations", () => {
  it("rounds a completed session to the nearest 15 minutes", () => {
    expect(roundDuration(487, 15, "nearest")).toBe(480)
    expect(roundDuration(488, 15, "nearest")).toBe(495)
  })

  it("supports always-up and always-down policies", () => {
    expect(roundDuration(481, 15, "up")).toBe(495)
    expect(roundDuration(494, 15, "down")).toBe(480)
  })

  it("never produces a negative duration", () => {
    expect(durationMinutes("2026-08-30T10:00:00Z", "2026-08-30T09:00:00Z")).toBe(0)
  })

  it("formats totals for reports", () => {
    expect(formatDuration(495)).toBe("8h 15m")
  })
})
