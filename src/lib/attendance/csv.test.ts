import { describe, it, expect } from "vitest";
import { escapeCsvCell } from "@/lib/attendance/csv";

describe("escapeCsvCell", () => {
  it("returns a plain value unchanged", () => {
    expect(escapeCsvCell("홍길동")).toBe("홍길동");
  });

  it("quotes a value containing a comma", () => {
    expect(escapeCsvCell("a,b")).toBe('"a,b"');
  });

  it("doubles an internal double quote and wraps in quotes", () => {
    expect(escapeCsvCell('a"b')).toBe('"a""b"');
  });

  it("quotes a value containing a newline", () => {
    expect(escapeCsvCell("a\nb")).toBe('"a\nb"');
  });

  it("quotes a value containing a carriage return", () => {
    expect(escapeCsvCell("a\rb")).toBe('"a\rb"');
  });

  it("prefixes a value starting with = with a leading single quote", () => {
    expect(escapeCsvCell("=SUM(A1)")).toBe("'=SUM(A1)");
  });

  it("prefixes a value starting with + with a leading single quote", () => {
    expect(escapeCsvCell("+1234")).toBe("'+1234");
  });

  it("prefixes a value starting with - with a leading single quote", () => {
    expect(escapeCsvCell("-1234")).toBe("'-1234");
  });

  it("prefixes a value starting with @ with a leading single quote", () => {
    expect(escapeCsvCell("@cmd")).toBe("'@cmd");
  });
});
