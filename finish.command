#!/bin/bash
# ─── MeetKit 收工儀式 ──────────────────────────────────────────
# 雙擊執行：確認 handoff 更新 → git commit → git push
cd "$(dirname "$0")"
PROJECT_DIR="$(pwd)"

echo ""
echo "═══════════════════════════════════════════"
echo "  ◈  MeetKit 收工中..."
echo "═══════════════════════════════════════════"
echo ""

# ── 1. 檢查 .claude-handoff.md 是否存在且最近更新過 ──
HANDOFF_FILE="$PROJECT_DIR/.claude-handoff.md"

if [ ! -f "$HANDOFF_FILE" ]; then
  echo "⚠ 找不到 .claude-handoff.md"
  echo ""
  echo "  可能原因:"
  echo "  • 這是第一次使用 finish.command"
  echo "  • Claude Code 這次 session 沒有更新交接紀錄"
  echo ""
  echo "  建議: 回到 Claude Code 說「幫我整理交接」,等它更新後再執行本腳本"
  echo ""
  echo "  仍要繼續 push 嗎？（y/N）"
  read -r CONTINUE_WITHOUT_HANDOFF
  if [ "$CONTINUE_WITHOUT_HANDOFF" != "y" ] && [ "$CONTINUE_WITHOUT_HANDOFF" != "Y" ]; then
    echo ""
    echo "已取消。請先更新交接紀錄。"
    read -n 1 -s -r -p "（按任意鍵關閉）"
    exit 0
  fi
else
  # 檢查 handoff 檔案的修改時間
  if [ "$(uname)" = "Darwin" ]; then
    HANDOFF_MTIME=$(stat -f "%m" "$HANDOFF_FILE")
  else
    HANDOFF_MTIME=$(stat -c "%Y" "$HANDOFF_FILE")
  fi
  NOW=$(date +%s)
  AGE_MINUTES=$(( (NOW - HANDOFF_MTIME) / 60 ))

  if [ "$AGE_MINUTES" -gt 30 ]; then
    echo "⚠ .claude-handoff.md 已經 $AGE_MINUTES 分鐘沒更新"
    echo ""
    echo "  可能 Claude Code 這次 session 忘了更新交接紀錄"
    echo ""
    echo "  仍要繼續 push 嗎？（y/N）"
    read -r CONTINUE_OLD_HANDOFF
    if [ "$CONTINUE_OLD_HANDOFF" != "y" ] && [ "$CONTINUE_OLD_HANDOFF" != "Y" ]; then
      echo ""
      echo "已取消。請回到 Claude Code 說「幫我整理交接」再執行本腳本。"
      read -n 1 -s -r -p "（按任意鍵關閉）"
      exit 0
    fi
  else
    echo "✓ 交接紀錄已更新（$AGE_MINUTES 分鐘前）"
  fi
fi
echo ""

# ── 2. 顯示即將提交的變動 ──
echo "═══════════════════════════════════════════"
echo "  📋 即將提交的變動"
echo "═══════════════════════════════════════════"
echo ""

CHANGED_COUNT=$(git status --porcelain | wc -l | tr -d ' ')

if [ "$CHANGED_COUNT" = "0" ]; then
  echo "✓ 沒有任何變動,不需要 commit"
  echo ""
  echo "═══════════════════════════════════════════"
  echo ""
  echo "收工完成（無變動）"
  echo ""
  read -n 1 -s -r -p "（按任意鍵關閉）"
  exit 0
fi

echo "  共有 $CHANGED_COUNT 個檔案變動:"
echo ""
git status --short | sed 's/^/  /'
echo ""
echo "═══════════════════════════════════════════"
echo ""

# ── 3. 詢問確認 ──
echo "確認要 commit + push 嗎？（Y/n）"
read -r CONFIRM
if [ "$CONFIRM" = "n" ] || [ "$CONFIRM" = "N" ]; then
  echo ""
  echo "已取消。變動保留在本機。"
  read -n 1 -s -r -p "（按任意鍵關閉）"
  exit 0
fi
echo ""

# ── 4. 組合 commit 訊息 ──
# 優先從 .claude-handoff.md 的「## 摘要」段落取內容
if [ -f "$HANDOFF_FILE" ]; then
  SUMMARY=$(awk '/^## 摘要/{flag=1; next} /^## /{flag=0} flag' "$HANDOFF_FILE" | sed '/^$/d' | head -2 | tr '\n' ' ')
fi

if [ -z "$SUMMARY" ]; then
  SUMMARY="自動收工 commit"
fi

TIMESTAMP=$(date "+%Y-%m-%d %H:%M")
DEVICE=$(hostname | sed 's/\.local//')
COMMIT_MSG="chore: $SUMMARY

[$TIMESTAMP / $DEVICE]"

# ── 5. Git add + commit + push ──
echo "⬆ 正在 commit..."
git add -A
if git commit -m "$COMMIT_MSG" --quiet; then
  echo "✓ Commit 完成"
else
  echo "⚠ Commit 失敗（可能沒有實質變動）"
fi
echo ""

echo "⬆ 正在 push 到 GitHub..."
if git push --quiet 2>&1; then
  echo "✓ Push 完成"
else
  echo ""
  echo "⚠ Push 失敗 — 可能原因:"
  echo "   • 沒網路 → 檢查 wifi"
  echo "   • 另一台機器有先 push → 先雙擊 start.command 拉最新再試"
  echo "   • 需要輸入 GitHub 密碼 → 請在下方輸入"
  echo ""
  echo "   要手動重試 push 嗎？（y/N）"
  read -r RETRY
  if [ "$RETRY" = "y" ] || [ "$RETRY" = "Y" ]; then
    git push
  fi
fi
echo ""

# ── 6. 收工總結 ──
echo "═══════════════════════════════════════════"
echo "  ✅ 收工完成"
echo "═══════════════════════════════════════════"
echo ""
echo "  🕐 $TIMESTAMP"
echo "  📍 來自: $DEVICE"
echo ""
echo "  下次在任何裝置雙擊 start.command,"
echo "  Claude Code 會自動接續這次進度。"
echo ""
echo "═══════════════════════════════════════════"
echo ""
read -n 1 -s -r -p "（按任意鍵關閉）"
