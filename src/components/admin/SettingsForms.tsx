"use client";

import { useEffect, useState } from "react";

function useSettings() {
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    fetch("/api/admin/settings").then((r) => r.json()).then(setData);
  }, []);
  return data;
}

function SaveBar({ section, value, onSaved }: { section: string; value: any; onSaved?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const save = async () => {
    setBusy(true);
    const r = await fetch("/api/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section, value }),
    });
    setBusy(false);
    if (r.ok) {
      setOk(true);
      onSaved?.();
      setTimeout(() => setOk(false), 2000);
    } else alert("保存失败");
  };
  return (
    <div className="mt-6">
      <button onClick={save} disabled={busy}
        className="rounded-lg bg-emerald-500 px-6 py-2 text-sm font-medium text-zinc-950 hover:bg-emerald-400 disabled:opacity-50">
        {busy ? "保存中…" : "保存设置"}
      </button>
      {ok && <span className="ml-3 text-sm text-emerald-400">已保存 ✓</span>}
    </div>
  );
}

const inputCls = "w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-emerald-500";
const labelCls = "mb-1 block text-sm text-zinc-400";
const cardCls = "rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 mb-4";

export function BasicForm() {
  const all = useSettings();
  const [f, setF] = useState<any>(null);
  useEffect(() => { if (all) setF({ ...all.basic }); }, [all]);
  if (!f) return <p className="py-10 text-center text-zinc-500">加载中…</p>;
  const set = (k: string, v: any) => setF({ ...f, [k]: v });

  return (
    <div className="max-w-2xl">
      <div className={cardCls}>
        <label className={labelCls}>网站名称</label>
        <input value={f.siteName} onChange={(e) => set("siteName", e.target.value)} className={`${inputCls} mb-4`} />
        <label className={labelCls}>网站描述（SEO description）</label>
        <textarea value={f.siteDescription} rows={3} onChange={(e) => set("siteDescription", e.target.value)}
          className={`${inputCls} mb-4`} />
        <label className={labelCls}>页脚文字</label>
        <input value={f.footerText} onChange={(e) => set("footerText", e.target.value)} className={`${inputCls} mb-4`} />
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input type="checkbox" checked={!!f.allowRegister} onChange={(e) => set("allowRegister", e.target.checked)} />
          开放新用户注册（关闭后注册接口与注册页均不可用）
        </label>
      </div>
      <SaveBar section="basic" value={f} />
    </div>
  );
}

export function PublishForm() {
  const all = useSettings();
  const [f, setF] = useState<any>(null);
  useEffect(() => { if (all) setF({ ...all.publish }); }, [all]);
  if (!f) return <p className="py-10 text-center text-zinc-500">加载中…</p>;
  const set = (k: string, v: any) => setF({ ...f, [k]: v });
  const num = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    set(k, Math.max(0, parseInt(e.target.value) || 0));

  return (
    <div className="max-w-2xl">
      <div className={cardCls}>
        <label className={labelCls}>发布模式</label>
        <select value={f.mode} onChange={(e) => set("mode", e.target.value)} className={`${inputCls} mb-2`}>
          <option value="auto">发布即上线（免审核）</option>
          <option value="review">先审核后上线（进入待审核队列）</option>
        </select>
        <p className="text-xs text-zinc-500">切换为审核模式后，用户新发布的内容需在「提示词管理」中通过后才公开。</p>
      </div>

      <div className={cardCls}>
        <h3 className="mb-3 text-sm font-medium text-zinc-300">上传与转载</h3>
        <label className="mb-3 flex items-center gap-2 text-sm text-zinc-300">
          <input type="checkbox" checked={!!f.allowUpload} onChange={(e) => set("allowUpload", e.target.checked)} />
          允许本地上传图片/视频
        </label>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={labelCls}>图片上限 MB</label>
            <input type="number" value={f.maxImageMB} onChange={num("maxImageMB")} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>视频上限 MB</label>
            <input type="number" value={f.maxVideoMB} onChange={num("maxVideoMB")} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>每条媒体数</label>
            <input type="number" value={f.maxMediaPerPrompt} onChange={num("maxMediaPerPrompt")} className={inputCls} />
          </div>
        </div>
      </div>

      <div className={cardCls}>
        <label className={labelCls}>内容最大长度（字符）</label>
        <input type="number" value={f.maxContentLen} onChange={num("maxContentLen")} className={inputCls} />
      </div>

      <SaveBar section="publish" value={f} />
    </div>
  );
}

type Tier = { level: string; price: number; name: { zh: string; en: string }; features: { zh: string; en: string } };

export function MembershipForm() {
  const all = useSettings();
  const [tiers, setTiers] = useState<Tier[]>([]);
  useEffect(() => { if (all) setTiers(all.membership.tiers.map((x: any) => structuredClone(x))); }, [all]);
  if (tiers.length === 0) return <p className="py-10 text-center text-zinc-500">加载中…</p>;

  const update = (i: number, patch: Partial<Tier>) =>
    setTiers(tiers.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  const add = () =>
    setTiers([
      ...tiers,
      { level: "tier" + Date.now(), price: 0, name: { zh: "新等级", en: "New" }, features: { zh: "", en: "" } },
    ]);
  const remove = (i: number) => {
    if (!confirm("删除该会员等级？")) return;
    setTiers(tiers.filter((_, idx) => idx !== i));
  };

  return (
    <div className="max-w-3xl">
      <p className="mb-4 text-sm text-zinc-500">
        level 为系统标识（free 为默认免费等级，授予用户时使用）；价格单位：元/月。删除等级不影响已授予用户，但建议保留 free。
      </p>
      {tiers.map((tier, i) => (
        <div key={i} className={cardCls}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>level 标识</label>
              <input value={tier.level} disabled={tier.level === "free"}
                onChange={(e) => update(i, { level: e.target.value })} className={`${inputCls} disabled:opacity-50`} />
            </div>
            <div>
              <label className={labelCls}>价格（元/月）</label>
              <input type="number" value={tier.price}
                onChange={(e) => update(i, { price: parseInt(e.target.value) || 0 })} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>中文名</label>
              <input value={tier.name.zh} onChange={(e) => update(i, { name: { ...tier.name, zh: e.target.value } })}
                className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>英文名</label>
              <input value={tier.name.en} onChange={(e) => update(i, { name: { ...tier.name, en: e.target.value } })}
                className={inputCls} />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>权益说明（中文）</label>
              <input value={tier.features.zh} onChange={(e) => update(i, { features: { ...tier.features, zh: e.target.value } })}
                className={inputCls} />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Features (English)</label>
              <input value={tier.features.en} onChange={(e) => update(i, { features: { ...tier.features, en: e.target.value } })}
                className={inputCls} />
            </div>
          </div>
          {tier.level !== "free" && (
            <button onClick={() => remove(i)} className="mt-3 text-xs text-rose-400 hover:underline">
              删除该等级
            </button>
          )}
        </div>
      ))}
      <button onClick={add} className="mb-4 rounded-lg border border-dashed border-zinc-600 px-4 py-2 text-sm text-zinc-300 hover:border-emerald-500 hover:text-emerald-300">
        + 新增会员等级
      </button>
      <SaveBar section="membership" value={{ tiers }} />
    </div>
  );
}
