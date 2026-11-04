# Turn the Vite single-file build into the artifact page (the host adds the document skeleton).
import re, sys
b = open('dist/index.html', encoding='utf-8').read()
b = re.sub(r'<!doctype html>\s*', '', b, flags=re.I)
b = re.sub(r'</?html[^>]*>', '', b, flags=re.I)
b = re.sub(r'</?head>', '', b, flags=re.I)
b = re.sub(r'</?body[^>]*>', '', b, flags=re.I)
b = re.sub(r'<meta charset[^>]*>', '', b, flags=re.I)  # re-added below
b = re.sub(r'<meta name="viewport"[^>]*>', '', b, flags=re.I)
b = re.sub(r'<title>.*?</title>', '', b, flags=re.S)
b = re.sub(r'<meta name="claude:viewport-fit-sides"[^>]*>', '', b)
out = sys.argv[1]
open(out, 'w', encoding='utf-8').write('<meta charset="UTF-8">\n<title>SocialAdz Studio</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n' + b.strip() + '\n')
print('wrote', out, len(b) // 1024, 'KB')
