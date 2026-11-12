import {tools} from './registry';
import {enUS} from '../i18n/locales/en-US';
import {zhCN} from '../i18n/locales/zh-CN';

const aliases:Record<string,string[]> = {"developer":["json","md5","sha","hmac","jwt","base64","url","uuid","密码生成"],"files":["pdf转ppt","pdf转word","ppt转pdf","word转pdf","pdf转图片","图片转pdf","pdf2ppt","pdf2word","旋转删页","格式转换","基础转换","pdf旋转","pdf压缩","压缩pdf","pdf变小"],"photo":["照片100kb","照片压到100kb","证件照","一寸","二寸","480640","报名照片","480×640"],"images":["图片压缩","批量改名","批量缩放","png转jpg","jpg转png","webp","压缩照片","重命名zip"],"ocr":["图片提取文字","图片转文字","识别文字","ocr","扫描pdf识别","提取可编辑文字"],"references":["参考文献","引用","citation","gbt7714","gb/t7714"],"sheets":["合并excel","合并表格","多份报名表合成一张"],"resume":["做简历","免费简历","cv","无水印pdf"],"scan":["扫描件变清晰","扫描增强","去阴影","背景减弱"],"ppt":["ppt体积太大","ppt瘦身","ppt压缩","pptx压缩","压缩嵌入图片"],"ppt-extract":["ppt图片提取","提取ppt图片","课件图片导出","pptx图片导出","ppt原图","ppt素材提取","幻灯片图片","zip","csv清单"],"privacy":["pdf隐私","清除作者","删除元数据"],"materials":["报名材料","附件检查","像素大小检查"],"wishes":["wps让我开会员怎么办","付费墙","建议","反馈"],"cost":["免费替代","wps会员","会员费用","单次费用"],"timestamp":["时间戳","unix时间","日期转时间戳","时间戳转日期","毫秒","时间转换","utc","10位","13位"],"text":["字数统计","文本统计","去重行","空行","文本整理","排序行","全角半角","标点转换"],"finance":["房贷","月供","等额本息","等额本金","利息","复利","单利","提前还款","贷款计算器","按揭"],"health":["bmi","体脂率","体脂","基础代谢","bmr","tdee","卡路里","每日热量","健康体重","减脂"],"color-picker":["取色","吸色","颜色","色板","主色","hex","rgb","hsl","调色板"],"stitch":["拼长图","长图拼接","图片拼接","拼图","纵向拼接","横向拼接"],"pdf-page-number":["加页码","pdf页码","页码","编号","9宫格"],"image-watermark":["图片加水印","图片水印","证件水印","身份证加水印","防盗用水印","仅供使用","打水印","照片加水印","日期水印","logo水印","批量水印"],"pdf-watermark":["pdf水印","pdf加水印","文档水印","全页密铺"],"pdf-crop":["pdf裁剪","裁剪pdf","裁边","页边距","去掉白边","去白边"],"timetable":["课程表","课表","排课","上课时间","单双周","单周","双周","ics","日历","上课提醒","课前提醒","wakeup","超级课程表"],"ai":["ai","ai助手","人工智能","智能向导","向导","智能问答","推荐工具","帮我找工具","问问ai","大学助手"],"leave-helper":["请假","请假条","请假理由"],"material-collector":["收作业","收材料","核对名单","材料收集"],"file-organizer":["批量重命名","文件改名","编号重命名"],"batch-pdf":["批量pdf","pdf转png"],"handwrite":["手写","手写生成","手写体"],"background":["抠图","换底色","红底蓝底白底"],"docx-check":["docx检查","论文格式检查","行距页边距"],"compare":["文档对比","文字比较","差异对比"],"course":["课程设计","答辩ppt","报告提纲"],"table-clean":["excel清洗","csv清洗","表格去重"],"lab":["实验数据","标准差","相对误差","线性拟合"],"grades":["成绩反推","期末考多少分","gpa","绩点","算绩点","期末算分"],"ppt-generate":["ppt生成","pptx生成","答辩ppt","做ppt","大纲生成","开题报告ppt","课程设计ppt","路演ppt","pptxgenjs"],"pdf-form":["pdf填表","pdf表格填写","pdf签名","pdf签字","奖学金申请表","缓考申请表","假条审批","社团申请表","pdfme"],"image-compress":["图片精准压缩","限制100kb","压到100kb","学信网图片压缩","考研网图片","squoosh","精确压缩","限制kb"],"flowchart":["流程图","mermaid","架构图","时序图","er图","算法流程图","甘特图","思维导图"],"media-converter":["音视频转换","提取音频","视频提取mp3","mp4转mp3","视频转gif","gif制作","录音转mp3","音频裁剪"],"web-to-apk":["apk","安卓","打包","pwabuilder","bubblewrap","pwa","网站转app","生成apk","安卓安装包","网站转apk","做个app","android","apk打包"],"pdf-merge-split":["pdf合并","pdf拆分","合并pdf","拆分pdf","合并拆分","pdf合并拆分","pdf拼接","pdf提取页面","按页拆分","pdf提取","提取页面","pdf提取页","pdf删页","删除pdf页面","pdf去页","删页","提取页","merge","split"],"pdf-compress":["压缩pdf","pdf压缩","pdf太大","pdf变小","pdf瘦身","缩小pdf","pdf降体积","pdf过大","压缩"],"photo-check":["证件照体检","照片体检","照片合格检查","照片诊断","四六级照片","考研照片","教资照片","照片检测","底色检测"]};

export const normalizeSearch=(s:string)=>s.toLowerCase().replace(/pptx/g,'ppt').replace(/docx/g,'word').replace(/jpeg/g,'jpg').replace(/[\s\p{P}\p{S}]/gu,'').replace(/转换为|转换成|转换/g,'转');

export function searchTools(query:string){
  const q=normalizeSearch(query);
  if(!q)return [...tools];
  return tools.map(t=>{
    const enMeta = enUS.tools[t.id];
    const enAliases = enUS.searchAliases[t.id] ?? [];
    const zhAliases = aliases[t.id] ?? [];
    const terms=[
      t.name,
      t.task,
      t.group,
      ...zhAliases,
      enMeta?.name ?? '',
      enMeta?.task ?? '',
      enMeta?.group ?? '',
      ...enAliases,
    ].filter(Boolean).map(normalizeSearch);

    let score=0;
    for(const s of terms){
      if(s===q)score=Math.max(score,100);
      else if(s.includes(q))score=Math.max(score,70);
      else if(q.includes(s)&&s.length>=3)score=Math.max(score,60);
    }
    return {t,score};
  }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).map(x=>x.t);
}
