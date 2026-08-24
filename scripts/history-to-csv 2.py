"""'2026 스터디 참여시간' xlsx 의 이벤트별 시간을 data/history.csv 로 변환.

각 (인원, 이벤트) 칸이 한 줄이 된다. 컬럼: name,event,date,hours
날짜는 이벤트 라벨에서 뽑고, 라벨에 날짜가 없는 이벤트는 UNDATED 표에서 찾는다.

실행:
  uvx --from openpyxl python scripts/history-to-csv.py <xlsx>
"""
import sys, csv, re, pathlib
import openpyxl

# 라벨에 날짜가 없는 이벤트의 대표 날짜. 시트의 시간은 기간 합계라
# 그 기간의 시작일에 몰아 넣는다.
UNDATED = {
    "2025-2": "2025-11-01",
    "겨울방학": "2026-01-15",
    "26-1 신입 1주차": "2026-03-05",
    "26-1 신입 2주차": "2026-03-12",
    "1주차 OT 회의 (5/8 ~ 5/11)": "2026-05-08",
    "세부팀장회의(6/23~)": "2026-06-23",
}

src = sys.argv[1]
ws = openpyxl.load_workbook(src, data_only=True)["총계"]
rows = list(ws.iter_rows(min_row=2, values_only=True))
hdr, data = rows[0], [r for r in rows[1:] if r[0]]

events = []
for i, h in enumerate(hdr):
    if i < 3 or h is None:
        continue
    label = str(h).strip()
    if label.startswith("Column "):   # 빈 자리 표시용 열
        continue
    m = re.match(r"^\s*(\d{1,2})[/.](\d{1,2})", label)
    if m:
        mo, d = int(m.group(1)), int(m.group(2))
        # 9~12월은 직전 연도(2025-2학기), 1~8월은 2026년.
        year = 2025 if mo >= 9 else 2026
        date = f"{year}-{mo:02d}-{d:02d}"
    elif label in UNDATED:
        date = UNDATED[label]
    else:
        print(f"  경고: 날짜를 알 수 없는 이벤트 건너뜀 — {label!r}", file=sys.stderr)
        continue
    events.append((i, label, date))

out = []
for r in data:
    name = str(r[0]).strip()
    for i, label, date in events:
        v = r[i]
        if isinstance(v, (int, float)) and v:
            out.append((name, label, date, f"{float(v):g}"))

pathlib.Path("data").mkdir(exist_ok=True)
with open("data/history.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["name", "event", "date", "hours"])
    w.writerows(out)

total = sum(float(h) for *_, h in out)
print(f"wrote data/history.csv: {len(out)} 행, {len(events)} 이벤트, 합계 {total:g}h")
