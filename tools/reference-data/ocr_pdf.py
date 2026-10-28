"""Text of a scanned PDF by OCR, one file per page (cached: pages already read are skipped).

  python3 tools/reference-data/ocr_pdf.py <scan.pdf> <out dir> [--dpi 450]

Needs poppler (pdftoppm) and tesseract. Pages are rendered in grey at --dpi and read with page segmentation
mode 6 (one block of text) and the spacing kept, so that table columns stay apart.
"""
import argparse
import os
import re
import subprocess
import sys
import tempfile


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('pdf')
    ap.add_argument('out')
    ap.add_argument('--dpi', type=int, default=450)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    info = subprocess.run(['pdfinfo', a.pdf], capture_output=True, text=True, encoding='utf-8', check=True).stdout
    pages = int(re.search(r'Pages:\s*(\d+)', info)[1])
    with tempfile.TemporaryDirectory() as tmp:
        for p in range(1, pages + 1):
            target = os.path.join(a.out, f'page-{p:03d}.txt')
            if os.path.exists(target):
                continue
            subprocess.run(['pdftoppm', '-r', str(a.dpi), '-gray', '-f', str(p), '-l', str(p), '-png', a.pdf,
                            os.path.join(tmp, 'p')], check=True)
            image = next(os.path.join(tmp, f) for f in os.listdir(tmp) if f.endswith('.png'))
            text = subprocess.run(['tesseract', image, '-', '--psm', '6', '-c', 'preserve_interword_spaces=1'],
                                  capture_output=True, text=True, encoding='utf-8', check=True).stdout
            os.remove(image)
            with open(target, 'w', encoding='utf-8') as f:
                f.write(text)
            print(f'page {p}/{pages}', file=sys.stderr)


if __name__ == '__main__':
    main()
