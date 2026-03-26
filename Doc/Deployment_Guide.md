# FT-NET 服务器生产环境部署指南 (Deployment Guide)

本指引旨在帮助您将 FT-NET（端云合一抗拦截终极版）无缝部署至正式的公网服务器（如各大云厂商的 VPS、轻量应用服务器等，推荐 Ubuntu / CentOS 等 Linux 系统）。

因前后端已完美融合为一体，您在服务器上**只需要启动单一的 Node 进程**，即可同时提供静态页面分发与双工数据通讯服务。

---

## 📡 第一步：提取本地项目代码
为了节省上传时间和服务器空间，您不需要把庞大的依赖模块一起传上去：
1. 请确保您本地已经成功执行过了 `npm run build`（以此保证您本地 `FT-NET` 夹里的 `dist` 静态打包目录是最新的）。
2. 将 `FT-NET` 整个文件夹**打包压缩成一个 ZIP**。
3. **【极度重要】**：打包时请务必**排除 `node_modules` 文件夹和隐藏的 `.git` 文件夹**。但**绝对不能排除 `dist` 文件夹**！

## 🚀 第二步：上传并解压到云服务器
1. 将刚打好的 ZIP 纯净包通过 SSH 工具（如 Xshell, FinalShell, MobaXterm, 或者宝塔网站面板）上传到云服务器上的目标目录，例如 `/www/wwwroot/FT-NET/`。
2. 在服务器上解压该压缩包。

## ⚙️ 第三步：安装服务器 Node 运行时环境
*如果您的服务器之前已经有了 Node.js 环境（推荐版本 v18 或 v20），此步跳过即可。*

在 Ubuntu/Debian 系统终端中，输入以下命令一键外网拉取并安装：
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```
安装完成后可通过 `node -v` 命令检查是否安装成功。

## 📦 第四步：在服务器装配生产核心依赖
在终端输入命令，进入您刚刚解压好的项目根目录：
```bash
cd /www/wwwroot/FT-NET
```
（⚠️ 注意替换为您真实的解压路径）

随后，在此目录下执行安装指令，让系统自动顺着 `package.json` 把那些被您排除掉的必须后端依赖（如 express, multer, socket.io 等）全数装回服务器：
```bash
npm install 
```

## 🛡️ 第五步：利用 PM2 进程管家实现 24 小时后台守护
为了防止您一关掉云服务器的连接窗口网站就跟着断网宕机，必须使用目前市面上最稳定出色的 Node 进程守护神 **PM2**：

```bash
# 1. 全局安装永久守护工具 PM2
npm install -g pm2

# 2. 启动我们的核心代理母服务器！并任意起个进程代号："ftnet-server"
pm2 start server/index.js --name "ftnet-server"

# 3. 把这个运行状态写进存盘列表，防止以后云服务器不慎自动重启而丢失
pm2 save

# 4. 把 PM2 本服务注为宿主机的开机自启项
pm2 startup
```

🎉 **至此，所有的工程化部署大功告成！**
只要去各大云厂商的网络安全组（或宝塔的安全菜单）里，**放行进入您的 `31208` 端口（TCP），即可用 `http://您的服务器公网IP地址:31208/` 全球访问！**

---

## 💡 终极进阶建议：Nginx 反向顶级域名绑定配置
如果您手头已经有了属于自己的域名，且想显得更加专业且美观（比如直接用 `http://m.yourdomain.com` 即可直接出入大厅，而不带一长串难看的数字端口号），您可以配置一条简单的反代请求。

在您的宝塔面板对应站点配置中，或 Nginx 服务器的任意 `server {}` 块里，塞入下面这段核心反向路由代码。把 80 端口（或 443 HTTPS 端口）静默转发给本地隐藏在暗处的 `31208`：

```nginx
location / {
    proxy_pass http://127.0.0.1:31208;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    
    # 【高危预警】：这一段升级协议栈必须原封不动地照抄加进去！
    # 它的意义是为了支撑 Socket.io 后台的 WebSocket 能够实时不断联通讯！否则发不了包！
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "Upgrade";
}
```
