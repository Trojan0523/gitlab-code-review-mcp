#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import axios from "axios"; // 移除 zod 依赖
import { simpleGit } from "simple-git";
import * as dotenv from "dotenv";
import * as fs from "fs";

// 读取 .env
// Suppress stdout during dotenv config to avoid breaking MCP protocol
const originalWrite = process.stdout.write;
// @ts-ignore
process.stdout.write = () => true;
dotenv.config();
process.stdout.write = originalWrite;

// --- 配置检查 ---
const GITLAB_TOKEN = process.env.GITLAB_TOKEN;
const GITLAB_HOST = process.env.GITLAB_HOST || "https://gitlab.com";

if (!GITLAB_TOKEN) {
  // 注意：使用 console.error 输出日志，不要用 console.log，否则会破坏 MCP 协议
  console.error("❌ Error: GITLAB_TOKEN environment variable is required.");
  process.exit(1);
}

// --- 初始化 Server ---
const server = new Server(
  {
    name: "gitlab-review-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// --- 1. 定义工具列表 (使用原生 JSON Schema，最稳健) ---
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "review_merge_request",
        description:
          "MUST use this tool when user provides a GitLab MR URL. Fetches MR details and diffs, and optionally checks out the branch locally.",
        inputSchema: {
          type: "object",
          properties: {
            url: {
              type: "string",
              description: "The full URL of the GitLab Merge Request",
            },
            shouldCheckout: {
              type: "boolean",
              description:
                "Set to true to checkout the branch locally (defaults to true)",
            },
            localRepoPath: {
              type: "string",
              description:
                "Absolute path to the local repository root (required if shouldCheckout is true)",
            },
          },
          required: ["url"],
        },
      },
    ],
  };
});

// --- 2. 处理工具调用 ---
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "review_merge_request") {
    // 手动断言参数类型
    const args = request.params.arguments as any;
    const url = args.url;
    // 默认 shouldCheckout 为 true，除非显式设为 false
    const shouldCheckout = args.shouldCheckout !== false;
    const localRepoPath = args.localRepoPath;

    try {
      // 1. 解析 URL (优化正则，兼容更多格式)
      const regex = /^(?:https?:\/\/[^\/]+\/)(.+)\/-\/merge_requests\/(\d+)/;
      const match = url.match(regex);
      if (!match) throw new Error("Invalid GitLab MR URL format");

      const projectPath = match[1];
      const mrIid = match[2];

      const api = axios.create({
        baseURL: `${GITLAB_HOST}/api/v4`,
        headers: { "PRIVATE-TOKEN": GITLAB_TOKEN },
      });

      // 2. 获取 MR 信息
      const [mrRes, changesRes] = await Promise.all([
        api.get(
          `/projects/${encodeURIComponent(projectPath)}/merge_requests/${mrIid}`
        ),
        api.get(
          `/projects/${encodeURIComponent(
            projectPath
          )}/merge_requests/${mrIid}/changes`
        ),
      ]);

      const mr = mrRes.data;
      const changes = changesRes.data.changes;
      let gitMsg = "Skipped local checkout.";

      // 3. Git 操作逻辑
      if (shouldCheckout && localRepoPath) {
        if (!fs.existsSync(localRepoPath)) {
          // 如果路径不存在，仅记录警告，不阻断流程
          gitMsg = `⚠️ Path not found: ${localRepoPath}, skipped checkout.`;
        } else {
          const git = simpleGit(localRepoPath);
          // 检查是否是 git 仓库
          if (await git.checkIsRepo()) {
            const status = await git.status();
            if (!status.isClean()) {
              await git.stash(["save", `MCP-Auto-Stash-${Date.now()}`]);
            }
            await git.fetch("origin", mr.source_branch);
            await git.checkout(mr.source_branch);
            await git.pull("origin", mr.source_branch);
            gitMsg = `✅ Checked out to branch: ${mr.source_branch}`;
          } else {
            gitMsg = `⚠️ Not a git repository: ${localRepoPath}`;
          }
        }
      }

      // 4. 构建上下文 (增加 Diff 截断逻辑)
      let context = `Git Status: ${gitMsg}\n\n`;
      context += `# MR !${mr.iid}: ${mr.title}\n`;
      context += `**Author:** ${mr.author.name}\n`;
      context += `**Description:**\n${mr.description}\n\n`;
      context += `## Changes Summary\n`;

      changes.forEach((change: any) => {
        // 过滤无关文件
        if (
          change.new_path.match(/(\.lock|\.map|package-lock\.json|\.min\.js)$/)
        )
          return;

        context += `### File: \`${change.new_path}\`\n`;

        // 防止单个文件 Diff 过大导致 AI 崩溃 (限制 8000 字符)
        if (change.diff.length > 8000) {
          context += `(Diff too large to display completely. Please open file locally to review.)\n`;
          context +=
            "```diff\n" +
            change.diff.substring(0, 1000) +
            "\n... (truncated)\n```\n\n";
        } else {
          context += "```diff\n" + change.diff + "\n```\n\n";
        }
      });

      return {
        content: [{ type: "text", text: context }],
      };
    } catch (error: any) {
      // 捕获所有错误返回给 AI，而不是让 Server 崩溃
      const errMsg = error.response?.data?.message || error.message;
      return {
        content: [{ type: "text", text: `Error fetching MR: ${errMsg}` }],
        isError: true,
      };
    }
  }

  throw new Error("Tool not found");
});

// --- 启动服务器 ---
const transport = new StdioServerTransport();
server.connect(transport).catch((err) => {
  console.error("Server connection error:", err);
  process.exit(1);
});
