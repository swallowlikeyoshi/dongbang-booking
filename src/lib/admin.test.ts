import { expect, test, describe, beforeEach, afterEach } from "vitest";
import { isAdmin } from "./admin";

describe("isAdmin", () => {
  const original = process.env.ADMIN_EMAIL;
  beforeEach(() => { process.env.ADMIN_EMAIL = " Boss@Example.com , dev@heven.io "; });
  afterEach(() => { process.env.ADMIN_EMAIL = original; });

  test("목록에 있으면 true (공백/대소문자 무시)", () => {
    expect(isAdmin("boss@example.com")).toBe(true);
    expect(isAdmin("dev@heven.io")).toBe(true);
  });
  test("목록에 없으면 false", () => {
    expect(isAdmin("random@gmail.com")).toBe(false);
  });
  test("null/undefined는 false", () => {
    expect(isAdmin(null)).toBe(false);
    expect(isAdmin(undefined)).toBe(false);
  });
  test("ADMIN_EMAIL 미설정 시 항상 false", () => {
    delete process.env.ADMIN_EMAIL;
    expect(isAdmin("boss@example.com")).toBe(false);
  });
});
