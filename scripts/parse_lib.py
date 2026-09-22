# -*- coding: utf-8 -*-
# 解析 LIB提示词文档/ 分类分卷 txt -> data/prompts.jsonl
# 每个"作品"块 -> 一条记录 {title, sourceAuthor, sourceUrl, tags, description, likeCount, publishedAt, content, type}
import sys, io, os, re, json, glob
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', line_buffering=True)

ROOT = os.path.join(os.path.dirname(__file__), '..', '..', 'LIB提示词文档')
OUT = os.path.join(os.path.dirname(__file__), '..', 'data', 'prompts.jsonl')
os.makedirs(os.path.dirname(OUT), exist_ok=True)

SEP = '=' * 80
title_re = re.compile(r'^作品 (\d+)：(.*)$')
author_re = re.compile(r'^作者：(.+?)\s*｜\s*点赞：(\d+)\s*｜\s*发布：(.*)$')
tags_re = re.compile(r'^标签：(.*)$')
link_re = re.compile(r'^链接：(.*)$')
desc_re = re.compile(r'^简介：(.*)$')
sec_re = re.compile(r'^\[(\d+)\]\s*(.+)$')
date_re = re.compile(r'(\d{4})年(\d{2})月(\d{2})日\s*(\d{2}):(\d{2})')

def infer_type(label):
    if '视频' in label or '剪辑' in label: return 'video'
    if '图片' in label: return 'image'
    if '音频' in label: return 'audio'
    return 'text'

files = sorted(glob.glob(os.path.join(ROOT, '*', '第*.txt')))
print('part files:', len(files))

records = []
skipped = 0

def flush(cur):
    global skipped
    if not cur or not cur.get('title'):
        skipped += 1
        return
    secs = cur['sections']
    if not secs:
        skipped += 1
        return
    types = [infer_type(l) for l, _ in secs]
    # 作品主类型：数量最多的类型
    main = max(set(types), key=types.count)
    content = '\n\n'.join('[%d] %s\n%s' % (i + 1, l, b.strip())
                          for i, (l, b) in enumerate(secs))
    m = date_re.search(cur.get('published', ''))
    if m:
        published = '%04d-%02d-%02dT%02d:%02d:00' % tuple(int(x) for x in m.groups())
    else:
        published = None
    records.append({
        'title': cur['title'].strip()[:200],
        'sourceAuthor': cur.get('author', '').strip()[:80] or None,
        'sourceUrl': cur.get('link', '').strip() or None,
        'tags': cur.get('tags', []),
        'description': (cur.get('desc') or '').strip()[:2000] or None,
        'likeCount': cur.get('likes', 0),
        'publishedAt': published,
        'sectionCount': len(secs),
        'type': main,
        'content': content,
    })

for fn in files:
    with open(fn, encoding='utf-8') as f:
        cur = None
        in_meta = False
        in_body = False
        for line in f:
            line = line.rstrip('\n')
            if line == SEP:
                flush(cur)
                cur = {'tags': [], 'sections': [], 'likes': 0}
                in_meta, in_body = True, False
                continue
            if cur is None:
                continue  # 卷头
            if in_meta:
                m = title_re.match(line)
                if m:
                    cur['title'] = m.group(2); continue
                m = author_re.match(line)
                if m:
                    cur['author'] = m.group(1); cur['likes'] = int(m.group(2))
                    cur['published'] = m.group(3); continue
                m = tags_re.match(line)
                if m:
                    cur['tags'] = [t.strip() for t in m.group(1).split('/') if t.strip()]
                    continue
                m = link_re.match(line)
                if m:
                    cur['link'] = m.group(1); continue
                m = desc_re.match(line)
                if m:
                    cur['desc'] = m.group(1); continue
                if line.startswith('----'):
                    in_meta, in_body = False, True
                continue
            # 正文区
            m = sec_re.match(line)
            if m:
                cur['sections'].append((m.group(2).strip(), ''))
            elif cur['sections']:
                l, b = cur['sections'][-1]
                cur['sections'][-1] = (l, b + line + '\n')
        flush(cur)

# 去重（sourceUrl 优先，其次 title）
seen, uniq = set(), []
for r in records:
    key = r['sourceUrl'] or ('t:' + r['title'])
    if key in seen:
        continue
    seen.add(key)
    uniq.append(r)

with open(OUT, 'w', encoding='utf-8') as f:
    for r in uniq:
        # ensure_ascii=True：U+2028/控制字符全部转义成 \uXXXX，
        # 避免 Node readline 把行分隔符当换行切断 JSON
        f.write(json.dumps(r, ensure_ascii=True) + '\n')

from collections import Counter
tc = Counter(r['type'] for r in uniq)
total = os.path.getsize(OUT)
print('records: %d (skipped %d) | %.1f MB | types: %s' % (
    len(uniq), skipped, total / 1048576, dict(tc)))
