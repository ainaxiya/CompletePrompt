# -*- coding: utf-8 -*-
# 解析 开发类/其他类/视频类/网络安全类/游戏制作类 5 个目录的提示词大全
# 输出 data/packs.jsonl，每条一个提示词记录
import sys, io, os, re, json, glob
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', line_buffering=True)

ROOT = r'e:\traexiangmu\提示词'
CATS = ['开发类', '其他类', '视频类', '网络安全类', '游戏制作类']
CAT_MAP = {'开发类': '开发', '其他类': '其他', '视频类': '视频',
           '网络安全类': '网络安全', '游戏制作类': '游戏制作'}
OUT = os.path.join(os.path.dirname(__file__), '..', 'data', 'packs.jsonl')

# 格式1: 【CODE】标题  或  [CODE] 标题 （同行）
ENTRY_SAME = re.compile(r'^(?:【([A-Z]+-[A-Z]+-\d+)】(.+?)|\[([A-Z]+-[A-Z]+-\d+)\]\s+(.+?))\s*$')
# 格式2: [CODE] 或 【CODE】 独占一行（后面跟 TITLE:/DESCRIPTION:/PROMPT:）
ENTRY_SOLO = re.compile(r'^(?:\[([A-Z]+-[A-Z]+-\d+)\]|【([A-Z]+-[A-Z]+-\d+)】)\s*$')
# 格式3: 数字编号列表  1. 标题  / 1、标题
ENTRY_NUM = re.compile(r'^(\d{1,3})[.、]\s*(.+?)\s*$')


def clean_topic(name):
    n = os.path.splitext(name)[0]
    n = re.sub(r'（.*?）|\(.*?\)', '', n)
    n = re.sub(r'^(中文|英文)?', '', n)
    n = n.replace('提示词大全', '').replace('提示词', '').replace('AI提示词大全', '')
    return n.strip() or os.path.splitext(name)[0]


def parse_file(path, category, lang):
    topic = clean_topic(os.path.basename(path))
    with open(path, encoding='utf-8') as f:
        lines = f.readlines()

    # 收集条目起始：(line_idx, code_or_None, title_or_None, fmt)
    starts = []
    for i, ln in enumerate(lines):
        s = ln.rstrip('\n')
        m = ENTRY_SAME.match(s)
        if m:
            starts.append((i, m.group(1) or m.group(3), (m.group(2) or m.group(4)).strip(), 'same'))
            continue
        m = ENTRY_SOLO.match(s)
        if m:
            starts.append((i, m.group(1) or m.group(2), None, 'solo'))
            continue
        m = ENTRY_NUM.match(s)
        # 编号列表格式：标题行后必须跟着非空内容行才认为是条目（避免误匹配目录里的序号）
        if m and i + 1 < len(lines) and lines[i + 1].strip() and not ENTRY_NUM.match(lines[i + 1].rstrip('\n')):
            starts.append((i, None, m.group(2).strip(), 'num'))

    records = []
    cat_letter = {'开发': 'DEV', '其他': 'OTH', '视频': 'VID',
                  '网络安全': 'SEC', '游戏制作': 'GAM'}[category]
    lang_letter = 'CN' if lang == 'zh' else 'EN'
    num_seq = 0

    for idx, (si, code, title, fmt) in enumerate(starts):
        ei = starts[idx + 1][0] if idx + 1 < len(starts) else len(lines)
        body = ''.join(lines[si + 1:ei])

        if fmt == 'solo':
            # 从 TITLE:/DESCRIPTION:/PROMPT: 提取
            tm = re.search(r'TITLE:\s*(.*)', body)
            title = (tm.group(1).strip() if tm else '').strip()
            dm = re.search(r'DESCRIPTION:\s*(.*?)(?=\n-+\n|PROMPT:|$)', body, re.S)
            desc = (dm.group(1).strip() if dm else '').strip()
            pm = re.search(r'PROMPT:\s*\n?(.*)', body, re.S)
            content = (pm.group(1).strip() if pm else '').strip()
        elif fmt == 'num':
            desc = ''
            # 内容 = 标题行之后到下一条目前的所有文本
            content = body.strip()
            num_seq += 1
            if not code:
                code = f'{cat_letter}-{lang_letter}-N{num_seq:03d}'
        else:  # same
            if lang == 'zh':
                dm = re.search(r'【说明】\s*\n(.*?)(?=\n-{4,}\n|【提示词】|$)', body, re.S)
                desc = (dm.group(1).strip() if dm else '').strip()
                pm = re.search(r'【提示词】\s*\n(.*)', body, re.S)
                content = (pm.group(1).strip() if pm else re.sub(r'【说明】.*?(?=\n-{4,}|$)', '', body, flags=re.S).strip()).strip()
            else:
                dm = re.search(r'DESCRIPTION:\s*(.*?)(?=\n-{4,}\n|PROMPT:|$)', body, re.S)
                desc = (dm.group(1).strip() if dm else '').strip()
                pm = re.search(r'PROMPT:\s*\n?(.*)', body, re.S)
                content = (pm.group(1).strip() if pm else re.sub(r'DESCRIPTION:.*?(?=\n-{4,}|$)', '', body, flags=re.S).strip()).strip()

        content = re.sub(r'\n={3,}-+\n?', '\n', content).strip()
        desc = re.sub(r'\n={3,}-+\n?', '\n', desc).strip()

        if not content or len(content) < 5:
            continue
        if not title:
            title = code or f'{category}提示词'

        title = re.sub(r'^[【\[]?[A-Z]+-[A-Z]+-\d+[】\]]?\s*', '', title).strip() or code

        records.append({
            'title': title[:200],
            'category': category,
            'language': lang,
            'promptCode': code,
            'description': desc[:3000] or None,
            'content': content,
            'tags': [category, topic],
            'sourceFile': os.path.relpath(path, ROOT),
        })
    return records


all_records = []
for cat_dir in CATS:
    cat = CAT_MAP[cat_dir]
    for sub in ['中文提示词', '英文提示词']:
        lang = 'zh' if sub.startswith('中文') else 'en'
        for fp in sorted(glob.glob(os.path.join(ROOT, cat_dir, sub, '*.txt'))):
            recs = parse_file(fp, cat, lang)
            all_records.extend(recs)
            print(f'{cat}/{lang}: {os.path.basename(fp)} -> {len(recs)}')

seen = set()
uniq = []
for r in all_records:
    key = (r['category'], r['language'], r['promptCode'])
    if key in seen:
        continue
    seen.add(key)
    uniq.append(r)

with open(OUT, 'w', encoding='utf-8') as f:
    for r in uniq:
        f.write(json.dumps(r, ensure_ascii=True) + '\n')

from collections import Counter
cc = Counter(r['category'] for r in uniq)
lc = Counter(r['language'] for r in uniq)
print(f'\nTOTAL: {len(uniq)} | by-category: {dict(cc)} | by-lang: {dict(lc)}')
print(f'output: {OUT}')
