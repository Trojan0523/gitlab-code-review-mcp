# GitLab MR Review 工具使用文档

本文档介绍如何使用 GitLab Cursor Review MCP 服务器提供的工具进行代码审查。

## 工具概览

该 MCP 服务器提供了三个核心工具，用于 GitLab Merge Request（MR）的审查流程：

1. **review_merge_request** - 获取 MR 详情和代码差异
2. **post_mr_comment** - 发布通用评论到 MR 讨论区
3. **post_inline_comment** - 在代码特定行发布内联评论

## 前置要求

- GitLab 访问令牌（Personal Access Token）
- 令牌需要至少具有以下权限：
  - `api` - 访问 API
  - `read_repository` - 读取仓库
  - `write_repository` - 写入评论（如需发布评论）

## 工具详细说明

### 1. review_merge_request

**用途**：拉取 MR 的详细信息和代码差异，可选择本地检出分支进行深度分析。

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `url` | string | 是 | GitLab MR 的完整 URL，格式如：`https://gitlab.com/group/project/-/merge_requests/123` |
| `shouldCheckout` | boolean | 否 | 是否在本地检出分支（默认：true） |
| `localRepoPath` | string | 否 | 本地仓库的绝对路径，如果需要检出分支则必填 |

**返回内容**：

- MR 标题和描述
- 所有变更文件的 diff 内容
- Git 操作状态（如果执行了本地检出）

**使用示例**：

```typescript
// 仅获取 MR 信息，不检出分支
{
  "url": "https://gitlab.com/group/project/-/merge_requests/123",
  "shouldCheckout": false
}

// 获取 MR 信息并在本地检出分支
{
  "url": "https://gitlab.com/group/project/-/merge_requests/123",
  "shouldCheckout": true,
  "localRepoPath": "/Users/username/projects/my-project"
}
```

**注意事项**：

- 如果本地有未提交的修改，工具会自动 stash 保存
- 大型 diff（超过 8000 字符）会被截断以提高性能
- 自动过滤 `.lock`、`.map` 和 `package-lock.json` 等文件

---

### 2. post_mr_comment

**用途**：在 MR 的讨论时间线中发布通用评论（note），适用于整体性的审查意见。

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `url` | string | 是 | GitLab MR 的完整 URL |
| `commentBody` | string | 是 | 评论内容，支持 Markdown 格式 |

**返回内容**：

- 成功提示和评论 ID

**使用示例**：

```typescript
{
  "url": "https://gitlab.com/group/project/-/merge_requests/123",
  "commentBody": "## 代码审查总结\n\n✅ 整体代码质量良好\n\n### 建议改进：\n- 建议添加单元测试覆盖新功能\n- 部分函数缺少错误处理"
}
```

**适用场景**：

- 发布整体性的审查总结
- 提出通用性的改进建议
- 询问 MR 相关问题
- 批准或请求修改

---

### 3. post_inline_comment

**用途**：在代码的特定行发布内联评论，创建新的讨论线程。

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `url` | string | 是 | GitLab MR 的完整 URL |
| `filePath` | string | 是 | 文件路径（new_path），如 `src/utils.ts` |
| `lineNumber` | number | 是 | 在新文件版本中的行号（new_line） |
| `commentBody` | string | 是 | 评论内容，支持 Markdown 格式 |

**返回内容**：

- 成功提示和讨论 ID

**使用示例**：

```typescript
{
  "url": "https://gitlab.com/group/project/-/merge_requests/123",
  "filePath": "src/services/user.ts",
  "lineNumber": 42,
  "commentBody": "建议使用 `async/await` 替代 Promise 链，提高代码可读性：\n\n```typescript\nconst user = await getUser(id);\nconst profile = await getUserProfile(user);\n```"
}
```

**适用场景**：

- 针对特定代码行提出改进建议
- 指出潜在的 bug 或安全问题
- 提供代码重构建议
- 询问特定实现细节

**注意事项**：

- 行号必须是新文件（MR 改动后）的行号
- GitLab 会严格校验 SHA 和行号匹配，确保 MR 未被更新
- 如果 MR 被推送了新的提交，旧的行号可能失效
- 仅支持评论新增或修改的行，不支持被删除的行

---

## 典型工作流程

### 场景 1：基础代码审查

1. 使用 `review_merge_request` 获取 MR 信息
2. 分析代码变更
3. 使用 `post_mr_comment` 发布总体评价

```bash
# 步骤 1：获取 MR
review_merge_request({
  url: "https://gitlab.com/group/project/-/merge_requests/123",
  shouldCheckout: false
})

# 步骤 2：分析代码...

# 步骤 3：发布评论
post_mr_comment({
  url: "https://gitlab.com/group/project/-/merge_requests/123",
  commentBody: "代码审查完成，建议合并。"
})
```

### 场景 2：深度代码审查（本地检出）

1. 使用 `review_merge_request` 并检出分支到本地
2. 结合本地 IDE 进行深度分析
3. 使用 `post_inline_comment` 针对特定行提出意见
4. 使用 `post_mr_comment` 总结审查结果

```bash
# 步骤 1：获取并检出分支
review_merge_request({
  url: "https://gitlab.com/group/project/-/merge_requests/123",
  shouldCheckout: true,
  localRepoPath: "/path/to/repo"
})

# 步骤 2：本地深度分析...

# 步骤 3：发布行级评论
post_inline_comment({
  url: "https://gitlab.com/group/project/-/merge_requests/123",
  filePath: "src/api/handler.ts",
  lineNumber: 25,
  commentBody: "这里可能存在 SQL 注入风险，建议使用参数化查询。"
})

# 步骤 4：发布总结
post_mr_comment({
  url: "https://gitlab.com/group/project/-/merge_requests/123",
  commentBody: "发现 1 个安全问题需要修复。"
})
```

### 场景 3：批量审查

对于多个文件的评论，可以连续调用 `post_inline_comment`：

```typescript
// 对文件 A 的评论
post_inline_comment({
  url: "...",
  filePath: "src/fileA.ts",
  lineNumber: 10,
  commentBody: "建议添加类型注解"
})

// 对文件 B 的评论
post_inline_comment({
  url: "...",
  filePath: "src/fileB.ts",
  lineNumber: 20,
  commentBody: "这个函数过于复杂，建议拆分"
})

// 最后发布总结
post_mr_comment({
  url: "...",
  commentBody: "已完成全部文件的审查，共提出 2 处改进建议。"
})
```

---

## 最佳实践

### 评论格式建议

使用 Markdown 格式化你的评论，提高可读性：

```markdown
## 问题描述
这里存在潜在的性能问题。

### 建议方案
使用缓存机制优化：
```typescript
const cache = new Map();
if (cache.has(key)) return cache.get(key);
```

### 参考资料
- [性能优化指南](https://example.com)
```

### 评论粒度

- **整体性意见**：使用 `post_mr_comment`
  - 架构设计评审
  - 测试覆盖率评价
  - 文档完整性检查

- **具体性意见**：使用 `post_inline_comment`
  - 具体代码实现问题
  - 命名建议
  - 算法优化建议

### 错误处理

如果工具返回错误，常见原因及解决方案：

| 错误信息 | 可能原因 | 解决方案 |
|----------|----------|----------|
| Invalid GitLab MR URL format | URL 格式不正确 | 检查 URL 是否完整且包含 `/-/merge_requests/` |
| 401 Unauthorized | Token 无效或权限不足 | 检查 `GITLAB_TOKEN` 环境变量和权限 |
| Line code not found | 行号或 SHA 不匹配 | 确认 MR 未被更新，行号准确 |
| Path not found | 本地路径不存在 | 检查 `localRepoPath` 参数 |

---

## 高级用法

### 结合 AI 助手使用

在使用 Claude Code 或其他 MCP 客户端时，可以通过自然语言与工具交互：

```
用户：请帮我审查这个 MR：https://gitlab.com/group/project/-/merge_requests/123

AI：好的，我将为你审查这个 MR。
[调用 review_merge_request 工具]
[分析代码]
我发现了以下几个问题：
1. 在 src/utils.ts:42 行存在潜在的空指针问题
2. 测试覆盖率不足

是否需要我将这些评论发布到 GitLab？

用户：是的，请发布详细的行级评论。

AI：[调用 post_inline_comment 和 post_mr_comment]
已成功发布评论！
```

### 批量处理多个 MR

可以编写脚本遍历多个 MR：

```typescript
const mrUrls = [
  "https://gitlab.com/group/project/-/merge_requests/123",
  "https://gitlab.com/group/project/-/merge_requests/124",
  "https://gitlab.com/group/project/-/merge_requests/125"
];

for (const url of mrUrls) {
  // 审查每个 MR
  const result = await review_merge_request({ url, shouldCheckout: false });
  // 分析并发布评论...
}
```

---

## 常见问题（FAQ）

**Q: 工具是否支持 GitLab 自托管实例？**

A: 是的，通过配置 `GITLAB_HOST` 环境变量即可支持。

**Q: 如何审查已删除的代码行？**

A: 当前版本的 `post_inline_comment` 仅支持评论新增或修改的行。评论删除的行需要使用 GitLab API 的高级参数，可能在未来版本中支持。

**Q: 工具是否会修改我的本地分支？**

A: 使用 `shouldCheckout: true` 时，工具会切换分支并拉取最新代码，但会先自动 stash 保存你的本地修改。

**Q: 评论发布后可以编辑或删除吗？**

A: 通过本工具发布的评论需要在 GitLab Web 界面中手动编辑或删除。

**Q: 支持批量发布多条评论吗？**

A: 可以连续调用工具多次，每次调用都会创建一个新的评论或讨论。

---

## 技术支持

如遇到问题或需要功能建议，请提交 Issue：
https://github.com/your-org/gitlab-cursor-review/issues
