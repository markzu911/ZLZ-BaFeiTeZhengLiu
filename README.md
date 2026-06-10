# 巴菲特视角对话

一个基于 Vite + React + Express + 智谱 GLM 的多轮流式聊天项目。项目不接知识库、不做 RAG，只使用巴菲特 Skill Prompt、会话历史和大模型生成。

## 本地运行

1. 安装依赖：

   ```bash
   npm install
   ```

2. 复制环境变量：

   ```bash
   cp .env.example .env.local
   ```

3. 在 `.env.local` 中配置：

   ```text
   ZHIPU_API_KEY="你的智谱 API Key"
   ZHIPU_MODEL="glm-4.7-flash"
   ZHIPU_MAX_TOKENS="1600"
   ```

4. 启动：

   ```bash
   npm run dev
   ```

默认访问 `http://localhost:3000`。

## 接口

- `POST /api/chat/stream`：SSE 流式对话
- `POST /api/clear`：清空指定会话
- `GET /api/config`：读取模型和密钥配置状态

智谱请求在后端发送，前端不会携带密钥；请求体中已通过 `thinking.type = "disabled"` 在 API 层关闭深度思考。
