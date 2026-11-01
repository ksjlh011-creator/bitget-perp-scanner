#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
gh auth status
npm test
if [ ! -d .git ]; then
  git init -b main
  git add .
  git -c user.name='Bitget Scanner' -c user.email='scanner@users.noreply.github.com' commit -m 'Build standalone Bitget public market scanner'
fi
owner="$(gh api user --jq .login)"
if [ "$owner" != 'ksjlh011-creator' ]; then
  echo '当前认证账号不是ksjlh011-creator，已停止。' >&2
  exit 1
fi
repo="${owner}/bitget-perp-scanner"
if git remote get-url origin >/dev/null 2>&1; then
  echo '已有 origin，请核实独立仓库后手动推送。脚本不会覆盖远端。' >&2
  exit 1
fi
gh repo create "$repo" --public --source=. --remote=origin --push
gh api --method POST "repos/$repo/pages" -f build_type=workflow
echo "免费 Pages 发布已触发，请在 https://github.com/$repo/actions 查看结果。"
