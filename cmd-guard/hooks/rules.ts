export type Lang = 'en' | 'zh'
export type RuleText = { name: string; impact: string; safer: string }
export type Rule = {
  re: RegExp
  // stable id: what session allowances remember
  id: string
  level: 'CRITICAL' | 'HIGH'
  text: Record<Lang, RuleText>
}

// matched against the whole Bash command, so chained commands are caught too.
// ponytail: regexes, not a shell parser; a guard against slips, not a sandbox
const BROAD = String.raw`(\/|\/\*|~|~\/|~\/\*|\$HOME|\$HOME\/\*?|\*|\.|\.\.|\.\/\*?)`
// `git`, then any global options (-C dir, -c key=value, --git-dir=...), then the subcommand
const GIT = String.raw`\bgit(\s+(-[cC]\s+\S+|-[a-zA-Z]+|--(git-dir|work-tree|namespace|config-env)\s+\S+|--[a-z-]+(=\S+)?))*\s+`
// git takes any unambiguous prefix of a long option: --fo is --force
// the rest of one command: quoted strings whole, stopping at ; & | or newline
const SEG = String.raw`([^;&|\n'"]|'[^']*'|"[^"]*")*`
// leading options with no separate value: -e / --exclude take the next word, so they end the run
const OPTS = String.raw`(\s+(-[a-zA-Z]*[a-df-zA-Z]|--(?!e)[a-z][a-z-]*|--[a-z-]+=\S+))*`
export const RULES: Rule[] = [
  { re: new RegExp(String.raw`\brm\s+(-[a-zA-Z]*r[a-zA-Z]*\s+|-[a-zA-Z]*f[a-zA-Z]*\s+|--recursive\s+|--force\s+)+${BROAD}(\s|;|&|\||$)`),
    id: 'rm-broad', level: 'CRITICAL', text: {
      en: { name: 'Broad rm -rf', impact: 'Recursively deletes the root, home or a wildcard path; cannot be undone', safer: 'Name exact paths, or ls first; use trash to move files to the Trash' },
      zh: { name: 'rm -rf 大範圍刪除', impact: '遞迴刪除根目錄、家目錄或萬用字元路徑，無法復原', safer: '指定精確路徑，或先 ls 確認再刪；改用 trash 移到垃圾桶' } } },
  // --force, -f in any flag cluster (-fu), or a +refspec
  { re: new RegExp(String.raw`${GIT}push\b(?=.*\s(--f(o(r(ce?)?)?)?(?![\w-])|-[a-zA-Z]*f[a-zA-Z]*\b|\+\S))`),
    id: 'git-push-force', level: 'HIGH', text: {
      en: { name: 'git push --force', impact: 'Overwrites remote history and can erase other people\'s commits', safer: 'git push --force-with-lease' },
      zh: { name: 'git push --force', impact: '覆寫遠端歷史，可能抹掉他人的 commit', safer: 'git push --force-with-lease' } } },
  { re: new RegExp(String.raw`${GIT}reset\b${SEG}\s--h(a(rd?)?)?\b`),
    id: 'git-reset-hard', level: 'HIGH', text: {
      en: { name: 'git reset --hard', impact: 'Discards every uncommitted change; cannot be undone', safer: 'git stash (keeps the changes; pop them back any time)' },
      zh: { name: 'git reset --hard', impact: '捨棄所有未提交的變更，無法復原', safer: 'git stash（保留變更，可隨時 pop 回來）' } } },
  // a dry run (-n, --dry-run) deletes nothing. It counts only among the leading
  // options (OPTS), so a -n that is a path after --, an -e pattern, or in a later
  // command can't pass for one
  { re: new RegExp(String.raw`${GIT}clean\b(?!${OPTS}\s+(-[a-df-zA-Z]*n[a-zA-Z]*|--d(r(y(-(r(un?)?)?)?)?)?)(\s|;|&|\||$))(?=${SEG}\s(-[a-zA-Z]*f|--f(o(r(ce?)?)?)?\b))`),
    id: 'git-clean', level: 'HIGH', text: {
      en: { name: 'git clean -f', impact: 'Deletes every untracked file', safer: 'git clean -n to preview what would go' },
      zh: { name: 'git clean -f', impact: '刪除所有未追蹤的檔案', safer: 'git clean -n 先預覽要刪的檔案' } } },
  { re: /\b(drop\s+(table|database|schema)|truncate\s+table)\b/i,
    id: 'sql-drop', level: 'CRITICAL', text: {
      en: { name: 'SQL DROP / TRUNCATE', impact: 'Deletes a whole table or database', safer: 'Back up first (pg_dump / mysqldump), or run it in a transaction' },
      zh: { name: 'SQL DROP / TRUNCATE', impact: '刪除整張資料表或資料庫', safer: '先備份（pg_dump / mysqldump），或在交易中執行' } } },
  { re: /\bmkfs(\.\w+)?\b/,
    id: 'mkfs', level: 'CRITICAL', text: {
      en: { name: 'mkfs format', impact: 'Formats a disk partition and destroys its data', safer: 'Check the device (diskutil list), then run it yourself' },
      zh: { name: 'mkfs 格式化', impact: '格式化磁碟分割區，資料全毀', safer: '確認裝置代號（diskutil list）後由你手動執行' } } },
  // writing to exactly the null / zero / std streams is harmless
  { re: /\bdd\b.*\bof=\/dev\/(?!(null|zero|stdout|stderr)(\s|;|&|\||$))/,
    id: 'dd-device', level: 'CRITICAL', text: {
      en: { name: 'dd to a device', impact: 'Overwrites a disk device directly', safer: 'Check the of= device, then run it yourself' },
      zh: { name: 'dd 寫入裝置', impact: '直接覆寫磁碟裝置', safer: '確認 of= 的裝置代號後由你手動執行' } } },
  { re: /\bchmod\s+(-R\s+)?777\s+\/(\s|$)/,
    id: 'chmod-root', level: 'CRITICAL', text: {
      en: { name: 'chmod 777 /', impact: 'Makes every file on the system writable by anyone', safer: 'Grant the least permission, only where it is needed' },
      zh: { name: 'chmod 777 /', impact: '讓整個系統所有檔案都可被任何人寫入', safer: '只對需要的目錄設定最小權限' } } },
  { re: /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/,
    id: 'fork-bomb', level: 'CRITICAL', text: {
      en: { name: 'fork bomb', impact: 'Exhausts system resources and hangs the machine', safer: 'Do not run it' },
      zh: { name: 'fork bomb', impact: '耗盡系統資源，導致當機', safer: '不要執行' } } },
  { re: /\b(curl|wget)\b[^|]*\|\s*(sudo\s+)?(ba|z)?sh\b/,
    id: 'curl-pipe-sh', level: 'HIGH', text: {
      en: { name: 'Pipe download to shell', impact: 'Runs a remote script without reading it', safer: 'Download it to a file, read it, then run it' },
      zh: { name: '下載後直接執行', impact: '未經檢查就執行遠端腳本', safer: '先下載成檔案、讀過內容再執行' } } },
]

// also read with the quotes gone, the way the shell joins "$HOME"/ or ~/'*' into one word
export const check = (command: string) => {
  const unquoted = command.replace(/["']/g, '')
  return RULES.find(r => r.re.test(command) || r.re.test(unquoted))
}

// a prompt's language: Chinese when it has at least as many Han characters as Latin words
export const langOf = (text: string): Lang => {
  const han = text.match(/\p{Script=Han}/gu)?.length ?? 0
  const words = text.match(/[A-Za-z]+/g)?.length ?? 0
  return han > 0 && han >= words ? 'zh' : 'en'
}
