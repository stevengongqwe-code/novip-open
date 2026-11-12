/**
 * pdf-form-core.ts
 * NOVIP PDF 申请表填写与电子签名核心引擎
 * 基于 pdf-lib 与 pdfme 规范，纯函数无 CSS 依赖，便于 Node.js 与浏览器测试
 */

import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

export type PdfFormTemplateId = 'scholarship' | 'exam-defer' | 'leave-approval' | 'club-join';

export interface FormFieldDef {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'date' | 'select' | 'checkbox';
  placeholder?: string;
  defaultValue?: string;
  options?: string[];
  gridSpan?: number; // 1 to 12
}

export interface PdfFormTemplate {
  id: PdfFormTemplateId;
  title: string;
  category: string;
  description: string;
  fields: FormFieldDef[];
  sampleData: Record<string, string>;
}

export const PDF_FORM_TEMPLATES: Record<PdfFormTemplateId, PdfFormTemplate> = {
  scholarship: {
    id: 'scholarship',
    title: '普通高等学校本专科生国家/校级奖助学金申请审批表',
    category: '评优评奖',
    description: '适用于国家奖学金、励志奖学金、校级优秀学生一二等奖学金申请评定',
    fields: [
      { key: 'name', label: '学生姓名', type: 'text', placeholder: '如：张三', gridSpan: 4 },
      { key: 'studentId', label: '学号', type: 'text', placeholder: '如：2023010101', gridSpan: 4 },
      { key: 'gender', label: '性别', type: 'select', options: ['男', '女'], defaultValue: '男', gridSpan: 4 },
      { key: 'college', label: '所在院系', type: 'text', placeholder: '如：计算机科学与工程学院', gridSpan: 6 },
      { key: 'majorClass', label: '专业班级', type: 'text', placeholder: '如：软件工程 2301 班', gridSpan: 6 },
      { key: 'political', label: '政治面貌', type: 'select', options: ['中共党员', '中共预备党员', '共青团员', '群众'], defaultValue: '共青团员', gridSpan: 4 },
      { key: 'phone', label: '联系电话', type: 'text', placeholder: '如：13800000000', gridSpan: 4 },
      { key: 'rank', label: '学业成绩排名', type: 'text', placeholder: '如：3 / 120 (前 2.5%)', gridSpan: 4 },
      { key: 'gpa', label: '平均学分绩点 (GPA)', type: 'text', placeholder: '如：3.85 / 4.00', gridSpan: 6 },
      { key: 'failedCount', label: '不及格门数', type: 'text', defaultValue: '0', gridSpan: 6 },
      { key: 'awards', label: '在校期间曾获主要奖励', type: 'textarea', placeholder: '列举近一年所获校级及以上荣誉、竞赛奖项…', gridSpan: 12 },
      { key: 'reason', label: '申请理由（思想、学业与综合表现）', type: 'textarea', placeholder: '汇报本人在思想、专业学习、科研实践、志愿服务等方面的表现…', gridSpan: 12 },
      { key: 'counselorNote', label: '辅导员 / 班主任推荐意见', type: 'textarea', placeholder: '该生在校期间思想端正，遵纪守法，学业优异，同意推荐。', gridSpan: 12 },
      { key: 'applyDate', label: '申请日期', type: 'text', placeholder: '如：2026年10月', gridSpan: 6 },
    ],
    sampleData: {
      name: '李华',
      studentId: '2023110234',
      gender: '男',
      college: '软件工程学院',
      majorClass: '软件工程 2302 班',
      political: '共青团员',
      phone: '13812345678',
      rank: '2 / 98 (前 2%)',
      gpa: '3.92 / 4.0',
      failedCount: '0',
      awards: '1. 2025年全国大学生数学建模竞赛省级一等奖\n2. 2025年校级三好学生标兵、校一等学业奖学金\n3. 2026年中国国际大学生创新大赛校级银奖',
      reason: '本人自入学以来思想端正，积极向党组织靠拢。专业课成绩优异，必修课平均分91.5，连续两个学期位居专业前2%。积极投身开源与学科竞赛，担任班级学习委员，热心为同学解答学业疑问。特此申请本年度学业奖学金，望批准！',
      counselorNote: '李华同学各方面表现优异，无挂科及违纪行为，综合素质排名班级第一，符合申报条件，同意推荐申报！',
      applyDate: '2026年10月25日',
    },
  },
  'exam-defer': {
    id: 'exam-defer',
    title: '普通高等学校学生课程缓考与复核申请审批单',
    category: '教务学籍',
    description: '适用于期末突发疾病、伤病住院或不可抗力导致无法参加考试的缓考审批',
    fields: [
      { key: 'name', label: '申请学生姓名', type: 'text', placeholder: '如：张三', gridSpan: 4 },
      { key: 'studentId', label: '学号', type: 'text', placeholder: '如：20230101', gridSpan: 4 },
      { key: 'college', label: '院系专业', type: 'text', placeholder: '如：信息学院 计科专业', gridSpan: 4 },
      { key: 'courseName', label: '申请缓考课程名称', type: 'text', placeholder: '如：数据结构与算法', gridSpan: 6 },
      { key: 'courseCode', label: '课程代码 / 课序号', type: 'text', placeholder: '如：CS201-01', gridSpan: 6 },
      { key: 'teacher', label: '任课主讲教师', type: 'text', placeholder: '如：王教授', gridSpan: 6 },
      { key: 'examTime', label: '原定考试时间与考场', type: 'text', placeholder: '如：2026年6月20日 9:00 教二301', gridSpan: 6 },
      { key: 'reason', label: '申请缓考详细事由及医疗佐证', type: 'textarea', placeholder: '详细叙述因身体急性病症需住院治疗等原因（后附二级甲等及以上医院诊断书与假条）…', gridSpan: 12 },
      { key: 'hospitalProof', label: '医院诊断证明书编号', type: 'text', placeholder: '如：校医院/三甲医院 2026-MED-09812', gridSpan: 6 },
      { key: 'applyDate', label: '申请日期', type: 'text', placeholder: '如：2026年6月18日', gridSpan: 6 },
    ],
    sampleData: {
      name: '王小明',
      studentId: '202204098',
      college: '微电子科学与工程学院',
      courseName: '大学物理 (下)',
      courseCode: 'PH102-03',
      teacher: '陈老师',
      examTime: '2026年6月22日 14:00 第一教学楼208',
      reason: '本人于2026年6月20日突发急性化脓性阑尾炎，已前往市第一人民医院急诊并安排住院手术治疗，医生开具全休假条7天。因行动受限无法按时参加原定考试，特此依教务学籍规定申请缓考，待新学期初参加统一缓考。',
      hospitalProof: '市一医院急诊住院证明书 No.20260620-8841',
      applyDate: '2026年6月21日',
    },
  },
  'leave-approval': {
    id: 'leave-approval',
    title: '普通高等学校大学生外出/离校请假审批单',
    category: '学生日常',
    description: '适用于因病因事离校、实习见习、回家就医等离校审批备案',
    fields: [
      { key: 'name', label: '请假学生姓名', type: 'text', placeholder: '如：张三', gridSpan: 4 },
      { key: 'studentId', label: '学号', type: 'text', placeholder: '如：20230101', gridSpan: 4 },
      { key: 'dorm', label: '宿舍楼栋与房号', type: 'text', placeholder: '如：梅园6栋402', gridSpan: 4 },
      { key: 'destination', label: '外出目的地（省市区）', type: 'text', placeholder: '如：浙江省杭州市西湖区', gridSpan: 6 },
      { key: 'contactEmergency', label: '紧急联系人及电话（家长）', type: 'text', placeholder: '如：父亲 张某某 13900000000', gridSpan: 6 },
      { key: 'timeRange', label: '请假时间区间', type: 'text', placeholder: '如：2026年11月1日 至 11月4日 (共4天)', gridSpan: 12 },
      { key: 'reason', label: '请假详细事由', type: 'textarea', placeholder: '说明请假原由、交通工具、安全防范与补课承诺…', gridSpan: 12 },
      { key: 'promise', label: '学生安全承诺', type: 'textarea', defaultValue: '本人承诺离校期间严格遵守国家法律法规及校规校纪，对自身人身与财产安全负责，保持通讯畅通，假满准时返校销假。', gridSpan: 12 },
      { key: 'applyDate', label: '申请日期', type: 'text', placeholder: '如：2026年10月30日', gridSpan: 6 },
    ],
    sampleData: {
      name: '陈同学',
      studentId: '202408102',
      dorm: '海棠公寓3栋512',
      destination: '江苏省南京市玄武区',
      contactEmergency: '母亲 刘女士 13788889999',
      timeRange: '2026年11月5日 08:00 至 2026年11月8日 20:00 (共4天)',
      reason: '因直系亲属婚礼，需返家出席。已向周四、周五相关任课教师请假并已联系同专业同学拷贝随堂课件，承诺返校后主动补齐实验作业。',
      promise: '本人承诺离校期间严格遵守国家法律法规及校规校纪，对自身人身与财产安全负责，保持通讯畅通，假满准时返校销假。',
      applyDate: '2026年11月2日',
    },
  },
  'club-join': {
    id: 'club-join',
    title: '普通高等学校学生社团入会与骨干竞聘登记表',
    category: '社团活动',
    description: '适用于各类学生社团招新、部门骨干面试与入会审批登记',
    fields: [
      { key: 'name', label: '申请人姓名', type: 'text', placeholder: '如：张三', gridSpan: 4 },
      { key: 'studentId', label: '学号', type: 'text', placeholder: '如：20230101', gridSpan: 4 },
      { key: 'gender', label: '性别', type: 'select', options: ['男', '女'], defaultValue: '女', gridSpan: 4 },
      { key: 'clubName', label: '申请社团名称', type: 'text', placeholder: '如：校摄影协会 / 算法研讨社', gridSpan: 6 },
      { key: 'targetDept', label: '意向部门 / 岗位', type: 'text', placeholder: '如：新媒体运营部 / 策划部', gridSpan: 6 },
      { key: 'skills', label: '个人特长与掌握技能', type: 'text', placeholder: '如：摄影剪辑、海报设计、Python编程、活动主持', gridSpan: 12 },
      { key: 'experience', label: '过往经历陈述', type: 'textarea', placeholder: '在高中或大学期间参加过的社团活动、组织策划经历…', gridSpan: 12 },
      { key: 'plan', label: '对所报部门的工作设想与规划', type: 'textarea', placeholder: '谈谈加入社团后能为同学们带来什么，计划开展哪些新活动…', gridSpan: 12 },
      { key: 'applyDate', label: '申请日期', type: 'text', placeholder: '如：2026年10月', gridSpan: 6 },
    ],
    sampleData: {
      name: '周雨彤',
      studentId: '202402199',
      gender: '女',
      clubName: '校新媒体与摄影协会',
      targetDept: '视觉传达与短视频部',
      skills: '熟练掌握手机与微单摄影、Premiere剪辑、Photoshop海报设计与微信排版',
      experience: '大一上学期担任院融媒体中心干事，负责学院官方公众号 12 期推文排版；参与校迎新晚会摄影组工作，拍摄图集阅读量破万。',
      plan: '希望在协会开设「校园手机摄影新手工作坊」，让更多零基础同学学会拍好看的校园秋色与活动照片；按时保质完成每次社团外勤拍摄。',
      applyDate: '2026年10月15日',
    },
  },
};

export interface GeneratePdfFormOptions {
  templateId: PdfFormTemplateId;
  formData: Record<string, string>;
  signatureDataUrl?: string; // Base64 PNG signature
  signatureDate?: string;
  renderPagePng?: () => Promise<Uint8Array>; // High-res canvas render of Chinese form
}

export function toSafeWinAnsi(str?: string, fallback = ''): string {
  const sanitized = String(str || '').replace(/[^\x20-\x7E]/g, ' ').replace(/\s+/g, ' ').trim();
  return sanitized || fallback;
}

/**
 * 核心渲染：基于 pdf-lib 生成排版清晰的大学正规标准 A4 PDF 审批表单
 */
export async function generatePdfFormBlob(options: GeneratePdfFormOptions): Promise<Blob> {
  const template = PDF_FORM_TEMPLATES[options.templateId] || PDF_FORM_TEMPLATES.scholarship;
  const data = { ...template.sampleData, ...options.formData };

  const pdfDoc = await PDFDocument.create();
  // 标准 A4 纸张尺寸：595.28 x 841.89 points
  const page = pdfDoc.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // 1. 顶部表头
  page.drawText('NOVIP CAMPUS DIGITAL WORKBENCH', {
    x: 40,
    y: height - 40,
    size: 8,
    font,
    color: rgb(0.4, 0.45, 0.5),
  });

  page.drawText('VERIFIED CAMPUS STANDARD FORM', {
    x: width - 180,
    y: height - 40,
    size: 8,
    font,
    color: rgb(0.4, 0.45, 0.5),
  });

  // 主标题栏
  page.drawRectangle({
    x: 40,
    y: height - 85,
    width: width - 80,
    height: 38,
    color: rgb(0.96, 0.98, 1.0),
    borderColor: rgb(0.12, 0.35, 0.65),
    borderWidth: 1.5,
  });

  // 标题英文标
  page.drawText(toSafeWinAnsi(template.category, 'CAMPUS FORM') + ' · OFFICIAL APPROVAL FORM', {
    x: 55,
    y: height - 62,
    size: 11,
    font: fontBold,
    color: rgb(0.12, 0.35, 0.65),
  });

  page.drawText('Form ID: NOVIP-' + template.id.toUpperCase() + '-2026', {
    x: width - 210,
    y: height - 62,
    size: 9,
    font,
    color: rgb(0.3, 0.4, 0.5),
  });

  // 表格主体网格绘制
  const startY = height - 105;
  const tableW = width - 80;
  let curY = startY;

  // 绘制表单字段条目
  const entries = Object.entries(data);
  for (let i = 0; i < entries.length; i += 2) {
    const [k1, v1] = entries[i];
    const item1 = template.fields.find(f => f.key === k1);
    const hasSecond = i + 1 < entries.length;
    const [k2, v2] = hasSecond ? entries[i + 1] : ['', ''];
    const item2 = hasSecond ? template.fields.find(f => f.key === k2) : null;

    const isLongText = (item1?.type === 'textarea') || (!hasSecond);
    const rowH = isLongText ? 55 : 32;

    if (curY - rowH < 150) break; // 留出底部署名栏

    if (isLongText) {
      // 单行通栏
      page.drawRectangle({
        x: 40,
        y: curY - rowH,
        width: tableW,
        height: rowH,
        color: rgb(1, 1, 1),
        borderColor: rgb(0.8, 0.85, 0.9),
        borderWidth: 1,
      });

      // 标签背景
      page.drawRectangle({
        x: 40,
        y: curY - 20,
        width: tableW,
        height: 20,
        color: rgb(0.95, 0.96, 0.98),
        borderColor: rgb(0.8, 0.85, 0.9),
        borderWidth: 1,
      });

      page.drawText(toSafeWinAnsi(item1?.label, k1), {
        x: 50,
        y: curY - 14,
        size: 9,
        font: fontBold,
        color: rgb(0.2, 0.25, 0.3),
      });

      // 内容（限制单行长度）
      const cleanVal = toSafeWinAnsi(String(v1 || '').replace(/[\r\n]+/g, ' '), 'Filled');
      page.drawText(cleanVal.slice(0, 120), {
        x: 50,
        y: curY - 38,
        size: 9,
        font,
        color: rgb(0.1, 0.1, 0.1),
      });
    } else {
      // 双列并排
      const halfW = tableW / 2;

      // 左列
      page.drawRectangle({
        x: 40,
        y: curY - rowH,
        width: halfW,
        height: rowH,
        color: rgb(1, 1, 1),
        borderColor: rgb(0.8, 0.85, 0.9),
        borderWidth: 1,
      });
      page.drawText(toSafeWinAnsi(item1?.label, k1) + ':', {
        x: 48,
        y: curY - 20,
        size: 9,
        font: fontBold,
        color: rgb(0.3, 0.35, 0.4),
      });
      page.drawText(toSafeWinAnsi(String(v1 || ''), 'N/A').slice(0, 32), {
        x: 140,
        y: curY - 20,
        size: 9,
        font,
        color: rgb(0.1, 0.1, 0.1),
      });

      // 右列
      page.drawRectangle({
        x: 40 + halfW,
        y: curY - rowH,
        width: halfW,
        height: rowH,
        color: rgb(1, 1, 1),
        borderColor: rgb(0.8, 0.85, 0.9),
        borderWidth: 1,
      });
      page.drawText(toSafeWinAnsi(item2?.label, k2) + ':', {
        x: 48 + halfW,
        y: curY - 20,
        size: 9,
        font: fontBold,
        color: rgb(0.3, 0.35, 0.4),
      });
      page.drawText(toSafeWinAnsi(String(v2 || ''), 'N/A').slice(0, 32), {
        x: 140 + halfW,
        y: curY - 20,
        size: 9,
        font,
        color: rgb(0.1, 0.1, 0.1),
      });
    }

    curY -= rowH;
  }

  // 底部签字盖章与承诺审批区
  const signBoxH = 100;
  const signBoxY = 60;

  page.drawRectangle({
    x: 40,
    y: signBoxY,
    width: tableW,
    height: signBoxH,
    color: rgb(0.98, 0.99, 1),
    borderColor: rgb(0.2, 0.4, 0.7),
    borderWidth: 1,
  });

  page.drawText('SIGNATURE & OFFICIAL ENDORSEMENT / APPROVAL SECTION', {
    x: 50,
    y: signBoxY + signBoxH - 18,
    size: 9,
    font: fontBold,
    color: rgb(0.2, 0.4, 0.7),
  });

  page.drawText('Applicant Signature / Digital Signature:', {
    x: 55,
    y: signBoxY + 50,
    size: 9,
    font,
    color: rgb(0.3, 0.35, 0.4),
  });

  page.drawText('Date / Sign Date: ' + toSafeWinAnsi(options.signatureDate || data.applyDate, '2026-10-30'), {
    x: 55,
    y: signBoxY + 22,
    size: 9,
    font,
    color: rgb(0.3, 0.35, 0.4),
  });

  page.drawText('Department Seal / Official Endorsement (Seal Here):', {
    x: width - 260,
    y: signBoxY + 50,
    size: 9,
    font,
    color: rgb(0.4, 0.45, 0.5),
  });

  // 如果传入了电子签名图 (Base64 PNG)，将其贴在签名区域
  if (options.signatureDataUrl && options.signatureDataUrl.startsWith('data:image/png;base64,')) {
    try {
      const base64Data = options.signatureDataUrl.replace(/^data:image\/png;base64,/, '');
      const imageBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
      const sigImage = await pdfDoc.embedPng(imageBytes);
      const sigDims = sigImage.scale(0.35);

      page.drawImage(sigImage, {
        x: 215,
        y: signBoxY + 30,
        width: Math.min(sigDims.width, 100),
        height: Math.min(sigDims.height, 45),
      });
    } catch {
      // 容错处理
    }
  }

  // 底部极简法律与说明注脚
  page.drawText('NOVIP Privacy Engine - Client-side PDF Form Generation - Verify details before submitting', {
    x: 40,
    y: 35,
    size: 7.5,
    font,
    color: rgb(0.55, 0.6, 0.65),
  });

  const pdfBytes = await pdfDoc.save();
  return new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
}
