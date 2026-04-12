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
SUMMARY="自動收工 commit"

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
