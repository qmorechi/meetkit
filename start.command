#!/bin/bash
# ─── MeetKit 啟動 + 接續上次工作 ────────────────────────────────
# 雙擊執行：拉取最新 → 顯示交接紀錄 → 啟動 Claude Code
cd "$(dirname "$0")"
PROJECT_DIR="$(pwd)"

echo ""
echo "═══════════════════════════════════════════"
echo "  ◈  MeetKit 啟動中..."
echo "═══════════════════════════════════════════"
echo ""

# ── 1. 從 GitHub 拉取最新 ──
echo "⬇ 同步最新版本..."
if git pull --quiet 2>/dev/null; then
  echo "✓ 已是最新版本"
else
  echo "⚠ 同步失敗（繼續使用本機版本）"
fi
echo ""

# ── 2. 讀取交接紀錄 ──
HANDOFF_FILE="$PROJECT_DIR/.claude-handoff.md"
HAS_HANDOFF=false

if [ -f "$HANDOFF_FILE" ]; then
  HAS_HANDOFF=true
  echo "═══════════════════════════════════════════"
  echo "  📋 上次交接紀錄"
  echo "═══════════════════════════════════════════"
  echo ""
  SUMMARY=$(sed -n '/^## 摘要/,/^## /p' "$HANDOFF_FILE" | head -4 | tail -3)
  DEVICE=$(grep '| 裝置' "$HANDOFF_FILE" | sed 's/.*| //')
  TIME=$(grep '| 時間' "$HANDOFF_FILE" | sed 's/.*| //')
  echo "  🕐 $TIME"
  echo "  📍 來自: $DEVICE"
  echo "  📝 $SUMMARY"
  echo ""
  echo "═══════════════════════════════════════════"
  echo ""
fi

# ── 3. 啟動 Claude Code ──
echo "🤖 啟動 Claude Code..."
echo ""

if [ "$HAS_HANDOFF" = true ]; then
  HANDOFF_CONTENT=$(cat "$HANDOFF_FILE")
  claude "請讀取以下交接紀錄，了解上次的工作進度後，告訴我目前狀態和可以繼續的方向：

$HANDOFF_CONTENT

工作目錄：$PROJECT_DIR
主要檔案：meetkit.html"
else
  claude
fi

echo ""
echo "Claude Code 已結束。"
echo "（按任意鍵關閉）"
read -n 1
