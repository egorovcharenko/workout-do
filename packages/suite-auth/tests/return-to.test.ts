import { afterEach, describe, expect, it, vi } from "vitest";
import { isAllowedSuiteReturnTo } from "../src/index";

afterEach(() => vi.unstubAllEnvs());

describe("suite return URLs", () => {
  it("accepts only the owned production app origins", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(
      isAllowedSuiteReturnTo("https://workouts.egorovcharenko.com/session"),
    ).toBe(true);
    expect(
      isAllowedSuiteReturnTo("https://workouts.egorovcharenko.com.evil.test/"),
    ).toBe(false);
    expect(isAllowedSuiteReturnTo("https://evil.test/")).toBe(false);
  });

  it("allows suite localhost ports during development", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(isAllowedSuiteReturnTo("http://localhost:3004/")).toBe(true);
    expect(isAllowedSuiteReturnTo("http://127.0.0.1:3005/")).toBe(true);
    expect(isAllowedSuiteReturnTo("http://localhost.evil.test:3000/")).toBe(false);
  });
});
