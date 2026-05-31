import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API_URL = process.env.INTERNMATCH_API_URL || "http://localhost:8000";

const server = new McpServer({
  name: "InternMatch MCP",
  version: "1.0.0",
  description: "Connect Cursor to your InternMatch FastAPI backend",
});

server.tool(
  "backend_health",
  "Check if the InternMatch backend is running",
  {},
  async () => {
    const res = await fetch(`${API_URL}/health`);
    const data = await res.json();
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

server.tool(
  "search_internships",
  "Search internships via the InternMatch backend (requires a resume_id from /upload)",
  {
    resume_id: z.string().describe("Resume ID returned by POST /upload"),
    location: z.string().default("Remote"),
    limit: z.number().int().min(1).max(50).default(20),
  },
  async ({ resume_id, location, limit }) => {
    const res = await fetch(`${API_URL}/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resume_id, location, limit }),
    });

    if (!res.ok) {
      return {
        isError: true,
        content: [{ type: "text", text: `Search failed: HTTP ${res.status}` }],
      };
    }

    const text = await res.text();
    const jobs = text
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .filter((row) => row.title);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ count: jobs.length, jobs }, null, 2),
        },
      ],
    };
  }
);

server.tool(
  "autofill_job",
  "Launch Playwright autofill for a job URL (backend must be running; user reviews form in browser)",
  {
    job_url: z.string().url(),
    access_token: z.string().describe("Supabase session access_token for auth"),
    resume_id: z.string().optional(),
    tailored_data: z.record(z.unknown()).optional(),
  },
  async ({ job_url, access_token, resume_id, tailored_data }) => {
    const res = await fetch(`${API_URL}/apply/autofill`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${access_token}`,
      },
      body: JSON.stringify({
        job_url,
        resume_id,
        tailored_data: tailored_data || {},
      }),
    });

    const data = await res.json();
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
