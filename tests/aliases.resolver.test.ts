import { describe, expect, it } from "vitest";
import { resolveSpeakerName } from "../src/aliases/resolver.js";

describe("resolveSpeakerName", () => {
  it("returns alias when mapping exists", () => {
    expect(
      resolveSpeakerName("Jan Kowalski", {
        "Jan Kowalski": "Jan",
      }),
    ).toBe("Jan");
  });

  it("falls back to original when alias does not exist", () => {
    expect(resolveSpeakerName("Anna Nowak", {})).toBe("Anna Nowak");
  });

  it("returns undefined when original is missing", () => {
    expect(resolveSpeakerName(undefined, {})).toBeUndefined();
  });
});
