/** body から制御行（due: / project:）を除いた表示用テキストを返す */
export function stripControlLines(rawBody: string): string {
  return rawBody
    .split('\n')
    .filter((line) => !/^(due|project):\s*/i.test(line))
    .join('\n')
    .trim();
}

/** 表示用テキストに制御行を再付加して保存用 body を組み立てる */
export function buildFinalBody(displayBody: string, rawBody: string, dueValue: string): string {
  const lines: string[] = [];
  const projectLine = rawBody.match(/^project:\s*.+$/m)?.[0];
  if (projectLine) lines.push(projectLine);
  if (dueValue) lines.push(`due: ${dueValue}`);
  const userText = displayBody.trim();
  if (userText) lines.push(userText);
  return lines.join('\n');
}
