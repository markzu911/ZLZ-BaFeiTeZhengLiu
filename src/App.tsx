import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  Copy,
  Loader2,
  RefreshCcw,
  Send,
  Trash2,
} from "lucide-react";

type Role = "user" | "assistant";

interface Message {
  id: string;
  role: Role;
  content: string;
  status?: "streaming" | "done" | "error";
}

interface SseEvent {
  event: string;
  data: any;
}

const buffettAvatarUrl =
  "/2.png";

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function splitBold(line: string) {
  const parts = line.split(/(\*\*[^*]+\*\*)/g);

  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={index} className="font-semibold text-[#0f172a]">
          {part.slice(2, -2)}
        </strong>
      );
    }

    return <span key={index}>{part}</span>;
  });
}

function MessageContent({ content }: { content: string }) {
  const lines = content.split(/\n/);

  return (
    <div className="space-y-1">
      {lines.map((line, index) => {
        const trimmed = line.trim();

        if (!trimmed) {
          return <div key={index} className="h-1" />;
        }

        if (/^[-*]\s+/.test(trimmed)) {
          return (
            <div key={index} className="flex gap-2">
              <span className="mt-[0.66em] h-1.5 w-1.5 shrink-0 rounded-full bg-[#2f66e8]" />
              <p className="min-w-0 leading-5">{splitBold(trimmed.replace(/^[-*]\s+/, ""))}</p>
            </div>
          );
        }

        if (/^\d+[.、]\s+/.test(trimmed)) {
          const marker = trimmed.match(/^\d+[.、]/)?.[0] || "";
          return (
            <div key={index} className="flex gap-2">
              <span className="shrink-0 font-semibold text-[#8a94a6]">{marker}</span>
              <p className="min-w-0 leading-5">{splitBold(trimmed.replace(/^\d+[.、]\s+/, ""))}</p>
            </div>
          );
        }

        const isSection = /^\*\*第[一二三四五六七八九十\d]+[，、].+[：:]\*\*$/.test(trimmed);

        return (
          <p
            key={index}
            className={`leading-5 ${isSection ? "border-l-[3px] border-[#2f66e8] pl-3 font-semibold" : ""}`}
          >
            {splitBold(trimmed)}
          </p>
        );
      })}
    </div>
  );
}

function BuffettAvatar() {
  const [hasImageError, setHasImageError] = useState(false);

  return (
    <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#eaf1ff] text-base font-bold text-[#2f66e8] shadow-sm ring-1 ring-black/5">
      {hasImageError ? (
        "AI"
      ) : (
        <img
          src={buffettAvatarUrl}
          alt="巴菲特"
          className="h-full w-full object-contain"
          referrerPolicy="no-referrer"
          onError={() => setHasImageError(true)}
        />
      )}
    </div>
  );
}

function parseSseFrames(chunk: string, bufferRef: { current: string }) {
  bufferRef.current += chunk;
  const frames = bufferRef.current.split(/\n\n/);
  bufferRef.current = frames.pop() || "";

  return frames
    .map((frame) => {
      const lines = frame.split(/\r?\n/);
      let event = "message";
      const dataLines: string[] = [];

      for (const line of lines) {
        if (line.startsWith("event:")) {
          event = line.slice(6).trim();
        } else if (line.startsWith("data:")) {
          dataLines.push(line.slice(5).trim());
        }
      }

      const dataText = dataLines.join("\n");
      let data: any = dataText;

      try {
        data = JSON.parse(dataText);
      } catch {
        data = dataText;
      }

      return { event, data } satisfies SseEvent;
    })
    .filter((item) => item.data !== "");
}

export default function App() {
  const sessionIdRef = useRef(`buffett-${createId()}`);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "你好，我们先慢下来。你把问题告诉我，我会先看它是不是在我的能力圈里，再看长期价值、风险和价格。",
      status: "done",
    },
  ]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  const updateAssistantMessage = (id: string, updater: (message: Message) => Message) => {
    setMessages((current) => current.map((message) => (message.id === id ? updater(message) : message)));
  };

  const handleSseEvent = (event: SseEvent, assistantId: string) => {
    if (event.event === "delta") {
      updateAssistantMessage(assistantId, (message) => ({
        ...message,
        content: message.content + (event.data?.text || ""),
      }));
    }

    if (event.event === "answer") {
      updateAssistantMessage(assistantId, (message) => ({
        ...message,
        content: event.data?.text || message.content,
        status: "done",
      }));
    }

    if (event.event === "error") {
      const message = event.data?.message || "请求失败，请稍后再试。";
      setError(message);
      updateAssistantMessage(assistantId, (item) => ({
        ...item,
        content: message,
        status: "error",
      }));
    }
  };

  const sendMessage = async (text = input) => {
    const question = text.trim();
    if (!question || isStreaming) {
      return;
    }

    setError("");
    setInput("");

    const userMessage: Message = {
      id: createId(),
      role: "user",
      content: question,
      status: "done",
    };
    const assistantId = createId();
    const assistantMessage: Message = {
      id: assistantId,
      role: "assistant",
      content: "",
      status: "streaming",
    };

    setMessages((current) => [...current, userMessage, assistantMessage]);
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/chat/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId: sessionIdRef.current,
          message: question,
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`请求失败：${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      const bufferRef = { current: "" };

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }

        const events = parseSseFrames(decoder.decode(value, { stream: true }), bufferRef);
        for (const event of events) {
          handleSseEvent(event, assistantId);
        }
      }

      const tailEvents = parseSseFrames(decoder.decode(), bufferRef);
      for (const event of tailEvents) {
        handleSseEvent(event, assistantId);
      }

      updateAssistantMessage(assistantId, (message) => ({
        ...message,
        status: message.status === "error" ? "error" : "done",
      }));
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        const message = err?.message || "请求失败，请稍后再试。";
        setError(message);
        updateAssistantMessage(assistantId, (item) => ({
          ...item,
          content: message,
          status: "error",
        }));
      }
    } finally {
      abortRef.current = null;
      setIsStreaming(false);
    }
  };

  const stopStreaming = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
  };

  const clearConversation = async () => {
    stopStreaming();
    await fetch("/api/clear", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sessionId: sessionIdRef.current }),
    }).catch(() => undefined);

    sessionIdRef.current = `buffett-${createId()}`;
    setError("");
    setMessages([
      {
        id: "welcome",
        role: "assistant",
        content:
          "我们重新开始。把问题讲清楚一点，我会先看它是不是在我的能力圈里，再看长期价值和安全边际。",
        status: "done",
      },
    ]);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  };

  const copyMessage = async (content: string) => {
    await navigator.clipboard?.writeText(content).catch(() => undefined);
  };

  return (
    <main className="flex h-screen items-center justify-center overflow-hidden bg-[#eef1f6] p-3 text-[#0f172a] sm:p-6">
      <section className="flex h-full min-h-0 w-full max-w-5xl flex-col overflow-hidden rounded-[12px] border border-[#d9dee8] bg-[#f5f6fa] shadow-[0_18px_55px_rgba(15,23,42,0.16)] sm:h-[88vh]">
        <header className="shrink-0 border-b border-[#e5e6eb] bg-white px-4 py-3 sm:px-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#eaf1ff] shadow-sm ring-1 ring-black/5">
              <img
                src={buffettAvatarUrl}
                alt="巴菲特"
                className="h-full w-full object-contain"
                referrerPolicy="no-referrer"
              />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-[17px] font-semibold text-[#0f172a]">巴菲特 skill 助手</h1>
              <p className="truncate text-sm text-[#667085]">用长期主义、能力圈和安全边际分析投资、商业与人生选择</p>
            </div>
          </div>
        </header>

        {error && (
          <div className="border-b border-[#f2d6cf] bg-[#fff7f3] px-6 py-2 text-sm text-[#a34a34]">
            {error}
          </div>
        )}

        <div ref={scrollRef} className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-5">
          <div className="space-y-4">
            {messages.map((message) => (
              <article
                key={message.id}
                className={`group flex items-start gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {message.role === "assistant" && <BuffettAvatar />}
                  <div
                    className={`relative w-fit max-w-[min(760px,calc(100%-56px))] rounded-[8px] border px-3 py-1.5 text-[15px] leading-5 sm:text-[16px] ${
                      message.role === "user"
                        ? "border-[#cfe0ff] bg-[#eaf1ff] text-[#0f172a]"
                        : message.status === "error"
                          ? "border-[#e8d4cb] bg-[#fff7f3] text-[#8a3c24]"
                          : "border-[#e5e6eb] bg-white text-[#0f172a]"
                    }`}
                  >
                    {message.content ? (
                      <MessageContent content={message.content} />
                    ) : (
                      <div className="flex items-center gap-2 text-[#657167]">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>正在回复</span>
                      </div>
                    )}
                    {message.role === "assistant" && message.content && (
                      <div className="absolute -right-9 top-1 opacity-0 transition group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => copyMessage(message.content)}
                          className="flex h-7 w-7 items-center justify-center rounded-md border border-[#e5e6eb] bg-white text-[#8a94a6] hover:text-[#2f66e8]"
                          title="复制"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                  {message.role === "user" && (
                    <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#dce8ff] text-base font-bold text-[#2f66e8] shadow-sm">
                      我
                    </div>
                  )}
                </article>
              ))}

          </div>
        </div>

        <form
          className="shrink-0 border-t border-[#e5e6eb] bg-white px-4 py-2.5 sm:px-5"
          onSubmit={(event) => {
            event.preventDefault();
            sendMessage();
          }}
        >
          <div className="rounded-[10px] border border-[#d9dee8] bg-white">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              className="block max-h-28 min-h-11 w-full resize-none rounded-[10px] border-0 bg-white px-3 py-2 text-[15px] leading-5 text-[#0f172a] outline-none placeholder:text-[#9aa3b2]"
              placeholder="例如：怎么看一家公司是否值得长期持有？普通人怎么建立自己的能力圈？"
            />
            <div className="flex items-center justify-between border-t border-[#eef0f4] px-3 py-2">
              <button
                type="button"
                onClick={clearConversation}
                className="flex h-8 w-8 items-center justify-center rounded-md text-[#9aa3b2] transition hover:bg-[#f2f4f8] hover:text-[#2f66e8]"
                title="清空对话"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <button
                type={isStreaming ? "button" : "submit"}
                onClick={isStreaming ? stopStreaming : undefined}
                disabled={!isStreaming && !input.trim()}
                className="flex h-9 min-w-20 items-center justify-center gap-2 rounded-[8px] bg-[#2f66e8] px-4 text-sm font-semibold text-white transition hover:bg-[#2457d6] disabled:bg-[#b7c5df]"
                title={isStreaming ? "停止" : "发送"}
              >
                {isStreaming ? <RefreshCcw className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                {isStreaming ? "停止" : "发送"}
              </button>
            </div>
          </div>
        </form>
      </section>
    </main>
  );
}
