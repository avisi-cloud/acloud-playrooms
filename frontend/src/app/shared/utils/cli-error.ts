/**
 * Turning whatever a failed call handed back into something worth reading. The
 * full text is never lost — it is all in the activity log.
 */

/** The most of the problem, and of the remedy, that a toast will carry. */
const MAX_PROBLEM_LENGTH = 160;
const MAX_REMEDY_LENGTH = 200;

/**
 * A failed command, in the two parts acloud's own messages are written in: what
 * went wrong, then any remedy after a semicolon or on the lines below.
 */
export interface FailureExplanation {
  /** Why it failed, as the CLI put it. */
  problem: string;
  /** What to do about it, or empty when the message did not say. */
  remedy: string;
}

/** What a command failed on, split into the problem and the way out of it. */
export function explainFailure(value: unknown): FailureExplanation {
  const lines = meaningfulLines(cliErrorText(value));
  if (lines.length === 0) return { problem: FAILED_WITHOUT_SAYING_WHY, remedy: '' };

  const [failure, ...continuation] = lines;
  // The first "; " only: later clauses belong to the remedy.
  const clause = failure.indexOf('; ');
  const problem = clause === -1 ? failure : failure.slice(0, clause);
  const remedy = [clause === -1 ? '' : failure.slice(clause + 2), ...continuation]
    .filter(Boolean)
    .join(' ');

  return {
    problem: truncate(asSentence(problem), MAX_PROBLEM_LENGTH),
    remedy: truncate(asSentence(remedy), MAX_REMEDY_LENGTH),
  };
}

/**
 * The same failure as one line, for a caption or an inline error state where
 * there is nowhere to put a second one.
 */
export function describeError(value: unknown): string {
  const { problem } = explainFailure(value);
  return problem;
}

const FAILED_WITHOUT_SAYING_WHY = 'The command failed. Open Activity for the output.';

/**
 * The message inside whatever was thrown, with a JS error prefix, binding JSON
 * or HTML error page taken off.
 */
function cliErrorText(value: unknown): string {
  const text = withoutThrownErrorPrefix(rawText(value));

  // A JSON-shaped CLI error has no newlines, so the line-based reading below
  // would treat the whole blob — `cause` and all — as the failure.
  const json = messageInsideJson(text);
  if (json) return json;

  return withoutMarkup(text);
}

function rawText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.message;
  // `String()` on the plain object a rejected binding hands back is useless.
  if (value && typeof value === 'object') {
    const message = (value as { message?: unknown }).message;
    if (typeof message === 'string') return message;
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

/**
 * Drops the class name JavaScript puts in front of a thrown error, which is
 * what hides the CLI's JSON from the parse below.
 */
function withoutThrownErrorPrefix(text: string): string {
  return text.replace(/^\s*(?:[A-Za-z]*Error):\s*/, '');
}

/**
 * Pulls the `message` out of a JSON-shaped CLI error, falling back to
 * `cause.message`. Null for anything else, so the caller cleans up instead.
 */
function messageInsideJson(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(trimmed) as { message?: unknown; cause?: { message?: unknown } };
    if (typeof parsed.message === 'string' && parsed.message.trim()) return parsed.message.trim();
    if (typeof parsed.cause?.message === 'string' && parsed.cause.message.trim())
      return parsed.cause.message.trim();
    return null;
  } catch {
    return null;
  }
}

/** An HTML error page reduced to whatever its `<pre>` or `<title>` said. */
function withoutMarkup(text: string): string {
  const pre = /<pre[^>]*>([\s\S]*?)<\/pre>/i.exec(text);
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(text);
  let stripped = text;
  if (pre) stripped = pre[1];
  else if (title && /<html/i.test(text)) stripped = title[1];

  return stripped
    .replace(/<[^>]+>/g, ' ') // any remaining markup
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/** The message as lines with something on them, each one collapsed to a line. */
function meaningfulLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0);
}

/**
 * Starts the sentence with a capital, but only a plain opening word: `--force`
 * must not become `--Force`.
 */
function asSentence(text: string): string {
  return /^[a-z]+ /.test(text) ? text[0].toUpperCase() + text.slice(1) : text;
}

function truncate(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text;
}
