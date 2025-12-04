#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";
import { simpleGit } from "simple-git";
import * as dotenv from "dotenv";
import * as fs from "fs";

dotenv.config();

const GITLAB_TOKEN = process.env.GITLAB_TOKEN;
const GITLAB_HOST = process.env.GITLAB_HOST || "https://gitlab.com";

if (!GITLAB_TOKEN) {
  console.error("❌ Error: GITLAB_TOKEN environment variable is required.");
  process.exit(1);
}

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

// --- 辅助函数：解析 URL ---
const parseMrUrl = (url: string) => {
  const regex = /^(?:https?:\/\/[^\/]+\/)(.+)\/-\/merge_requests\/(\d+)/;
  const match = url.match(regex);
  if (!match) throw new Error("Invalid GitLab MR URL format");
  return { projectPath: match[1], mrIid: match[2] };
};

// --- 1. 定义工具列表 ---
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        // 工具 1: 拉取代码进行 Review
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
              description: "Absolute path to the local repository root",
            },
          },
          required: ["url"],
        },
      },
      {
        // 工具 2: (新增) 回填评论到 GitLab
        name: "post_mr_comment",
        description:
          "Post a comment (note) to the GitLab Merge Request discussion timeline. Use this when the user asks to submit the review or post a comment.",
        inputSchema: {
          type: "object",
          properties: {
            url: {
              type: "string",
              description: "The full URL of the GitLab Merge Request",
            },
            commentBody: {
              type: "string",
              description: "The content of the comment in Markdown format.",
            },
          },
          required: ["url", "commentBody"],
        },
      },
    ],
  };
});

// --- 2. 处理工具调用 ---
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  // === 工具 1: Review MR ===
  if (name === "review_merge_request") {
    const { url, shouldCheckout, localRepoPath } = args as any;

    try {
      const { projectPath, mrIid } = parseMrUrl(url);
      const api = axios.create({
        baseURL: `${GITLAB_HOST}/api/v4`,
        headers: { "PRIVATE-TOKEN": GITLAB_TOKEN },
      });

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

      if (shouldCheckout !== false && localRepoPath) {
        if (!fs.existsSync(localRepoPath)) {
          gitMsg = `⚠️ Path not found: ${localRepoPath}`;
        } else {
          const git = simpleGit(localRepoPath);
          if (await git.checkIsRepo()) {
            const status = await git.status();
            if (!status.isClean())
              await git.stash(["save", `MCP-Auto-Stash-${Date.now()}`]);
            await git.fetch("origin", mr.source_branch);
            await git.checkout(mr.source_branch);
            await git.pull("origin", mr.source_branch);
            gitMsg = `✅ Checked out to branch: ${mr.source_branch}`;
          }
        }
      }

      let context = `Git Status: ${gitMsg}\n\n# MR !${mr.iid}: ${mr.title}\n${mr.description}\n\n## Changes Summary\n`;
      changes.forEach((change: any) => {
        if (change.new_path.match(/(\.lock|\.map|package-lock\.json)$/)) return;
        context += `### File: \`${change.new_path}\`\n`;
        if (change.diff.length > 8000) {
          context +=
            `(Diff too large, truncated)\n` +
            "```diff\n" +
            change.diff.substring(0, 1000) +
            "\n...\n```\n\n";
        } else {
          context += "```diff\n" + change.diff + "\n```\n\n";
        }
      });

      return { content: [{ type: "text", text: context }] };
    } catch (error: any) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
        isError: true,
      };
    }
  }

  // === 工具 2: (新增) Post Comment ===
  if (name === "post_mr_comment") {
    const { url, commentBody } = args as any;

    try {
      const { projectPath, mrIid } = parseMrUrl(url);

      const api = axios.create({
        baseURL: `${GITLAB_HOST}/api/v4`,
        headers: { "PRIVATE-TOKEN": GITLAB_TOKEN },
      });

      console.error(`Posting comment to ${projectPath} !${mrIid}...`);

      // 调用 GitLab API 创建 Note
      const response = await api.post(
        `/projects/${encodeURIComponent(
          projectPath
        )}/merge_requests/${mrIid}/notes`,
        { body: commentBody }
      );

      return {
        content: [
          {
            type: "text",
            text: `✅ Successfully posted comment to GitLab!\nLink: ${response.data.id}`, // GitLab API 通常不直接返回 Web 链接，这里简单提示成功
          },
        ],
      };
    } catch (error: any) {
      const errMsg = error.response?.data?.message || error.message;
      return {
        content: [
          {
            type: "text",
            text: `❌ Failed to post comment: ${JSON.stringify(errMsg)}`,
          },
        ],
        isError: true,
      };
    }
  }

  throw new Error("Tool not found");
});

const transport = new StdioServerTransport();
server.connect(transport).catch((err) => {
  console.error(err);
  process.exit(1);
});
