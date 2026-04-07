# AiMeeting — 智能在线会议系统

一个功能完整的网络会议系统，支持**视频通话**、**屏幕共享**、**即时 / 预约会议**、**自动录制与 AI 纪要**、**远程控制**、**邮件邀请（含日历附件）**等核心功能。

---

## 功能特性

| 功能 | 说明 |
|---|---|
| 📹 视频会议 | WebRTC 全网状 P2P 多人视频 / 音频通话 |
| 🖥 屏幕共享 | 一键共享桌面，录制时自动切换为全屏布局 |
| ⏺ 会议录制 | Canvas 合成器（1280×720，30fps）混合所有流，实时流式传输到服务端；自动触发 AI 转录与纪要 |
| 🤖 AI 转录 | 支持本地 Qwen3-ASR-1.7B（推荐）或 OpenAI Whisper-1 语音识别，自动切换 |
| 📝 AI 纪要 | 支持本地/自定义 LLM（Ollama 等）或 OpenAI GPT-4o 生成结构化中文会议纪要（含行动项、决议表格）|
| 🖱 远程控制 | 实时鼠标指针同步；录制时被控方桌面自动作为主画面 |
| 💬 即时聊天 | 会议内文字聊天，未读消息角标 |
| 📅 预约会议 | 支持即时与预约两种模式，预约邀请邮件附 iCal 日历（.ics）|
| 📧 邮件邀请 | 创建 / 会中均可邀请，自动发送含加入链接的 HTML 邮件 |
| 🔐 账号体系 | JWT 登录，bcrypt 密码哈希，忘记密码邮件重置 |
| 👑 管理员角色 | 通过 `ADMIN_EMAIL` 指定系统管理员；可在首页或会议中通过 UI 配置 ASR / LLM 服务，无需重启后端 |
| 🛡 会议权限 | 口令保护、主持人锁会、踢人、主持权移交 |
| 🌐 TURN 支持 | 服务端下发 ICE/TURN 配置，支持复杂 NAT 穿透 |

---

## 技术架构

```
前端   React 18 + TypeScript + Vite + Tailwind CSS
后端   Node.js + Express + Socket.IO + TypeScript
通信   WebRTC（P2P 视频/音频/数据通道）+ Socket.IO（信令/聊天/录制流）
AI     ASR：Qwen3-ASR-1.7B（本地）或 OpenAI Whisper-1（云端）
       LLM：自定义本地模型（Ollama 等）或 OpenAI GPT-4o（纪要生成）
邮件   Nodemailer（支持任意 SMTP；预约会议附 iCal 附件）
```

---

## 快速开始

### 1. 配置环境变量

```bash
cp backend/.env.example backend/.env
```

编辑 `backend/.env`，至少填入以下必填项：

```env
JWT_SECRET=replace-with-a-long-random-secret
APP_BASE_URL=http://localhost:3000
```

**可选：指定系统管理员**

```env
ADMIN_EMAIL=admin@example.com
```

> 设置后，该邮箱登录的账号将拥有管理员权限，可在首页"AI 服务配置"入口或会议工具栏通过 UI 配置 ASR / LLM 服务，配置实时生效并持久保存，无需修改环境变量或重启后端。

**如需使用 OpenAI ASR / LLM（未配置本地服务时的默认回退）**

```env
OPENAI_API_KEY=your-openai-key
```

**可选：本地 ASR 语音识别（Qwen3-ASR-1.7B）**

```env
ASR_BASE_URL=http://localhost:8000
ASR_MODEL=Qwen/Qwen3-ASR-1.7B
ASR_API_KEY=EMPTY
```

> 设置后使用本地模型转录，跳过 OpenAI Whisper。启动方式见 `backend/asr_server.py`。

**可选：自定义 LLM 纪要生成（Ollama 等）**

```env
LLM_BASE_URL=http://localhost:11434
LLM_MODEL=qwen3
LLM_API_KEY=EMPTY
```

> 任何兼容 OpenAI Chat Completions API 的服务均可使用。未配置时回退到 GPT-4o。

**可选：TURN 服务器（生产环境建议配置）**

```env
TURN_URLS=turn:turn.example.com:3478?transport=udp,turns:turn.example.com:5349?transport=tcp
TURN_USERNAME=turn-user
TURN_CREDENTIAL=turn-password
```

**可选：SMTP 邮件服务**

```env
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=mailer@example.com
SMTP_PASS=your-password
SMTP_FROM=AiMeeting <noreply@example.com>
PASSWORD_RESET_TOKEN_TTL_MINUTES=30
```

> 未配置 SMTP 时，邮件功能静默降级——API 仍返回 `previewLinks`，录制/纪要等功能不受影响。

### 2. 安装依赖

```bash
npm install
npm --prefix backend install
npm --prefix frontend install
```

### 3. 启动开发环境

```bash
npm run dev
```

- 前端：`http://localhost:3000`
- 后端：`http://localhost:3001`

分开启动：

```bash
npm run dev:backend
npm run dev:frontend
```

### Docker Compose 一键部署

```bash
docker compose up --build
```

附带可选 TURN 服务器：

```bash
docker compose --profile turn up --build
```

### 客户端打包

- 仅构建当前机器所在平台的客户端：

```bash
npm run build:client
```

- 需要同时输出 macOS、Windows、Linux 三个平台安装包时，使用 GitHub Actions 里的 `Client Bundles` workflow。
- 可以在 GitHub Actions 页面手动触发 `workflow_dispatch`，也可以推送形如 `client-v0.1.0` 的 tag 自动触发。
- `workflow_dispatch` 会生成三平台构建 artifacts；推送 `client-v*` tag 时，workflow 还会自动创建或更新对应的 GitHub Release，并把三平台安装包直接挂到 Release 页面。
- 示例：

```bash
git tag client-v0.1.0
git push origin client-v0.1.0
```

- workflow 会分别产出以下客户端包并上传为构建 artifacts：
- macOS：`.app`、`.dmg`
- Windows：`.msi`、`.exe`
- Linux：`.deb`、`.AppImage`、`.rpm`

---

## 使用说明

### 账号与登录

1. 打开 `http://localhost:3000`，注册或登录账号。
2. 忘记密码：点击登录卡片中的"忘记密码"，填写邮箱，按邮件中的链接重置密码。

### 创建 / 加入会议

- **即时会议**：选择"即时会议"，填写标题和可选口令，点击"创建并进入会议"。
- **预约会议**：选择"预约会议"，填写会议时间，邀请邮件将附带 iCal 日历文件。
- **加入会议**：切换到"加入会议"，输入会议室 ID；或直接点击邀请链接自动填入。
- **受邀加入**：被邀请邮箱用户无需输入口令，且不受会议锁定限制直接加入。

### 邀请参会者

- 创建时在"邀请参与者"输入框填写邮箱（逗号/分号/换行分隔，最多 50 个）。
- 会中点击底部"邀请"按钮，在邀请面板复制链接或发送邮件邀请。

### 录制与 AI 纪要

1. 点击底部**录制**按钮开始录制——画面由 Canvas 合成器混流（屏幕共享/被控桌面优先全屏，摄像头退为小窗）。
2. 再次点击停止录制；录制文件自动上传服务端。
3. 上传完成后自动触发语音转录（本地 Qwen3-ASR-1.7B 或 Whisper），转录完成后自动调用配置的 LLM（本地或 GPT-4o）生成会议纪要。
4. 在**AI 纪要**侧边栏查看或复制纪要；录制文件可通过下载接口保存。

### 屏幕共享

- 点击底部**共享**按钮，选择窗口或整个屏幕；关闭系统提示条或再次点击停止均可结束。
- 共享时如同时录制，录制画面自动以共享屏幕为主画面，本地摄像头退至右下角 PiP。
- 远端参与者开启共享时，其共享画面同样在录制中优先显示。

### 远程控制

1. 打开**远程控制**侧边栏，选择参与者并发起控制请求。
2. 被控方在页面顶部横幅看到确认请求，可接受或拒绝。
3. 接受后控制方的鼠标移动实时显示在被控方视频画面上；点击操作显示点击动画。
4. 指针 3 秒无移动后自动隐藏。
5. 任意一方可随时结束控制。
6. 录制时被控方的视频流自动作为录制主画面。

### 会议权限（主持人）

- **锁定会议**：阻止新人加入（已邀请的邮箱不受影响）。
- **踢出参会者**：将指定参会者移出会议。
- **移交主持人**：将主持权转给任意参会者。

---

## API 接口

### 认证

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/auth/register` | 注册账号（姓名 2–50 字符，密码 8–128 字符）|
| POST | `/api/auth/login` | 登录，返回 JWT（12 小时有效）|
| GET  | `/api/auth/me` | 获取当前用户信息（需登录）|
| POST | `/api/auth/forgot-password` | 发起密码重置（发送邮件或返回预览链接）|
| POST | `/api/auth/reset-password` | 使用令牌设置新密码 |

### 配置

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/config/client` | 获取 WebRTC ICE/TURN 服务器配置（需登录）|
| GET | `/api/config/ai` | 获取当前 AI 服务配置（需登录，API Key 脱敏返回）|
| PUT | `/api/config/ai` | 更新 AI 服务配置（需管理员）|
| POST | `/api/config/ai/test` | 测试 ASR / LLM 连接（需管理员）|

### 会议室

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/rooms` | 创建会议室（支持 `roomType`、`scheduledAt`、`invitedEmails`）|
| GET  | `/api/rooms/:roomId` | 查询会议室信息 |
| POST | `/api/rooms/:roomId/access` | 校验入会权限（口令、锁定、邀请状态）|
| POST | `/api/rooms/:roomId/invite` | 会中发送邀请邮件（主持人或房主）|

### 录制

| 方法 | 路径 | 说明 |
|---|---|---|
| GET  | `/api/recordings/:fileId/download` | 下载录制文件（需登录）|
| POST | `/api/recordings/upload` | 直接上传录制文件（最大 500 MB）|
| POST | `/api/recordings/:fileId/transcribe` | 手动触发语音转录（自动选择本地 Qwen3-ASR-1.7B 或 Whisper）|
| POST | `/api/recordings/minutes` | 手动生成 AI 会议纪要（自动选择本地 LLM 或 GPT-4o）|

### Socket 事件（客户端 → 服务端）

| 事件 | 说明 |
|---|---|
| `join-room` | 加入会议室 |
| `offer` / `answer` / `ice-candidate` | WebRTC 信令转发 |
| `chat-message` | 发送聊天消息（最大 2000 字符）|
| `toggle-room-lock` | 锁定或解锁会议（主持人）|
| `kick-participant` | 踢出参会者（主持人）|
| `transfer-host` | 移交主持人（主持人）|
| `remote-control-request` | 请求远程控制 |
| `remote-control-response` | 接受或拒绝远程控制 |
| `remote-control-end` | 结束远程控制 |
| `recording-start` | 开始服务端录制 |
| `recording-chunk` | 发送录制数据块（二进制）|
| `recording-stop` | 停止录制，触发 AI 流水线 |

### Socket 事件（服务端 → 客户端）

| 事件 | 说明 |
|---|---|
| `room-joined` | 加入成功，返回参会者列表与主持人状态 |
| `participant-joined` / `participant-left` | 参会者进出通知 |
| `host-changed` | 主持人变更通知 |
| `room-locked-state` | 会议锁定状态广播 |
| `chat-message` | 聊天消息广播 |
| `participant-kicked` | 通知被踢出的参会者 |
| `room-error` | 错误通知（锁定、口令错误等）|
| `remote-control-request` / `remote-control-response` / `remote-control-end` | 远程控制信令 |
| `recording-saved` | 录制文件保存完成 |
| `recording-transcribed` | 语音转录完成（Qwen3-ASR-1.7B 或 Whisper） |
| `recording-minutes` | 纪要生成完成（本地 LLM 或 GPT-4o）|
| `recording-error` / `recording-minutes-error` | AI 流水线错误 |

### 数据通道消息类型（P2P）

| 类型 | 说明 |
|---|---|
| `media-state` | 音视频开关状态同步 |
| `screen-share-state` | 屏幕共享开始或结束通知（供录制合成器使用）|
| `remote-pointer` | 鼠标指针位置（归一化 0–1 坐标）|
| `remote-click` | 鼠标点击事件 |

---

## User Stories

### US-001 · 账号注册与登录

**As a** 新用户  
**I want to** 用邮箱和密码注册并登录  
**So that** 我可以使用会议相关功能

**验收标准**
- 注册时姓名 2–50 字符、邮箱格式正确、密码 8–128 字符，不符合要求时显示具体错误提示
- 同一邮箱不可重复注册
- 登录成功后获取 JWT，12 小时后过期需重新登录
- 未登录时无法创建或加入会议，页面引导跳转至登录

---

### US-002 · 忘记密码

**As a** 忘记密码的用户  
**I want to** 通过邮件重置密码  
**So that** 我可以恢复账号访问

**验收标准**
- 在登录页点击"忘记密码"，输入注册邮箱，提交后发送重置邮件
- 邮件中含带令牌的重置链接，有效期 30 分钟（可通过环境变量配置）
- 通过链接可设置新密码（8–128 字符），设置后原令牌失效
- 未配置 SMTP 时，API 响应中直接返回重置链接（开发模式）
- 同一邮箱 15 分钟内最多发起 5 次重置请求

---

### US-003 · 创建即时会议

**As a** 已登录用户  
**I want to** 快速创建一个即时会议并进入  
**So that** 我可以立即与他人开始视频通话

**验收标准**
- 可自定义会议标题（2–80 字符），不填时默认"姓名 的会议"
- 可设置 4–32 字符的会议口令；不设置则任何知道 ID 的人均可加入
- 系统自动生成 7 位会议室 ID；用户也可自定义 3–32 位 ID（字母数字加 `-_`）
- 创建成功后立即进入会议并被设置为主持人
- 可在创建时填写最多 50 个受邀者邮箱，系统自动发送邀请邮件

---

### US-004 · 创建预约会议

**As a** 需要提前安排日程的用户  
**I want to** 预约一个未来的会议并通知参会者  
**So that** 大家可以提前安排时间

**验收标准**
- 在首页选择"预约会议"后出现日期时间选择器，仅允许选择当前时间之后
- 提交时如未填写会议时间或时间不在将来，显示错误提示
- 邀请邮件包含会议时间（中文格式）及 iCal（.ics）附件
- iCal 附件格式符合 RFC 5545，默认持续 60 分钟，可在日历客户端直接添加
- 进入已创建的预约会议时，邀请面板显示格式化后的会议时间

---

### US-005 · 加入会议

**As a** 受邀或知道会议室 ID 的用户  
**I want to** 通过 ID 或邀请链接加入正在进行的会议  
**So that** 我可以参与视频通话

**验收标准**
- 在首页"加入会议"模式下输入会议室 ID，完成口令校验后进入
- 点击邀请链接自动跳转首页并填入会议室 ID，切换至加入模式
- 受邀邮箱用户无需输入口令，且不受会议锁定限制直接加入
- 会议不存在、已锁定（且非受邀）或口令错误时显示对应错误信息
- 会议入会请求每 IP 每会议室每 5 分钟限 20 次

---

### US-006 · 视频与音频通话

**As a** 会议参与者  
**I want to** 与其他参会者进行实时视频和音频通话  
**So that** 我们可以高效地远程沟通

**验收标准**
- 进入会议后自动请求摄像头和麦克风权限；仅有麦克风时降级为纯音频
- 底部工具栏可随时静音或取消静音、开启或关闭摄像头
- 视频网格根据参会人数自动排布（1 / 2 / 2x2 / 3x2 / 4 列）
- 视频关闭时显示姓名首字母头像
- 其他参会者的麦克风和摄像头开关状态实时同步显示

---

### US-007 · 屏幕共享

**As a** 会议参与者  
**I want to** 将我的屏幕或窗口共享给所有参会者  
**So that** 我可以展示内容或演示操作

**验收标准**
- 点击"共享"按钮弹出系统媒体选择器，可选择整个屏幕、应用窗口或标签页
- 共享开始后所有参会者收到共享流；关闭系统提示条或再次点击停止均可结束
- 共享时如同时录制，录制画面自动以共享屏幕为主画面，本人摄像头缩至右下角 PiP
- 远端参会者开启共享时，其共享画面同样在录制中优先显示

---

### US-008 · 会议录制

**As a** 会议主持人或参与者  
**I want to** 录制整个会议过程  
**So that** 缺席者或日后可回顾会议内容

**验收标准**
- 点击"录制"按钮开始录制，再次点击停止；底部显示实时录制时长
- 录制内容由 Canvas 合成所有参会者画面和音频（1280x720，30fps）
- 有屏幕共享或远程控制时，被控/共享画面自动作为主画面，本人摄像头缩至右下角
- 停止后录制数据流式传输到服务端，自动触发语音转录（优先本地 Qwen3-ASR-1.7B，无则 Whisper）
- 录制文件可通过 `GET /api/recordings/:fileId/download` 下载

---

### US-009 · AI 语音转录

**As a** 会议参与者  
**I want to** 自动将会议录音转换为文字  
**So that** 我可以快速检索和回顾会议内容

**验收标准**
- 录制停止后，系统自动调用本地 Qwen3-ASR-1.7B（如已配置）或 OpenAI Whisper-1 进行语音转录
- 也可手动通过 `POST /api/recordings/:fileId/transcribe` 触发转录，自动选择本地或云端
- 未配置本地 ASR 且未设置 `OPENAI_API_KEY` 时显示明确的错误提示

---

### US-010 · AI 会议纪要

**As a** 会议主持人  
**I want to** 自动生成结构化的会议纪要  
**So that** 无需手动整理，可直接分发给参会者

**验收标准**
- 转录完成后自动调用配置的 LLM 生成纪要（优先本地模型，如 Ollama + qwen3；未配置则回退到 GPT-4o），AI 纪要面板显示"生成中"状态
- 纪要包含：会议主题、时间、参会人员、讨论内容、决议或行动项表格、下一步计划
- 内容以结构化中文 Markdown 呈现
- 也可手动通过 `POST /api/recordings/minutes` 触发（需提供转录文本，最大 100k 字符）
- 未配置本地 LLM 且未设置 `OPENAI_API_KEY` 时显示明确的错误提示
- 生成失败时显示具体错误信息

---

### US-011 · 远程控制

**As a** 会议参与者  
**I want to** 在对方同意后控制其屏幕上的鼠标指针  
**So that** 我可以远程演示或辅助操作

**验收标准**
- 在"远程控制"侧边栏选择参与者并发起控制请求
- 被控方在页面顶部横幅看到确认请求，可接受或拒绝
- 接受后控制方的鼠标移动实时显示在被控方视频画面上；点击操作显示点击动画
- 指针 3 秒无移动后自动隐藏
- 任意一方可随时结束控制
- 录制时被控方的视频流自动作为录制主画面

---

### US-012 · 会议聊天

**As a** 会议参与者  
**I want to** 在通话过程中发送文字消息  
**So that** 我可以分享链接或补充信息而不打断发言者

**验收标准**
- 点击底部"聊天"按钮打开聊天侧边栏
- Enter 发送消息，Shift+Enter 换行；单条消息最大 2000 字符
- 消息包含发送者姓名、内容和时间戳（HH:MM）
- 聊天面板关闭时收到新消息，"聊天"按钮显示未读数角标
- 新消息到达时自动滚动到底部

---

### US-013 · 邮件邀请

**As a** 会议主持人  
**I want to** 通过邮件邀请他人加入会议  
**So that** 受邀者可以方便地收到会议信息并一键加入

**验收标准**
- 创建会议时可填写受邀者邮箱（最多 50 个），创建后自动发送邀请邮件
- 会中可通过邀请面板额外发送邮件邀请，仅房主或当前主持人可操作
- 邮件包含会议标题、会议号、加入链接及口令提示
- 预约会议的邮件额外包含中文会议时间和 iCal 附件
- 邀请链接格式为 `APP_BASE_URL/?roomId=ROOM_ID`，点击自动跳转并填入 ID
- 未配置 SMTP 时，接口响应 `previewLinks` 字段包含加入链接供备用

---

### US-014 · 主持人权限控制

**As a** 会议主持人  
**I want to** 管理参会者权限和会议状态  
**So that** 我可以维持良好的会议秩序

**验收标准**
- 第一个加入会议室的用户自动成为主持人；主持人断线后自动移交给下一位参会者
- 主持人可在"权限"面板锁定会议，锁定后新参会者无法加入（已邀请邮箱除外）
- 主持人可踢出任意非主持人参会者；被踢者收到提示并跳回首页
- 主持人可将主持权移交给任意其他参会者
- 非主持人在权限面板只能查看，无法操作
- 所有权限变更实时同步给所有参会者

---

## 环境变量参考

| 变量 | 必填 | 说明 |
|---|---|---|
| `JWT_SECRET` | 是 | JWT 签名密钥（建议 32+ 字符随机串）|
| `APP_BASE_URL` | 是 | 前端访问地址，用于生成邀请和重置链接 |
| `ADMIN_EMAIL` | 否 | 系统管理员邮箱；匹配该邮箱的账号登录后可通过 UI 配置 AI 服务，无需改环境变量 |
| `OPENAI_API_KEY` | 推荐 | 未配置本地 LLM 时用于 GPT-4o 纪要；未配置本地 ASR 时用于 Whisper 转录 |
| `ASR_BASE_URL` | 否 | 本地 ASR 服务地址（如 `http://localhost:8000`）；设置后使用本地模型转录，跳过 Whisper |
| `ASR_MODEL` | 否 | 本地 ASR 模型名（默认 `Qwen/Qwen3-ASR-1.7B`）|
| `ASR_API_KEY` | 否 | 本地 ASR 服务的 API Key（默认 `EMPTY`）|
| `LLM_BASE_URL` | 否 | 自定义 LLM 服务地址（兼容 OpenAI Chat API，如 Ollama `http://localhost:11434`）；设置后替代 GPT-4o 生成纪要 |
| `LLM_MODEL` | 否 | 自定义 LLM 模型名（默认 `qwen3`，未配置 `LLM_BASE_URL` 时默认 `gpt-4o`）|
| `LLM_API_KEY` | 否 | 自定义 LLM 服务的 API Key（默认 `EMPTY`）|
| `JWT_SECRET` | 是 | JWT 签名密钥（建议 32+ 字符随机串）|
| `APP_BASE_URL` | 是 | 前端访问地址，用于生成邀请和重置链接 |
| `PORT` | 否 | 后端端口（默认 3001）|
| `PASSWORD_RESET_TOKEN_TTL_MINUTES` | 否 | 密码重置令牌有效期（默认 30 分钟）|
| `ALLOW_PASSWORD_RESET_PREVIEW` | 否 | 开发模式：在 API 响应中返回重置链接 |
| `SMTP_HOST` | 否 | SMTP 服务器地址 |
| `SMTP_PORT` | 否 | SMTP 端口（默认 465）|
| `SMTP_SECURE` | 否 | 是否启用 TLS（true 或 false）|
| `SMTP_USER` | 否 | SMTP 认证用户名 |
| `SMTP_PASS` | 否 | SMTP 认证密码 |
| `SMTP_FROM` | 否 | 发件人显示名称与地址 |
| `TURN_URLS` | 否 | TURN 服务器 URL（逗号分隔）|
| `TURN_USERNAME` | 否 | TURN 认证用户名 |
| `TURN_CREDENTIAL` | 否 | TURN 认证密码 |

---

### US-015 · 系统管理员配置 AI 服务

**As a** 系统管理员  
**I want to** 在 Web 界面上配置 ASR 语音识别和 LLM 纪要生成服务  
**So that** 无需修改服务器环境变量或重启后端即可切换 AI 服务

**验收标准**
- 通过环境变量 `ADMIN_EMAIL` 指定管理员邮箱；匹配该邮箱登录的用户在账号卡片显示「管理员」徽章
- 管理员在首页账号区看到「AI 服务配置」按钮，点击打开配置弹窗，无需进入会议即可操作
- 管理员在会议工具栏也有「AI配置」按钮，可随时打开配置面板；非管理员不可见
- 配置面板分 ASR 和 LLM 两个可折叠区块，每区块可设置服务地址、模型名、API Key
- 每个区块提供「测试连接」按钮，使用当前填写的值（含未保存的修改）发起连通性检测，显示延迟和结果
- 保存后配置写入 `backend/data/aiConfig.json` 并立即生效，重启后依然有效
- API Key 在读取时脱敏返回（显示为 `***set***`），保存时若字段值为 `***set***` 则保留原有密钥
- 非管理员用户调用配置写入和测试接口返回 403

---

## 注意事项

- AI 转录：配置 `ASR_BASE_URL` 使用本地 Qwen3-ASR-1.7B，否则需要有效的 `OPENAI_API_KEY`（Whisper）
- AI 纪要：配置 `LLM_BASE_URL` 使用本地/自定义模型（Ollama 等），否则需要有效的 `OPENAI_API_KEY`（GPT-4o）
- ASR / LLM 服务也可在运行时通过管理员 Web UI 配置，优先级高于环境变量，配置存储在 `backend/data/aiConfig.json`
- 系统管理员通过 `ADMIN_EMAIL` 环境变量指定，动态计算，无需迁移数据
- 所有会议接口和 Socket 连接都要求用户先登录
- 登录 / 注册和会议入会均有独立限流，防止暴力尝试
- 用户数据存储在 `backend/data/users.json`，生产环境建议迁移至独立数据库
- 录制文件存储在 `backend/uploads/`，可定期清理
- CORS 默认开放（`*`），生产环境建议收紧为前端实际域名
- 生产环境建议配置 TURN 服务器以支持对称 NAT 和企业防火墙环境
