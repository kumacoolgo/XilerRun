# Run Tracker

一个自托管的网页版跑步记录应用，支持：

- 浏览器 GPS 实时记录（开始 / 停止）
- 导入 GPX 文件（例如手表或其他跑步 App 导出）
- 每次跑步详情：总距离 / 用时 / 平均配速 / 每公里配速 / 轨迹地图 / 截图
- 周 / 月统计 + 柱状图
- 个人最佳（最长距离 / 最快平均配速 / 估算最佳 5K / 10K / 半马）
- 本周目标里程 + 进度条
- 导出所有记录为 CSV
- PWA：可添加到主屏幕，当作 App 使用

## 本地运行

1. 安装依赖：

   ```bash
   npm install
   ```

2. 创建数据库（PostgreSQL），例如：

   ```sql
   CREATE DATABASE run_tracker;
   ```

3. 初始化表结构：

   ```bash
   psql -d run_tracker -f schema.sql
   ```

4. 复制环境变量示例并修改：

   ```bash
   cp .env.example .env
   ```

   将 `DATABASE_URL` 改成你的本地连接串。

5. 启动：

   ```bash
   npm run dev
   # 或
   npm start
   ```

   浏览器打开：<http://localhost:3000>

## 部署到 Zeabur（或其他平台）

1. 将该仓库推送到 GitHub。
2. 在 Zeabur 新建项目，选择该仓库。
3. 添加一个 PostgreSQL 服务，获取 `DATABASE_URL`。
4. 在 Web 服务的环境变量中设置：

   - `DATABASE_URL`：Postgres 连接串
   - `DATABASE_SSL`：通常保持 `true`
   - `PORT`：可选，默认为 3000

5. 初始化数据库（在本地或通过远程方式执行 `schema.sql`）。
6. 部署完成后，通过 Zeabur 提供的 HTTPS 域名访问。

> 建议将 `uploads/` 目录挂载为持久化卷，以免重启时截图丢失。

## 目录结构

- `src/`：Node.js 后端
- `public/`：前端静态资源（HTML / CSS / JS / PWA）
- `uploads/`：运行时保存的截图（通过 `/uploads/...` 访问）
- `schema.sql`：数据库表结构定义
