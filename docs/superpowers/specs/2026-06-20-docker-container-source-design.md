# Źródło Docker — ingestia sesji agentów z kontenerów

**Data:** 2026-06-20
**Status:** zaakceptowany projekt, gotowy do planu implementacji

## Problem

AgentCraft pozyskuje dane o sesjach Claude Code (i innych CLI) **czytając pliki
z dysku hosta** (`~/.claude/projects/**/*.jsonl` itd.). Coraz więcej użytkowników
uruchamia swoich agentów **w kontenerach Docker**. Pliki sesji takich agentów żyją
wewnątrz filesystemu kontenera (na macOS dodatkowo wewnątrz VM Dockera) i są
**niewidoczne** dla obecnej metodologii. Te sesje w ogóle nie pojawiają się
w wizualizacji.

## Cel (MVP)

Wizualizować sesje agentów działających w **lokalnych kontenerach Docker na tym
samym hoście** (zwykły `docker run` oraz devcontainery), bez wymuszania zmian
w obrazach ani konfiguracji użytkownika. Kontenerowi bohaterowie pojawiają się
obok hostowych, z wyraźną odznaką kontenera.

### Poza zakresem MVP (świadome odłożenie)

- Kontenery zdalne / cloud / CI / Kubernetes (brak lokalnego daemona).
- Inne runtime'y (podman, nerdctl, Apple Containers).
- Inne CLI w kontenerze niż Claude (codex/koda/opencode) — architektura to dopuści,
  ale MVP celuje w Claude.
- Szybka ścieżka dla bind-mountów `~/.claude` (czytanie wprost ze ścieżki hosta).
- Osobna „dzielnica kontenerów" jako teren na mapie.
- Push (wstrzykiwanie hooków do kontenera) — odrzucone, bo sprzeczne z zero-config.

## Założenia środowiskowe (zweryfikowane)

- `docker` CLI na PATH (u autora 29.3.1), daemon działa, socket w `$HOME`
  (Docker Desktop / macOS) — serwer AgentCraft jako zwykły user ma dostęp bez root-a.
- macOS uruchamia kontenery w lekkiej VM → **nie da się** czytać warstwy overlay
  kontenera ze ścieżki hosta. Dlatego odczyt musi iść przez `docker exec`/`docker cp`,
  a nie przez chokidar na ścieżce hosta.

## Wybrane podejście

**Pull przez `docker exec` z pollingiem.** Serwer cyklicznie listuje kontenery,
sonduje nowe o obecność `~/.claude/projects`, a dla plików sesji trzyma offset
bajtowy i doczytuje przyrost przez `docker exec ... tail -c +N`. Surowe linie JSONL
są **identyczne** z formatem Claude na hoście, więc przepuszczamy je przez istniejący
parser Claude bez zmian.

Wzorzec już istnieje w repo: `docker-poller` modelujemy na
`packages/server/src/sources/opencode-poller.ts` (poll + offset per-sesja +
`tracker.apply`), a **nie** na chokidarowym interfejsie `AgentSource` (ten zakłada
`roots()` = ścieżki hosta, co dla Dockera nie ma sensu).

### Rozważone alternatywy

- **Push (wstrzyknięcie hooków)** — real-time, ale inwazyjne (modyfikacja
  `settings.json`/obrazu, restart kontenerów, sieć), sprzeczne z wyborem zero-config.
- **Hybryda z odczytem bind-mountów ze ścieżki hosta** — niższa latencja dla
  devcontainerów dzielących config, ale dodatkowa złożoność i ryzyko duplikatów;
  ewentualny późniejszy optymalizator, nie MVP.

## Architektura i komponenty

### Nowe pliki (serwer)

- `packages/server/src/sources/docker-client.ts` — cienka abstrakcja nad CLI Dockera.
  **Kluczowy szew testowalności**: cała komunikacja z daemonem za jednym interfejsem.
  ```ts
  export interface DockerClient {
    available(): Promise<boolean>;                 // `docker` na PATH i daemon żyje
    ps(): Promise<ContainerInfo[]>;                // docker ps --format '{{json .}}'
    exec(id: string, argv: string[], opts?: { timeoutMs?: number }): Promise<ExecResult>;
  }
  // CliDockerClient (child_process) — produkcja
  // FakeDockerClient — testy
  ```
  Wybór CLI (a nie `dockerode`): zero nowych zależności, automatyczne uszanowanie
  `DOCKER_HOST`/kontekstu Dockera, zgodność z pragmatyzmem serwera. Abstrakcja
  zostawia furtkę na `dockerode` (streaming), gdyby polling okazał się za wolny.

- `packages/server/src/sources/docker-poller.ts` — `DockerPoller`: pętla pollingu,
  discovery, sonda, tail, mapowanie linii na fakty → `tracker.apply(...)`.

- `packages/server/src/sources/docker-tail.ts` — rejestr offsetów per
  `(containerId, file)`, oparty na logice `packages/server/src/transcript/tail.ts`
  (doczytywanie nowych bajtów, buforowanie niepełnej linii, guard na duże pliki).

### Reuse bez zmian

Parser Claude (`packages/server/src/transcript/parser.ts`), state-machine, world,
transport WebSocket. Docker to **nowy transport** (discovery + odczyt), nie nowe
parsowanie.

### Wpięcie

W `packages/server/src/server.ts`, obok `SOURCES.map(... new SourceWatcher)`:
`new DockerPoller(world, new CliDockerClient()).start()` — symetrycznie do startu
pollera OpenCode.

## Pętla pollingu, discovery i odczyt

Co ~2 s (OpenCode używa 1 s, ale `exec` jest cięższy):

1. `docker ps` → lista działających kontenerów.
2. **Diff względem znanych:**
   - Nowy kontener → **sonda raz na ID** (wynik cache'owany):
     `docker exec <id> sh -c 'ls -1 ~/.claude/projects/*/*.jsonl 2>/dev/null'`.
     Pusto/błąd → oznacz „nie-agentowy", **nigdy nie sonduj ponownie** (ID stałe
     przez życie kontenera). Koszt sondowania = O(nowe kontenery), nie O(wszystkie × tick).
   - Kontener zniknął → patrz „Cykl życia".
3. Dla kontenerów agentowych: jeden `exec` zwraca rozmiary plików sesji; pliki,
   które urosły → doczytaj.

**Odczyt przyrostu (tail):** per `(containerId, file)` trzymamy offset. Nowe bajty:
`docker exec <id> sh -c 'tail -c +<offset+1> "<file>"'`; stdout dzielimy na kompletne
linie, niepełną buforujemy do następnego ticku. Każdy `exec` owinięty timeoutem
(np. 5 s, kill na timeout), by zawieszony kontener nie blokował pętli.

**Guard na historię:** plik > 2 MB przy pierwszym ujrzeniu → start od końca
(jak `registerAtEnd` na hoście), bez odgrywania całej historii.

**Fallback:** obrazy bez `sh`/`tail` → log ostrzeżenia raz, kontener „nieczytelny",
pomijamy. (`docker cp` jako cięższy plan B — poza MVP.)

## Tożsamość, cwd i deduplikacja

- **`agent`** pozostaje `'claude'`. „Kontenerowość" to wymiar ortogonalny,
  **nie** nowy `AgentKind`.
- **Nowe pole w `HeroSnapshot`** (`packages/shared/src/index.ts`):
  ```ts
  container?: { id: string; name: string; image: string };
  ```
- **`sessionId`** (klucz bohatera): `docker:<shortId>:<uuid>` — prefiks zapobiega
  kolizjom między kontenerami. Surowy `<uuid>` zachowujemy do dedup.
- **`workingDir`**: parsowany z transkryptu (cwd wewnątrz kontenera, np. `/workspace/app`).
- **`projectDir`**: syntetyczny `docker://<containerName>` + podfolder projektu.
- **`projectName`**: `basename(workingDir)` — bez zmian.
- **Deduplikacja (twardy wymóg):** przed zrodzeniem kontenerowego bohatera
  sprawdzamy, czy *surowy* UUID jest już śledzony przez hostowe źródło Claude
  (przypadek współdzielonego bind-mountu `~/.claude`). Jeśli tak → **host wygrywa**,
  kontener pomijamy. Zapobiega podwójnym bohaterom.
  > Punkt wkładu użytkownika (tryb nauki): dokładna reguła „kto wygrywa" i sposób
  > wykrycia współdzielonego configu.
- **Filtr projektu:** kontenerowi bohaterowie mają cwd „gdzie indziej", więc hostowy
  filtr projektu by ich ukrył. MVP: **zwolnieni z filtra**, zawsze widoczni
  (z odznaką). Globalny przełącznik „pokaż kontenery" → follow-up.

> Punkt wkładu użytkownika (tryb nauki): klasyfikacja sondy — co liczy się jako
> „kontener agentowy" (sam katalog `~/.claude`, czy też żywy proces `claude`?).

## Cykl życia i obsługa błędów

- **Kontener znika z `docker ps`** (stop/rm) → bohaterowie przechodzą w stan końcowy;
  sweep usuwa po `removeAfterMs` (reuse cyklu state-machine).
- **Koniec tury w kontenerze** (`turn-end`) → `idle`, identycznie jak host.
- **`docker` niedostępny / daemon padł** → poller loguje **raz** i jest bezczynny
  (żadnego crasha); ponawia sprawdzenie co N sekund.
- **`exec` pada dla kontenera** → „nieczytelny", log raz, pomiń; jeden zły kontener
  nigdy nie wywraca pętli (odporność jak w opencode-pollerze).
- **Bezpiecznik:** env `AGENTCRAFT_DOCKER=0` całkowicie wyłącza poller.

## Wizualizacja (klient)

Reuse trwającej pracy nad emblematami: odznaka kontenera (glif „statek/skrzynia")
na sprite'cie / w `packages/client/src/hud/SidePanel.tsx`, sterowana `hero.container`;
nazwa kontenera + obraz w panelu szczegółów. „Dzielnica kontenerów" → follow-up.

## Testy (vitest, jak istniejące `packages/*/tests/*.test.ts`)

- Parsowanie `docker ps --format json` → lista kontenerów.
- Offsety/tail: poprzedni offset + nowe bajty → kompletne linie + bufor reszty;
  truncation/rotacja pliku.
- Dedup: UUID znany hostowi → pominięcie.
- Klasyfikacja sondy: wyjście `ls` → `isAgentContainer`.
- Guard dużego pliku: > 2 MB → start od końca.
- Wszystko na **`FakeDockerClient`** — bez prawdziwego Dockera w CI.

## Konfiguracja

MVP zero-config (poll interval i `enabled=true` domyślnie). Jedyne pokrętło:
env `AGENTCRAFT_DOCKER=0` (bezpiecznik). Konfigurowalny interwał i przełącznik
„pokaż kontenery" w panelu ustawień → follow-up (spójnie z `mapping-config` /
`model-config` w `~/.age-of-agents/`).

## Zmiany w istniejących plikach

| Plik | Zmiana |
|------|--------|
| `packages/shared/src/index.ts` | dodać `container?: {...}` do `HeroSnapshot` |
| `packages/server/src/server.ts` | wystartować `DockerPoller` obok watcherów |
| `packages/client/src/hud/SidePanel.tsx` | odznaka + nazwa/obraz kontenera |
| (emblematy providerów) | reuse glifu odznaki kontenera |

## Ryzyka

- **Koszt `exec`** przy wielu kontenerach — mitygacja: sonda raz na ID, cache
  negatywów, jeden `exec` na rozmiary na tick, timeouty.
- **Minimalne obrazy** bez `sh`/`tail` — degradacja: „nieczytelny", log, pomiń.
- **Podwójni bohaterowie** przy współdzielonym `~/.claude` — mitygacja: dedup po UUID.
- **Latencja pollingu** vs hostowy chokidar — akceptowalna w MVP; `dockerode`/stream
  jako ścieżka rozwoju.
