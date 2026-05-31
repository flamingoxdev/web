"use client";

import { useState, useRef, useEffect } from "react";
import { createClient } from "../lib/supabase";
import { API_URL } from "../lib/api";
import { getAccessToken } from "../lib/authToken";
import type { ResumeData } from "./EditableResumePreview";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ResumeEditorAIProps {
  resume: ResumeData | null;
  jobTitle: string;
  company: string;
  onResumeUpdate: (updated: ResumeData) => void;
}

export default function ResumeEditorAI({
  resume,
  jobTitle,
  company,
  onResumeUpdate,
}: ResumeEditorAIProps) {
  const supabase = createClient();
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "I'm your resume copilot for this application. Ask me to edit your draft (summary, bullets, contact info) or ask anything — interview tips, ATS advice, what to emphasize for this role. Your profile stays unchanged; only this resume updates.",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || busy || !resume) return;

    const userMessage = input.trim();
    setInput("");
    const historyForApi = messages.slice(-10);
    setMessages((m) => [...m, { role: "user", content: userMessage }]);
    setBusy(true);

    try {
      const token = await getAccessToken(supabase);
      const res = await fetch(`${API_URL}/tailor/assistant`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          current_draft: resume,
          message: userMessage,
          job_title: jobTitle,
          company,
          history: historyForApi,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "AI assistant failed");
      }

      const data = await res.json();
      if (data.tailored) {
        onResumeUpdate(data.tailored);
      }

      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: data.reply || (data.action === "edit" ? "Done — resume draft updated." : "Here's my answer."),
        },
      ]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content:
            err instanceof Error
              ? `Sorry, something went wrong: ${err.message}`
              : "Sorry, I couldn't respond. Check that NVIDIA_API_KEY is set and try again.",
        },
      ]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col border-l border-[#ddd] bg-white">
      <div className="shrink-0 border-b border-[#eee] px-3 py-2">
        <p className="text-xs font-semibold text-[#333]">AI Assistant</p>
        <p className="text-[10px] text-[#888]">Edit draft · Ask questions · NVIDIA powered</p>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`rounded-lg px-2.5 py-2 text-xs leading-relaxed whitespace-pre-wrap ${
              m.role === "user" ? "ml-4 bg-accent-cyan/10 text-[#222]" : "mr-2 bg-[#f5f5f5] text-[#444]"
            }`}
          >
            {m.content}
          </div>
        ))}
        {busy && (
          <div className="mr-2 flex items-center gap-1.5 rounded-lg bg-[#f5f5f5] px-2.5 py-2 text-xs text-[#888]">
            <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-accent-cyan" style={{ animationDelay: "0ms" }} />
            <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-accent-cyan" style={{ animationDelay: "150ms" }} />
            <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-accent-cyan" style={{ animationDelay: "300ms" }} />
          </div>
        )}
        <div ref={endRef} />
      </div>
      <form onSubmit={handleSubmit} className="shrink-0 border-t border-[#eee] p-2">
        <div className="flex gap-1">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Edit or ask: e.g. How should I frame my NJIT role?"
            disabled={busy || !resume}
            className="flex-1 rounded border border-[#ddd] px-2 py-1.5 text-xs outline-none focus:border-accent-cyan"
          />
          <button
            type="submit"
            disabled={busy || !input.trim() || !resume}
            className="rounded bg-accent-cyan px-2 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
          >
            {busy ? "…" : "→"}
          </button>
        </div>
      </form>
    </div>
  );
}
