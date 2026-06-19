import { execFile } from 'node:child_process';

export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
}

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * Cienki adapter nad CLI Dockera. Cała komunikacja z daemonem przechodzi tędy,
 * dzięki czemu DockerPoller jest testowalny z fake'em (bez prawdziwego Dockera).
 */
export interface DockerClient {
  /** Czy `docker` jest na PATH i daemon odpowiada. */
  available(): Promise<boolean>;
  /** Lista działających kontenerów (`docker ps`). Rzuca, gdy polecenie zawiedzie. */
  ps(): Promise<ContainerInfo[]>;
  /** `docker exec <id> <argv...>`. Nigdy nie rzuca — kod wyjścia w ExecResult.code. */
  exec(id: string, argv: string[], opts?: { timeoutMs?: number }): Promise<ExecResult>;
}

/** Parsuje wyjście `docker ps --format '{{json .}}'` (jeden obiekt JSON na linię). */
export function parseDockerPs(stdout: string): ContainerInfo[] {
  const out: ContainerInfo[] = [];
  for (const raw of stdout.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    try {
      const obj = JSON.parse(line) as Record<string, unknown>;
      const id = String(obj.ID ?? '');
      if (!id) continue;
      // `Names` bywa listą rozdzieloną przecinkami — bierzemy pierwszą.
      const name = String(obj.Names ?? '').split(',')[0] || id;
      const image = String(obj.Image ?? '');
      out.push({ id, name, image });
    } catch {
      // pomiń nie-JSON
    }
  }
  return out;
}

const DEFAULT_TIMEOUT_MS = 5000;
const MAX_BUFFER = 16 * 1024 * 1024;

function run(argv: string[], timeoutMs: number): Promise<ExecResult> {
  return new Promise((resolve) => {
    execFile('docker', argv, { timeout: timeoutMs, maxBuffer: MAX_BUFFER, encoding: 'utf8' }, (err, stdout, stderr) => {
      // execFile zwraca err z .code (number) dla nie-zerowego exitu; 'ENOENT' (string)
      // gdy brak `docker` na PATH; null + killed=true przy timeoucie. Mapujemy na liczbę.
      const code = err && typeof (err as { code?: unknown }).code === 'number' ? (err as { code: number }).code : err ? 1 : 0;
      resolve({ code, stdout: stdout ?? '', stderr: stderr ?? '' });
    });
  });
}

export class CliDockerClient implements DockerClient {
  async available(): Promise<boolean> {
    const r = await run(['version', '--format', '{{.Server.Version}}'], DEFAULT_TIMEOUT_MS);
    return r.code === 0 && r.stdout.trim().length > 0;
  }

  async ps(): Promise<ContainerInfo[]> {
    const r = await run(['ps', '--format', '{{json .}}'], DEFAULT_TIMEOUT_MS);
    if (r.code !== 0) throw new Error(`docker ps failed (${r.code}): ${r.stderr.trim()}`);
    return parseDockerPs(r.stdout);
  }

  async exec(id: string, argv: string[], opts?: { timeoutMs?: number }): Promise<ExecResult> {
    return run(['exec', id, ...argv], opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  }
}
