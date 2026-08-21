import { describe, it, expect } from "vitest";
import { validateClaimInput, isValidStudentNo } from "@/lib/attendance/claim-validation";
import { SUB_TEAMS } from "@/lib/constants";

describe("isValidStudentNo", () => {
  it("accepts a well-formed 10-digit ID", () => {
    expect(isValidStudentNo("2025312077")).toBe(true);
  });

  it("rejects 9 digits", () => {
    expect(isValidStudentNo("202531207")).toBe(false);
  });

  it("rejects 11 digits", () => {
    expect(isValidStudentNo("20253120771")).toBe(false);
  });

  it("rejects non-digit characters", () => {
    expect(isValidStudentNo("202531207a")).toBe(false);
  });

  it("rejects a non-string value", () => {
    expect(isValidStudentNo(2025312077)).toBe(false);
    expect(isValidStudentNo(null)).toBe(false);
    expect(isValidStudentNo(undefined)).toBe(false);
  });
});

describe("validateClaimInput", () => {
  it("passes with a well-formed studentNo only", () => {
    const r = validateClaimInput({ studentNo: "2025312077" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.studentNo).toBe("2025312077");
  });

  it("fails a subTeam outside SUB_TEAMS", () => {
    const r = validateClaimInput({ studentNo: "2025312077", name: "홍길동", subTeam: "없는팀" });
    expect(r.ok).toBe(false);
  });

  it("passes for each of the four valid SUB_TEAMS values", () => {
    for (const t of SUB_TEAMS) {
      const r = validateClaimInput({ studentNo: "2025312077", name: "홍길동", subTeam: t });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.subTeam).toBe(t);
    }
  });

  it("fails an empty name", () => {
    const r = validateClaimInput({ studentNo: "2025312077", name: "" });
    expect(r.ok).toBe(false);
  });

  it("fails a whitespace-only name", () => {
    const r = validateClaimInput({ studentNo: "2025312077", name: "   " });
    expect(r.ok).toBe(false);
  });

  it("fails a 21-character name", () => {
    const r = validateClaimInput({ studentNo: "2025312077", name: "a".repeat(21) });
    expect(r.ok).toBe(false);
  });

  it("passes a 20-character name", () => {
    const r = validateClaimInput({ studentNo: "2025312077", name: "a".repeat(20) });
    expect(r.ok).toBe(true);
  });
});
