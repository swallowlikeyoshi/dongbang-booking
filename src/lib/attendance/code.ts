import { createHmac } from "node:crypto";

export const SLOT_SECONDS = 60;
export const CODE_LENGTH = 6;

/** Crockford base32 — I/L/O/U 제외. 손으로 옮겨 적을 때 헷갈리지 않게. */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export type Device = { roomId: number; secret: string };
export type Match = { roomId: number; slot: number };

export function slotNumber(ts: number): number {
  return Math.floor(ts / SLOT_SECONDS);
}

export function codeForSlot(secret: string, slot: number): string {
  const mac = createHmac("sha256", secret).update(String(slot)).digest();
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += ALPHABET[mac[i] % ALPHABET.length];
  }
  return out;
}

/**
 * 현재 슬롯과 직전 슬롯을 장비 전체에 대조한다.
 * 카메라를 조준하는 사이 코드가 바뀌어 실패하는 것을 막기 위해 두 슬롯을 인정한다.
 */
export function verifyCode(code: string, ts: number, devices: Device[]): Match | null {
  const normalized = code.trim().toUpperCase();
  if (normalized.length !== CODE_LENGTH) return null;
  const now = slotNumber(ts);
  for (const slot of [now, now - 1]) {
    for (const d of devices) {
      if (codeForSlot(d.secret, slot) === normalized) return { roomId: d.roomId, slot };
    }
  }
  return null;
}

/**
 * `ATTENDANCE_DEVICE_SECRETS` 환경변수에서 장비 목록을 읽는다.
 * 형식: `1:시크릿1,2:시크릿2`
 */
export function loadDevices(): Device[] {
  const raw = process.env.ATTENDANCE_DEVICE_SECRETS;
  if (!raw) return [];
  return raw
    .split(",")
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const idx = pair.indexOf(":");
      return { roomId: Number(pair.slice(0, idx)), secret: pair.slice(idx + 1) };
    })
    .filter((d) => Number.isFinite(d.roomId) && d.secret.length > 0);
}
