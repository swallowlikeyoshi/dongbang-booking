import { describe, it, expect } from "vitest";
import { validateSettingInput } from "@/lib/attendance/settings-validation";

describe("validateSettingInput", () => {
  it("accepts an allowed key with a numeric value", () => {
    expect(validateSettingInput({ key: "weekly_cap_hours", value: "10" })).toEqual({
      ok: true,
      key: "weekly_cap_hours",
      value: "10",
    });
  });

  it("accepts the other allowed key", () => {
    expect(validateSettingInput({ key: "entry_quota", value: "5" })).toEqual({
      ok: true,
      key: "entry_quota",
      value: "5",
    });
  });

  it("accepts an empty value (clears the setting)", () => {
    expect(validateSettingInput({ key: "weekly_cap_hours", value: "" })).toEqual({
      ok: true,
      key: "weekly_cap_hours",
      value: "",
    });
  });

  it("trims whitespace from the value", () => {
    expect(validateSettingInput({ key: "weekly_cap_hours", value: "  12  " })).toEqual({
      ok: true,
      key: "weekly_cap_hours",
      value: "12",
    });
  });

  it("rejects an unknown key", () => {
    const r = validateSettingInput({ key: "not_a_real_key", value: "10" });
    expect(r).toEqual({ ok: false, error: "알 수 없는 설정" });
  });

  it("rejects a missing key", () => {
    const r = validateSettingInput({ value: "10" });
    expect(r.ok).toBe(false);
  });

  it("rejects a non-numeric value", () => {
    const r = validateSettingInput({ key: "entry_quota", value: "abc" });
    expect(r).toEqual({ ok: false, error: "숫자를 입력해주세요." });
  });

  it("rejects a null body", () => {
    const r = validateSettingInput(null);
    expect(r.ok).toBe(false);
  });
});
