# 可选 Office 保真服务

这是实际 FastAPI + LibreOffice 服务，不是模拟接口。当前公开站点未配置这个后端；浏览器基础模式仍可使用。静态托管 / Cloudflare Workers 不能执行 LibreOffice。

`docker compose up -d --build` 在自有 Linux 服务器运行。容器监听 127.0.0.1:8000，需在已有 HTTPS 反向代理后发布。建议至少 2 vCPU、2 GB 内存、2 GB 可用磁盘。部署产生费用前必须获得站主批准。

设置 `ALLOWED_ORIGINS` 为前端域名。前端构建时设置 `VITE_OFFICE_API_URL=https://你的转换服务域名`，再构建发布。选择保真模式会显示上传提示。不要把 Token 或私有服务凭据写入前端。

单进程、单转换并发；每 IP 每分钟五次；DOCX/PPTX 真类型检查、单文件20MB、解压80MB、页数50、处理90秒。禁用宏，拒绝外部资源和嵌入程序；每次独立临时目录 / LO 用户配置，进程组清理及 CPU/内存/输出限制，成功/失败删除临时文件。容器非 root、只读根目录、tmpfs、禁提权、丢弃 capabilities。建议反向代理限制请求体20MB及请求速率；应用仍有读取大小上限，UploadFile 暂存也只位于 /tmp。

自有闲置服务器可无新增云实例费用；无机器则需另选主机并授权。没有使用付费转换 API。部署前应持续安装系统与 LibreOffice 安全更新，生产容器镜像应固定经过测试的 digest。fonts-noto-cjk 使用随系统附带的 OFL 许可证；DOCX/PPTX 指定但服务器没有的字体仍会替换。
