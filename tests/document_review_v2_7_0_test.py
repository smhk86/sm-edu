"""Private DOCX extraction and in-memory image OCR regression tests."""
import os, sys, io, zipfile
from pathlib import Path
from unittest.mock import patch
os.environ['ALLOW_OPEN_REVIEW_API']='1'
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'backend'))
from fastapi.testclient import TestClient
from PIL import Image
from app import main

def run():
    client=TestClient(main.app)
    xml='''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Exercise one</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Cell A</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Cell B</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>'''
    buf=io.BytesIO()
    with zipfile.ZipFile(buf,'w',zipfile.ZIP_DEFLATED) as z:z.writestr('word/document.xml',xml)
    result=client.post('/api/v1/archive/document-review/docx-text',content=buf.getvalue())
    assert result.status_code==200,result.text
    assert 'Exercise one' in result.json()['text'] and 'Cell A | Cell B' in result.json()['text']
    assert result.json()['stored'] is False and result.json()['auto_published'] is False
    bad=client.post('/api/v1/archive/document-review/docx-text',content=b'not-docx')
    assert bad.status_code==422
    image=Image.new('RGB',(120,60),'white'); raw=io.BytesIO();image.save(raw,format='PNG')
    with patch('pytesseract.get_languages',return_value=['eng']), patch('pytesseract.image_to_string',return_value='OCR EXERCISE 123'):
        ocr=client.post('/api/v1/archive/document-review/image-ocr?languages=eng',content=raw.getvalue(),headers={'Content-Type':'image/png'})
    assert ocr.status_code==200,ocr.text
    assert ocr.json()['text']=='OCR EXERCISE 123'
    assert ocr.json()['stored'] is False and ocr.json()['auto_published'] is False
    invalid=client.post('/api/v1/archive/document-review/image-ocr?languages=eng',content=b'not-image',headers={'Content-Type':'image/png'})
    assert invalid.status_code==422
    print('v2.8.2 DOCX and image OCR API tests passed')

if __name__=='__main__':run()
