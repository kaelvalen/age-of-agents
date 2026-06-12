import { basename } from 'node:path';
import type { Fact } from './facts.js';

/** Skraca tekst do dymków/panelu. */
function clip(text: string, max = 240): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Wyciąga krótki opis pracy z inputu narzędzia (do dymka nad jednostką). */
export function toolDetail(tool: string, input: Record<string, unknown> | undefined): string | undefined {
  if (!input) return undefined;
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  switch (tool) {
    case 'Bash':
      return str(input.description) ?? str(input.command)?.slice(0, 60);
    case 'Task':
    case 'Agent':
      return str(input.description);
    case 'WebSearch':
      return str(input.query);
    case 'WebFetch':
      return str(input.url);
    case 'Read':
    case 'Edit':
    case 'Write':
    case 'MultiEdit':
      return str(input.file_path) ? basename(input.file_path as string) : undefined;
    case 'Grep':
    case 'Glob':
      return str(input.pattern);
    default:
      return undefined;
  }
}

/**
 * Parsuje jedną linię JSONL transkryptu na listę Faktów.
 * Nieznane/uszkodzone rekordy → pusta lista (format zmienia się między
 * wersjami CLI, więc wszystko czytamy defensywnie).
 */
export function interpretLine(line: string): Fact[] {
  let record: any;
  try {
    record = JSON.parse(line);
  } catch {
    return [];
  }
  if (!record || typeof record !== 'object') return [];

  const ts: string = typeof record.timestamp === 'string' ? record.timestamp : new Date().toISOString();
  const facts: Fact[] = [];

  switch (record.type) {
    case 'queue-operation':
      if (record.operation === 'enqueue' && typeof record.content === 'string') {
        facts.push({ kind: 'prompt', text: clip(record.content), ts });
      }
      break;

    case 'custom-title':
      if (typeof record.customTitle === 'string') facts.push({ kind: 'title', title: record.customTitle });
      break;
    case 'ai-title':
      if (typeof record.aiTitle === 'string') facts.push({ kind: 'title', title: record.aiTitle });
      break;
    case 'last-prompt':
      if (typeof record.lastPrompt === 'string') facts.push({ kind: 'title', title: clip(record.lastPrompt, 80) });
      break;

    case 'permission-mode':
      if (typeof record.permissionMode === 'string') {
        facts.push({ kind: 'meta', permissionMode: record.permissionMode });
      }
      break;

    case 'assistant': {
      const message = record.message;
      if (!message || typeof message !== 'object') break;
      const messageId: string = typeof message.id === 'string' ? message.id : record.uuid ?? '';

      facts.push({
        kind: 'meta',
        model: typeof message.model === 'string' ? message.model : undefined,
        gitBranch: typeof record.gitBranch === 'string' ? record.gitBranch : undefined,
        cwd: typeof record.cwd === 'string' ? record.cwd : undefined,
      });

      const usage = message.usage;
      if (usage && typeof usage === 'object') {
        facts.push({
          kind: 'usage',
          messageId,
          input: Number(usage.input_tokens ?? 0) + Number(usage.cache_read_input_tokens ?? 0),
          output: Number(usage.output_tokens ?? 0),
        });
      }

      const blocks: any[] = Array.isArray(message.content) ? message.content : [];
      for (const block of blocks) {
        if (!block || typeof block !== 'object') continue;
        if (block.type === 'thinking') facts.push({ kind: 'thinking', ts });
        if (block.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
          facts.push({ kind: 'assistant-text', text: clip(block.text), ts });
        }
        if (block.type === 'tool_use' && typeof block.name === 'string') {
          facts.push({
            kind: 'tool-start',
            tool: block.name,
            detail: toolDetail(block.name, block.input),
            messageId,
            ts,
          });
        }
      }

      if (message.stop_reason === 'end_turn') facts.push({ kind: 'turn-end', ts });
      break;
    }

    case 'user': {
      const meta: Fact = {
        kind: 'meta',
        gitBranch: typeof record.gitBranch === 'string' ? record.gitBranch : undefined,
        permissionMode: typeof record.permissionMode === 'string' ? record.permissionMode : undefined,
        cwd: typeof record.cwd === 'string' ? record.cwd : undefined,
      };
      if (meta.gitBranch || meta.permissionMode || meta.cwd) facts.push(meta);

      const content = record.message?.content;
      if (typeof content === 'string') {
        if (content.trim()) facts.push({ kind: 'prompt', text: clip(content), ts });
      } else if (Array.isArray(content)) {
        for (const block of content) {
          if (block?.type === 'tool_result') {
            facts.push({ kind: 'tool-result', isError: block.is_error === true, ts });
          }
          if (block?.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
            facts.push({ kind: 'prompt', text: clip(block.text), ts });
          }
        }
      }
      break;
    }

    default:
      break;
  }

  return facts;
}
