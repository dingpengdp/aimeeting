# AiMeeting 系统架构文档

本文档描述 AiMeeting 视频会议系统的完整架构，包含系统总览、模块关系、数据流和部署拓扑。所有图表使用 Mermaid 内嵌格式，可在 GitHub / GitLab / Obsidian 等平台直接渲染。

---

## 目录

1. [系统总览](#1-系统总览)
2. [目录结构与模块职责](#2-目录结构与模块职责)
3. [后端模块关系图](#3-后端模块关系图)
4. [前端组件树](#4-前端组件树)
5. [端到端数据流](#5-端到端数据流)
6. [Socket.IO 事件总览](#6-socketio-事件总览)
7. [部署拓扑图](#7-部署拓扑图)

---

## 1. 系统总览

AiMeeting 是一个基于浏览器的实时视频会议系统，无需插件，支持 P2P/TURN 媒体中转、录制转写、AI 纪要和远程控制两种模式。

```mermaid
graph TB
    subgraph Clients["客户端层"]
        Browser["🌐 浏览器\nReact 18 + Vite\n:3000 HTTPS"]
        Agent["🤖 Python Agent\nremote_agent.py\n局域网机器"]
    end

    subgraph Backend["后端服务层 :3001"]
        Express["Express HTTP 服务器\n20 条 REST 路由"]
        SIO["Socket.IO 信令服务器\n~30 个事件"]
        TURN["内嵌 TURN 服务器\nnode-turn :3478"]
        Express --- SIO
    end

    subgraph AI["AI 服务层"]
        ASR["ASR 语音识别\nQwen3-ASR / Whisper\n:8000"]
        LLM["LLM 纪要生成\nOllama / OpenAI\n:11434 / 443"]
    end

    subgraph External["外部服务"]
        SMTP["📧 SMTP 邮件\nAliyun :465"]
        OpenAI["☁️ OpenAI API\nWhisper / GPT-4o"]
    end

    subgraph Storage["持久化"]
        DataDir["data/\nusers.json\naiConfig.json"]
        Uploads["uploads/\n录制文件 .webm"]
    end

    Browser -->|"REST + Socket.IO\n(JWT Auth)"| Express
    Browser -->|"Socket.IO WS"| SIO
    Agent -->|"Socket.IO WS\nagent-register"| SIO
    Browser <-->|"WebRTC P2P\n音频+视频+数据通道"| Browser
    Browser -->|"媒体中转 UDP/TCP"| TURN

    SIO -->|"转发 remote-input"| Agent
    Express --> ASR
    Express --> LLM
    Express --> SMTP
    Express --> OpenAI
    Express --> DataDir
    Express --> Uploads
```

---

## 2. 目录结构与模块职责

```
aimeeting/
├── agent/                        # Python 远程控制代理
│   ├── remote_agent.py           # Socket.IO 客户端，通过 pyautogui 执行真实鼠标操作
│   └── requirements.txt          # python-socketio, pyautogui, requests
│
├── backend/                      # Node.js + TypeScript 后端
│   ├── src/
│   │   ├── index.ts              # Express 服务器入口、路由注册、node-turn 启动
│   │   ├── socketHandlers.ts     # 全部 Socket.IO 事件处理（信令/录制/远控/聊天）
│   │   ├── rooms.ts              # 内存房间管理（创建/加入/离开/主持人选举）
│   │   ├── auth.ts               # JWT 签发验证、bcrypt 密码、用户 CRUD
│   │   ├── aiService.ts          # ASR 调用（Qwen3 / Whisper）+ LLM 纪要生成
│   │   ├── aiConfigService.ts    # AI 配置读写（aiConfig.json）+ 密钥掩码
│   │   ├── clientConfig.ts       # ICE/TURN 配置生成（返回给前端）
│   │   ├── emailService.ts       # SMTP 邮件 + iCal 日历附件
│   │   ├── passwordResetService.ts # 密码重置 Token 生成/验证
│   │   └── rateLimit.ts          # Express 请求频率限制中间件
│   ├── data/                     # 持久化 JSON 文件（随容器卷挂载保留）
│   ├── uploads/                  # 会议录制 .webm 文件
│   ├── .env                      # 环境变量（见第 7 节）
│   └── Dockerfile
│
├── frontend/                     # React 18 + TypeScript + Vite
│   ├── src/
│   │   ├── pages/                # 三个页面
│   │   ├── components/           # 11 个 UI 组件
│   │   ├── hooks/                # 3 个自定义 Hook
│   │   ├── services/             # REST / Socket.IO / localStorage 封装
│   │   ├── context/              # AuthContext 全局认证状态
│   │   ├── i18n/locales/         # zh-CN / zh-TW / en 翻译文件
│   │   └── types/                # TypeScript 类型定义
│   ├── vite.config.ts            # Dev 代理 + HTTPS（basic-ssl）
│   └── Dockerfile                # Nginx 反向代理（生产）
│
└── docker-compose.yml            # 多服务编排（backend / frontend / turn）
```

---

## 3. 后端模块关系图

```mermaid
graph LR
    subgraph Entry["入口"]
        IDX["index.ts\nHTTP + Socket.IO + TURN 启动"]
    end

    subgraph Handlers["请求处理"]
        SH["socketHandlers.ts\n信令 / 录制 / 远控 / 聊天 / 房间权限"]
    end

    subgraph Core["核心模块"]
        RM["rooms.ts\nRoomManager\n房间 & 参会者状态"]
        AU["auth.ts\nAuthService\nJWT / bcrypt / 用户 CRUD"]
        AI["aiService.ts\nASR + LLM 调用"]
        AIC["aiConfigService.ts\n配置读写 & 密钥掩码"]
        CC["clientConfig.ts\nICE / TURN 配置生成"]
    end

    subgraph Infra["基础设施"]
        RL["rateLimit.ts\n请求频率限制"]
        EM["emailService.ts\nSMTP + iCal"]
        PR["passwordResetService.ts\nToken 生命周期"]
        TN["node-turn\n内嵌 TURN :3478"]
    end

    subgraph External["外部服务"]
        ASRSVC["ASR 服务 :8000\nQwen3-ASR"]
        LLMSVC["LLM 服务 :11434\nOllama / GPT-4o"]
        SMTPSVC["SMTP :465\nAliyun"]
    end

    IDX --> SH
    IDX --> AU
    IDX --> AIC
    IDX --> CC
    IDX --> RL
    IDX --> EM
    IDX --> PR
    IDX --> TN

    SH --> RM
    SH --> AU
    SH --> AI

    AI --> ASRSVC
    AI --> LLMSVC
    EM --> SMTPSVC
    AIC --> AI
```

---

## 4. 前端组件树

```mermaid
graph TD
    MAIN["main.tsx\nApp 入口"]
    AUTH["AuthContext\n全局认证状态\nuser / token / login / logout"]
    ROUTER["React Router v6"]

    MAIN --> AUTH
    AUTH --> ROUTER

    HOME["Home.tsx /\n登录/注册/创建/加入房间"]
    MEET["Meeting.tsx\n/meeting/:roomId\n主会议页面"]
    RESET["ResetPassword.tsx\n/reset-password"]

    ROUTER --> HOME
    ROUTER --> MEET
    ROUTER --> RESET

    subgraph Hooks["Meeting 使用的 Hook"]
        HRTC["useWebRTC\nPeer 连接 / ICE / DataChannel\n媒体流管理"]
        HREC["useRecording\nCanvas 录制 → Socket.IO chunks\n转写 & 纪要状态"]
        HRC["useRemoteControl\n远控请求/接受/拒绝\n指针事件 & Agent 路由"]
    end

    subgraph Components["UI 组件"]
        VG["VideoGrid\nSpotlight/Grid 布局\n全屏切换"]
        VT["VideoTile\n单路视频\n远控指针叠加层"]
        CTRL["Controls\n工具栏\n音视频/屏共享/录制/面板切换"]
        CHAT["ChatPanel\n实时聊天"]
        REC["RecordingPanel\n录制状态 & 下载"]
        AIMIN["AiMinutesPanel\nMarkdown 纪要渲染"]
        RC["RemoteControlPanel\n申请/接受/拒绝控制\nAgent 徽章 & 模式确认"]
        SEC["SecurityPanel\n锁定房间/踢人/转让主持"]
        INV["InvitePanel\n发送邮件邀请"]
        AISET["AiSettingsPanel\n管理员配置 ASR/LLM"]
        LANG["LanguageSwitcher\nzh-CN / zh-TW / en"]
    end

    MEET --> HRTC
    MEET --> HREC
    MEET --> HRC
    MEET --> VG
    MEET --> CTRL
    MEET --> CHAT
    MEET --> REC
    MEET --> AIMIN
    MEET --> RC
    MEET --> SEC
    MEET --> INV
    MEET --> AISET
    MEET --> LANG
    VG --> VT

    subgraph Services["Service 层"]
        APIS["api.ts\nREST fetch + JWT 头"]
        SOCKS["socket.ts\nSocket.IO 单例"]
        SESS["session.ts\nlocalStorage token/user"]
    end

    HRTC --> SOCKS
    HRC --> SOCKS
    HREC --> SOCKS
    HOME --> APIS
    MEET --> APIS
    AUTH --> SESS
```

---

## 5. 端到端数据流

### 图 A：认证 → 加入房间 → WebRTC P2P 建立

```mermaid
sequenceDiagram
    actor UserA as 用户 A（发起方）
    actor UserB as 用户 B（接收方）
    participant FE as 前端 React
    participant BE as 后端 Express
    participant SIO as Socket.IO
    participant TURN as TURN :3478

    Note over UserA,BE: ① 认证
    UserA->>FE: 输入 email / password
    FE->>BE: POST /api/auth/login
    BE-->>FE: JWT token + user
    FE->>FE: localStorage.setItem(token)

    Note over UserA,BE: ② 创建/加入房间
    UserA->>FE: 创建会议
    FE->>BE: POST /api/rooms
    BE-->>FE: { roomId }
    FE->>BE: GET /api/config/client
    BE-->>FE: { iceServers: [TURN] }
    FE->>FE: navigate /meeting/:roomId

    Note over UserA,SIO: ③ Socket.IO 加入
    FE->>SIO: connect (Authorization: Bearer JWT)
    FE->>SIO: emit join-room { roomId, participantId, name }
    SIO->>FE: room-joined { participants:[], isHost:true }

    Note over UserB,SIO: ④ B 加入 → 触发 WebRTC 握手
    UserB->>SIO: emit join-room
    SIO->>FE: participant-joined { participantId:B }
    SIO->>UserB: room-joined { participants:[A] }

    Note over UserA,TURN: ⑤ SDP 信令 + ICE（TURN 中转）
    FE->>FE: createPeerConnection(B)
    FE->>FE: pc.createOffer()
    FE->>SIO: emit offer { targetId:B, offer }
    SIO->>UserB: offer { fromId:A }
    UserB->>SIO: emit answer { targetId:A }
    SIO->>FE: answer { fromId:B }
    FE->>TURN: ICE 候选（UDP 中继）
    UserB->>TURN: ICE 候选
    Note over FE,UserB: P2P 连接建立\n音视频 + DataChannel 流通
```

### 图 B：录制 → AI 处理；以及双模式远程控制

```mermaid
sequenceDiagram
    actor Ctrl as 控制方
    actor Host as 被控方
    participant FE_C as 控制方前端
    participant FE_H as 被控方前端
    participant BE as 后端
    participant ASR as ASR 服务 :8000
    participant LLM as LLM 服务 :11434
    participant PY as Python Agent

    Note over Ctrl,LLM: ① 录制 → 转写 → AI 纪要
    Ctrl->>FE_C: 点击「开始录制」
    FE_C->>BE: emit recording-start
    loop 每 ~1s 一个 chunk
        FE_C->>BE: emit recording-chunk Buffer
        BE->>BE: 写入 uploads/rec-*.webm
    end
    Ctrl->>FE_C: 点击「停止录制」
    FE_C->>BE: emit recording-stop
    BE-->>FE_C: recording-saved { fileId, duration }
    BE->>ASR: POST audio stream (Qwen3-ASR / Whisper)
    ASR-->>BE: 转写文本
    BE-->>FE_C: recording-transcribed { transcription }
    BE->>LLM: 转写文本 → 生成纪要 prompt
    LLM-->>BE: Markdown 格式纪要
    BE-->>FE_C: recording-minutes { minutes }

    Note over Ctrl,Host: ② 远程控制 — 指针模式（无 Agent）
    Ctrl->>FE_C: 点击「申请控制」（目标无 Agent）
    FE_C->>FE_C: 弹窗：👁 指针演示模式说明
    Ctrl->>FE_C: 确认申请
    FE_C->>BE: emit remote-control-request { agentMode:false }
    BE->>FE_H: remote-control-request { fromName, agentMode:false }
    FE_H->>FE_H: 顶部横幅：👁 指针演示模式
    Host->>FE_H: 点击「接受」
    FE_H->>BE: emit remote-control-response { accepted:true }
    BE->>FE_C: remote-control-response { accepted:true }
    Ctrl->>FE_C: 鼠标移入视频区域
    FE_C->>FE_C: DataChannel broadcast remote-pointer {x,y}
    FE_H->>FE_H: 渲染指针叠加层（仅视觉效果）

    Note over Ctrl,PY: ③ 远程控制 — Agent 完整控制模式
    PY->>BE: Socket.IO connect + emit agent-register { roomId }
    BE-->>FE_H: participant-agent-state { agentEnabled:true }
    FE_H->>FE_H: 显示 🤖 Agent 徽章
    Ctrl->>FE_C: 点击「申请控制」（目标有 Agent）
    FE_C->>FE_C: 弹窗：🤖 完整控制模式说明
    Ctrl->>FE_C: 确认申请
    FE_C->>BE: emit remote-control-request { agentMode:true }
    BE->>FE_H: remote-control-request { agentMode:true }
    FE_H->>FE_H: 横幅：🤖 完整控制模式（将实际操作鼠标）
    Host->>FE_H: 接受
    Ctrl->>FE_C: 移动鼠标
    FE_C->>FE_C: DataChannel → 指针叠加（视觉）
    FE_C->>BE: emit remote-input { targetId, x, y, action:'move' }
    BE->>BE: agentByUserId.get(Host.userId) → agentSocketId
    BE->>PY: emit remote-input { x, y, action }
    PY->>PY: pyautogui.moveTo(x*sw, y*sh)
```

---

## 6. Socket.IO 事件总览

### 房间管理

| 事件名 | 方向 | 主要 Payload | 说明 |
|--------|------|-------------|------|
| `join-room` | C→S | `{ roomId, participantId, name, passcode? }` | 加入房间 |
| `room-joined` | S→C | `{ roomId, participants, isHost, hostId, room }` | 发送给新加入者 |
| `participant-joined` | S→C | `{ participantId, name, isHost, agentEnabled }` | 广播给已有成员 |
| `participant-left` | S→C | `{ participantId }` | 成员离开 |
| `room-error` | S→C | `{ message }` | 房间访问错误 |
| `host-changed` | S→C | `{ participantId }` | 主持人变更 |
| `room-locked-state` | S→C | `{ isLocked }` | 房间锁定状态 |
| `participant-kicked` | S→C | `{ roomId }` | 被踢出房间 |
| `toggle-room-lock` | C→S | `{ roomId, locked }` | 主持人锁定/解锁 |
| `kick-participant` | C→S | `{ participantId }` | 主持人移除参会者 |
| `transfer-host` | C→S | `{ participantId }` | 移交主持人权限 |

### WebRTC 信令

| 事件名 | 方向 | 主要 Payload | 说明 |
|--------|------|-------------|------|
| `offer` | C↔S↔C | `{ targetId, fromId, offer }` | SDP Offer 中继 |
| `answer` | C↔S↔C | `{ targetId, fromId, answer }` | SDP Answer 中继 |
| `ice-candidate` | C↔S↔C | `{ targetId, fromId, candidate }` | ICE 候选中继 |

### 远程控制

| 事件名 | 方向 | 主要 Payload | 说明 |
|--------|------|-------------|------|
| `remote-control-request` | C→S→C | `{ targetId, fromId, fromName, agentMode }` | 申请控制（含模式标志） |
| `remote-control-response` | C→S→C | `{ targetId, fromId, accepted }` | 接受/拒绝 |
| `remote-control-end` | C→S→C | `{ targetId, fromId }` | 结束控制 |
| `agent-register` | Agent→S | `{ roomId }` | Python Agent 注册 |
| `remote-input` | C→S→Agent | `{ targetId, x, y, action }` | 鼠标事件路由到 Agent |
| `participant-agent-state` | S→C | `{ participantId, agentEnabled }` | Agent 上/下线广播 |

### 录制 & AI

| 事件名 | 方向 | 主要 Payload | 说明 |
|--------|------|-------------|------|
| `recording-start` | C→S | —  | 开始录制 |
| `recording-chunk` | C→S | `Buffer` | WebM 数据块 |
| `recording-stop` | C→S | — | 停止录制，触发 AI 流水线 |
| `recording-saved` | S→C | `{ fileId, duration }` | 文件已保存 |
| `recording-transcribed` | S→C | `{ transcription }` | ASR 转写完成 |
| `recording-minutes` | S→C | `{ minutes }` | AI 纪要生成完成 |
| `recording-error` | S→C | `{ message }` | ASR 错误 |
| `recording-minutes-error` | S→C | `{ message }` | 纪要生成错误 |

### 聊天 & DataChannel（P2P）

| 事件名 | 方向 | 主要 Payload | 说明 |
|--------|------|-------------|------|
| `chat-message` | C↔S↔C | `{ fromId, fromName, message, timestamp }` | 文字聊天 |
| `remote-pointer` *(DC)* | P2P DataChannel | `{ participantId, targetId, x, y, clicking }` | 指针位置广播 |
| `remote-click` *(DC)* | P2P DataChannel | `{ participantId, targetId, x, y, clicking }` | 点击事件广播 |
| `media-state` *(DC)* | P2P DataChannel | `{ isAudioEnabled, isVideoEnabled }` | 音视频状态同步 |
| `screen-share-state` *(DC)* | P2P DataChannel | `{ isSharing }` | 屏幕共享状态同步 |

---

## 7. 部署拓扑图

### 本地开发模式

```mermaid
graph TB
    subgraph LAN["局域网 192.168.3.84"]
        subgraph DevMachine["开发机器"]
            ViteHTTPS["Vite Dev Server\n:3000 HTTPS\n(basic-ssl 自签名证书)"]
            NodeBE["Node.js Backend\n:3001 HTTP/WS"]
            NodeTURN["内嵌 TURN\n(node-turn :3478)"]
            ASRPy["Python ASR 服务\n:8000"]
            OllamaLLM["Ollama LLM\n:11434"]
            ViteHTTPS -->|"Dev Proxy /api\n/socket.io"| NodeBE
            NodeBE --- NodeTURN
            NodeBE -->|"转写请求"| ASRPy
            NodeBE -->|"纪要请求"| OllamaLLM
        end
        subgraph RemoteMachine["其他局域网机器"]
            Browser2["🌐 Chrome\nhttps://192.168.3.84:3000\n(接受自签名证书)"]
            PythonAgent["🤖 remote_agent.py\npython3 remote_agent.py\n--server https://192.168.3.84:3001"]
        end
        Browser1["🌐 Chrome\nhttps://localhost:3000"]
    end
    subgraph Cloud["云端（可选）"]
        OpenAICloud["☁️ OpenAI API\nWhisper + GPT-4o"]
        SMTPCloud["📧 阿里云 SMTP\n:465"]
    end

    Browser1 -->|"HTTPS\nWebRTC P2P"| ViteHTTPS
    Browser2 -->|"HTTPS\nWebRTC P2P\n媒体通过 TURN 中转"| NodeBE
    Browser2 -->|"UDP :3478"| NodeTURN
    PythonAgent -->|"Socket.IO WSS"| NodeBE
    NodeBE -.->|"fallback"| OpenAICloud
    NodeBE -.->|"邮件通知"| SMTPCloud
```

### 生产 Docker Compose 模式

```mermaid
graph TB
    subgraph DockerHost["Docker 宿主机"]
        subgraph Compose["docker-compose.yml"]
            FEContainer["frontend 容器\nNginx :3000→80\n反向代理静态资源"]
            BEContainer["backend 容器\nNode.js :3001\n挂载 uploads/ data/"]
            TURNContainer["turn 容器 (可选 profile)\ncoturn :3478\nUDP 49160-49200"]
        end
        Vol1["📁 ./backend/uploads\n录制文件持久化"]
        Vol2["📁 ./backend/data\nusers.json aiConfig.json"]
        BEContainer --- Vol1
        BEContainer --- Vol2
    end
    FEContainer -->|"HTTP :3001"| BEContainer
    FEContainer -->|"depends_on"| BEContainer

    ExternalASR["ASR 服务\n:8000（宿主机或另一容器）"]
    ExternalLLM["LLM 服务\n:11434（宿主机或另一容器）"]
    BEContainer -->|"http://host:8000"| ExternalASR
    BEContainer -->|"http://host:11434"| ExternalLLM
```

### 环境变量速查

| 变量 | 用途 | 示例值 |
|------|------|--------|
| `PORT` | 后端监听端口 | `3001` |
| `APP_BASE_URL` | 前端 URL（用于 TURN 配置 & 邮件链接） | `https://192.168.3.84:3000` |
| `JWT_SECRET` | JWT 签名密钥 | 随机 32+ 位十六进制 |
| `ADMIN_EMAIL` | 管理员账号 | `admin@example.com` |
| `STUN_URLS` | STUN 服务器（空=跳过 Google STUN） | `` （留空） |
| `INTERNAL_TURN_PORT` | 内嵌 TURN 端口 | `3478` |
| `INTERNAL_TURN_USER / PASS` | 内嵌 TURN 凭据 | `aimeeting` / `aimeeting2024` |
| `ASR_BASE_URL` | ASR 服务地址 | `http://localhost:8000` |
| `ASR_MODEL` | ASR 模型名称 | `Qwen/Qwen3-ASR-1.7B` |
| `LLM_BASE_URL` | LLM 服务地址 | `http://localhost:11434/v1` |
| `LLM_MODEL` | LLM 模型名称 | `qwen3` |
| `SMTP_HOST / PORT / USER / PASS` | 邮件服务配置 | `smtpdm.aliyun.com` / `465` |
| `HF_TOKEN` | HuggingFace Token（下载受限模型） | `hf_...` |

---

## 快速启动

### 开发模式
```bash
# 安装依赖
npm install

# 启动（前端 :3000 + 后端 :3001 + 内嵌 TURN :3478）
npm run dev
```

### Python Agent（被控机器上运行）
```bash
cd agent
pip3 install -r requirements.txt
python3 remote_agent.py \
  --server https://192.168.3.84:3001 \
  --room  <房间ID> \
  --email user@example.com \
  --password yourpassword
```

### 生产容器
```bash
docker compose up -d
# 启用外部 TURN（可选）
docker compose --profile turn up -d
```

---

*文档生成于 2026-04-06，基于 AiMeeting 当前代码版本。*
