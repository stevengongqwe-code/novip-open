# OPERATION NOVIP UI REVOLUTION — 80 项研究成果决策矩阵与 20 项高价值交互落地表

> **生成时间**：2026-11-09  
> **关联文档**：`docs/ui-revolution/research.md`、`docs/ui-revolution/design-system.md`  
> **筛选准则**：优先采用「零或极低依赖、纯合成层 (`transform`/`opacity`)、强化真实业务操作感、完美兼容 Android 微信与 iOS Safari」的设计与组件，坚决剔除「劫持原生滚动、持续高功耗 GPU 着色器、干扰文字阅读或破坏按钮点击稳定性」的昂贵装饰。

---

## 一、优选落地的 14 项高价值交互工程清单（跨 8 大核心业务场景）

| 落地编号 | 交互/组件名称 | 灵感来源编号 | 核心覆盖业务区域（对应第四节 8 大区域） | 生产代码落点 | 外部依赖成本 | 移动端 / 微信表现 |
|---|---|---|---|---|---|---|
| **M-01** | **Hero BlurSplitText & Highlight 渐进聚焦排版与荧光高亮** | `#01`, `#02`, `#11`, `#12`, `#45` | **1. 首页**（首屏口号「大学生，别花冤枉钱。」与核心信任承诺） | `src/motion/components/BlurSplitText.tsx`<br>`src/tools/Home.tsx` | 0 KB（自研 CSS/WAAPI + SEO 完整文本） | 380ms 一次性清晰聚焦，不阻塞 LCP |
| **M-02** | **CountUpMetric 真实指标滚动递增与 ShinyText 绿标流光** | `#04`, `#13`, `#14` | **1. 首页**（灵动岛状态、60 款工具 / 100% 本地 / 0 水印指标） | `src/motion/components/CountUpMetric.tsx`<br>`src/motion/motion-system.css` | 复用 `animejs` v4 / rAF | 进入视口触发一次，减弱动画模式直接显示定值 |
| **M-03** | **Smart Idle-Throttled Immersion Stage 智能空闲休眠背景** | `#05`, `#44` | **1. 首页 & 全站背景**（深空沉浸 / 纯净日光 / 极简省电三模统一） | `src/immersive/ImmersionStage.tsx`<br>`src/immersive/offscreenRenderer.ts` | 0 KB | 静止 >3s 自动降频休眠省电，触控/滚动瞬间唤醒 |
| **M-04** | **Spotlight & 3D Micro-Tilt Tool Cards 聚光灯与微倾角工具卡** | `#10`, `#15`, `#17`, `#25`, `#41`, `#42`, `#43` | **2. 工具卡片**（四大神器卡、场景卡、高频卡、为你推荐卡、分组列表行） | `src/immersive/useSpatialInteractions.ts`<br>`src/motion/motion-system.css` | 0 KB（全局单 rAF 代理 CSS 变量） | 桌面端径向聚光+4°微倾；手机端 `:active` 按压回弹 |
| **M-05** | **ClickSparkLayer 全局点击/触控微火花物理确认层** | `#16`, `#29` | **2. 工具卡片 & 8. 移动端交互**（全站按钮、工具卡、Tab 切换触控确认） | `src/motion/components/ClickSparkLayer.tsx`<br>`src/immersive/GlobalImmersionShell.tsx` | 0 KB（按需激活 360ms Canvas 2D） | 专为无 `:hover` 的微信/安卓触屏提供清脆点按反馈 |
| **M-06** | **Tactile Spring CTA & Hover Border Gradient 触感弹簧按钮** | `#21`, `#47` | **1. 首页 & 5. 工具操作界面**（主行动按钮、下载按钮、AI 向导入口） | `src/motion/motion-system.css` | 0 KB（纯 CSS 合成层过渡） | 80ms 极速下压 `scale(0.97)`，220ms 弹簧回弹 |
| **M-07** | **Liquid Glass Navigation & Quick Command Trigger 导航与速查入口** | `#07`, `#18`, `#46` | **3. 导航系统**（桌面顶栏、子页面导航栏、手机单手底部 Dock） | `src/main.tsx`<br>`src/motion/motion-system.css` | 0 KB | 全部触控区 `>= 44×44px`，新增一键唤起工具速查面板 |
| **M-08** | **Spotlight Focus Halo Search & Elastic Segmented Control** | `#22`, `#24` | **4. 搜索和分类**（Spotlight 搜索框焦点光环、情境胶囊、分组切换器） | `src/tools/Home.tsx`<br>`src/motion/motion-system.css` | 0 KB | `:focus-within` 双色呼吸光环 + 放大镜微旋反馈 |
| **M-09** | **Staggered Category & Grid Reveal 分类筛选阶梯流式揭示** | `#06`, `#32`, `#39`, `#40` | **4. 搜索和分类**（切换分类、展开 60 款桌面图标、场景过滤） | `src/motion/useNovipMotion.ts`<br>`src/tools/Home.tsx` | `animejs` v4 (`stagger`) | 20ms 阶梯入场（封顶 220ms），零卡顿零闪烁 |
| **M-10** | **TactileDropzone 双层微交互文件上传区与文件元信息胶囊** | `#28`, `#50` | **5. 工具操作界面**（文件转换、报名照、PDF 等文件拖拽与选文件反馈） | `src/motion/components/TactileDropzone.tsx`<br>`src/Converter.tsx` | 0 KB（原生 HTML5 Drag & File Input） | 拖拽/点击微错位展开，已选文件实时展示体积与类型 |
| **M-11** | **Shimmer ProgressBar & Real-State Job Feedback 真实进度流光条** | `#26`, `#31` | **5. 工具操作界面**（绑定 `useJob().busy` 与真实百分比进度显示） | `src/tools/common.tsx`<br>`src/motion/motion-system.css` | 0 KB | 严格反映真实本地计算状态，绝不用假动画伪造成功 |
| **M-12** | **AdaptiveDialog 桌面弹簧模态框 / 手机底部抽屉统一体系** | `#33`, `#36`, `#40` | **6. 弹窗与提示**（统一灵动岛隐私详情、工具速查面板、帮助说明弹窗） | `src/motion/components/AdaptiveDialog.tsx`<br>`src/tools/Home.tsx`<br>`src/main.tsx` | `animejs` v4 + 原生無障碍焦点管理 | 桌面端居中弹簧模态框；手机端单手可下滑关闭的底部抽屉 |
| **M-13** | **Semantic IosHudToast 多语义灵动胶囊提示（成功/下载/错误/提示）** | `#31`, `#33`, `#34` | **6. 弹窗与提示 & 5. 下载反馈**（复制成功、文件开始下载、状态通知） | `src/main.tsx`<br>`src/motion/motion-system.css` | 0 KB | 顶部居中弹簧滑入，自动匹配语义色彩与动态矢量图标 |
| **M-14** | **Animated SVG EmptyState, SuccessNotice & ActionableError** | `#23`, `#34`, `#38` | **7. 空状态和异常状态**（搜索无结果、任务完成对勾绘制、错误微震与重试） | `src/tools/common.tsx`<br>`src/tools/Home.tsx` | `animejs` v4 / CSS SVG Stroke | 完成时动态画出绿色对勾，报错时克制微震并给出大白话建议 |

---

## 二、50 项研究成果全量评估与取舍总表

| 编号 | 来源网站 | 研究对象 / 组件名称 | 许可证 | 性能风险 | 决策结论 | 落地位置 / 放弃原因说明 |
|---|---|---|---|---|---|---|
| **#01** | Motion Sites | Nexora AI SaaS 首屏四级视觉漏斗 | 自研实现 | 低 | **改造采用** | 落地于 `Home.tsx` 首屏（灵动岛 → 大标题 → 双 CTA → 交互演示台） |
| **#02** | Motion Sites | Datacore 流体字号与紧凑字距体系 | 自研实现 | 无 | **采用** | 落地于 `tokens.css` 与首屏大标题、`tabular-nums` 数字对齐 |
| **#03** | Motion Sites | Radiant 日间模式双层弥散阴影与通透卡片 | 自研实现 | 无 | **采用** | 落地于「☀️ 纯净日光」模式与分区分组卡片 |
| **#04** | Motion Sites | Wealth Builder 真实信任指标滚动看板 | 自研实现 | 极低 | **采用** | 落地于首屏 `CountUpMetric`（60 款工具 / 100% 本地 / 0 水印） |
| **#05** | Motion Sites | Serein 静谧流体视觉焦点与空闲降频法则 | 自研实现 | 负风险（省电） | **采用** | 落地于 `ImmersionStage.tsx`（3 秒静止自动降频休眠） |
| **#06** | Motion Sites | Motion Portfolio 视口渐进揭示 | 自研实现 | 极低 | **改造采用** | 位移收敛至 `<= 12px`，首屏首帧不隐藏以确保 `LCP <= 2.5s` |
| **#07** | Motion Sites | Liquid Glass 液态毛玻璃胶囊导航 | 自研实现 | 低 | **采用** | 落地于 `main.tsx` 顶栏、子页面导航与手机底部 Dock |
| **#08** | Motion Sites | Interactive Product Stage 首屏实物沙盒 | 自研实现 | 无 | **采用并升级** | 落地于 `Home.tsx` 四大场景实时交互演示台 |
| **#09** | Motion Sites | Parallax Depth Orbit 滚轴劫持 3D 轨道 | — | 极高 | **放弃** | 劫持滚动条会严重阻碍大学生快速查找工具，且在微信内易卡死 |
| **#10** | Motion Sites | Bento Feature Architecture 模块化网格 | 自研实现 | 无 | **采用** | 落地于首页小组件群、四大神器与高频工具网格 |
| **#11** | React Bits | `BlurText` 高斯模糊渐进聚焦标题 | MIT + Commons Clause | 低 | **改造采用** | 封装为零额外依赖的 `BlurSplitText.tsx`，支持减弱动画与 SEO |
| **#12** | React Bits | `SplitText` 词组交错入场动效 | MIT + Commons Clause | 低 | **合并采用** | 与 `BlurText` 合并为按语义词块拆分的 `BlurSplitText.tsx` |
| **#13** | React Bits | `ShinyText` 金属流光扫掠徽章文本 | MIT + Commons Clause | 极低 | **采用** | 纯 CSS 落地于首屏「安全绿标」与旗舰徽章 |
| **#14** | React Bits | `CountUp` 数字平滑递增组件 | MIT + Commons Clause | 无 | **改造采用** | 封装为 `CountUpMetric.tsx`，默认输出真实目标值保障测试与 SEO |
| **#15** | React Bits | `SpotlightCard` 鼠标追踪聚光灯卡片 | MIT + Commons Clause | 极低 | **采用并深化** | 复用 `useSpatialInteractions.ts` 全局 rAF 变量，零重渲染 |
| **#16** | React Bits | `ClickSpark` 全局点击/触控微火花 | MIT + Commons Clause | 极低 | **采用** | 封装为 `ClickSparkLayer.tsx`，平时 0 开销，点按触发 360ms 反馈 |
| **#17** | React Bits | `TiltedCard` 3D 透视微倾角卡片 | MIT + Commons Clause | 低 | **改造采用** | 最大倾角限制在 `<= 4deg`，仅桌面端精细指针启用 |
| **#18** | React Bits | `Dock` 弹性程序坞导航栏 | MIT + Commons Clause | 无 | **改造采用** | 舍弃横向挤压，保留纵向图标弹簧跃起与 `>= 44×44px` 触控热区 |
| **#19** | React Bits | `DecryptedText` 乱码解密跳动文字 | MIT + Commons Clause | 中 | **放弃** | 中文乱码跳动造成字宽抖动与阅读障碍，不符合实用工具站定位 |
| **#20** | React Bits | `Iridescence` OGL 全屏虹彩着色器 | MIT + Commons Clause | 高 | **放弃** | 持续消耗 GPU 且高饱和度色块破坏前景文字 WCAG 对比度 |
| **#21** | Uiverse | Tactile Spring CTA 多层光影弹簧按钮 | MIT | 无 | **采用** | 落地于 `.novip-btn-tactile`、`.study-btn`、`.button.primary` |
| **#22** | Uiverse | Spotlight Focus Halo 焦点光环搜索框 | MIT | 无 | **采用** | 落地于 `.ios-spotlight-box:focus-within` 与全局输入框 |
| **#23** | Uiverse | Animated SVG Stroke 矢量描边勾选框 | MIT | 无 | **采用** | 落地于 `SuccessNotice` 对勾绘制与 `.study-check` 复选框 |
| **#24** | Uiverse | Elastic Pill Switch 弹性胶囊切换器 | MIT | 无 | **采用** | 落地于模式切换器、`.ios-segmented-btn` 与 `.ios-scenario-pill` |
| **#25** | Uiverse | Glassmorphic Border Glow 悬停流光卡片 | MIT | 无 | **采用** | 卡片微上浮 `-3px` + 右侧行动箭头同步右移 `+4px` |
| **#26** | Uiverse | Shimmer Progress 流光进度条与加载器 | MIT | 无 | **采用** | 落地于 `common.tsx` 的 `ProgressBar` 与 `Skeleton` |
| **#27** | Uiverse | Floating Micro Tooltip 弹簧微气泡 | MIT | 无 | **采用** | 落地于 `[data-novip-tip]`，触屏设备自动静默防遮挡 |
| **#28** | Uiverse | Interactive Dropzone Pulse 拖拽脉冲框 | MIT | 无 | **采用** | 落地于 `TactileDropzone.tsx` 与 `.dropzone` 拖拽激活态 |
| **#29** | Uiverse | Mobile Touch Active Scale 触控按压回弹 | MIT | 无 | **采用** | 全局 `touch-action: manipulation` + `:active` 75ms 快速响应 |
| **#30** | Uiverse | Skeuomorphic Heavy Switch 拟物重阴影开关 | MIT | 中 | **放弃** | 多层大阴影插值触发重绘，且厚重拟物风格与全站极简现代风冲突 |
| **#31** | Anime.js | `createTimeline()` 多阶段状态编排 | MIT | 极低 | **采用** | 用于任务完成反馈与弹窗入场序列编排 |
| **#32** | Anime.js | `stagger()` 阶梯式网格交错动画 | MIT | 极低 | **改造采用** | 单步 `20ms`、最大总延迟封顶 `220ms`，用于分类切换与网格展开 |
| **#33** | Anime.js | `createSpring()` 物理弹簧缓动模型 | MIT | 无 | **采用** | 用于 `AdaptiveDialog`、灵动岛展开与 `IosHudToast` |
| **#34** | Anime.js | `svg.createDrawable()` SVG 路径绘制 | MIT | 无 | **采用** | 用于 `SuccessNotice`、`EmptyState` 与 `IosHudToast` 矢量图标 |
| **#35** | Anime.js | `onScroll()` 视口进入观察触发 | MIT | 低 | **改造采用** | 仅采用「进入视口触发一次」策略，禁用常驻滚轴同步锁 |
| **#36** | Anime.js | `createDraggable()` 物理拖拽与下滑关闭 | MIT | 低 | **改造采用** | 用于移动端 `AdaptiveDialog` 底部抽屉顶部把手的下滑关闭手势 |
| **#37** | Anime.js | `svg.createMotionPath()` 轨迹持续飞行 | MIT | 中 | **放弃** | 工具界面无需常驻飞行的装饰物分散用户注意力 |
| **#38** | Anime.js | Keyframes 多段关键帧弹性与错误微震 | MIT | 无 | **采用** | 用于 `SuccessNotice` 弹性缩放与 `ActionableError` 320ms 轻柔提醒 |
| **#39** | Anime.js | `createScope()` 响应式与减弱动画作用域 | MIT | 负风险 | **采用** | 收敛于 `useNovipMotion.ts`，全面尊重 `prefers-reduced-motion` |
| **#40** | Anime.js | `revert()` / `cancel()` 生命周期清理 | MIT | 负风险 | **采用** | 所有命令式动画 `useEffect` 卸载时强制清理还原 |
| **#41** | Aceternity UI | `BentoGrid` 响应式非对称特性网格 | Free Component License | 无 | **改造采用** | 提炼 `group-hover` 内部图标与标题联动微位移至 NOVIP 卡片 |
| **#42** | Aceternity UI | `CardSpotlight` 径向探照灯卡片 | Free Component License | 极低（去 WebGL 后） | **剔除 WebGL 改造采用** | 剔除原版每卡一个 Three.js Canvas，改用 0 开销 CSS 径向光晕 |
| **#43** | Aceternity UI | `3D Card Effect` Z 轴多层立体悬浮 | Free Component License | 低 | **克制采用** | 仅对首页 4 张旗舰神器卡的图标盒应用微幅 Z 轴抬升 |
| **#44** | Aceternity UI | `Aurora Background` 极光柔光背景 | Free Component License | 低（去 blur 循环后） | **改造为静态微光采用** | 去除耗电的全屏 `filter: blur` 动画，保留日光模式极光渐变配比 |
| **#45** | Aceternity UI | `Hero Highlight` 核心词动态荧光高亮 | Free Component License | 无 | **采用** | 落地于首屏核心承诺文字（`.novip-hero-highlight`） |
| **#46** | Aceternity UI | `Floating Navbar` 智能悬浮顶栏 | Free Component License | 无 | **改造采用** | 保持顶栏常驻不隐藏，滚动时增强毛玻璃质感并集成速查面板入口 |
| **#47** | Aceternity UI | `Hover Border Gradient` 流光描边按钮 | Free Component License | 无（纯 CSS 版） | **改造采用** | 用纯 CSS 伪元素描边替代原版每秒 `setInterval` 重渲染 |
| **#48** | Aceternity UI | `Wobble Card` 鼠标果冻摇摆容器 | Free Component License | 中 | **放弃** | 卡片内容随光标大幅晃动会导致用户点击「去制作」按钮时脱靶 |
| **#49** | Aceternity UI | `Background Beams` 50 路 SVG 激光束 | Free Component License | 高 | **放弃** | 50 个并发 SVG 渐变动画消耗移动端 CPU/GPU，违反性能红线 |
| **#50** | Aceternity UI | `File Upload` 微交互网格文件上传区 | Free Component License | 无 | **自研无依赖采用** | 封装为 `TactileDropzone.tsx` 并赋能 `Converter.tsx` 等上传区 |

---

## 三、阶段二 15 项深度研究（#51–#65）与安卓触控体验对齐矩阵

| 编号 | 来源网站 | 研究对象 / 组件名称 | 许可证 | 性能风险 | 决策结论 | 落地位置 / 说明 |
|---|---|---|---|---|---|---|
| **#51** | Motion Sites | Linear Mobile 触控按压高光与阻尼卡片 | 自研实现 | 零 | **采用** | 融入 `useSpatialInteractions.ts`，为安卓端提供与桌面一致的触摸高光 |
| **#52** | Motion Sites | Vercel Fluid Nav 响应式自适应胶囊导航 | 自研实现 | 低 | **采用** | 强化移动端底部 Dock 栏 (`.ios-dock-bar`) 与毛玻璃顶栏 |
| **#53** | Motion Sites | Arc Peek Cards 触控预览扩散投影 | 自研实现 | 零 | **采用** | 落地于 `immersive.css` 的 `[data-spatial-hover="true"]` 触摸高光 |
| **#54** | React Bits | `DecryptedText` 极客字符密码解码动效 | MIT | 极低 | **自研落地** | 封装为 `DecryptedText.tsx`，赋能 3D 全息星环与子页面遥测胶囊 |
| **#55** | React Bits | `ShinyText` 微光掠过文字徽章 | MIT | 极低 | **采用** | 纯 CSS 落地于灵动岛与全息星环徽章 |
| **#56** | React Bits | `Magnet` 磁性吸附按压跟随 | MIT | 低 | **改造采用** | 融入 `ImmersionHeroCore.tsx` 3D 星环滑动微倾角跟随 |
| **#57** | Uiverse | Tactile Micro Toggle 仪器级微触开关 | MIT | 零 | **采用** | 优化 `.novip-holo-mode-btn` 与 `.novip-audio-wave-btn` 触控手感 |
| **#58** | Uiverse | Pulse Badge 微脉冲扩散状态标 | MIT | 零 | **采用** | 落地于灵动岛左侧微透镜指示灯与 SFX 状态灯 |
| **#59** | Uiverse | Cyberpunk Card 极客等宽数据标签 | MIT | 低 | **提炼采用** | 落地于全息遥测栏等宽字符排版 (`tabular-nums`) 与边框微光 |
| **#60** | Anime.js | Spring Physics 弹簧刚度/阻尼数学模型 | MIT | 零 | **采用** | 落地于 `tokens.css` `--novip-ease-spring` 与星环回弹曲线 |
| **#61** | Anime.js | SVG Stroke Dashoffset 真实业务进度管线 | MIT | 零 | **采用** | 落地于 `TactileDropzone` 与文件批量处理进度反馈 |
| **#62** | Anime.js | Stagger Grid Ripple 触控同心圆波纹延迟 | MIT | 低 | **改造采用** | 优化 `useStaggerReveal` 展开网格的阶梯延迟编排 |
| **#63** | Aceternity UI | `MovingBorder` 圆锥流光渐变边框 | Free License | 低（纯 CSS） | **采用** | 纯 CSS 落地于 `.novip-moving-border` 与首屏 CTA 按钮 |
| **#64** | Aceternity UI | Direction Aware 触控进出方向感知微倾 | Free License | 低 | **改造采用** | 融入 `useSpatialInteractions.ts`，安卓触摸滑动方向微倾 |
| **#65** | Aceternity UI | `Lamp` 顶部锥形深空聚光灯 | Free License | 低 | **采用** | 落地于首屏 `.is-immersive-hero` 顶部光晕与氛围投射 |

---

## 四、阶段三 15 项深度研究（#66–#80）与全站流体交互跃升矩阵

| 编号 | 来源网站 | 研究对象 / 组件名称 | 许可证 | 性能风险 | 决策结论 | 落地位置 / 说明 |
|---|---|---|---|---|---|---|
| **#66** | Motion Sites | Fluid Island Morph 灵动岛弹性形变 | 自研实现 | 零 | **采用** | 优化 `.ios-dynamic-island` 展开与收起的贝塞尔形变曲线 |
| **#67** | Motion Sites | Scenario Carousel 横向视差滚动 | 自研实现 | 低 | **采用** | 优化 `.ios-scenarios-scroll` 水平滚动 Snap 与边界橡皮筋回弹 |
| **#68** | Motion Sites | Bento Telemetry 实时微胶囊角标 | 自研实现 | 零 | **采用** | 落地于旗舰工具卡与首屏核心承诺状态标签 |
| **#69** | React Bits | `TrueFocus` 搜索框流光对焦透镜 | MIT | 零 | **自研落地** | 赋能 `.ios-spotlight-box:focus-within` 焦点流光与实时提示 |
| **#70** | React Bits | `CircularGallery` 3D 环形轮播滚筒 | MIT | 高 | **放弃** | 3D 滚筒影响找工具效率且消耗 GPU，用原生 Snap 替代 |
| **#71** | React Bits | `ScrollVelocity` GPU 跑马灯 | MIT | 低 | **克制采用** | 落地于页面底部高校支持标签条，匀速平缓不抢占视觉焦点 |
| **#72** | Uiverse | Tactile Slider 金属质感触觉滑块 | MIT | 零 | **采用** | 全局优化 `input[type="range"]`（用于图片压缩、水印透明度等） |
| **#73** | Uiverse | Sliding Pill 弹性滑动分段胶囊 | MIT | 零 | **自研落地** | 落地于场景筛选条 (`.ios-scenario-pill`) 与工具分组选择器 |
| **#74** | Uiverse | Cyber Pulse 微型流光加载指示灯 | MIT | 零 | **采用** | 替代传统灰暗菊花图，用于工具端侧运算等待反馈 |
| **#75** | Anime.js | SVG Morph 矢量路径几何形变 | MIT | 低 | **CSS 替代采用** | 纯 CSS 旋转/缩放实现搜索与清除图标丝滑切换 |
| **#76** | Anime.js | Stagger Char 逐字阶梯式入场 | MIT | 极低 | **采用** | 复用 `BlurSplitText`，保障工具标题动态质感兼顾 SEO |
| **#77** | Anime.js | Draggable Reorder 手势重排 | MIT | 低 | **FLIP 模式采用** | 赋能 PDF 合并与图片拼版顺序微调，零外部包开销 |
| **#78** | Aceternity UI | `CardHoverEffect` 共享悬浮高亮底块 | Free License | 低 | **采用** | 赋予场景卡片群连续光标牵引感，手势触摸跟随响应 |
| **#79** | Aceternity UI | `SparklesCore` 品牌微晶氛围粒子 | Free License | 极低 | **采用** | 融合进 WebGL 深度粒子通道与 `ClickSpark` 交互层 |
| **#80** | Aceternity UI | `Timeline` 步骤流向导指示器 | Free License | 零 | **采用** | 落地于多步工具向导头部，清晰指示当前进度节点 |


---

## 五、阶段四 15 项深度研究（#81–#95）与触觉物理向导体系矩阵

| 编号 | 来源网站 | 研究对象 / 组件名称 | 许可证 | 性能风险 | 决策结论 | 落地位置 / 说明 |
|---|---|---|---|---|---|---|
| **#81** | Motion Sites | Humane AI Pin 声学触觉双模确认 | 自研实现 | 零 | **采用** | 融入 `useSpatialInteractions.ts` 触控反馈、工具按钮与音效系统 |
| **#82** | Motion Sites | Raycast Store 横向胶囊阻尼视差滚槽 | 自研实现 | 零 | **采用** | 落地于场景筛选条与高频工具横向滚动容器 |
| **#83** | Motion Sites | Opal Camera 紧凑高密度毛玻璃调参板 | 自研实现 | 极低 | **采用** | 优化工具操作区设置面板排版与微回弹触感 |
| **#84** | React Bits | `ShinyBadge` 边缘纳米微光扫掠徽标 | MIT | 极低 | **采用** | 纯 CSS 落地于首页口号下方安全绿标与主工具行动卡片 |
| **#85** | React Bits | `ElasticSlider` 触控弹性滑块阻尼拉伸 | MIT | 低 | **改造采用** | 简化为边界物理微震与音效刻度反馈，兼顾触屏顺畅度 |
| **#86** | React Bits | `GradientText` 流体文字渐变动画 | MIT | 零 | **克制采用** | 落地于重点关键词，严控色彩明暗比，满足 WCAG AA 可读性 |
| **#87** | Uiverse | Neo-Brutalism 触控小标签芯片 | MIT | 零 | **采用** | 落地于 `TactileStepper` 步骤按钮、参数选项与分类标签 |
| **#88** | Uiverse | Quantum Switch 量子微光开关 | MIT | 零 | **采用** | 优化全局音效与主题模式微动开关，提供 App 级手感 |
| **#89** | Uiverse | Floating Copy Action 复制成功浮动小气泡 | MIT | 零 | **采用** | 落地于 AI 答案复制、Markdown 导出与报表一键复制操作 |
| **#90** | Anime.js | Spring-Tension 文件吞入弹性挤压拉伸 | MIT | 零 | **采用** | 落地于 `TactileDropzone.tsx` 文件上传确认动画 |
| **#91** | Anime.js | Coordinated Counter S 曲线平滑数字翻牌 | MIT | 零 | **采用** | 赋能 `CountUpMetric.tsx`，自适应降级模式 |
| **#92** | Anime.js | Multi-Path SVG 复合笔画连贯绘制 | MIT | 零 | **采用** | 落地于 `SuccessNotice` 成功绿色双笔画对勾与圆环 |
| **#93** | Aceternity UI | `Multi-Step Stepper` 流光追踪连线步骤向导 | Free License | 零 | **自研落地** | 封装为 `TactileStepper.tsx`，赋能证件照、PDF 与多阶段工具 |
| **#94** | Aceternity UI | `GlareCard` 仿真全真机反光折射卡片 | Free License | 极低 | **采用** | 融入 `useSpatialInteractions.ts` 单一 rAF 调度与触控跟随 |
| **#95** | Aceternity UI | `FocusCards` 聚焦点外围克制柔和变暗 | Free License | 零 | **改造采用** | 纯 CSS `:hover` 实现周围卡片 `opacity: 0.82` 微降，突出当前聚焦点 |


---

## 六、阶段五 15 项深度研究（#96–#110）与 10 大全新功能实装落地矩阵

| 编号 | 来源网站 | 研究对象 / 组件名称 | 许可证 | 性能风险 | 决策结论 | 落地位置 / 说明 |
|---|---|---|---|---|---|---|
| **#96** | Motion Sites | Raycast Command Palette 磨砂即搜 | 自研实现 | 零 | **采用落地** | **功能 6**：全站 `⌘K` / `Ctrl+K` 极速命令面板（`CommandPalette.tsx`） |
| **#97** | Motion Sites | Endel 纯端侧合成白噪音与专注光环 | 自研实现 | 极低 | **采用落地** | **功能 1**：沉浸自习室番茄钟与 Web Audio 白噪音（`/tools/focus`） |
| **#98** | Motion Sites | Linear 快速收藏与专属工作台 | 自研实现 | 零 | **采用落地** | **功能 7**：工具收藏夹与常用自选置顶 Dock（`PinnedTools`） |
| **#99** | React Bits | Noise Canvas & 声波响应光环 | MIT | 极低 | **采用落地** | 赋能 `FocusTimer` 倒计时刻度盘与专注状态呼吸反馈 |
| **#100** | React Bits | Animated List 列表平滑增删让位 | MIT | 零 | **采用落地** | 赋能 `DormPower` 室友增删与 `PostgradScore` 院校比对动画 |
| **#101** | React Bits | High-Contrast Shiny Text 扫掠微光 | MIT | 零 | **采用落地** | **功能 8**：离线离网就绪指示器（`OfflineReadyBadge`） |
| **#102** | Uiverse | Minimalist Circular Timer 环形表盘 | MIT | 零 | **采用落地** | 落地于 `FocusTimer` 中央环形进度盘与秒针脉冲 |
| **#103** | Uiverse | Floating Rich Text Copy 浮起气泡 | MIT | 零 | **采用落地** | **功能 5**：Markdown 转微信排版助手（`/tools/md-to-wechat`） |
| **#104** | Uiverse | Split-Bill Ledger Card 分摊账本卡片 | MIT | 零 | **采用落地** | **功能 3**：宿舍电费分摊与阶梯均摊计算器（`/tools/dorm-power`） |
| **#105** | Anime.js | Stroke Dashoffset 圆弧高帧率绘制 | MIT | 零 | **采用落地** | 赋能 `FocusTimer` 与 `ExamCountdown` 的 SVG 进度条环 |
| **#106** | Anime.js | Coordinated Tab Slider 弹性定位滑块 | MIT | 零 | **采用落地** | 赋能全站分段选择器与各工具的模式切换底块 |
| **#107** | Anime.js | Counter Roll-Up 倒计时数字翻牌 | MIT | 零 | **采用落地** | **功能 4**：考研/四六级目标倒计时微挂件（`/tools/countdown`） |
| **#108** | Aceternity UI | Spotlight Command Search 居中浮层 | Free License | 零 | **采用落地** | 赋能 `CommandPalette.tsx` 弹窗外框流光氛围与暗夜对比度 |
| **#109** | Aceternity UI | Card Stack 多方案对比叠放卡片 | Free License | 零 | **采用落地** | **功能 2**：考研初复试折算与逆袭推算器（`/tools/postgrad-score`） |
| **#110** | Aceternity UI | Moving Border Gradient 按钮激光边框 | Free License | 零 | **采用落地** | **功能 9**：动态反光卡片与激光描边按钮（`GlareHoverCard`） |
| **—** | NOVIP 自研 | TactileStepper 多步向导全站集成 | 自研 | 零 | **采用落地** | **功能 10**：报名照片与文件工具多步触觉向导无缝实装 |
