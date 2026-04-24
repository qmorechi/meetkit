# 幫 journals 表加 notion_page_id 欄位

> 這是 `feat: Notion sync 狀態持久化` 的配套 DB 改動。
> 不加這欄也不會爆錯，但「✓ 已同步」的標記只會記在當下那次瀏覽器 session，重新整理後會忘記，導致「全部同步」時重複建立 Notion 頁。

---

## 步驟（Supabase Dashboard）

1. 打開 https://supabase.com/dashboard/project/yrugcgzkomydmorgzwhb
2. 左側選單 → **Table Editor**
3. 選 `journals` 表
4. 右上角 **+** → **Add column**
5. 填入：

   | 欄位 | 值 |
   |---|---|
   | Name | `notion_page_id` |
   | Type | `text` |
   | Default Value | (留空) |
   | Is Nullable | ✅ 勾起來 |
   | Is Unique | ❌ 不用勾 |

6. 按 **Save**

---

## 或者用 SQL Editor（一行搞定）

1. 左側選單 → **SQL Editor**
2. 貼這一行：

   ```sql
   alter table journals add column notion_page_id text;
   ```

3. 按 **Run**

---

## 驗證

加完後，回到 MeetKit：

1. 隨便找一筆 journal 點 **↗ 同步** 單筆
2. 重新整理頁面
3. 該筆應該保持 **✓ 已同步**（不會退回未同步狀態）
4. 點「同步剩餘 N 筆」只會處理真正沒同步過的

---

## 補充：如果未來想刪掉某筆的 Notion 頁重同步

```sql
update journals set notion_page_id = null where id = '...';
```

把 `notion_page_id` 清空，該筆就會回到「待同步」狀態，下次批次同步會重新建立 Notion 頁。
