# GitLab Cursor Review

A powerful MCP (Model Context Protocol) server that enables AI assistants like Claude to review GitLab Merge Requests with intelligent code analysis and automated commenting capabilities.

## Features

- **Fetch MR Details**: Automatically retrieve merge request information, descriptions, and diffs
- **Local Checkout**: Optionally check out MR branches locally for deep code analysis
- **Post Comments**: Submit review comments to MR discussion timeline
- **Inline Comments**: Add targeted code review comments on specific lines
- **Self-Hosted Support**: Works with both GitLab.com and self-hosted GitLab instances
- **Smart Filtering**: Automatically filters out noise files (lock files, maps, etc.)

## Quick Start

### Installation

```bash
npm install -g gitlab-cursor-review
```

### Configuration

1. Get your GitLab Personal Access Token from:
   - GitLab.com: https://gitlab.com/-/profile/personal_access_tokens
   - Self-hosted: `https://your-gitlab.com/-/profile/personal_access_tokens`

2. Configure your MCP client (Claude Code, Claude Desktop, etc.):

```json
{
  "mcpServers": {
    "gitlab-review": {
      "command": "node",
      "args": ["/usr/local/bin/gitlab-cursor-review"],
      "env": {
        "GITLAB_TOKEN": "glpat-YOUR_TOKEN_HERE",
        "GITLAB_HOST": "https://gitlab.com"
      }
    }
  }
}
```

3. Restart your MCP client and start reviewing!

## Documentation

- **[Integration Guide](./INTEGRATION.md)** - Detailed setup instructions for various MCP clients
- **[Usage Guide](./USAGE.md)** - Complete tool documentation and workflow examples

## Available Tools

### 1. review_merge_request
Fetch MR details and diffs, optionally checkout branch locally.

```typescript
{
  "url": "https://gitlab.com/group/project/-/merge_requests/123",
  "shouldCheckout": true,
  "localRepoPath": "/path/to/repo"
}
```

### 2. post_mr_comment
Post a general comment to the MR discussion.

```typescript
{
  "url": "https://gitlab.com/group/project/-/merge_requests/123",
  "commentBody": "## Review Summary\n\nLooks good to merge!"
}
```

### 3. post_inline_comment
Post a comment on a specific line of code.

```typescript
{
  "url": "https://gitlab.com/group/project/-/merge_requests/123",
  "filePath": "src/utils.ts",
  "lineNumber": 42,
  "commentBody": "Consider using async/await here."
}
```

## Example Workflow

```
User: Review this MR: https://gitlab.com/group/project/-/merge_requests/123

AI: [Uses review_merge_request tool]
    I've analyzed the MR. Here are my findings:

    1. Great test coverage
    2. Found a potential bug in src/api.ts:25

    Should I post these comments to GitLab?

User: Yes, post inline comments.

AI: [Uses post_inline_comment tool]
    Done! Comments posted successfully.
```

## Development

### Install dependencies

```bash
npm install
```

### Build the project

```bash
npm run build
```

### Run tests

```bash
npm run test
```

### Development mode (with watch)

```bash
npm run dev
```

## Requirements

- Node.js v18 or higher
- GitLab Personal Access Token with `api` and `read_repository` scopes
- MCP-compatible client (Claude Code, Claude Desktop, etc.)

## Security

- Never commit your GitLab token to version control
- Use environment variables or secure configuration files
- Grant minimal necessary permissions to tokens
- Rotate tokens regularly

## Troubleshooting

See the [Integration Guide](./INTEGRATION.md#故障排查) for common issues and solutions.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT - See [LICENSE](./LICENSE) file for details.

## Resources

- [MCP Documentation](https://modelcontextprotocol.io)
- [GitLab API Documentation](https://docs.gitlab.com/ee/api/)
- [Claude Code](https://code.claude.com/)

## Support

If you encounter any issues or have questions:
- Open an issue on GitHub
- Check existing issues for solutions
- Review the documentation guides