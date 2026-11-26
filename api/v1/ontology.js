// GET /api/v1/ontology – ontology dạng JSON (bản YAML Ossie: /ontology/cfo.ossie.yaml trong kho)
import { load, guard, send } from "../../lib/server.js";

export default async function handler(req, res) {
  if (!guard(req, res)) return;
  const { ont } = await load();
  ont ? send(res, 200, ont, { maxAge: 86400 }) : send(res, 503, { loi: "Thiếu assets/ontology.json" });
}
