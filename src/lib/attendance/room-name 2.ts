import { listRooms } from "@/lib/db/queries";

/**
 * 세션이 속한 방 이름을 `rooms` 테이블(단일 진실 소스, 관리자 개명 반영)에서 조회한다.
 * 매칭되는 방이 없으면 "동방"으로 대체한다.
 */
export function resolveRoomName(roomId: number): string {
  const room = listRooms().find((r) => r.id === roomId);
  return room?.name ?? "동방";
}
