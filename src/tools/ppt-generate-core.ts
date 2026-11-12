/**
 * ppt-generate-core.ts
 * NOVIP PPT 生成与答辩大纲核心引擎
 * 基于 PptxGenJS，纯函数与数据模型，无 CSS 依赖，便于 Node.js 与浏览器测试
 */

import pptxgen from 'pptxgenjs';

export type PptThemeId = 'apple-dark' | 'academic-navy' | 'modern-teal' | 'warm-charcoal';
export type PptScenarioId = 'thesis' | 'project' | 'paper' | 'competition';

export interface PptTheme {
  id: PptThemeId;
  name: string;
  bgColor: string;       // Hex without '#' for PptxGenJS (e.g. '0B0F19')
  cardBgColor: string;   // Card background (e.g. '1E293B')
  primaryColor: string;  // Accent color (e.g. '38BDF8')
  textColor: string;     // Main text color (e.g. 'F8FAFC')
  subTextColor: string;  // Subtitle/secondary text color (e.g. '94A3B8')
  borderColor: string;   // Border color (e.g. '334155')
  fontFace: string;
}

export const PPT_THEMES: Record<PptThemeId, PptTheme> = {
  'apple-dark': {
    id: 'apple-dark',
    name: '深空黑极简风',
    bgColor: '0B0F19',
    cardBgColor: '1E293B',
    primaryColor: '38BDF8',
    textColor: 'F8FAFC',
    subTextColor: '94A3B8',
    borderColor: '334155',
    fontFace: 'Microsoft YaHei',
  },
  'academic-navy': {
    id: 'academic-navy',
    name: '典雅学术蓝',
    bgColor: 'F8FAFC',
    cardBgColor: 'FFFFFF',
    primaryColor: '1E3A8A',
    textColor: '0F172A',
    subTextColor: '475569',
    borderColor: 'CBD5E1',
    fontFace: 'Microsoft YaHei',
  },
  'modern-teal': {
    id: 'modern-teal',
    name: '活力创新青',
    bgColor: 'F0FDF4',
    cardBgColor: 'FFFFFF',
    primaryColor: '0D9488',
    textColor: '064E3B',
    subTextColor: '047857',
    borderColor: 'CCFBF1',
    fontFace: 'Microsoft YaHei',
  },
  'warm-charcoal': {
    id: 'warm-charcoal',
    name: '极简暖灰风',
    bgColor: 'FAFAF9',
    cardBgColor: 'FFFFFF',
    primaryColor: '27272A',
    textColor: '18181B',
    subTextColor: '71717A',
    borderColor: 'E7E5E4',
    fontFace: 'Microsoft YaHei',
  },
};

export type SlideLayout = 'title' | 'agenda' | 'cards-2' | 'cards-3' | 'timeline' | 'metrics' | 'conclusion';

export interface PptSlide {
  id: string;
  layout: SlideLayout;
  title: string;
  subtitle?: string;
  bullets?: string[];
  cards?: { title: string; content: string }[];
  timeline?: { time: string; event: string }[];
  metrics?: { value: string; label: string; desc?: string }[];
  notes?: string;
}

export interface PptDeck {
  title: string;
  subtitle: string;
  author: string;
  affiliation: string;
  date: string;
  themeId: PptThemeId;
  scenarioId: PptScenarioId;
  slides: PptSlide[];
}

export const PPT_SCENARIOS: Record<PptScenarioId, { name: string; desc: string; defaultDeck: () => PptDeck }> = {
  thesis: {
    name: '毕业设计与开题答辩',
    desc: '包含背景意义、现状痛点、方案架构、实验评测与创新点，适合本科/硕士答辩',
    defaultDeck: () => ({
      title: '基于深度学习的高性能校园数据分析系统设计与实现',
      subtitle: '本科毕业设计开题 / 中期答辩汇报',
      author: '答辩人：张三',
      affiliation: '计算机科学与技术学院 · 软件工程系',
      date: '2026年5月',
      themeId: 'academic-navy',
      scenarioId: 'thesis',
      slides: [
        {
          id: 'slide-1',
          layout: 'title',
          title: '基于深度学习的高性能校园数据分析系统',
          subtitle: '本科毕业设计开题 / 毕业答辩汇报',
          notes: '答辩开场介绍研究课题背景与指导教师。',
        },
        {
          id: 'slide-2',
          layout: 'agenda',
          title: '答辩汇报大纲',
          subtitle: 'OVERVIEW & AGENDA',
          bullets: [
            '01. 选题背景与研究意义',
            '02. 国内外研究现状与痛点分析',
            '03. 核心方案与系统架构设计',
            '04. 关键技术实现与实验评测',
            '05. 课题创新点与成果展望',
          ],
        },
        {
          id: 'slide-3',
          layout: 'cards-2',
          title: '01. 选题背景与核心痛点',
          subtitle: 'BACKGROUND & MOTIVATION',
          cards: [
            {
              title: '传统校园系统现状与不足',
              content: '现有教务与学工系统存在数据孤岛严重、高并发易卡顿、缺乏智能化分析看板等问题，学生与教师办事流程繁琐。',
            },
            {
              title: '课题研究价值与应用前景',
              content: '采用轻量化现代前端与边缘智能模型，实现秒级课表排布、成绩趋势预测与无纸化审批，显著提升校园数字化治理效能。',
            },
          ],
        },
        {
          id: 'slide-4',
          layout: 'cards-3',
          title: '02. 系统总体架构与技术选型',
          subtitle: 'SYSTEM ARCHITECTURE DESIGN',
          cards: [
            {
              title: '用户交互层 (Frontend)',
              content: '基于 React 19 与原生移动端流体布局，支持纯端侧离线计算，首屏加载小于 1 秒，多视口零横向溢出。',
            },
            {
              title: '模型与推理层 (Inference)',
              content: '自研轻量级向量检索与语义分词引擎，纯端侧运行保障学生隐私，完全零云端 API 依赖与费用。',
            },
            {
              title: '数据服务层 (Storage)',
              content: '采用本地 IndexedDB 与加密缓存机制，结合标准 RESTful 接口实现秒级增量同步与断网可用。',
            },
          ],
        },
        {
          id: 'slide-5',
          layout: 'metrics',
          title: '03. 核心性能与实验评测对比',
          subtitle: 'EXPERIMENTAL RESULTS & METRICS',
          metrics: [
            { value: '99.4%', label: '意图识别准确率', desc: '在 1000+ 高校真实语料测试集下表现优异' },
            { value: '18ms', label: '端侧推理平均耗时', desc: '相比传统云端调用提速超过 95%' },
            { value: '0元', label: '运行维护成本', desc: '完全无需采购商用大模型 Token 账单' },
          ],
        },
        {
          id: 'slide-6',
          layout: 'timeline',
          title: '04. 课题进度与里程碑规划',
          subtitle: 'SCHEDULE & MILESTONES',
          timeline: [
            { time: '第 1-3 周', event: '完成需求调研、文献综述与架构原型设计' },
            { time: '第 4-8 周', event: '核心算法编码实现、端侧模型轻量化蒸馏' },
            { time: '第 9-11 周', event: '全链路集成测试、高并发压力与真机适配测试' },
            { time: '第 12-14 周', event: '撰写毕业设计论文正文、查重并准备答辩材料' },
          ],
        },
        {
          id: 'slide-7',
          layout: 'conclusion',
          title: '汇报完毕，恳请各位评审老师批评指正！',
          subtitle: 'THANK YOU FOR YOUR TIME',
          bullets: [
            '感谢指导老师在课题研究过程中的悉心指点与学术指导！',
            '感谢学院各位评审老师的宝贵建议与专业审阅！',
          ],
        },
      ],
    }),
  },
  project: {
    name: '期末课程大作业汇报',
    desc: '面向软件工程、计算机或各专业期末大作业设计汇报，包含需求、技术、演示与心得',
    defaultDeck: () => ({
      title: '大学生高效协作工具箱设计与开发',
      subtitle: '《软件工程大作业》期末小组汇报',
      author: '汇报小组：第一组 · 汇报人：李四',
      affiliation: '软件工程学院 · 2023级',
      date: '2026年6月',
      themeId: 'apple-dark',
      scenarioId: 'project',
      slides: [
        {
          id: 'slide-p1',
          layout: 'title',
          title: '大学生高效协作工具箱设计与开发',
          subtitle: '《软件工程》期末课程设计大作业汇报',
        },
        {
          id: 'slide-p2',
          layout: 'agenda',
          title: '项目汇报目录',
          subtitle: 'PROJECT OUTLINE',
          bullets: [
            '一、项目背景与痛点需求',
            '二、产品核心功能与技术实现',
            '三、系统界面展示与真机测试',
            '四、团队分工与项目收获体会',
          ],
        },
        {
          id: 'slide-p3',
          layout: 'cards-2',
          title: '一、项目背景与核心痛点',
          subtitle: 'PROJECT BACKGROUND',
          cards: [
            {
              title: '大学生日常高频痛点',
              content: '市面工具充斥强制注册、充值会员与下载水印，且大部分不支持多端自适应，学生在手机上使用体验极差。',
            },
            {
              title: '我们的产品设计原则',
              content: '坚持「免费、零登录、零水印、纯端侧处理」，打造像原生系统级 App 一样精致流畅的高校利器。',
            },
          ],
        },
        {
          id: 'slide-p4',
          layout: 'metrics',
          title: '二、核心研发成果与指标',
          subtitle: 'KEY PROJECT METRICS',
          metrics: [
            { value: '45+', label: '开箱即用工具', desc: '覆盖 PDF、证件照、图表、课表等各场景' },
            { value: '100%', label: '单元测试覆盖', desc: '500+ 项自动化测试保障长期稳定' },
            { value: '0溢出', label: '多端屏幕适配', desc: '兼容 iPhone SE 到 4K 桌面显示器' },
          ],
        },
        {
          id: 'slide-p5',
          layout: 'conclusion',
          title: '感谢老师与同学们的聆听！',
          subtitle: 'Q & A SESSION',
          bullets: [
            '代码开源托管于 GitHub 仓库，欢迎交流体验！',
            '现场演示环节开始，欢迎各位老师提问。',
          ],
        },
      ],
    }),
  },
  paper: {
    name: '学术论文与文献汇报',
    desc: '面向组会文献分享、读书笔记汇报，包含研究假设、实验设计与思考启示',
    defaultDeck: () => ({
      title: '文献精读与组会分享汇报',
      subtitle: '精读论文：《Towards Privacy-Preserving Edge Intelligence》',
      author: '分享人：王五',
      affiliation: '智能计算重点实验室 · 硕士研究生',
      date: '2026年4月',
      themeId: 'warm-charcoal',
      scenarioId: 'paper',
      slides: [
        {
          id: 'slide-w1',
          layout: 'title',
          title: 'Towards Privacy-Preserving Edge Intelligence',
          subtitle: 'CVPR / NeurIPS 顶会论文精读研讨',
        },
        {
          id: 'slide-w2',
          layout: 'agenda',
          title: '文献精读汇报提纲',
          subtitle: 'READING OUTLINE',
          bullets: [
            '1. 论文核心贡献与研究动机',
            '2. 核心数学模型与理论推导',
            '3. 实验基准、数据集与对比指标',
            '4. 本文优势、局限性与对自身课题的启发',
          ],
        },
        {
          id: 'slide-w3',
          layout: 'cards-2',
          title: '核心理论与创新点',
          subtitle: 'CONTRIBUTION & METHODOLOGY',
          cards: [
            {
              title: '端侧差分隐私保护',
              content: '提出新型自适应加噪方案，在保障模型推理精度的同时，严格杜绝从梯度反推用户原始私密数据的可能性。',
            },
            {
              title: '稀疏激活加速算法',
              content: '通过动态通道剪枝与权重量化，将计算开销降低 70%，使移动端浏览器也能以 60FPS 流畅运行。',
            },
          ],
        },
        {
          id: 'slide-w4',
          layout: 'conclusion',
          title: '总结与下一步研讨',
          subtitle: 'DISCUSSION & THOUGHTS',
          bullets: [
            '论文的轻量化剪枝思想可以直接应用于本组的移动端工具优化中。',
            '感谢导师与同门参与研讨，请大家自由提问！',
          ],
        },
      ],
    }),
  },
  competition: {
    name: '挑战杯/双创竞赛路演',
    desc: '面向挑战杯、互联网+、创青春路演，包含痛点痛点、商业壁垒、市场规模与团队',
    defaultDeck: () => ({
      title: 'NOVIP · 新一代大学生公益极简数字工作台',
      subtitle: '「挑战杯」大学生创业计划竞赛项目路演',
      author: '项目负责人：赵六',
      affiliation: '创新创业学院 · 联合团队',
      date: '2026年3月',
      themeId: 'modern-teal',
      scenarioId: 'competition',
      slides: [
        {
          id: 'slide-c1',
          layout: 'title',
          title: 'NOVIP · 大学生公益极简数字工作台',
          subtitle: '拒绝收费套路 · 赋能三千万中国高校学子',
        },
        {
          id: 'slide-c2',
          layout: 'cards-3',
          title: '市场痛点与产品壁垒',
          subtitle: 'PAIN POINTS & ADVANTAGES',
          cards: [
            {
              title: '高校学子痛点',
              content: '市面工具动辄充值 VIP、按次收费，学生经济负担重且学生隐私被随意转卖。',
            },
            {
              title: 'NOVIP 创新解决方案',
              content: '全自主研发端侧 WebAssembly 离线处理引擎，彻底实现零云端服务器成本与极致安全。',
            },
            {
              title: '核心竞争壁垒',
              content: '纯公益非盈利定位积累良好校园口碑，全站工具深度契合大学生成长刚需。',
            },
          ],
        },
        {
          id: 'slide-c3',
          layout: 'metrics',
          title: '核心用户增长与运营表现',
          subtitle: 'TRACTION & IMPACT',
          metrics: [
            { value: '300,000+', label: '服务大学生用户', desc: '覆盖全国 500+ 所高校学子' },
            { value: '98.8%', label: '好评与推荐率', desc: '纯靠同学自发口碑传播' },
            { value: '￥0', label: '学生累计节省费用', desc: '累计帮大学生节省超百万元软件会员费' },
          ],
        },
        {
          id: 'slide-c4',
          layout: 'conclusion',
          title: '青年有为 · 科技向善',
          subtitle: 'THANK YOU FOR SUPPORTING OUR MISSION',
          bullets: [
            '立足高校，服务青年，我们一直在路上！',
            '欢迎各位评委老师批评指导。',
          ],
        },
      ],
    }),
  },
};

/**
 * 构建并导出真实的 PPTX 文件
 */
export async function generatePptxBlob(deck: PptDeck): Promise<Blob> {
  const pptx = new pptxgen();
  const theme = PPT_THEMES[deck.themeId] || PPT_THEMES['apple-dark'];

  // 16:9 宽屏布局 (13.33 x 7.5 inches)
  pptx.layout = 'LAYOUT_16x9';

  for (const slideData of deck.slides) {
    const slide = pptx.addSlide();
    slide.background = { color: theme.bgColor };

    // 顶部或底部品牌小字
    slide.addText('NOVIP · 大学生免费工具箱', {
      x: 0.8,
      y: 0.35,
      w: 6.0,
      h: 0.3,
      fontSize: 10,
      color: theme.subTextColor,
      fontFace: theme.fontFace,
    });

    if (slideData.layout === 'title') {
      // 封面页
      slide.addText(slideData.title || deck.title, {
        x: 1.0,
        y: 2.2,
        w: 11.33,
        h: 1.8,
        fontSize: 34,
        bold: true,
        color: theme.primaryColor,
        fontFace: theme.fontFace,
        align: 'center',
        valign: 'middle',
      });

      if (slideData.subtitle || deck.subtitle) {
        slide.addText(slideData.subtitle || deck.subtitle, {
          x: 1.5,
          y: 4.1,
          w: 10.33,
          h: 0.8,
          fontSize: 18,
          color: theme.subTextColor,
          fontFace: theme.fontFace,
          align: 'center',
        });
      }

      const metaLine = [deck.author, deck.affiliation, deck.date].filter(Boolean).join('  |  ');
      if (metaLine) {
        slide.addText(metaLine, {
          x: 1.5,
          y: 5.4,
          w: 10.33,
          h: 0.6,
          fontSize: 13,
          color: theme.textColor,
          fontFace: theme.fontFace,
          align: 'center',
        });
      }
    } else if (slideData.layout === 'agenda') {
      // 目录页
      slide.addText(slideData.title, {
        x: 1.0,
        y: 1.0,
        w: 11.33,
        h: 0.8,
        fontSize: 26,
        bold: true,
        color: theme.primaryColor,
        fontFace: theme.fontFace,
      });

      if (slideData.subtitle) {
        slide.addText(slideData.subtitle, {
          x: 1.0,
          y: 1.7,
          w: 11.33,
          h: 0.4,
          fontSize: 12,
          color: theme.subTextColor,
          fontFace: theme.fontFace,
        });
      }

      const bullets = slideData.bullets || [];
      bullets.forEach((b, idx) => {
        const rowY = 2.4 + idx * 0.85;
        // 背景卡片
        slide.addShape('roundRect', {
          x: 1.0,
          y: rowY,
          w: 11.33,
          h: 0.65,
          fill: { color: theme.cardBgColor },
          line: { color: theme.borderColor, width: 1 },
          rectRadius: 0.1,
        });

        slide.addText(b, {
          x: 1.3,
          y: rowY,
          w: 10.7,
          h: 0.65,
          fontSize: 16,
          bold: true,
          color: theme.textColor,
          fontFace: theme.fontFace,
          valign: 'middle',
        });
      });
    } else if (slideData.layout === 'cards-2') {
      // 双栏卡片对比
      slide.addText(slideData.title, {
        x: 1.0,
        y: 1.0,
        w: 11.33,
        h: 0.8,
        fontSize: 26,
        bold: true,
        color: theme.primaryColor,
        fontFace: theme.fontFace,
      });

      if (slideData.subtitle) {
        slide.addText(slideData.subtitle, {
          x: 1.0,
          y: 1.7,
          w: 11.33,
          h: 0.4,
          fontSize: 12,
          color: theme.subTextColor,
          fontFace: theme.fontFace,
        });
      }

      const cards = slideData.cards || [];
      const cardW = 5.4;
      cards.slice(0, 2).forEach((c, idx) => {
        const cardX = 1.0 + idx * 5.9;
        slide.addShape('roundRect', {
          x: cardX,
          y: 2.3,
          w: cardW,
          h: 4.4,
          fill: { color: theme.cardBgColor },
          line: { color: theme.borderColor, width: 1 },
          rectRadius: 0.15,
        });

        slide.addText(c.title, {
          x: cardX + 0.4,
          y: 2.6,
          w: cardW - 0.8,
          h: 0.6,
          fontSize: 18,
          bold: true,
          color: theme.primaryColor,
          fontFace: theme.fontFace,
        });

        slide.addText(c.content, {
          x: cardX + 0.4,
          y: 3.3,
          w: cardW - 0.8,
          h: 3.0,
          fontSize: 14,
          color: theme.textColor,
          fontFace: theme.fontFace,
          valign: 'top',
        });
      });
    } else if (slideData.layout === 'cards-3') {
      // 三栏卡片
      slide.addText(slideData.title, {
        x: 1.0,
        y: 1.0,
        w: 11.33,
        h: 0.8,
        fontSize: 26,
        bold: true,
        color: theme.primaryColor,
        fontFace: theme.fontFace,
      });

      if (slideData.subtitle) {
        slide.addText(slideData.subtitle, {
          x: 1.0,
          y: 1.7,
          w: 11.33,
          h: 0.4,
          fontSize: 12,
          color: theme.subTextColor,
          fontFace: theme.fontFace,
        });
      }

      const cards = slideData.cards || [];
      const cardW = 3.55;
      cards.slice(0, 3).forEach((c, idx) => {
        const cardX = 1.0 + idx * 3.88;
        slide.addShape('roundRect', {
          x: cardX,
          y: 2.3,
          w: cardW,
          h: 4.4,
          fill: { color: theme.cardBgColor },
          line: { color: theme.borderColor, width: 1 },
          rectRadius: 0.15,
        });

        slide.addText(c.title, {
          x: cardX + 0.3,
          y: 2.6,
          w: cardW - 0.6,
          h: 0.6,
          fontSize: 16,
          bold: true,
          color: theme.primaryColor,
          fontFace: theme.fontFace,
        });

        slide.addText(c.content, {
          x: cardX + 0.3,
          y: 3.3,
          w: cardW - 0.6,
          h: 3.0,
          fontSize: 13,
          color: theme.textColor,
          fontFace: theme.fontFace,
          valign: 'top',
        });
      });
    } else if (slideData.layout === 'metrics') {
      // 指标数据页
      slide.addText(slideData.title, {
        x: 1.0,
        y: 1.0,
        w: 11.33,
        h: 0.8,
        fontSize: 26,
        bold: true,
        color: theme.primaryColor,
        fontFace: theme.fontFace,
      });

      if (slideData.subtitle) {
        slide.addText(slideData.subtitle, {
          x: 1.0,
          y: 1.7,
          w: 11.33,
          h: 0.4,
          fontSize: 12,
          color: theme.subTextColor,
          fontFace: theme.fontFace,
        });
      }

      const metrics = slideData.metrics || [];
      const cardW = 3.55;
      metrics.slice(0, 3).forEach((m, idx) => {
        const cardX = 1.0 + idx * 3.88;
        slide.addShape('roundRect', {
          x: cardX,
          y: 2.4,
          w: cardW,
          h: 4.2,
          fill: { color: theme.cardBgColor },
          line: { color: theme.borderColor, width: 1 },
          rectRadius: 0.15,
        });

        // 巨型数字指标
        slide.addText(m.value, {
          x: cardX + 0.2,
          y: 2.8,
          w: cardW - 0.4,
          h: 1.2,
          fontSize: 42,
          bold: true,
          color: theme.primaryColor,
          fontFace: theme.fontFace,
          align: 'center',
        });

        // 标签
        slide.addText(m.label, {
          x: cardX + 0.2,
          y: 4.1,
          w: cardW - 0.4,
          h: 0.5,
          fontSize: 16,
          bold: true,
          color: theme.textColor,
          fontFace: theme.fontFace,
          align: 'center',
        });

        // 描述
        if (m.desc) {
          slide.addText(m.desc, {
            x: cardX + 0.3,
            y: 4.7,
            w: cardW - 0.6,
            h: 1.5,
            fontSize: 12,
            color: theme.subTextColor,
            fontFace: theme.fontFace,
            align: 'center',
          });
        }
      });
    } else if (slideData.layout === 'timeline') {
      // 时间轴页
      slide.addText(slideData.title, {
        x: 1.0,
        y: 1.0,
        w: 11.33,
        h: 0.8,
        fontSize: 26,
        bold: true,
        color: theme.primaryColor,
        fontFace: theme.fontFace,
      });

      if (slideData.subtitle) {
        slide.addText(slideData.subtitle, {
          x: 1.0,
          y: 1.7,
          w: 11.33,
          h: 0.4,
          fontSize: 12,
          color: theme.subTextColor,
          fontFace: theme.fontFace,
        });
      }

      const timeline = slideData.timeline || [];
      timeline.slice(0, 4).forEach((item, idx) => {
        const rowY = 2.4 + idx * 1.0;
        // 圆点
        slide.addShape('ellipse', {
          x: 1.2,
          y: rowY + 0.18,
          w: 0.3,
          h: 0.3,
          fill: { color: theme.primaryColor },
          line: { color: theme.primaryColor, width: 0 },
        });

        // 时间标签卡片
        slide.addText(item.time, {
          x: 1.7,
          y: rowY,
          w: 2.2,
          h: 0.7,
          fontSize: 15,
          bold: true,
          color: theme.primaryColor,
          fontFace: theme.fontFace,
          valign: 'middle',
        });

        // 描述卡片
        slide.addShape('roundRect', {
          x: 4.1,
          y: rowY,
          w: 8.2,
          h: 0.75,
          fill: { color: theme.cardBgColor },
          line: { color: theme.borderColor, width: 1 },
          rectRadius: 0.1,
        });

        slide.addText(item.event, {
          x: 4.3,
          y: rowY,
          w: 7.8,
          h: 0.75,
          fontSize: 14,
          color: theme.textColor,
          fontFace: theme.fontFace,
          valign: 'middle',
        });
      });
    } else {
      // 总结或结语页
      slide.addText(slideData.title, {
        x: 1.0,
        y: 2.4,
        w: 11.33,
        h: 1.5,
        fontSize: 32,
        bold: true,
        color: theme.primaryColor,
        fontFace: theme.fontFace,
        align: 'center',
        valign: 'middle',
      });

      if (slideData.subtitle) {
        slide.addText(slideData.subtitle, {
          x: 1.0,
          y: 4.0,
          w: 11.33,
          h: 0.6,
          fontSize: 16,
          color: theme.subTextColor,
          fontFace: theme.fontFace,
          align: 'center',
        });
      }

      const bullets = slideData.bullets || [];
      if (bullets.length > 0) {
        slide.addText(bullets.join('\n'), {
          x: 2.0,
          y: 4.8,
          w: 9.33,
          h: 1.5,
          fontSize: 14,
          color: theme.textColor,
          fontFace: theme.fontFace,
          align: 'center',
        });
      }
    }
  }

  // 生成二进制输出
  const arrayBuffer = (await pptx.write({ outputType: 'arraybuffer' })) as ArrayBuffer;
  return new Blob([arrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  });
}
