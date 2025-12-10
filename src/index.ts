#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
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

const server = new McpServer({
  name: "gitlab-review-server",
  version: "1.0.0",
});

// --- 辅助函数：解析 URL ---
const parseMrUrl = (url: string) => {
  const regex = /^(?:https?:\/\/[^\/]+\/)(.+)\/-\/merge_requests\/(\d+)/;
  const match = url.match(regex);
  if (!match) throw new Error("Invalid GitLab MR URL format");
  return { projectPath: match[1], mrIid: match[2] };
};

// --- Define Tools ---

server.registerTool(
  "review_merge_request",
  {
    description: "MUST use this tool when user provides a GitLab MR URL. Fetches MR details and diffs, and optionally checks out the branch locally.",
    inputSchema: z.object({
      url: z.string().describe("The full URL of the GitLab Merge Request"),
      shouldCheckout: z
        .boolean()
        .optional()
        .describe("Set to true to checkout the branch locally (defaults to true)"),
      localRepoPath: z
        .string()
        .optional()
        .describe("Absolute path to the local repository root"),
    }),
  },
  async ({ url, shouldCheckout, localRepoPath }) => {
    const api = axios.create({
      baseURL: `${GITLAB_HOST}/api/v4`,
      headers: { "PRIVATE-TOKEN": GITLAB_TOKEN },
    });

    try {
      const { projectPath, mrIid } = parseMrUrl(url);

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
);

server.registerTool(
  "post_mr_comment",
  {
    description: "Post a comment (note) to the GitLab Merge Request discussion timeline. Use this when the user asks to submit the review or post a comment.",
    inputSchema: z.object({
      url: z.string().describe("The full URL of the GitLab Merge Request"),
      commentBody: z
        .string()
        .describe("The content of the comment in Markdown format."),
    }),
  },
  async ({ url, commentBody }) => {
    const api = axios.create({
      baseURL: `${GITLAB_HOST}/api/v4`,
      headers: { "PRIVATE-TOKEN": GITLAB_TOKEN },
    });

    try {
      const { projectPath, mrIid } = parseMrUrl(url);

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
            text: `✅ Successfully posted comment to GitLab!\nLink: ${response.data.id}`,
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
);

server.registerTool(
  "post_inline_comment",
  {
    description: "Post a review comment on a SPECIFIC LINE of code in the Merge Request. Use this for specific code suggestions.",
    inputSchema: z.object({
      url: z.string().describe("The full URL of the GitLab MR"),
      filePath: z
        .string()
        .describe("The file path (new_path) to comment on (e.g. src/utils.ts)"),
      lineNumber: z
        .number()
        .describe("The line number in the NEW file version (new_line)"),
      commentBody: z.string().describe("The comment content in Markdown"),
    }),
  },
  async ({ url, filePath, lineNumber, commentBody }) => {
    const api = axios.create({
      baseURL: `${GITLAB_HOST}/api/v4`,
      headers: { "PRIVATE-TOKEN": GITLAB_TOKEN },
    });

    try {
      const { projectPath, mrIid } = parseMrUrl(url);

      // 1. 获取 MR 详情，目的是拿到关键的 diff_refs (SHA信息)
      console.error(
        `Fetching MR details to get SHAs for ${projectPath} !${mrIid}...`
      );
      const mrRes = await api.get(
        `/projects/${encodeURIComponent(projectPath)}/merge_requests/${mrIid}`
      );
      const diffRefs = mrRes.data.diff_refs;

      if (!diffRefs) {
        throw new Error(
          "Could not retrieve diff_refs from MR. Ensure the MR has changes."
        );
      }

      // 2. 构造 GitLab 特有的 Position 对象
      // 注意：这里我们默认针对“新代码”(new_line) 进行评论，这是 Review 最常见的场景
      const position = {
        base_sha: diffRefs.base_sha,
        start_sha: diffRefs.start_sha,
        head_sha: diffRefs.head_sha,
        position_type: "text",
        new_path: filePath, // 文件路径
        new_line: lineNumber, // 行号
        // 如果是评论被删除的行，需要传 old_path 和 old_line，这里暂只支持新行
      };

      console.error(`Posting inline comment on ${filePath}:${lineNumber}...`);

      // 3. 调用 Create New Discussion API
      const res = await api.post(
        `/projects/${encodeURIComponent(
          projectPath
        )}/merge_requests/${mrIid}/discussions`,
        {
          body: commentBody,
          position: position,
        }
      );

      return {
        content: [
          {
            type: "text",
            text: `✅ Inline comment posted on \`${filePath}:${lineNumber}\`\n(ID: ${res.data.id})`,
          },
        ],
      };
    } catch (error: any) {
      const errMsg = error.response?.data?.message || error.message;
      // 常见错误：行号对不上（GitLab 对 SHA 校验非常严格）
      // 如果报错 "Line code not found"，通常是行号或 SHA 不匹配
      return {
        content: [
          {
            type: "text",
            text: `❌ Failed to post inline comment: ${JSON.stringify(errMsg)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

const transport = new StdioServerTransport();
server.connect(transport).catch((err) => {
  console.error(err);
  process.exit(1);
});

