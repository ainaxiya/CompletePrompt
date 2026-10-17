import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const PRESET_KEY = "tagPresets";

async function getPresets(): Promise<string[]> {
  const row = await db.siteSetting.findUnique({ where: { key: PRESET_KEY } });
  if (!row) return [];
  try {
    const arr = JSON.parse(row.value);
    return Array.isArray(arr) ? arr.filter((s) => typeof s === "string") : [];
  } catch {
    return [];
  }
}

async function savePresets(tags: string[]) {
  const value = JSON.stringify(tags);
  await db.siteSetting.upsert({
    where: { key: PRESET_KEY },
    update: { value },
    create: { key: PRESET_KEY, value },
  });
}

// GET：全站标签列表（使用中+预设），带提示词数量；支持分页/搜索/每页数量
export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1") || 1);
  const rawSize = parseInt(searchParams.get("pageSize") || "100") || 100;
  const pageSize = [50, 100, 200, 500].includes(rawSize) ? rawSize : 100;
  const q = (searchParams.get("q") || "").trim().toLowerCase();

  // 聚合所有提示词的 tags 及关联数量
  const rows = await db.prompt.findMany({ select: { tags: true } });
  const counts = new Map<string, number>();
  rows.forEach((r) => r.tags.forEach((t) => counts.set(t, (counts.get(t) || 0) + 1)));

  const presets = await getPresets();
  presets.forEach((t) => {
    if (!counts.has(t)) counts.set(t, 0);
  });

  let list = [...counts.entries()]
    .map(([name, count]) => ({ name, count, preset: presets.includes(name) }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh"));

  if (q) list = list.filter((t) => t.name.toLowerCase().includes(q));

  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const items = list.slice((page - 1) * pageSize, page * pageSize);

  return NextResponse.json({ items, total, totalPages, page, pageSize });
}

// POST：新增预设标签（0 使用量，便于发布时选用）
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const name = (body?.name || "").trim();
  if (!name) return NextResponse.json({ error: "标签名不能为空" }, { status: 400 });
  if (name.length > 30)
    return NextResponse.json({ error: "标签名最长 30 字符" }, { status: 400 });

  const presets = await getPresets();
  if (presets.includes(name))
    return NextResponse.json({ error: "标签已存在" }, { status: 409 });

  // 已在使用中的同名标签也算存在
  const inUse = await db.prompt.findFirst({ where: { tags: { has: name } }, select: { id: true } });
  if (inUse) return NextResponse.json({ error: "标签已存在（使用中）" }, { status: 409 });

  await savePresets([...presets, name]);
  return NextResponse.json({ ok: true, name });
}

// PATCH：重命名标签（合并到所有提示词）；支持批量 {items:[{from,to}]}
export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const items: { from: string; to: string }[] = Array.isArray(body?.items)
    ? body.items
    : body?.from && body?.to
      ? [{ from: body.from, to: body.to }]
      : [];
  if (!items.length) return NextResponse.json({ error: "参数不完整" }, { status: 400 });

  let affected = 0;
  const presets = await getPresets();
  let presetsChanged = false;

  for (const { from: rawFrom, to: rawTo } of items) {
    const from = (rawFrom || "").trim();
    const to = (rawTo || "").trim();
    if (!from || !to || from === to) continue;

    const rows = await db.prompt.findMany({
      where: { tags: { has: from } },
      select: { id: true, tags: true },
    });
    await db.$transaction(
      rows.map((p) =>
        db.prompt.update({
          where: { id: p.id },
          data: { tags: p.tags.map((t) => (t === from ? to : t)) },
        })
      )
    );
    affected += rows.length;

    const pi = presets.indexOf(from);
    if (pi >= 0) {
      presets[pi] = to;
      presetsChanged = true;
    }
  }
  if (presetsChanged) await savePresets(presets);

  return NextResponse.json({ ok: true, affected });
}

// DELETE：从所有提示词中移除标签；支持批量 ?names=a,b,c
export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const names = (searchParams.get("names") || searchParams.get("name") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!names.length) return NextResponse.json({ error: "参数不完整" }, { status: 400 });

  let affected = 0;
  for (const name of names) {
    const rows = await db.prompt.findMany({
      where: { tags: { has: name } },
      select: { id: true, tags: true },
    });
    await db.$transaction(
      rows.map((p) =>
        db.prompt.update({
          where: { id: p.id },
          data: { tags: p.tags.filter((t) => t !== name) },
        })
      )
    );
    affected += rows.length;
  }

  const presets = await getPresets();
  const remain = presets.filter((t) => !names.includes(t));
  if (remain.length !== presets.length) await savePresets(remain);

  return NextResponse.json({ ok: true, affected, removed: names.length });
}
