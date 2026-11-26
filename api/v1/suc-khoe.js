// GET /api/v1/suc-khoe – lần cào gần nhất, trạng thái từng nguồn, độ mới giá ngân hàng
import { load, guard, send, lastDate } from "../../lib/server.js";

export default async function handler(req, res) {
  if (!guard(req, res)) return;
  const { raw, t } = await load();
  const h = raw.health || {};
  const loi = Object.values(h.sources || {}).filter((s) => s.trang_thai === "loi").length;
  send(res, 200, {
    trang_thai: loi ? "co_loi" : "on",
    nhnn: { lan_chay: h.lan_chay || null, may_chay: h.may_chay || null, nguon: h.sources || {} },
    ngan_hang: { ngay_moi_nhat: lastDate(t.gia_usd_ngan_hang), cap_nhat_luc: raw.live?.timestamp || null, cao_thang: raw.live?.cao_thang || [], so_ngan_hang: Object.keys(raw.live?.banks || {}).length },
  }, { maxAge: 300 });
}
