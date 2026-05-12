# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 规范。

## [Unreleased]

### Added

- 新增卡片质量门控（template/redundancy 检测），自动标记降级卡片进入 meta_review
- 新增 knowledge_extract 空结果重试机制，使用更严格的 prompt 二次提取
- 新增领域数据集自动发现，实验设计方案使用真实数据集名称替代占位符
- 新增 `min_shortlist` 可配置参数（默认 8），支持窄领域灵活调整筛选阈值
- 新增 `object_detection` 领域基准知识库条目（VisDrone、COCO 等）
- 新增配置管理 API 端点（字段元数据、配置读取/保存、环境诊断），支持 Web 端动态编辑配置
- 新增浏览器配置编辑器 — 按类别分组的动态表单，支持字符串/整数/浮点/布尔/下拉/密码/标签列表/多行文本等字段类型
- 新增实时日志流推送（WebSocket）与阶段事件追踪（阶段开始/完成/失败，带时间戳）
- 新增 Artifact 查看器增强：30+ 语言的代码语法高亮、文件类型图标、内容搜索、文件大小显示
- 新增 `encoding` 字段到 ArtifactContent 类型，支持二进制/文本文件识别
- 新增 `run_doctor_from_config()` API，支持在内存配置上直接运行健康检查
- 新增研究任务创建弹窗，支持从浏览器直接启动新研究
- 新增 `config_path` 参数到 `create_app()`，支持从 Web 服务保存/重载配置

### Changed

- 改进 literature shortlist 补充策略：动态上限避免噪声稀释，提升补充论文评分
- 改进 run_id 生成：基于 project name 而非 topic，确保同项目 checkpoint 稳定复用
- DuckDuckGo 搜索增加 TLS 1.2 回退与代理感知，解决 ECH 干扰导致的连接重置
- 重构 health 模块，提取 `_run_checks_from_config()` 供 Web 上下文复用
- 改进 artifact 树形列表的错误处理，添加 OSError 保护

### Fixed

- 修复 `hitl_required_stages` 安全校验未接受 tuple 类型的问题
- 修复 artifact 树根节点结构，确保子节点正确包裹

### Added

- 新增阶段卡片折叠/展开、阶段进度计数与状态着色功能
- 实时日志流查看器，支持自动滚动与关键词高亮
- 环境健康诊断工具，支持一键检查 LLM 连接与 API Key 可用性
- 新建研究弹窗，支持自定义研究主题与自动审批选项
- 流水线从历史检查点恢复功能（`POST /api/pipeline/resume/{run_id}`）
  - 运行历史页与运行详情页新增「恢复」按钮
  - 后台 `_write_checkpoint` 新增 topic 存储，支持按主题恢复

### Fixed

- 修复 `GET /pipeline/stages` 中阶段 phase 字段始终为空的问题，阶段现在按 A-H 正确分组
- 展开 `GET /runs` 与 `GET /runs/{run_id}` 的 checkpoint 字段，返回 `current_stage`、`topic`、`status` 等扁平化字段
- 新增 Artifact 浏览与日志读取 API 路由（`/api/runs/{run_id}/artifacts`、`/api/runs/{run_id}/logs`、`/api/runs/{run_id}/hitl`）
- 注册 `/ws/hitl/{run_id}` WebSocket 路由，支持 HITL 人机交互
- 后端 SPA fallback 路由，支持前端 React Router 子路由刷新
- 静态文件服务路径调整为 `frontend/dist/`，适配 Vite 构建产物
- 新增完整功能的 Web Dashboard（React + TypeScript + Vite + Tailwind CSS）
  - 23 阶段流水线可视化监控（时间线、进度条、阶段详情）
  - HITL 人机交互面板（批准/拒绝/编辑/注入指导/协作聊天）
  - Artifact 文件树浏览与多格式预览（Markdown/JSON/代码/图片）
  - 实时日志 tail 与关键词高亮
  - 运行历史列表与详情查看
  - 交付物预览（论文、验证报告）与下载
  - 设置页（服务健康、配置摘要）
- 界面全面汉化

### Changed

- 更新 `.gitignore`，仅忽略前端依赖与构建缓存，保留源码与产物

### Added

- 管线架构/主题发现能力增强（解决管线未能发现已发布 YOLO26 的问题）：
  - Stage-02 新增 web 搜索验证步骤，检查主题中核心技术组件（模型、库、工具）是否真实存在，产出 `topic_verification.json`
  - Stage-03 搜索回退计划增加 `general_web` 策略和 `web_general` 源，覆盖通用网页搜索
  - Stage-04 将通用网页搜索结果（官方文档、GitHub 仓库、博客等）转换为候选条目写入 `candidates.jsonl`，而非仅作为辅助上下文
  - Stage-04 从 `topic_verification.json` 和 `search_plan.yaml` 收集种子 URL，传入 WebSearchAgent 进行权威内容抓取
  - Stage-06 知识提取阶段注入架构验证说明，提示 LLM 将权威来源作为参考
