// engine 側（~/.claude/todo-engine.js parseBodyObj / buildBody）が扱う制御行プレフィックス。
// due は EditForm 側の専用UI（日付入力）から再構築するため PRESERVED_CONTROL_PREFIXES には含めない。
// それ以外の8種は編集フォームにUIが無いため、rawBody の値をそのまま保持する。
const PRESERVED_CONTROL_PREFIXES = [
  'activate',
  'before',
  'depends_on',
  'recur',
  'project',
  'estimate',
  'actual',
  'reviewed_at',
] as const;

// stripControlLines での除去対象（表示用テキストから完全に隠す）。due も含めた全9種。
const ALL_CONTROL_PREFIXES = ['due', ...PRESERVED_CONTROL_PREFIXES] as const;

/**
 * body から制御行（due: / activate: / before: / depends_on: / recur: /
 * project: / estimate: / actual: / reviewed_at:）を除いた表示用テキストを返す。
 * engine（~/.claude/todo-engine.js parseBodyObj）が解釈する制御行を編集フォームに
 * 一切出さないことで、ユーザーが説明文と誤認して書き換え・削除する事故を防ぐ。
 */
export function stripControlLines(rawBody: string): string {
  const prefixPattern = ALL_CONTROL_PREFIXES.join('|');
  const controlLineRegex = new RegExp(`^(${prefixPattern}):\\s*`, 'i');
  return rawBody
    .split('\n')
    .filter((line) => !controlLineRegex.test(line))
    .join('\n')
    .trim();
}

/** rawBody（編集前の issue.body）から指定プレフィックスの制御行を1行そのまま抽出する */
function extractControlLine(rawBody: string, prefix: string): string | undefined {
  const regex = new RegExp(`^${prefix}:\\s*.+$`, 'm');
  return rawBody.match(regex)?.[0];
}

/**
 * 表示用テキストに制御行を再付加して保存用 body を組み立てる。
 * due のみ dueValue（EditForm の日付入力の値）から再構築し、それ以外の制御行
 * （activate/before/depends_on/recur/project/estimate/actual/reviewed_at）は
 * 編集フォームに対応するUIが無いため rawBody から変更せずそのまま保持する。
 * 行の並び順は engine 側 buildBody() と揃えている
 * （due, activate, before, depends_on, recur, project, estimate, actual, reviewed_at, 空行, desc）。
 */
export function buildFinalBody(displayBody: string, rawBody: string, dueValue: string): string {
  const lines: string[] = [];
  if (dueValue) lines.push(`due: ${dueValue}`);
  for (const prefix of PRESERVED_CONTROL_PREFIXES) {
    const line = extractControlLine(rawBody, prefix);
    if (line) lines.push(line);
  }
  const userText = displayBody.trim();
  if (userText) lines.push(userText);
  return lines.join('\n');
}
