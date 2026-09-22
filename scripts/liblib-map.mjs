// LibLib 快照节点提取 + 提示词分段映射（确定性对应）
// 节点来源：community template detail 的 snapshotData
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const CACHE_DIR = path.join(__dirname, "..", "data", "liblib", "nodes");

export function normText(s) {
  return String(s || "").replace(/\s+/g, "").toLowerCase();
}

// 0..1：a（正文分段）与 b（节点 prompt）相似度；正文可能截断/带前后缀
export function promptSim(a, b) {
  const x = normText(a);
  const y = normText(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const long = x.length >= y.length ? x : y;
  const short = x.length >= y.length ? y : x;
  if (long.includes(short)) return short.length / long.length; // 截断文本
  // 字符 bigram Jaccard
  const bg = (s) => {
    const set = new Set();
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
    return set;
  };
  const A = bg(x), B = bg(y);
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return inter / (A.size + B.size - inter);
}

function safeParse(v) {
  if (v == null) return null;
  if (typeof v === "object") return v;
  try { return JSON.parse(v); } catch { return null; }
}

// 从 snapshotData（字符串或对象）提取有媒体产物的节点
export function extractNodes(snapshotData) {
  const snap = typeof snapshotData === "string" ? JSON.parse(snapshotData) : snapshotData;
  const out = [];
  for (const n of snap.nodes || []) {
    const d = n.data || {};
    const urls = Array.isArray(d.url) ? d.url.filter(Boolean) : [];
    if (urls.length === 0) continue;
    const params = safeParse(d.params) || {};
    out.push({
      nodeId: n.id,
      kind: n.type, // image / video / audio
      action: d.action || "",
      name: String(d.name || "").trim(),
      urls,
      width: d.contentWidth || n.width || null,
      height: d.contentHeight || n.height || null,
      prompt: typeof params.prompt === "string" ? params.prompt : "",
      model: params.model || "",
      createdAtMs: n.createdAtMs || d._updatedAtMs || 0,
    });
  }
  return out;
}

const stripCopy = (s) => s.replace(/\s*-\s*副本(\s*\d*)*$/g, "").trim();

// 解析分段首行：返回 {kind, name}
// 例：图片生成｜nebula-ultra｜image2image｜ratio=16:9 quality=2K｜图片节点 12
export function parseLabel(labelLine) {
  const parts = labelLine.split("｜").map((s) => s.trim()).filter(Boolean);
  const head = parts[0] || "";
  const tail = parts[parts.length - 1] || "";
  let kind = null;
  if (/^图片/.test(head)) kind = "image";
  else if (/^视频/.test(head)) kind = "video";
  else if (/^音频/.test(head)) kind = "audio";
  return { kind, head, tail };
}

// 从分段正文提取用于比对的提示词
export function extractSectionPrompt(body) {
  let t = String(body || "");
  const zh = t.match(/中文提示词[：:]\s*([\s\S]*?)(?=英文提示词[：:]|提示词英文版|$)/);
  if (zh && zh[1].trim()) t = zh[1];
  // 去掉用途/参数等前缀行
  t = t.replace(/^\s*用途[：:][^\n]*\n?/m, "");
  return t.trim();
}

const PROMPT_HIT = 0.55; // 单段判定命中阈值
const PROMPT_ASSIGN = 0.3; // 同名副本组内全局指派的最低阈值

// 为每个分段匹配节点
// sections: [{index, label, body}]；nodes: extractNodes()
// 返回 Map<sectionIndex, {node, score, via}>  + 统计
export function mapSections(sections, nodes) {
  const result = new Map();
  const stats = { exactUnique: 0, exactPrompt: 0, normUnique: 0, normPrompt: 0, assigned: 0, promptOnly: 0, ambiguous: 0, textNode: 0, none: 0 };
  const ambigu = [];

  // 第一步：为每个分段找候选集
  const candidates = (sec) => {
    const { kind, tail } = parseLabel(sec.label);
    const pool = kind ? nodes.filter((n) => n.kind === kind) : nodes;
    let cands = pool.filter((n) => n.name === tail);
    let via = "exact";
    if (cands.length === 0) {
      const base = stripCopy(tail);
      cands = pool.filter((n) => stripCopy(n.name) === base);
      via = "stripCopy";
    }
    if (cands.length === 0) {
      // 图片35 / 视频19-片段重拍 → 图片节点 35 / 视频19
      const m = tail.match(/^(图片|视频|音频)\s*(\d+)(?:\s*[-－].*)?$/);
      if (m) {
        const k = m[1] === "图片" ? "image" : m[1] === "视频" ? "video" : "audio";
        cands = (kind ? pool : nodes.filter((n) => n.kind === k)).filter((n) => {
          const mm = n.name.match(/^(?:图片|视频|音频)\s*(?:节点\s*)?(\d+)(?:\s*[-－].*)?$/);
          return mm && mm[1] === m[2];
        });
        via = "bareCn";
      }
    }
    if (cands.length === 0 && /^\d+$/.test(tail) && kind) {
      cands = pool.filter((n) => {
        const mm = n.name.match(/(?:图片|视频|音频)节点\s*(\d+)/);
        return mm && mm[1] === tail;
      });
      via = "bareNum";
    }
    return { cands, via, kind, tail };
  };

  // 文本节点：画布中无媒体产物
  const isTextLabel = (sec) => /^文本节点/.test(parseLabel(sec.label).tail);

  // 分组：相同候选「键」的分段一起做全局指派（处理 N 个 - 副本）
  const groups = new Map();
  for (const sec of sections) {
    if (isTextLabel(sec)) { stats.textNode++; continue; }
    const { cands, via, tail } = candidates(sec);
    if (cands.length === 0) {
      // 全局 prompt 兜底（自定义命名的生成节点）
      const { kind } = parseLabel(sec.label);
      const sp = extractSectionPrompt(sec.body);
      if (kind && sp) {
        let best = null;
        for (const n of nodes.filter((x) => x.kind === kind && x.prompt)) {
          const score = promptSim(sp, n.prompt);
          if (!best || score > best.score) best = { node: n, score };
        }
        if (best && best.score >= 0.8) {
          result.set(sec.index, { ...best, via: "promptOnly" });
          stats.promptOnly++;
          continue;
        }
      }
      stats.none++;
      continue;
    }
    const key = cands.map((c) => c.nodeId).sort().join("|") + "#" + via;
    if (!groups.has(key)) groups.set(key, { cands, via, tail, secs: [] });
    groups.get(key).secs.push(sec);
  }

  for (const g of groups.values()) {
    const spOf = (sec) => extractSectionPrompt(sec.body);
    const scored = g.secs.map((sec) => {
      const sp = spOf(sec);
      const rows = g.cands.map((node) => ({ node, score: node.prompt ? promptSim(sp, node.prompt) : 0 }));
      rows.sort((a, b) => b.score - a.score);
      return { sec, rows };
    });

    if (g.cands.length === 1) {
      for (const { sec } of scored) {
        result.set(sec.index, { node: g.cands[0], score: 1, via: g.via === "exact" ? "exactUnique" : "normUnique" });
        stats[g.via === "exact" ? "exactUnique" : "normUnique"]++;
      }
      continue;
    }

    // 多副本：全局贪心 1:1 指派（按最高相似度降序，节点不重复，用完后允许复用）
    const used = new Set();
    scored.sort((a, b) => b.rows[0].score - a.rows[0].score);
    const assignedRows = [];
    for (const item of scored) {
      let pick = item.rows.find((r) => !used.has(r.node.nodeId) && r.score >= PROMPT_ASSIGN);
      let reused = false;
      if (!pick) pick = item.rows.find((r) => !used.has(r.node.nodeId));
      if (!pick) { pick = item.rows[0]; reused = true; }
      if (!pick) continue;
      used.add(pick.node.nodeId);
      assignedRows.push({ sec: item.sec, ...pick, reused });
    }
    // 恢复正文顺序输出
    for (const row of assignedRows) {
      if (row.score >= PROMPT_HIT) {
        result.set(row.sec.index, { node: row.node, score: row.score, via: g.via + "+prompt" });
        stats.exactPrompt++;
      } else if (row.score >= PROMPT_ASSIGN) {
        result.set(row.sec.index, { node: row.node, score: row.score, via: "assigned" });
        stats.assigned++;
      } else {
        stats.ambiguous++;
        ambigu.push({ sec: row.sec.index, label: g.tail, score: +row.score.toFixed(2) });
      }
    }
  }
  return { result, stats, ambigu };
}

export function cachePath(templateUuid) {
  return path.join(CACHE_DIR, `${templateUuid}.json`);
}
export function loadCachedNodes(templateUuid) {
  const p = cachePath(templateUuid);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, "utf8")).nodes; } catch { return null; }
}
export function saveCachedNodes(templateUuid, nodes, meta = {}) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(cachePath(templateUuid), JSON.stringify({ cachedAt: Date.now(), ...meta, nodes }));
}
