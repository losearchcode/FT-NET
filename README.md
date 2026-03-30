<p align="center">
  <h1 align="center">🌐 FT-NET</h1>
  <p align="center">
    <b>零配置 · 密码即房间 · 阅后即焚</b><br/>
    基于星型拓扑的局域网/公网即时群组通讯与文件共享一体化平台
  </p>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-v18+-339933?logo=nodedotjs&logoColor=white" />
  <img src="https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white" />
  <img src="https://img.shields.io/badge/Socket.IO-4.x-010101?logo=socketdotio&logoColor=white" />
  <img src="https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white" />
  <img src="https://img.shields.io/badge/License-MIT-blue" />
</p>

<p align="center">
  <img src="Doc/Images/FT-NET.png" alt="FT-NET 效果图" width="800" />
</p>

---

## ✨ 产品亮点

| 特性 | 描述 |
|------|------|
| 🔑 **密码即房间** | 无需注册账号，输入相同密码的用户自动进入同一个私密群组空间 |
| 💾 **服务端物理存储** | 上传的文件实体安全保存在服务器磁盘，房间内所有人可随时主动拉取下载 |
| 💬 **实时群组通讯** | 基于 Socket.IO 的多人即时聊天，中途加入的成员自动同步全部历史记录 |
| 📦 **批量文件管理** | 支持全选/多选复选框，一键批量下载或删除服务器上的文件资源 |
| ♻️ **阅后即焚** | 当房间人数归零时，服务器自动销毁该房间的全部聊天记录与物理文件 |
| 🛡️ **大文件稳传** | 移除 Node.js 默认超时限制 + 前端自动重试机制，支持 GB 级文件稳定传输 |
| 🎨 **现代暗黑 UI** | Glassmorphism 毛玻璃设计 + 聊天气泡 + 响应式自适应滑窗布局 |
| 👁️ **文件快捷预览** | 图片/PDF/文本代码文件（txt/md/json/csv/js/py 等 30+ 格式）无需下载即可在线预览 |

---

## 🏗️ 系统架构

```
┌──────────────────────────────────────────────────┐
│              Browser (React + Vite)              │
│  ┌────────────┐  ┌──────────┐  ┌──────────────┐  │
│  │ 密码大厅    │  │ 群组通讯  │  │ 公共存储柜   │  │
│  └─────┬──────┘  └────┬─────┘  └──────┬───────┘  │
│        │              │               │           │
│        └──────────────┼───────────────┘           │
│                       │ 同源单端口                 │
└───────────────────────┼──────────────────────────┘
                        ▼
┌───────────────────────────────────────────────────┐
│          Node.js Express + Socket.IO              │
│          (统一端口: PORT from .env)                │
│                                                   │
│  ┌─────────┐  ┌──────────┐  ┌──────────────────┐ │
│  │ 房间管理 │  │ 消息广播  │  │ 文件存储/下载    │ │
│  │ (内存)   │  │ (Socket) │  │ (磁盘 /uploads/) │ │
│  └─────────┘  └──────────┘  └──────────────────┘ │
│                                                   │
│  🗑️ 人数归零 → 自动销毁内存 + rm -rf 物理文件     │
└───────────────────────────────────────────────────┘
```

**核心设计：端云合一同源架构** — 前端静态资源由 Express 直接托管分发，WebSocket 通讯与 HTTP 文件接口共享同一端口。一个端口解决所有问题，彻底免疫防火墙跨域拦截。

---

## 🚀 快速开始

### 环境要求
- **Node.js** ≥ v18（推荐 v20）
- **npm** ≥ v8

### 安装与运行

```bash
# 1. 克隆项目
git clone <your-repo-url>
cd FT-NET

# 2. 安装依赖
npm install

# 3. 编译前端
npm run build

# 4. 启动服务（一个命令，全站就绪）
node server/index.js
```

启动后访问终端显示的地址（默认 `http://localhost:31208`），在任意设备浏览器输入相同密码即可组建群组。

### 环境变量配置

编辑项目根目录下的 `.env` 文件自定义端口：

```env
# 统一服务端口（同时承载网页面板 + WebSocket + 文件接口）
PORT=31208
```

---

## 📁 项目结构

```
FT-NET/
├── .env                    # 环境变量配置
├── server/
│   └── index.js            # Node.js 服务端（房间管理 + 文件存储 + 静态托管）
├── src/
│   ├── hooks/
│   │   └── usePeer.ts      # 核心通讯 Hook（Socket.IO + 文件上传）
│   ├── components/
│   │   ├── ConnectionPanel.tsx   # 密码大厅入口
│   │   ├── ChatBox.tsx           # 群组通讯录
│   │   └── FileTransfer.tsx      # 公共存储柜
│   ├── types.ts            # TypeScript 类型定义
│   ├── App.tsx             # 主应用组件
│   ├── index.css           # 全局样式系统
│   └── main.tsx            # 入口文件
├── Doc/
│   ├── User_Manual.md      # 使用手册
│   ├── Deployment_Guide.md # 服务器部署指南
│   └── Encryption_Plan.md  # 端到端加密规划
└── dist/                   # 编译产物（由 npm run build 生成）
```

---

## 🌍 服务器部署

> 详细教程请见 [`Doc/Deployment_Guide.md`](Doc/Deployment_Guide.md)

精简版：

```bash
# 上传项目至服务器后
cd /your/path/FT-NET
npm install
npm install -g pm2
pm2 start server/index.js --name ftnet
pm2 save && pm2 startup
```

记得在云服务器安全组中**放行 `.env` 中配置的端口**（默认 `31208`）。

如需绑定域名，配置 Nginx 反向代理时务必加上 WebSocket 升级头：

```nginx
location / {
    proxy_pass http://127.0.0.1:31208;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "Upgrade";
}
```

---

## 📋 更新日志

### v1.4.0 — 文件在线预览
- 👁️ **图片/PDF 在线预览**：文件列表中对图片（jpg/png/gif/webp/bmp/svg）和 PDF 文件显示预览按钮，点击即弹出全屏毛玻璃遮罩预览窗口
- 📝 **文本/代码文件预览**：支持 txt、md、json、csv、log、yaml、xml、js、ts、py、java、go 等 30+ 种常见文本格式，暗黑主题等宽字体渲染
- 🔧 **服务端内联返回**：新增 `?preview=1` 查询参数支持，预览时使用 `Content-Disposition: inline` 内联返回文件流，全部文本类 MIME 强制 `charset=utf-8` 确保中文正常显示

### v1.3.0 — 多文件批量上传与在线人数显示
- 📂 **拖拽多文件批量上传**：拖拽区和文件选择器均支持一次选中多个文件同时上传
- 👥 **房间在线人数实时显示**：左侧面板实时展示当前房间在线人数徽标，随进出即时刷新

### v1.2.0 — 大文件传输稳定性加固
- 🔧 **移除 Node.js HTTP Server 默认超时限制**（`timeout`、`headersTimeout`、`requestTimeout`、`keepAliveTimeout` 全部置零），彻底根治大文件上传中途被静默截断的问题
- 🔧 **前端 XHR 超时解锁**：将浏览器端 `xhr.timeout` 设为 `0`，并增加 `ontimeout` / `onabort` 精确事件捕获
- 🔄 **智能重试机制**：上传失败后自动等待 1.5 秒重试，最多 3 次，提升弱网环境稳定性
- 📏 **Multer 体积上限**：显式声明单文件最大 10GB 上传限制

### v1.1.0 — 批量管理与环境变量
- ✅ 文件列表复选框：支持全选/多选/单选
- 🗑️ 批量下载与批量删除功能
- ⚙️ 引入 `.env` 环境变量配置，端口可热插拔
- 📖 新增 `Doc/` 目录：部署指南、使用手册、加密规划

### v1.0.0 — 星型拓扑中心化房间架构
- 🏠 密码即房间：输入相同密码自动进入同一群组
- 💾 服务端文件物理存储与按需拉取下载
- 💬 Socket.IO 实时群聊 + 历史消息漫游同步
- ♻️ 人数归零自动销毁房间数据与物理文件
- 🎨 暗黑毛玻璃 UI + 聊天气泡 + 响应式滑窗布局
- 🌐 端云合一同源架构：单端口同时承载前端 + API + WebSocket

---

## 🔮 To-do

- [ ] **端到端加密 (E2EE)**：利用房间密码作为 AES-256 对称密钥，实现前端本地加密/解密，服务端零知识存储（详见 [`Doc/Encryption_Plan.md`](Doc/Encryption_Plan.md)）
- [ ] HTTPS / WSS 传输层加密
- [x] ~~房间在线人数实时显示~~
- [x] ~~文件预览（图片/PDF）~~
- [x] ~~拖拽多文件批量上传~~

---

## 📄 License

MIT
