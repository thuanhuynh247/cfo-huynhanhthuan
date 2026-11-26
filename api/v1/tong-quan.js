// GET /api/v1/tong-quan – chỉ số chính, tín hiệu rủi ro, độ mới số liệu
import { load, guard, send } from "../../lib/server.js";
import { summary, signals, todayVN } from "../../lib/core.js";

export default async function handler(req, res) {
  if (!guard(req, res)) return;
  const { raw, M } = await load();
  if (!M.last) return send(res, 503, { loi: "Chưa có số liệu tỷ giá trung tâm" });
  send(res, 200, { ngay_tinh: todayVN(), chi_so: summary(M, raw), tin_hieu: signals(M, raw) });
}
