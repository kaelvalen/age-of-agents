import { homedir } from 'node:os';
import { basename, join, sep } from 'node:path';
import { interpretLine } from '../transcript/parser.js';
import type { AgentSource, ClassifiedFile } from './types.js';

/**
 * Źródło Claude Code: ~/.claude/projects/<projekt>/<uuid>.jsonl (bohaterowie)
 * i <sesja>/subagents/**​/agent-<id>.jsonl (peony).
 */
export const claudeSource: AgentSource = {
  id: 'claude',
  roots: () => [join(homedir(), '.claude', 'projects')],
  depth: 6,
  classify(path: string, root: string): ClassifiedFile {
    const rel = path.slice(root.length + 1);
    const parts = rel.split(sep);
    const file = basename(path, '.jsonl');
    if (parts.length === 2) {
      return { kind: 'session', sessionId: file, projectDir: parts[0] };
    }
    if (parts.includes('subagents') && basename(path).startsWith('agent-')) {
      return { kind: 'subagent', agentId: file.replace(/^agent-/, ''), parentSessionId: parts[1] };
    }
    return { kind: 'other' };
  },
  parseLine: interpretLine,
};
