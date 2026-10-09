export type Rule = {
  re: RegExp
  name: string
  level: 'CRITICAL' | 'HIGH'
  impact: string
  safer: string
}

// matched against the whole Bash command, so chained commands are caught too
const BROAD = String.raw`(\/|\/\*|~|~\/|~\/\*|\$HOME|\$HOME\/\*?|\*|\.|\.\.|\.\/\*?)`
export const RULES: Rule[] = [
  { re: new RegExp(String.raw`\brm\s+(-[a-zA-Z]*r[a-zA-Z]*\s+|-[a-zA-Z]*f[a-zA-Z]*\s+|--recursive\s+|--force\s+)+${BROAD}(\s|;|&|\||$)`),
    name: 'rm -rf 大範圍刪除', level: 'CRITICAL', impact: '遞迴刪除根目錄、家目錄或萬用字元路徑，無法復原', safer: '指定精確路徑，或先 ls 確認再刪；改用 trash 移到垃圾桶' },
  { re: /\bgit\s+push\b(?=.*\s(--force(?!-with-lease)|-f)\b)/,
    name: 'git push --force', level: 'HIGH', impact: '覆寫遠端歷史，可能抹掉他人的 commit', safer: 'git push --force-with-lease' },
  { re: /\bgit\s+reset\s+--hard\b/,
    name: 'git reset --hard', level: 'HIGH', impact: '捨棄所有未提交的變更，無法復原', safer: 'git stash（保留變更，可隨時 pop 回來）' },
  { re: /\bgit\s+clean\s+-[a-zA-Z]*f/,
    name: 'git clean -f', level: 'HIGH', impact: '刪除所有未追蹤的檔案', safer: 'git clean -n 先預覽要刪的檔案' },
  { re: /\b(drop\s+(table|database|schema)|truncate\s+table)\b/i,
    name: 'SQL DROP / TRUNCATE', level: 'CRITICAL', impact: '刪除整張資料表或資料庫', safer: '先備份（pg_dump / mysqldump），或在交易中執行' },
  { re: /\bmkfs(\.\w+)?\b/,
    name: 'mkfs 格式化', level: 'CRITICAL', impact: '格式化磁碟分割區，資料全毀', safer: '確認裝置代號（diskutil list）後由你手動執行' },
  { re: /\bdd\b.*\bof=\/dev\//,
    name: 'dd 寫入裝置', level: 'CRITICAL', impact: '直接覆寫磁碟裝置', safer: '確認 of= 的裝置代號後由你手動執行' },
  { re: /\bchmod\s+(-R\s+)?777\s+\/(\s|$)/,
    name: 'chmod 777 /', level: 'CRITICAL', impact: '讓整個系統所有檔案都可被任何人寫入', safer: '只對需要的目錄設定最小權限' },
  { re: /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/,
    name: 'fork bomb', level: 'CRITICAL', impact: '耗盡系統資源，導致當機', safer: '不要執行' },
  { re: /\b(curl|wget)\b[^|]*\|\s*(sudo\s+)?(ba|z)?sh\b/,
    name: '下載後直接執行', level: 'HIGH', impact: '未經檢查就執行遠端腳本', safer: '先下載成檔案、讀過內容再執行' },
]

export const check = (command: string) => RULES.find(r => r.re.test(command))
