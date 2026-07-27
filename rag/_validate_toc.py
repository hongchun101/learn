import re

text = open('RAG教程.md', encoding='utf-8').read()

def slugify(s):
    s = s.lower().strip()
    s = re.sub(r'[^\w\s\-]', '', s)
    s = re.sub(r'\s+', '-', s)
    return s

headers = re.findall(r'^##\s+(.+)$', text, re.MULTILINE)
real_slugs = set(slugify(h) for h in headers)

toc = re.findall(r'\[([^\]]+)\]\(#([^)]+)\)', text)
broken = [(t, a) for t, a in toc if a not in real_slugs]
print(f'headers: {len(headers)}, toc links: {len(toc)}, broken: {len(broken)}')
for t, a in broken[:8]:
    print(f'  BROKEN: [{t}](#{a})')
