/**
 * flowchart-core.ts
 * NOVIP 流程图与架构图核心引擎 (基于 Mermaid 12)
 * 纯函数无 CSS 依赖，便于 Node.js 与浏览器测试
 */

export type FlowchartTheme = 'apple-blue' | 'dark' | 'neutral' | 'forest';
export type FlowchartTemplateId =
  | 'auth-flow'
  | 'algorithm'
  | 'tcp-handshake'
  | 'er-diagram'
  | 'architecture'
  | 'gantt-thesis'
  | 'mindmap-cs';

export interface FlowchartTemplate {
  id: FlowchartTemplateId;
  name: string;
  category: string;
  desc: string;
  code: string;
}

export const FLOWCHART_TEMPLATES: Record<FlowchartTemplateId, FlowchartTemplate> = {
  'auth-flow': {
    id: 'auth-flow',
    name: '系统登录与鉴权业务流程图',
    category: '软件工程与毕设',
    desc: '包含客户端输入校验、服务端哈希校验、JWT 签发与异常分支，适合毕业论文系统设计章节',
    code: `flowchart TD
    Start([用户进入登录页]) --> Input[输入学号与密码]
    Input --> ValidateFormat{客户端格式校验}
    ValidateFormat -- 不合法 --> ShowErr1[提示输入格式有误] --> Input
    ValidateFormat -- 合法 --> SendReq[发送 HTTPS 登录请求]
    SendReq --> RateLimit{频率限流检测}
    RateLimit -- 超频拦截 --> ShowErr2[限制访问，稍后再试]
    RateLimit -- 通过 --> QueryDB[(查询校园数据库)]
    QueryDB --> UserExist{用户是否存在}
    UserExist -- 否 --> ShowErr3[学号不存在或密码错误]
    UserExist -- 是 --> CheckHash{Argon2/Bcrypt 哈希校验}
    CheckHash -- 密码不一致 --> ShowErr3
    CheckHash -- 验证通过 --> GenToken[生成加密 JWT 令牌]
    GenToken --> SetCookie[写回 HTTP-Only 会话凭据]
    SetCookie --> NavHome[跳转至学生专属工作台] --> Done([登录成功])
`,
  },
  'algorithm': {
    id: 'algorithm',
    name: '二分查找与分治算法流程图',
    category: '数据结构与算法',
    desc: '清晰呈现边界计算、中点判断与双指针区间收缩过程，适合算法课程作业与考研复试',
    code: `flowchart TD
    Start([开始: 输入有序数组 nums 与目标 target]) --> Init[初始化双指针: left = 0, right = n - 1]
    Init --> LoopCond{left <= right ?}
    LoopCond -- 否 (循环结束) --> NotFound[返回 -1 (未找到目标元素)] --> End([结束])
    LoopCond -- 是 --> CalcMid[计算防溢出中点: mid = left + (right - left) / 2]
    CalcMid --> Compare{比较 nums[mid] 与 target}
    Compare -- 等于 --> Found[命中目标! 返回下标 mid] --> End
    Compare -- 小于 (目标在右半区) --> MoveLeft[收缩左边界: left = mid + 1] --> LoopCond
    Compare -- 大于 (目标在左半区) --> MoveRight[收缩右边界: right = mid - 1] --> LoopCond
`,
  },
  'tcp-handshake': {
    id: 'tcp-handshake',
    name: '计算机网络 TCP 三次握手与四次挥手',
    category: '计算机网络',
    desc: '标准时序图清晰演示 SYN、ACK、FIN 报文交互与两端状态迁移，适合计网期末复习与答辩',
    code: `sequenceDiagram
    autonumber
    actor Client as 客户端 (Client)
    actor Server as 服务器 (Server)

    Note over Client,Server: === 阶段一: TCP 三次握手建立连接 ===
    Client->>Server: SYN=1, seq=x (请求建立连接)
    Note over Client: 状态: SYN_SENT
    Server->>Client: SYN=1, ACK=1, seq=y, ack=x+1 (同意连接)
    Note over Server: 状态: SYN_RCVD
    Client->>Server: ACK=1, seq=x+1, ack=y+1 (确认收到)
    Note over Client,Server: 连接已建立 (ESTABLISHED)，开始可靠传输应用层数据

    Note over Client,Server: === 阶段二: TCP 四次挥手释放连接 ===
    Client->>Server: FIN=1, seq=u (主动关闭请求)
    Note over Client: 状态: FIN_WAIT_1
    Server->>Client: ACK=1, seq=v, ack=u+1 (通知关闭，但可能仍在发送残留数据)
    Note over Server: 状态: CLOSE_WAIT
    Server->>Client: FIN=1, ACK=1, seq=w, ack=u+1 (数据发送完毕，同意关闭)
    Note over Server: 状态: LAST_ACK
    Client->>Server: ACK=1, seq=u+1, ack=w+1 (收到关闭确认)
    Note over Client: 状态: TIME_WAIT (等待 2MSL 后彻底关闭)
`,
  },
  'er-diagram': {
    id: 'er-diagram',
    name: '大学教务与选课系统 ER 实体关系图',
    category: '数据库系统',
    desc: '清晰规范的学生-班级-课程-选课成绩多对多关系图，满足数据库课设与毕业设计要求',
    code: `erDiagram
    STUDENT ||--o{ ENROLLMENT : "参与选课"
    COURSE ||--o{ ENROLLMENT : "被选记录"
    DEPARTMENT ||--|{ STUDENT : "管辖学生"
    DEPARTMENT ||--|{ TEACHER : "聘任教师"
    TEACHER ||--o{ COURSE : "主讲授课"

    STUDENT {
        string student_id PK "学号"
        string name "姓名"
        string gender "性别"
        int grade "年级"
        string dept_id FK "所属院系代码"
    }

    COURSE {
        string course_code PK "课程代码"
        string title "课程名称"
        float credits "学分"
        int max_capacity "课容量"
    }

    ENROLLMENT {
        string student_id PK, FK "学生学号"
        string course_code PK, FK "课程代码"
        float final_score "期末综合成绩"
        string semester "选课学期 (如 2026-Spring)"
    }
`,
  },
  'architecture': {
    id: 'architecture',
    name: '现代全栈软件系统分层架构图',
    category: '系统架构',
    desc: '展示前端表现层、API 网关、微服务与持久存储层，适合软件工程与项目路演',
    code: `flowchart TB
    subgraph ClientLayer [前端与多端表现层]
        Web[React 19 Web 响应式端]
        Mobile[iOS / 微信小程序轻量端]
        PWA[端侧离线 Service Worker]
    end

    subgraph GatewayLayer [网关与接入层]
        CDN[EdgeOne 边缘节点缓存]
        Nginx[安全反向代理 & 限流]
    end

    subgraph ServiceLayer [微服务与业务计算层]
        AuthSvc[统一认证授权中心]
        ToolEngine[端侧/边缘计算引擎]
        ExportSvc[格式转换与报表生成器]
    end

    subgraph DataLayer [数据持久化与缓存层]
        MySQL[(核心业务关系库)]
        Redis[(高并发会话缓存)]
        LocalDB[(用户本地 IndexedDB)]
    end

    ClientLayer --> GatewayLayer
    GatewayLayer --> ServiceLayer
    ServiceLayer --> DataLayer
    ClientLayer -. 本地直连缓存 .-> LocalDB
`,
  },
  'gantt-thesis': {
    id: 'gantt-thesis',
    name: '毕业设计进度安排与甘特图',
    category: '毕业设计进度',
    desc: '直观展示开题、编码、实验评测、初稿查重与答辩时间线，直接用于开题报告',
    code: `gantt
    title 2026 届本科毕业设计进度时间规划表
    dateFormat YYYY-MM-DD
    section 选题与开题阶段
    文献综述与文献查阅    :done,   des1, 2026-01-05, 2026-01-20
    需求分析与开题答辩    :done,   des2, 2026-01-21, 2026-02-15
    section 核心研发与实现
    系统整体架构设计      :active, des3, 2026-02-16, 2026-03-05
    端侧核心算法与模块编码 :        des4, 2026-03-06, 2026-04-10
    全链路性能优化与真机适配:       des5, 2026-04-11, 2026-04-25
    section 论文撰写与答辩
    撰写毕业设计论文初稿  :        des6, 2026-04-26, 2026-05-15
    学术不端查重与导师定稿:        des7, 2026-05-16, 2026-05-25
    制作汇报 PPT 与毕业答辩:       des8, 2026-05-26, 2026-06-05
`,
  },
  'mindmap-cs': {
    id: 'mindmap-cs',
    name: '计算机科学专业核心课程思维导图',
    category: '课程体系',
    desc: '整理本科四年四大件（数据结构、组成原理、操作系统、网络）知识图谱',
    code: `mindmap
  root((计算机专业核心课))
    数学基础
      高等数学与微积分
      线性代数
      离散数学
      概率论与数理统计
    四大核心底座
      数据结构与算法
      计算机组成原理
      操作系统
      计算机网络
    工程实践与应用
      数据库系统原理
      软件工程导论
      Web 全栈开发
      编译原理
    前沿选修方向
      人工智能与深度学习
      网络空间安全
      云计算与分布式系统
`,
  },
};

/**
 * 校验 Mermaid 代码的基本结构与防御注入
 */
export function validateMermaidCode(code: string): { valid: boolean; error?: string } {
  const trimmed = code.trim();
  if (!trimmed) {
    return { valid: false, error: 'Mermaid 代码不可为空。' };
  }

  // 必须以支持的图表类型声明开头
  const validHeaders = [
    'flowchart',
    'graph',
    'sequencediagram',
    'classdiagram',
    'statediagram',
    'erdiagram',
    'gantt',
    'pie',
    'gitgraph',
    'mindmap',
    'timeline',
  ];

  const firstLine = trimmed.split('\n')[0].trim().toLowerCase().replace(/[\s\t]+/g, '');
  const matched = validHeaders.some(h => firstLine.startsWith(h));
  if (!matched) {
    return {
      valid: false,
      error: '代码必须以标准图表声明开头（如 flowchart TD, sequenceDiagram, erDiagram 等）。',
    };
  }

  if (/<script[\s>]/i.test(code)) {
    return { valid: false, error: '检测到非法脚本代码。' };
  }

  return { valid: true };
}

/**
 * 获取 Mermaid 主题配置对象
 */
export function getMermaidConfig(theme: FlowchartTheme) {
  const isDark = theme === 'dark';
  const themeName: 'dark' | 'neutral' | 'forest' | 'default' = isDark
    ? 'dark'
    : theme === 'neutral'
    ? 'neutral'
    : theme === 'forest'
    ? 'forest'
    : 'default';

  return {
    startOnLoad: false,
    securityLevel: 'loose' as const,
    theme: themeName,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  };
}
