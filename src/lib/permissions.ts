// 客户端安全的权限定义（不依赖 next/headers 等服务端 API）
// 客户端组件 import 此文件，不要 import rbac.ts

export const PERMISSIONS = {
  PROMPT_READ: "prompt:read",
  PROMPT_WRITE: "prompt:write",
  PROMPT_DELETE: "prompt:delete",
  PROMPT_FEATURE: "prompt:feature",
  PROMPT_BATCH: "prompt:batch",
  USER_READ: "user:read",
  USER_WRITE: "user:write",
  USER_DELETE: "user:delete",
  ROLE_READ: "role:read",
  ROLE_WRITE: "role:write",
  ROLE_DELETE: "role:delete",
  CATEGORY_READ: "category:read",
  CATEGORY_WRITE: "category:write",
  CATEGORY_DELETE: "category:delete",
  COMMENT_READ: "comment:read",
  COMMENT_MODERATE: "comment:moderate",
  CRAWL_MANAGE: "crawl:manage",
  LOG_READ: "log:read",
  SETTING_READ: "setting:read",
  SETTING_WRITE: "setting:write",
} as const;

export const ALL_PERMISSIONS = Object.values(PERMISSIONS);

export const PERMISSION_GROUPS = [
  { label: "提示词管理", perms: ["prompt:read", "prompt:write", "prompt:delete", "prompt:feature", "prompt:batch"] },
  { label: "用户管理", perms: ["user:read", "user:write", "user:delete"] },
  { label: "角色管理", perms: ["role:read", "role:write", "role:delete"] },
  { label: "分类管理", perms: ["category:read", "category:write", "category:delete"] },
  { label: "评论管理", perms: ["comment:read", "comment:moderate"] },
  { label: "采集管理", perms: ["crawl:manage"] },
  { label: "操作日志", perms: ["log:read"] },
  { label: "站点设置", perms: ["setting:read", "setting:write"] },
];
