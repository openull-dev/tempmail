# tempmail
这是一个基于 Node.js 的临时邮箱系统，支持多语言、HTTPS、固定域名选择、任意域名 MX 解析接收邮件等功能。以下是完整的搭建和运行指南。
功能概览
多语言支持：简体中文、繁体中文、英文、意大利语、西班牙语。
邮箱有效期：默认 10 分钟，支持手动延长。
复制功能：一键复制邮箱地址。
HTTPS 支持：通过 Nginx 和 Let’s Encrypt 实现。
域名支持：
主域名（如 email.yourdomain.com）用于访问程序。
固定域名（如 yourdomain1.com）供用户选择。
任意域名通过 MX 记录接收邮件。
进程常驻：使用 PM2 保持后台运行。
前置要求
操作系统：Linux（推荐 Ubuntu）
软件：
Node.js（建议 v16 或以上）
Nginx
Certbot（用于 HTTPS）
PM2（用于进程管理）
硬件：一台具有公网 IP 的服务器
域名：至少一个主域名和几个固定域名
