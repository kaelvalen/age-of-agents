import { randomUUID } from 'node:crypto';
import { isSafeTool, type PendingQuestion } from '@agent-citadel/shared';
import type { PendingRegistry } from '../pending-registry.js';
import { parseAskUserQuestion } from '../hook-decide.js';

/** Minimal subset of the SDK PermissionResult we produce. */
export type PermissionResult =
  | { behavior: 'allow'; updatedInput?: Record<string, unknown> }
  | { behavior: 'deny'; message: string; interrupt?: boolean };

export type CallToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };

/** Builds a `canUseTool` for one session that routes decisions through the panel. */
export function makeCanUseTool(sessionId: string, registry: PendingRegistry, timeoutMs: number) {
  return async (toolName: string, input: Record<string, unknown>, _opts: unknown): Promise<PermissionResult> => {
    if (isSafeTool(toolName)) return { behavior: 'allow' };
    const isPlan = toolName === 'ExitPlanMode';
    const question: PendingQuestion = {
      id: randomUUID(),
      sessionId,
      source: 'sdk',
      kind: isPlan ? 'plan-approval' : 'tool-permission',
      tool: toolName,
      detail: detailOf(toolName, input),
      createdAt: new Date().toISOString(),
    };
    const decision = await registry.ask(question, timeoutMs);
    if (!decision) return { behavior: 'deny', message: 'No answer from panel' };
    switch (decision.type) {
      case 'allow': return { behavior: 'allow' };
      case 'approve-plan': return { behavior: 'allow' };
      case 'deny': return { behavior: 'deny', message: decision.reason ?? 'Denied in panel' };
      case 'reject-plan': return { behavior: 'deny', message: decision.reason ?? 'Plan rejected in panel' };
      default: return { behavior: 'deny', message: 'Unsupported decision' };
    }
  };
}

/** Builds the AskUserQuestion MCP tool handler for one session. */
export function makeAskQuestionHandler(sessionId: string, registry: PendingRegistry, timeoutMs: number) {
  return async (args: Record<string, unknown>, _meta: unknown): Promise<CallToolResult> => {
    const { question: questionText, options } = parseAskUserQuestion(args);
    const question: PendingQuestion = {
      id: randomUUID(),
      sessionId,
      source: 'sdk',
      kind: 'ask-user-question',
      tool: 'AskUserQuestion',
      detail: questionText,
      options,
      createdAt: new Date().toISOString(),
    };
    const decision = await registry.ask(question, timeoutMs);
    if (decision?.type === 'select') {
      return { content: [{ type: 'text', text: JSON.stringify({ selected: decision.optionLabels }) }] };
    }
    return { content: [{ type: 'text', text: 'No answer provided by the user.' }], isError: true };
  };
}

/** Tiny detail extractor for permission cards. */
function detailOf(tool: string, input: Record<string, unknown>): string | undefined {
  const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  if (tool === 'Bash') return s(input.command);
  if (tool === 'Edit' || tool === 'Write' || tool === 'Read') return s(input.file_path);
  if (tool === 'WebFetch') return s(input.url);
  return undefined;
}
