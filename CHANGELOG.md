# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 规范。

## [Unreleased]

### Added

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
