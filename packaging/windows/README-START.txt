SiteOptimizer Pro 本机测试包使用说明
====================================

1. 首次使用请双击 install-dependencies.bat
   它会在当前目录创建 .venv，并安装后端依赖。

2. 安装完成后双击 start-siteoptimizer.bat
   第一次启动会要求你设置“本机访问口令”。
   如果直接回车，会使用 siteoptimizer-test 作为测试口令。

3. 浏览器会自动打开：
   http://127.0.0.1:8000

4. 登录后请到“系统设置”导入 Google 服务账号 JSON 密钥。
   不要把 JSON 密钥发到聊天或放到公开仓库。

5. 本地数据文件：
   backend\siteoptimizer.db

6. 本地配置文件：
   backend\.env

7. 停止软件：
   在启动窗口按 Ctrl+C，然后确认结束。

如果 8000 端口被占用，请先关闭其他正在运行的 SiteOptimizer 后端。
