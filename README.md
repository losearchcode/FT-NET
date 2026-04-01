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
| 🚚 **分块上传降压** | 上传端按分片加密/上传，服务端顺序落盘，避免大文件“整份加密后再整份上传”带来的高内存占用 |
| 🔐 **可选上传模式** | 支持“端到端加密上传 / 明文直传”两种模式，兼顾隐私保护与性能较弱设备的可用性 |
| 💽 **下载能力分流** | 支持流式保存的浏览器可边下载边写入本地文件；不支持时自动回退并提示内存占用风险 |
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

> 提示：
> - 若需启用**低内存流式保存下载**，建议使用较新的 Edge / Chrome，并通过 `HTTPS` 或 `localhost` 访问。
> - 局域网 `HTTP` 地址通常会被浏览器判定为不安全上下文，因此会自动回退到“内存回退模式”。

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
│   └── index.js            # Node.js 服务端（房间管理 + 分块上传 + 文件存储 + 静态托管）
├── src/
│   ├── hooks/
│   │   └── usePeer.ts      # 核心通讯 Hook（Socket.IO + 分块上传 + 房间状态）
│   ├── components/
│   │   ├── ConnectionPanel.tsx   # 密码大厅入口
│   │   ├── ChatBox.tsx           # 群组通讯录
│   │   └── FileTransfer.tsx      # 公共存储柜（上传模式切换 / 预览 / 下载分流）
│   ├── utils/
│   │   └── cryptoUtils.ts # 文本与文件加解密工具
│   ├── workers/
│   │   ├── encryptWorker.ts # 分块加密 Worker
│   │   └── decryptWorker.ts # 分块解密 Worker
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

### v1.5.0 — 分块上传、可选加密与低内存下载
- 🚚 **分块上传与顺序落盘**：上传端改为分片处理，服务端通过 `init / chunk / complete / abort` 协议顺序写盘，显著降低大文件上传时的浏览器内存压力
- 🔐 **可选上传模式**：文件上传支持“端到端加密上传 / 明文直传”切换，文件列表新增“已加密 / 未加密”状态标记与筛选
- 💽 **下载能力分流**：支持流式保存的浏览器可边下载边解密边写入本地文件；不支持时自动回退到内存模式，并在界面中提示原因
- 🧭 **交互增强**：新增上传模式说明、浏览器能力提示、进入房间后的滚动位置修正，以及群组通讯录仅在自身区域内自动滚动

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

- [ ] **完善端到端加密 (E2EE)**：当前已支持文本消息加密与文件可选加密上传，后续继续完善统一密钥管理、下载体验与安全策略（详见 [`Doc/Encryption_Plan.md`](Doc/Encryption_Plan.md)）
- [ ] HTTPS / WSS 传输层加密
- [ ] 上传模式偏好记忆（记住上次选择“加密上传”或“明文直传”）
- [ ] 下载恢复 / 断点续传
- [ ] 更细粒度的大文件传输校验与异常恢复
- [x] ~~房间在线人数实时显示~~
- [x] ~~文件预览（图片/PDF）~~
- [x] ~~拖拽多文件批量上传~~

---

## 📄 License

MIT
