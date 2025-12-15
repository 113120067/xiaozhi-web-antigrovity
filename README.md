# xiaozhi-webui

> 本项目供学习交流使用，如果有问题欢迎联系 zamyang@qq.com

## 项目简介

声明：「小智」项目起源于 [虾哥](https://github.com/78/xiaozhi-esp32) 之手。

本项目 xiaozhi-webui 是一个使用 **Node.js (TypeScript)** + **Vue3** 实现的小智语音 Web 端，旨在通过代码学习和在没有硬件条件下體驗 AI 小智的對話功能。

本仓库使用 Vue3 基于 [xiaozhi-web-client](https://github.com/TOM88812/xiaozhi-web-client) 进行重构，并进行了一定的优化和拓展。

小智美美滴头像取自 [小红书 @涂丫丫](http://xhslink.com/a/ZWjAcoOzvzq9)

## 演示

<div style="display: flex; justify-content: space-around; margin-bottom: 20px;">
    <img src="./images/聊天.jpg" alt="聊天" style="width: 45%;">
    <img src="./images/聊天3.jpg" alt="聊天3" style="width: 45%;">
</div>

<div style="display: flex; justify-content: space-around;">
    <img src="./images/设置面板.jpg" alt="设置面板" style="width: 45%;">
    <img src="./images/语音通话.jpg" alt="语音通话" style="width: 45%;">
</div>

## 功能特点

- [x] 文字聊天：像微信好友一样聊天
- [x] 语音聊天：和小智进行语音对话，支持打断
- [x] 自动配置：自动获取 MAC 地址、更新 OTA 版本，避免繁杂的配置流程
- [x] 反馈动效：（语音对话时）用户的说话波形 + 小智回答时的头像缩放动画
- [x] 移动适配：支持移动端配置服务器地址

## 系統要求
- Node.js 18+  (建議 v20 LTS)
- pnpm (推薦) 或 npm
- 支援的作業系統：Windows 10+、macOS、Linux

## 快速開始

### 方式一：一键启动（推荐）

1. 克隆项目并进入目录

```bash
git clone https://github.com/kalicyh/xiaozhi-webui.git
cd xiaozhi-webui
```

2. 安装前端依赖

```bash
pnpm install
```

3. 安装后端依赖 (Node.js Service)

```bash
cd service
npm install
cd ..
```

4. 同时启动前后端

```bash
pnpm dev
```

此命令将使用 `concurrently` 同时启动前端 (Vite) 和 后端 (Node.js Service)。啟動後，瀏覽器應會自動打開 `http://localhost:5173`。

## 使用說明

1. **檢查設備 ID**
   - 啟動成功後，進入網頁點擊左上角的「設置」圖示。
   - 在「小智信息」中，您應該能看到自動生成的 `Device ID`。這代表後端模擬器已成功運作。

2. **開始聊天**
   - **文字對話**：直接在下方輸入框打字「你好」，小智應會回覆。
   - **語音對話**：點擊麥克風圖示（或切換到語音模式），允許瀏覽器使用麥克風。
   - **說話**：嘗試說「現在幾點了？」，小智會以語音回覆您。

3. **除錯**
   - 如果無法連線，請檢查終端機 (Terminal) 的輸出日誌。
   - 正常的日誌應包含 `Connected to Xiaozhi Cloud`。


## 项目结构 (Node.js Rewrite)

本项目已从 Python 后端迁移至纯 Node.js 架构，无需安装 Python 环境。

```
├── service/                            # Node.js 后端服务 (替代原 backend)
│   ├── src/
│   │   ├── config/                     # 配置管理
│   │   ├── protocol/                   # 小智协议模拟
│   │   ├── transport/                  # WebSocket 代理
│   │   └── audio/                      # Opus/PCM 音频处理
│   ├── package.json
│   └── tsconfig.json
├── src/                                # 前端源码目录
│   ├── ...
├── backend_old/                        # 原 Python 后端 (已废弃备份)
└── package.json
```

## 技术栈

**前端**
- 框架： Vue3 + TypeScript + Pinia
- 构建工具：Vite
- 包管理器：pnpm
- UI 组件：Element Plus

**后端 (Service)**
- 运行环境：Node.js (LTS)
- 语言：TypeScript
- 框架：无 (原生 WebSocket + Fastify/Node libraries)
- 音频处理：@discordjs/opus (或 opus-script)
