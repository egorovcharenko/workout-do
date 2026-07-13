<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Release workflow

After completing and verifying code changes, commit and push them to `origin/main`, then wait for the linked Vercel production deployment to reach Ready and verify the production alias. Do not leave completed changes only in the local worktree unless the user explicitly says not to deploy.
