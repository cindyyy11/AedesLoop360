import { test, expect } from "@playwright/test";
import { WINDOW, summarise } from "../components/egg-preview-stats";

test("no estimates gives no summary", () => {
  expect(summarise([])).toBeNull();
});

test("median and range use only the last window", () => {
  const s = summarise([200, 200, 10, 12, 11, 13, 12])!;
  expect(s.n).toBe(WINDOW);
  expect([s.median, s.min, s.max]).toEqual([12, 10, 13]);
});

test("settled needs a full window and a narrow spread", () => {
  expect(summarise([20, 21, 20])!.settled).toBe(false); // too few frames
  expect(summarise([20, 21, 22, 21, 20])!.settled).toBe(true);
  expect(summarise([10, 30, 12, 28, 11])!.settled).toBe(false); // jumping around
  expect(summarise([100, 108, 95, 104, 99])!.settled).toBe(true); // 15% tolerance on larger counts
});

test("even-length windows round the median", () => {
  expect(summarise([4, 7])!.median).toBe(6);
});
