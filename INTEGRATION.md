# GitLab MR Review MCP 服务器接入文档

本文档详细介绍如何将 GitLab Cursor Review MCP 服务器集成到各种 MCP 客户端（如 Claude Code、Claude Desktop 等）中。

## 目录

- [什么是 MCP](#什么是-mcp)
- [快速开始](#快速开始)
- [安装方式](#安装方式)
- [配置方法](#配置方法)
- [验证安装](#验证安装)
- [故障排查](#故障排查)
- [高级配置](#高级配置)

---

## 什么是 MCP

Model Context Protocol (MCP) 是一个开放协议，允许 AI 应用程序安全地连接到外部数据源和工具。本 MCP 服务器为 AI 助手（如 Claude）提供了与 GitLab 交互的能力，实现自动化代码审查。

---

## 快速开始

### 前置要求

1. **Node.js** 环境（建议 v18 或更高版本）
2. **GitLab Personal Access Token**
   - 访问 GitLab 设置页面：`https://gitlab.com/-/profile/personal_access_tokens`（或你的自托管实例）
   - 创建新 Token，至少需要以下权限：
     - `api` - 完整 API 访问
     - `read_repository` - 读取仓库
   - 保存生成的 Token（仅显示一次）

3. **MCP 客户端**（以下任一）：
   - [Claude Code](https://code.claude.com/)（推荐）
   - [Claude Desktop](https://claude.ai/download)
   - 其他支持 MCP 的客户端

---

## 安装方式

### 方式 1：通过 npm 全局安装（推荐）

```bash
npm install -g gitlab-cursor-review
```

安装后，可执行文件路径为：
```bash
which gitlab-cursor-review  # 输出如：/usr/local/bin/gitlab-cursor-review
```

### 方式 2：通过 npx 运行（无需安装）

无需全局安装，直接在配置中使用 `npx`：

```bash
npx gitlab-cursor-review
```

### 方式 3：从源码构建

```bash
# 克隆仓库
git clone https://github.com/your-org/gitlab-cursor-review.git
cd gitlab-cursor-review

# 安装依赖
npm install

# 构建项目
npm run build

# 可执行文件位于
./dist/index.mjs
```

---

## 配置方法

### 配置 Claude Code

Claude Code 是 Anthropic 官方的 CLI 工具，原生支持 MCP 服务器。

#### 步骤 1：定位配置文件

Claude Code 的 MCP 配置文件位置：

- **macOS/Linux**: `~/.config/claude-code/mcp_config.json`
- **Windows**: `%APPDATA%\claude-code\mcp_config.json`

如果文件不存在，请手动创建。

#### 步骤 2：编辑配置文件

打开 `mcp_config.json`，添加以下配置：

```json
{
  "mcpServers": {
    "gitlab-review": {
      "command": "node",
      "args": [
        "/usr/local/bin/gitlab-cursor-review"
      ],
      "env": {
        "GITLAB_TOKEN": "glpat-YOUR_GITLAB_TOKEN_HERE",
        "GITLAB_HOST": "https://gitlab.com"
      }
    }
  }
}
```

**配置说明：**

- `gitlab-review`：服务器名称（可自定义）
- `command`：Node.js 可执行文件路径
  - macOS/Linux: `node`（如已配置 PATH）
  - Windows: `C:\\Program Files\\nodejs\\node.exe`
- `args`：MCP 服务器的路径
  - 全局安装：使用 `which gitlab-cursor-review` 获取路径
  - npx 方式：`["npx", "gitlab-cursor-review"]`
  - 源码构建：`["/path/to/gitlab-cursor-review/dist/index.mjs"]`
- `env`：环境变量
  - `GITLAB_TOKEN`：你的 GitLab Personal Access Token（必填）
  - `GITLAB_HOST`：GitLab 实例地址（默认：`https://gitlab.com`）

#### 步骤 3：重启 Claude Code

```bash
# 重启 Claude Code 以加载新配置
# 方式取决于你的启动方式，通常直接重新运行即可
```

---

### 配置 Claude Desktop

Claude Desktop 是 Anthropic 提供的桌面应用程序。

#### 步骤 1：定位配置文件

配置文件位置：

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

#### 步骤 2：编辑配置文件

添加 MCP 服务器配置：

```json
{
  "mcpServers": {
    "gitlab-review": {
      "command": "npx",
      "args": [
        "-y",
        "gitlab-cursor-review"
      ],
      "env": {
        "GITLAB_TOKEN": "glpat-YOUR_GITLAB_TOKEN_HERE",
        "GITLAB_HOST": "https://gitlab.com"
      }
    }
  }
}
```

或者使用全局安装路径：

```json
{
  "mcpServers": {
    "gitlab-review": {
      "command": "node",
      "args": [
        "/usr/local/bin/gitlab-cursor-review"
      ],
      "env": {
        "GITLAB_TOKEN": "glpat-YOUR_GITLAB_TOKEN_HERE",
        "GITLAB_HOST": "https://gitlab.com"
      }
    }
  }
}
```

#### 步骤 3：重启 Claude Desktop

完全退出应用程序并重新启动。

---

### 配置自托管 GitLab

如果你使用的是自托管的 GitLab 实例，需要修改 `GITLAB_HOST` 环境变量：

```json
{
  "mcpServers": {
    "gitlab-review": {
      "command": "node",
      "args": ["/usr/local/bin/gitlab-cursor-review"],
      "env": {
        "GITLAB_TOKEN": "glpat-YOUR_TOKEN",
        "GITLAB_HOST": "https://gitlab.yourcompany.com"
      }
    }
  }
}
```

确保：
- 去掉 URL 末尾的斜杠
- 使用 `https://` 协议（除非你的实例使用 HTTP）
- Token 是从该实例生成的

---

## 验证安装

### 方法 1：通过客户端验证

启动 Claude Code 或 Claude Desktop，尝试以下对话：

```
你：列出可用的 MCP 工具

Claude：[应该能看到 review_merge_request、post_mr_comment、post_inline_comment]

你：请帮我审查这个 MR：https://gitlab.com/group/project/-/merge_requests/123

Claude：[调用工具并返回 MR 详情]
```

### 方法 2：手动测试服务器

在终端直接运行服务器测试：

```bash
# 设置环境变量
export GITLAB_TOKEN="glpat-YOUR_TOKEN"
export GITLAB_HOST="https://gitlab.com"

# 运行服务器（会进入 stdio 模式，等待输入）
gitlab-cursor-review
```

如果配置正确，服务器将启动并等待输入。按 `Ctrl+C` 退出。

如果缺少 Token，会看到错误：
```
❌ Error: GITLAB_TOKEN environment variable is required.
```

---

## 故障排查

### 问题 1：服务器未出现在工具列表中

**可能原因：**
- 配置文件路径错误
- 配置文件 JSON 格式错误
- 客户端未重启

**解决方案：**
1. 检查配置文件路径是否正确
2. 使用 JSON 验证器检查格式：[jsonlint.com](https://jsonlint.com/)
3. 完全退出并重启客户端应用
4. 查看客户端日志（如有）

### 问题 2：Token 认证失败

**错误信息：** `401 Unauthorized`

**解决方案：**
1. 确认 Token 是否正确复制（注意前后空格）
2. 检查 Token 是否具有 `api` 权限
3. 确认 Token 未过期
4. 验证 `GITLAB_HOST` 与 Token 来源一致

### 问题 3：找不到可执行文件

**错误信息：** `command not found` 或 `ENOENT`

**解决方案：**
1. 确认 Node.js 已安装：`node --version`
2. 全局安装后，运行：`which gitlab-cursor-review`（或 `where gitlab-cursor-review` on Windows）
3. 使用绝对路径配置 `args`
4. 或改用 npx 方式：`"command": "npx", "args": ["-y", "gitlab-cursor-review"]`

### 问题 4：Windows 路径问题

Windows 用户需要注意路径中的反斜杠需要转义：

```json
{
  "command": "C:\\Program Files\\nodejs\\node.exe",
  "args": ["C:\\Users\\YourName\\AppData\\npm\\gitlab-cursor-review"]
}
```

或使用正斜杠（Node.js 支持）：

```json
{
  "command": "C:/Program Files/nodejs/node.exe",
  "args": ["C:/Users/YourName/AppData/npm/gitlab-cursor-review"]
}
```

### 问题 5：查看详细日志

启用调试模式查看详细日志：

```bash
# 在终端手动运行服务器
export GITLAB_TOKEN="your_token"
export GITLAB_HOST="https://gitlab.com"
node /path/to/gitlab-cursor-review 2>&1 | tee mcp-server.log
```

这将输出所有日志到 `mcp-server.log` 文件。

---

## 高级配置

### 配置多个 GitLab 实例

如果你需要同时连接多个 GitLab 实例（如公有云和自托管），可以配置多个服务器：

```json
{
  "mcpServers": {
    "gitlab-public": {
      "command": "node",
      "args": ["/usr/local/bin/gitlab-cursor-review"],
      "env": {
        "GITLAB_TOKEN": "glpat-PUBLIC_TOKEN",
        "GITLAB_HOST": "https://gitlab.com"
      }
    },
    "gitlab-company": {
      "command": "node",
      "args": ["/usr/local/bin/gitlab-cursor-review"],
      "env": {
        "GITLAB_TOKEN": "glpat-COMPANY_TOKEN",
        "GITLAB_HOST": "https://gitlab.company.com"
      }
    }
  }
}
```

在使用时，AI 会根据 MR URL 的域名自动选择合适的服务器。

### 使用 .env 文件（开发环境）

如果你是从源码运行，可以在项目根目录创建 `.env` 文件：

```bash
GITLAB_TOKEN=glpat-YOUR_TOKEN_HERE
GITLAB_HOST=https://gitlab.com
```

然后配置文件可以简化为：

```json
{
  "mcpServers": {
    "gitlab-review": {
      "command": "node",
      "args": ["/path/to/gitlab-cursor-review/dist/index.mjs"],
      "cwd": "/path/to/gitlab-cursor-review"
    }
  }
}
```

服务器会自动加载 `.env` 文件中的环境变量。

### 配置超时和重试

MCP SDK 支持配置超时参数。如果你的 GitLab 实例响应较慢，可以在配置中添加：

```json
{
  "mcpServers": {
    "gitlab-review": {
      "command": "node",
      "args": ["/usr/local/bin/gitlab-cursor-review"],
      "env": {
        "GITLAB_TOKEN": "glpat-YOUR_TOKEN",
        "GITLAB_HOST": "https://gitlab.com",
        "AXIOS_TIMEOUT": "30000"
      }
    }
  }
}
```

注意：当前版本不直接支持 `AXIOS_TIMEOUT`，这是一个建议的扩展功能。

### 配置代理（企业环境）

如果你的网络环境需要代理访问 GitLab：

```json
{
  "mcpServers": {
    "gitlab-review": {
      "command": "node",
      "args": ["/usr/local/bin/gitlab-cursor-review"],
      "env": {
        "GITLAB_TOKEN": "glpat-YOUR_TOKEN",
        "GITLAB_HOST": "https://gitlab.com",
        "HTTP_PROXY": "http://proxy.company.com:8080",
        "HTTPS_PROXY": "http://proxy.company.com:8080"
      }
    }
  }
}
```

注意：当前版本使用 axios，默认会尊重 HTTP_PROXY 环境变量。

---

## 安全最佳实践

### 1. Token 安全

- **不要**将 Token 提交到版本控制系统
- 使用环境变量或配置文件存储 Token
- 为不同项目创建不同的 Token，设置最小权限
- 定期轮换 Token

### 2. 权限控制

创建 Token 时，仅授予必需的权限：

- **只读审查**：`read_api` + `read_repository`
- **评论功能**：需要添加 `api`（包含写入权限）

### 3. 配置文件权限

确保配置文件仅当前用户可读：

```bash
chmod 600 ~/.config/claude-code/mcp_config.json
```

### 4. 企业部署

对于团队或企业部署：

- 考虑使用集中式密钥管理（如 HashiCorp Vault）
- 配置服务账户而非个人 Token
- 实施审计日志监控 API 调用

---

## 更新服务器

### 更新全局安装

```bash
npm update -g gitlab-cursor-review
```

### 更新源码构建

```bash
cd gitlab-cursor-review
git pull origin main
npm install
npm run build
```

更新后，重启 MCP 客户端以加载新版本。

---

## 卸载

### 卸载全局安装

```bash
npm uninstall -g gitlab-cursor-review
```

### 清理配置

从 MCP 客户端配置文件中移除 `gitlab-review` 条目，然后重启客户端。

---

## 常见问题（FAQ）

**Q: 我可以在没有网络连接时使用吗？**

A: 不可以，服务器需要访问 GitLab API。但 `review_merge_request` 的本地检出功能可以在离线时分析已拉取的代码。

**Q: 支持哪些 Node.js 版本？**

A: 建议使用 Node.js v18 或更高版本。最低支持 v16。

**Q: 配置修改后需要重启客户端吗？**

A: 是的，MCP 配置在客户端启动时加载，修改后需要重启才能生效。

**Q: 可以同时运行多个 MCP 服务器吗？**

A: 可以，在配置文件的 `mcpServers` 对象中添加多个条目即可。

**Q: 如何获取客户端日志？**

A:
- Claude Code: 运行时会在终端输出日志
- Claude Desktop: 查看应用程序日志文件夹（位置因平台而异）

---

## 下一步

现在你已经成功集成了 GitLab MR Review MCP 服务器，可以：

1. 阅读 [使用文档](./USAGE.md) 了解工具的详细用法
2. 查看 [示例工作流](./USAGE.md#典型工作流程) 快速上手
3. 探索 [高级功能](./USAGE.md#高级用法) 提升效率

---

## 获取帮助

如遇到问题或需要帮助：

- 提交 Issue: https://github.com/your-org/gitlab-cursor-review/issues
- 查看 MCP 文档: https://modelcontextprotocol.io
- Claude Code 文档: https://code.claude.com/docs

---

## 贡献

欢迎贡献代码或改进文档！请参阅 [CONTRIBUTING.md](./CONTRIBUTING.md)（如有）。

## 许可证

本项目采用 MIT 许可证。详见 [LICENSE](./LICENSE) 文件。
