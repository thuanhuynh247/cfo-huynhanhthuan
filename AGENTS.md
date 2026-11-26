# AGENTS.md – CFO Terminal (cfo.huynhanhthuan.com)

Điểm vào cho mọi trợ lý lập trình (Claude Code, Codex, Cursor, Kiro…).

## Đọc skill nào

| Việc | Skill |
|---|---|
| Thêm lệnh, sửa giao diện, thêm/sửa khái niệm và chỉ số, kiểm thử, triển khai | [`skills/cfo-terminal/`](./skills/cfo-terminal/SKILL.md) |
| Thiết kế khái niệm, quan hệ, chỉ số, đơn vị, độ hạt; xác nhận và phát hành | [`skills/nvidia-ontology-management/`](./skills/nvidia-ontology-management/SKILL.md) → `references/modeling.md`, `references/publication.md` |
| Kiểm câu trả lời: ý định, SQL, dòng dữ liệu, cắt bớt, lời văn | [`skills/nvidia-ontology-query/`](./skills/nvidia-ontology-query/SKILL.md) → `references/query-validation.md` |
| Dựng NVIDIA Auto Ontology thật (Docker/Helm) để nhập `ontology/cfo.ossie.yaml` | [`skills/nvidia-ontology-setup/`](./skills/nvidia-ontology-setup/SKILL.md) |

Ba skill `nvidia-ontology-*` chép nguyên bản từ https://github.com/NVIDIA/auto-ontology (Apache-2.0,
commit ghi trong `skills/NVIDIA_SOURCE_COMMIT`), kèm chữ ký `skill.oms.sig`: **không sửa** các tệp đó;
điều chỉnh cho dự án này viết ở `skills/cfo-terminal/`. `.claude/skills/` là bản sao để Claude Code tự nạp.

## Sáu câu hỏi mọi con số phải trả lời được

Nghĩa là gì · Nằm ở đâu · Nối với gì · Tính thế nào · Từ đâu ra · Có dùng được không.
Tất cả nằm trong `ontology/build_ontology.py`. Không sửa tay `assets/ontology.json` hay `ontology/cfo.ossie.yaml`.

## Cổng kiểm trước khi commit

```bash
python ontology/build_ontology.py      # sinh lại ontology
python scripts/validate_ontology.py    # mọi chỉ số chạy được trên số liệu thật (data/)
node scripts/test_api.mjs              # API /api/v1/* chạy đúng trên số liệu thật
python scripts/smoke_test.py           # trình duyệt thật, desktop + điện thoại, AI giả lập
```

## Dữ liệu

`data/` do bot ghi (workflow `cap-nhat-du-lieu.yml`). Không sửa tay. Muốn cào thử trên máy:
`pip install -r requirements.txt && python crawler/sbv.py && python crawler/ngan_hang.py`.
NHNN chặn khi gọi dồn dập: không giảm `RADAR_PACE_S` dưới 20 giây, không tăng `RADAR_MAX_CALLS` quá 4.
