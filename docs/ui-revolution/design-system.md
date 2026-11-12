# NOVIP Motion Design System — 统一视觉与交互动效设计规范 v4.0

> **版本**：v4.0 (`OPERATION NOVIP UI REVOLUTION`)  
> **设计方向**：`Modern / Minimal / Premium / Functional / Fast`  
> **品牌内核**：「大学生，别花冤枉钱。」—— 将顶级设计网站的精工质感与纯端侧实用工具站的毫秒级效率合二为一。  
> **代码入口**：`src/motion/tokens.css`、`src/motion/motion-system.css`、`src/motion/useNovipMotion.ts`、`src/motion/components/*`

---

## 一、核心设计原则（四条铁律）

1. **真实状态驱动（Truthful Motion）**：所有进度条、加载骨架屏、完成对勾与下载提示必须 100% 绑定真实本地计算状态（如 `useJob().busy`、`saveLocal` 触发事件），**严禁用虚假倒计时或假动画伪装任务已完成**。
2. **合成层优先与空闲零功耗（Compositor-First & Zero Idle Drain）**：日常交互动画严格限制在 `transform` 与 `opacity` 属性；首屏与全局深空粒子场在指针/滚动静止超过 3 秒后自动进入低功耗休眠，交互瞬间满帧唤醒。
3. **触屏一等公民（Touch & WeChat First）**：Android Chrome 与微信内置浏览器不依赖 `:hover` 完成任何核心操作；所有可点击控件热区 `>= 44 × 44 CSS px`，统一配置 `touch-action: manipulation` 与 `75ms` 极速 `:active` 按压回弹。
4. **无障碍与极简兜底（Reduced Motion & Low-End Graceful Fallback）**：当系统开启 `prefers-reduced-motion: reduce` 或用户切换至「🍃 极简省电」模式时，自动关闭位移与粒子动画，保留清晰的色彩与边框对比度。

---

## 二、统一设计 Tokens 规范（`src/motion/tokens.css`）

### 1. 动效时长阶梯（Duration Scale）
| Token 名称 | 默认值 | 适用场景 |
|---|---|---|
| `--novip-dur-instant` | `75ms` | 手指/鼠标按压瞬间（`:active` 下压反馈），确保零延迟跟手 |
| `--novip-dur-fast` | `150ms` | 颜色状态切换、微气泡显隐、图标微旋、复选框框体响应 |
| `--novip-dur-base` | `240ms` | 卡片悬停上浮、按钮松手回弹、搜索框焦点光环、Segmented Control 切换 |
| `--novip-dur-moderate` | `360ms` | `AdaptiveDialog` 模态框/底部抽屉开合、`IosHudToast` 滑入、SVG 对勾描边 |
| `--novip-dur-slow` | `520ms` | 首屏标题 `BlurSplitText` 渐进聚焦、`CountUpMetric` 指标递增 |

*(注：在 `@media (prefers-reduced-motion: reduce)` 或 `html[data-novip-visual-mode="minimal"]` 下，所有位移动效时长自动收敛为 `0.01ms`。)*

### 2. 缓动曲线（Easing Curves）
| Token 名称 | CSS 取值 | 物理特性与用途 |
|---|---|---|
| `--novip-ease-out-expo` | `cubic-bezier(0.16, 1, 0.3, 1)` | 干脆启动、柔和减速，用于面板展开、卡片上浮、焦点光环与列表揭示 |
| `--novip-ease-spring` | `cubic-bezier(0.22, 1, 0.36, 1)` | 细腻阻尼弹簧，用于主按钮回弹、弹窗入场、胶囊指示器切换 |
| `--novip-ease-bounce` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | 轻微过冲弹性（Overshoot），用于完成徽章弹出、上传图标上浮、Dock 图标点按 |
| `--novip-ease-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` | 对称平滑曲线，用于 SVG `stroke-dashoffset` 描边与进度条宽度过渡 |

### 3. 动画距离阶梯（Distance Scale）
| Token 名称 | 默认值 | 用途 |
|---|---|---|
| `--novip-dist-micro` | `2px` | 按钮悬停微抬升（`translateY(-2px)`）、按压下沉（`translateY(1px)`） |
| `--novip-dist-card` | `3px` | 工具卡片悬停上浮（`translateY(-3px)`）与行动箭头右推（`translateX(4px)`） |
| `--novip-dist-reveal` | `10px` | 分类切换、标题词组与二级区块入场垂直位移（克制不浮夸） |
| `--novip-dist-sheet` | `24px` | 模态框与底部抽屉入场位移基数 |

### 4. 圆角与阴影层级（Radius & Elevation Scale）
| Token 名称 | 取值 | 适用组件 |
|---|---|---|
| `--novip-radius-pill` | `9999px` | 灵动岛、胶囊标签、快捷键徽章、顶部与底部悬浮导航 |
| `--novip-radius-card` | `20px` | 工具卡片、Bento 小组件、上传区容器 |
| `--novip-radius-dialog` | `24px` | `AdaptiveDialog` 桌面弹窗与手机底部抽屉顶部圆角 |
| `--novip-shadow-resting` | `0 2px 8px -2px rgba(15, 23, 42, 0.05), 0 1px 2px rgba(15, 23, 42, 0.03)` | 日间卡片常态阴影 |
| `--novip-shadow-hover` | `0 16px 36px -8px rgba(0, 113, 227, 0.14), 0 4px 12px -2px rgba(15, 23, 42, 0.06)` | 卡片悬停态弥散阴影 |
| `--novip-shadow-dialog` | `0 24px 64px -12px rgba(2, 6, 23, 0.45), 0 0 0 1px rgba(255, 255, 255, 0.12)` | 模态弹窗与抽屉高阶浮层阴影 |

---

## 三、交互状态矩阵（Focus / Hover / Tap / Loading / Success / Error）

1. **焦点状态（Focus State）**：
   - 全局 `:focus-visible` 采用双层高对比度环：`outline: none; box-shadow: 0 0 0 2px var(--novip-bg-elevated, #fff), 0 0 0 4px var(--novip-focus-color, #0071e3)`。
   - 搜索框 `.ios-spotlight-box:focus-within` 激活 `4px` 柔光环并联动左侧搜索图标微缩放。
2. **悬停状态（Hover State — 仅在 `@media (hover: hover) and (pointer: fine)` 生效）**：
   - 工具卡片：表面触发 `--spatial-x` / `--spatial-y` 径向聚光灯，卡片整体 `translateY(-3px)`，右侧箭头 `translateX(4px)`。
   - 主按钮：亮度提升 6%，外发光阴影扩大，顶部 `1px` 内高光显现。
3. **触控与按压状态（Tap / Active State — 全端尤其是手机微信核心反馈）**：
   - 按钮与卡片 `:active`：在 `75ms` 内执行 `transform: scale(0.97)`，配合全局 `ClickSparkLayer` 在触点綻放 8 道微火花。
   - 触控热区：导航项、分段按钮、清空按钮、关闭按钮均保证 `min-height: 44px; min-width: 44px`。
4. **加载状态（Loading State）**：
   - `ProgressBar`：真实百分比宽度平滑过渡 + 合成层流光扫掠（Shimmer），搭配雙环呼吸加载图标。
   - `Skeleton`：柔和脉冲骨架条，避免布局跳动（`CLS <= 0.1`）。
5. **成功与错误状态（Success & Error States）**：
   - `SuccessNotice`：翠绿胶囊底衬 + SVG 对勾 `stroke-dashoffset` 动态绘制 + 弹性入场。
   - `ActionableError`：琥珀/珊瑚红警示边框 + 320ms 轻柔水平微震提醒 + 结构化大白话排查建议与「重试一次」按钮。
   - `IosHudToast`：支持 `success`（绿勾）、`download`（蓝色下载箭）、`error`（红色警示）、`info`（品牌蓝星标）四种语义态。

---

## 四、三模主题一致性（Immersive Dark / Daylight / Minimal Power-Saver）

| 视觉维度 | 🌌 沉浸深空 (`immersive`) | ☀️ 纯净日光 (`daylight`) | 🍃 极简省电 (`minimal`) |
|---|---|---|---|
| **页面底色** | `#050814` 深空星云底色 | `#f5f7fb` 柔和日光浅灰底 | `#f8fafc` (浅色) / `#111318` (系统深色) |
| **卡片表面** | `rgba(15, 23, 42, 0.88)` 高对比毛玻璃 | `rgba(255, 255, 255, 0.96)` 纯白通透卡片 | `100%` 不透明纯色卡片，关闭毛玻璃模糊 |
| **正文对比度** | 纯白主字 `#f8fafc` / 次级 `#cbd5e1` (WCAG AAA) | 深墨主字 `#0f172a` / 次级 `#334155` (WCAG AAA) | 最高对比度纯色文字 |
| **WebGL 粒子舞台** | 开启（静止 >3s 自动降频休眠，交互唤醒） | 隐藏 WebGL，展示极光柔光静态渐变 | 完全卸载 WebGL 与 Canvas 循环 |
| **微交互动效** | 全量开启（聚光灯 + 弹簧 + 微火花） | 开启 UI 弹簧与聚光灯微交互 | 仅保留颜色切换，关闭位移动效 |
