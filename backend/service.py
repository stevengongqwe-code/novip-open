"""Optional genuine LibreOffice backend. No API simulation or file persistence."""
import asyncio, io, os, signal, subprocess, tempfile, time, zipfile, xml.etree.ElementTree as ET, re
from pathlib import Path
import resource
from fastapi import FastAPI, UploadFile, File, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pypdf import PdfReader
MAX_FILE=20*1024*1024
MAX_INFLATED=80*1024*1024
TIMEOUT=90
SOFFICE=os.environ.get('SOFFICE_BIN','soffice')
app=FastAPI(title='Office conversion',docs_url=None,redoc_url=None)
origins=os.environ.get('ALLOWED_ORIGINS','https://zhijian-handwrite.stevengongqwe.chatgpt.site').split(',')
app.add_middleware(CORSMiddleware,allow_origins=origins,allow_methods=['POST','GET'],allow_headers=['Content-Type'])
lock=asyncio.Lock()
requests_by_ip={}
def check_office(data:bytes):
    if not data or len(data)>MAX_FILE:raise ValueError('文件为空或超过 20 MB。')
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            infos=z.infolist()
            if len(infos)>2000 or sum(i.file_size for i in infos)>MAX_INFLATED:raise ValueError('Office 解压内容过大。')
            names={i.filename for i in infos}
            if any(not n.endswith('/') and ('vbaproject' in n.lower() or '/activex/' in n.lower() or '/embeddings/' in n.lower()) for n in names):raise ValueError('不接受含宏、ActiveX 或嵌入程序的文件。')
            if '[Content_Types].xml' not in names:raise ValueError('不是有效 Office 文件。')
            kind='docx' if 'word/document.xml' in names else 'pptx' if 'ppt/presentation.xml' in names else None
            if not kind:raise ValueError('只支持 DOCX / PPTX。')
            total=0
            for info in infos:
                if info.flag_bits&1:raise ValueError('不接受加密文件。')
                if info.filename.endswith(('.xml','.rels')):
                    if info.file_size>8*1024*1024:raise ValueError('XML 部件过大。')
                    text=z.read(info).decode('utf-8','strict')
                    if '<!DOCTYPE' in text or '<!ENTITY' in text or 'macroEnabled' in text:raise ValueError('拒绝含宏或 XML 实体的文档。')
                    # Reject remote targets outright: LO must not fetch images/templates/links.
                    if info.filename.endswith('.rels') and any(n.attrib.get('TargetMode','').lower()=='external' for n in ET.fromstring(text).iter()):raise ValueError('保真服务暂不接受外部链接或远程资源，请先移除或嵌入内容。')
                    tree=ET.fromstring(text)
                    for node in tree.iter():
                        field=(node.text or '') if node.tag.split('}')[-1]=='instrText' else ' '.join(v for k,v in node.attrib.items() if k.split('}')[-1]=='instr')
                        if re.search(r'\b(DDEAUTO|DDE|INCLUDETEXT|INCLUDEPICTURE|LINK)\b',field,re.I):raise ValueError('不接受动态外部数据字段，请先转为静态内容。')
                    total+=len(text.encode())
                else:
                    with z.open(info) as source:
                        while chunk:=source.read(1024*1024):
                            total+=len(chunk)
                            if total>MAX_INFLATED:raise ValueError('解压内容超过限制。')
            return kind
    except (zipfile.BadZipFile, UnicodeDecodeError,RuntimeError,ET.ParseError) as e:raise ValueError('Office 文件损坏或不受支持。') from e

def limits():
    resource.setrlimit(resource.RLIMIT_CPU,(TIMEOUT,TIMEOUT))
    resource.setrlimit(resource.RLIMIT_AS,(1536*1024*1024,1536*1024*1024))
    resource.setrlimit(resource.RLIMIT_FSIZE,(80*1024*1024,80*1024*1024))
    resource.setrlimit(resource.RLIMIT_NOFILE,(256,256))

def convert_office(data:bytes)->bytes:
    kind=check_office(data)
    with tempfile.TemporaryDirectory(prefix='office-') as folder:
        root=Path(folder);source=root/f'input.{kind}';source.write_bytes(data);profile=root/'profile';profile.mkdir();(profile/'user').mkdir()
        (profile/'user/registrymodifications.xcu').write_text('''<?xml version="1.0"?><oor:items xmlns:oor="http://openoffice.org/2001/registry"><item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop></item></oor:items>''')
        args=[SOFFICE,'--headless','--nologo','--nodefault','--norestore','--nolockcheck',f'-env:UserInstallation={profile.as_uri()}','--convert-to','pdf:writer_pdf_Export' if kind=='docx' else 'pdf:impress_pdf_Export','--outdir',folder,str(source)]
        proc=subprocess.Popen(args,stdout=subprocess.PIPE,stderr=subprocess.PIPE,start_new_session=True,preexec_fn=limits,env={**os.environ,'SAL_USE_VCLPLUGIN':'gen'})
        try:
            stdout,stderr=proc.communicate(timeout=TIMEOUT)
            out=root/'input.pdf'
            if proc.returncode or not out.is_file():raise ValueError('LibreOffice 转换失败，请确认文档没有损坏。')
            result=out.read_bytes()
            if len(result)>80*1024*1024:raise ValueError('输出超过 80 MB。')
            pdf=PdfReader(io.BytesIO(result))
            if not 1<=len(pdf.pages)<=50:raise ValueError('输出超过 50 页，或没有有效页面。')
            return result
        except subprocess.TimeoutExpired as e:raise ValueError('Office 转换超时，请缩小文档。') from e
        finally:
            try:os.killpg(proc.pid,signal.SIGKILL)
            except ProcessLookupError:pass

@app.get('/health')
def health():return {'status':'ok','engine':'LibreOffice','max_pages':50,'max_file_mb':20}
@app.post('/convert')
async def convert(request:Request,file:UploadFile=File(...)):
    ip=request.client.host if request.client else 'unknown';now=time.monotonic()
    if len(requests_by_ip)>5000:requests_by_ip.clear()
    calls=[t for t in requests_by_ip.get(ip,[]) if now-t<60]
    if len(calls)>=5:raise HTTPException(429,'每分钟最多 5 次，请稍后再试。')
    requests_by_ip[ip]=calls+[now]
    if lock.locked():raise HTTPException(429,'转换服务繁忙，请稍后重试。')
    data=await file.read(MAX_FILE+1);await file.close()
    if len(data)>MAX_FILE:raise HTTPException(413,'文件超过 20 MB。')
    async with lock:
        try:pdf=await asyncio.to_thread(convert_office,data)
        except ValueError as e:raise HTTPException(422,str(e)) from e
        except Exception as e:raise HTTPException(500,'转换服务异常，没有生成下载文件。') from e
    from fastapi.responses import Response
    return Response(pdf,media_type='application/pdf',headers={'Content-Disposition':'attachment; filename="converted.pdf"','Cache-Control':'no-store'})
