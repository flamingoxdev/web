"use client";

import { useState, useRef, useEffect } from "react";
import Header from "../components/Header";
import { API_URL } from "../lib/api";
import { createClient } from "../lib/supabase";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function AIAssistantPage() {
  const supabase = createClient();
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Hi! I'm your AI career assistant. I've loaded your profile. Ask me anything — or paste a job description and I'll help pick the best projects and tailor your resume for that role.",
    },
  ]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isStreaming) return;

    const userMessage = input.trim();
    setInput("");
    
    const newMessages: Message[] = [...messages, { role: "user", content: userMessage }];
    setMessages(newMessages);
    setIsStreaming(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (session) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }

      // We only send the history (excluding the very first greeting to save tokens)
      const history = newMessages.slice(1, -1);

      const res = await fetch(`${API_URL}/copilot/chat`, {
        method: "POST",
        headers,
        body: JSON.stringify({ message: userMessage, history }),
      });

      if (!res.ok) throw new Error("Chat failed");
      if (!res.body) throw new Error("No stream body");

      setMessages(prev => [...prev, { role: "assistant", content: "" }]);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.role !== "assistant") return prev;
          // Build a brand-new object (no in-place mutation) so React Strict Mode's
          // double-invoked updater can't append the same chunk twice.
          const updated = prev.slice(0, -1);
          updated.push({ role: "assistant", content: last.content + chunk });
          return updated;
        });
      }
    } catch (err) {
      console.error(err);
      setMessages(prev => [
        ...prev,
        { role: "assistant", content: "Sorry, I encountered an error. Please try again." }
      ]);
    } finally {
      setIsStreaming(false);
    }
  };

  return (
    <div className="relative min-h-screen flex flex-col">
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div className="bg-orb-1 absolute -top-32 right-[10%] h-[500px] w-[500px] rounded-full bg-[#f77062]/10 blur-[130px]" />
        <div className="bg-orb-2 absolute bottom-0 left-[10%] h-[400px] w-[400px] rounded-full bg-[#16a085]/10 blur-[120px]" />
      </div>

      <Header />

      <main className="relative flex-1 mx-auto w-full max-w-4xl p-4 sm:p-6 flex flex-col">
        {/* Header */}
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-accent-amber to-accent-coral text-xl shadow-lg">
            🤖
          </div>
          <div>
            <h1 className="font-[family-name:var(--font-syne)] text-xl font-bold">AI Assistant</h1>
            <p className="text-xs text-muted">Paste a job description — I&apos;ll curate the perfect tailored resume for it in seconds</p>
          </div>
        </div>

        {/* Chat window */}
        <div className="flex-1 glass-card overflow-hidden flex flex-col mb-4 min-h-[400px]">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex w-full ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-5 py-3.5 text-sm leading-relaxed shadow-sm ${
                    msg.role === "user"
                      ? "bg-gradient-to-r from-accent-cyan to-accent-violet text-white rounded-tr-sm"
                      : "bg-surface border border-border text-foreground rounded-tl-sm"
                  }`}
                >
                  {msg.role === "assistant" && i === 0 ? (
                    <p>{msg.content}</p>
                  ) : (
                    <pre className="whitespace-pre-wrap font-sans">
                      {msg.content}
                    </pre>
                  )}
                </div>
              </div>
            ))}
            {isStreaming && (
              <div className="flex w-full justify-start">
                <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-surface border border-border px-5 py-4 flex gap-1.5 items-center">
                  <span className="h-2 w-2 rounded-full bg-accent-cyan/60 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="h-2 w-2 rounded-full bg-accent-cyan/60 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="h-2 w-2 rounded-full bg-accent-cyan/60 animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input area */}
          <div className="border-t border-border bg-surface/50 p-4">
            <form onSubmit={handleSubmit} className="relative">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                placeholder="Paste a job description or ask: 'Tailor my resume for this PM role at Stripe'"
                className="w-full rounded-xl border border-border bg-surface pl-4 pr-14 py-3 text-sm focus:border-accent-cyan/50 focus:outline-none focus:ring-1 focus:ring-accent-cyan/20 resize-none min-h-[52px] max-h-[150px]"
                rows={1}
                style={{ height: input ? "auto" : "52px" }}
              />
              <button
                type="submit"
                disabled={!input.trim() || isStreaming}
                className="absolute right-2 bottom-2 rounded-lg bg-gradient-to-r from-accent-cyan to-accent-violet p-2 text-white shadow transition-transform hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </form>
            <p className="mt-2 text-center text-[10px] text-muted">
              Flamingo AI can make mistakes. Consider verifying important information.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
