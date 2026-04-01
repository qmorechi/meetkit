#!/bin/bash
# ─── MeetKit 交接推送 ─────────────────────────────────────────
# 雙擊執行：儲存工作進度 → 推送到 GitHub → 另一台裝置可接續
cd "$(dirname "$0")"

echo ""
echo "═══════════════════════════════════════════"
echo "  ◈  MeetKit · 交接推送"
echo "═══════════════════════════════════════════"
echo ""

# ── 1. 自動擷取當前狀態 ──
DEVICE=$(scutil --get ComputerName 2>/dev/null || hostname)
TIMESTAMP=$(date '+%Y-%m-%d %H:%M')
BRANCH=$(git branch --show-current 2>/dev/null || echo "main")
GIT_STATUS=$(git status --short 2>/dev/null)
RECENT_COMMITS=$(git log --oneline -5 2>/dev/null)
MODIFIED_FILES=$(git diff --name-only 2>/dev/null; git diff --cached --name-only 2>/dev/null)

echo "📍 裝置: $DEVICE"
echo "🕐 時間: $TIMESTAMP"
echo "🌿 分支: $BRANCH"
echo ""

if [ -n "$GIT_STATUS" ]; then
  echo "📝 未提交的變更:"
  echo "$GIT_STATUS"
  echo ""
fi

# ── 2. 請使用者輸入交接摘要 ──
echo "───────────────────────────────────────────"
echo "請輸入交接摘要（下次開工時 Claude 會讀取）："
echo "（直接按 Enter 可跳過，會用自動摘要）"
echo "───────────────────────────────────────────"
read -r USER_SUMMARY

if [ -z "$USER_SUMMARY" ]; then
  USER_SUMMARY=$(git log --oneline -1 --format="%s" 2>/dev/null || echo "繼續上次的工作")
  echo "→ 自動摘要: $USER_SUMMARY"
fi

# ── 3. 寫入交接紀錄 ──
cat > .claude-handoff.md << HANDOFF_EOF
# 交接紀錄

> 這份紀錄由 handoff.command 自動產生，Claude Code 啟動時會自動讀取。

## 狀態

| 項目 | 內容 |
|------|------|
| 時間 | $TIMESTAMP |
| 裝置 | $DEVICE |
| 分支 | $BRANCH |

## 摘要

$USER_SUMMARY

## 未提交的變更

\`\`\`
${GIT_STATUS:-（無未提交變更）}
\`\`\`

## 最近 5 筆 Commits

\`\`\`
${RECENT_COMMITS:-（無紀錄）}
\`\`\`

## 修改中的檔案

\`\`\`
${MODIFIED_FILES:-（無）}
\`\`\`
HANDOFF_EOF

echo ""
echo "✅ 交接紀錄已寫入 .claude-handoff.md"

# ── 4. Git add + commit + push ──
echo ""
echo "📦 提交到 GitHub..."
git add -A
git commit -m "handoff: $USER_SUMMARY [$DEVICE → $TIMESTAMP]" 2>/dev/null

if git push 2>/dev/null; then
  echo ""
  echo "═══════════════════════════════════════════"
  echo "  ✅ 交接完成！"
  echo "  到另一台裝置雙擊 start.command 即可接續"
  echo "═══════════════════════════════════════════"
else
  echo ""
  echo "⚠ 推送失敗，請檢查網路連線後手動 git push"
fi

echo ""
echo "（按任意鍵關閉）"
read -n 1
