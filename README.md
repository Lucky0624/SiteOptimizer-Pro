# 🚀 SiteOptimizer Pro

**SiteOptimizer Pro** 是一款专为独立站（Shopify / WordPress）设计的专业级多站点 SEO 自动化管理与优化平台。

通过整合 **Google Search Console (GSC)**、**Google Analytics 4 (GA4)** 和 **PageSpeed Insights (PSI)**，本项目实现了一套自动化的 SEO 闭环：从数据拉取、指标分析、任务分配到自动优化，帮助跨境电商卖家和 SEO 专家高效管理成百上千个站点的搜索表现。

---

## ✨ 核心特性

- **📂 多站点管理系统**：支持同时配置多个 Shopify 或 WordPress 站点，每个站点拥有独立的 API 凭据和统计视角。
- **🔄 自动化 SEO 循环**：每日自动同步 GSC 排名数据、GA4 转化指标及 PSI 性能得分。
- **📊 多维度智能分析**：
  - **机会发现**：自动识别高曝光、低点击的“潜力页面”。
  - **衰退预警**：实时追踪流量下滑的页面并触发警报。
  - **转化分析**：结合 GA4 数据，直接在 SEO 仪表盘查看 ROI 和转化率。
- **🛠️ 任务调度引擎**：基于优先级评分（Priority Score）自动分配 URL 检查、索引提交和性能检测任务。
- **🎨 现代感交互界面**：采用 Glassmorphism（玻璃拟态）设计的响应式仪表盘，支持中英文双语切换。

---

## 🛠️ 技术栈

- **后端**: FastAPI (Python), SQLAlchemy (Async), PostgreSQL/SQLite
- **前端**: React, TypeScript, Tailwind CSS, Vite
- **API 集成**: Google Search Console API, GA4 Data API, PageSpeed Insights API, Shopify Admin API, WordPress Rest API

---

## 🚀 快速开始

### 1. 克隆并进入项目
```bash
git clone https://github.com/Lucky0624/SiteOptimizer-Pro.git
cd SiteOptimizer-Pro
```

### 2. 后端配置 (Backend)
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows 使用: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env  # 设置 Admin Key；Google 凭据在界面中导入
python main.py
```

### 3. 前端配置 (Frontend)
```bash
cd frontend
npm install
npm run dev
```

---

## ⚙️ 核心配置说明

在 `backend/.env` 中，您需要配置以下关键参数：
- `ADMIN_KEY`: 访问后台的管理员密钥（需与前端登录一致）。
- `DATABASE_URL`: 数据库连接字符串。
- `CREDENTIAL_ENCRYPTION_KEY`: 非 Windows 系统必填，用于在本机加密保存导入的 Google 私钥。

启动前后端后，在“系统设置”中导入 Google Cloud 下载的服务账号 JSON 密钥文件。应用只显示服务账号邮箱和项目 ID；私钥在写入本地数据库前加密保存。随后在“站点管理”配置 GSC 属性地址（例如 `sc-domain:example.com` 或 `https://www.example.com/`），并执行站点级连接测试。

---

## 📁 项目结构

```text
SiteOptimizer Pro/
├── backend/
│   ├── app/
│   │   ├── api/           # API 路由 (Websites, URLs, Dashboard)
│   │   ├── models/        # 数据库模型 (SQLAlchemy)
│   │   ├── services/      # 核心逻辑 (SEO Loop, Google Client, Tag Engine)
│   │   └── schemas/       # Pydantic 数据验证
│   └── main.py            # 应用入口
├── frontend/
│   ├── src/
│   │   ├── pages/         # 页面 (Dashboard, WebsiteManagement, etc.)
│   │   ├── components/    # 玻璃拟态 UI 组件
│   │   └── services/      # API 请求封装
│   └── vite.config.ts
└── README.md
```

---

## 🤝 贡献指南

我们欢迎所有形式的贡献！无论是修复 Bug、增加新功能还是改进文档，请随时提交 Pull Request。

---

## 📄 开源协议

本项目采用 [MIT License](LICENSE) 协议。

---

> **作者**: [Lucky0624](https://github.com/Lucky0624)  
> **愿景**: 让每一封网页都能在搜索引擎中发光发热。
