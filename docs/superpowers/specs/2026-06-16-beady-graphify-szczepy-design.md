# Beady i Graphify jako „szczepy" (add-ony) — notatka decyzyjna

Data: 2026-06-16 · Status: **odłożone** (kierunek wybrany, implementacja czeka)

## Kontekst
Panel intel („Salon Architekta") pokazuje dziś dwa źródła per miasto:
- **beady** — issue tracker `bd` (`.beads`): zlecenia open/blocked/closed + zależności,
- **graphify** — graf zależności kodu (`graphify-out/graph.json`): nodes/edges/communities/god-nodes.

Właściciel produktu wątpi w ich miejsce w grze: *„beady nie są popularne, kto będzie korzystał"*,
*„grafy ciekawe, ale czy konieczne? czy to nasz lor?"*. Równolegle (poza tym repo lokalnie) ma
powstawać **World Tree** = uniwersalny hub dodatków/pluginów (MCP, skille, integracje).

## Decyzja: kierunek B — „Bazar szczepów"
Beady i graphify **nie** mają być osobnym, na stałe wpiętym panelem. Mają być **opcjonalnymi
add-onami („szczepami")** instalowanymi w hubie World Tree, obok MCP/skilli. Mniej fabuły,
więcej modelu „instaluj / odinstaluj". Klucz adopcji: **opt-in bez śmiecenia** — szczep pokazuje
się tylko gdy jego źródło istnieje w projekcie (`.beads` → beady, `graph.json` → graphify);
brak źródła → hub po prostu go nie pokazuje. Nikt nie płaci UI/klimatem za funkcję, której nie używa.

## Szkic kontraktu „szczepu" (hub-agnostyczny)
Żeby nie zależeć od jednego agenta od World Tree, add-on powinien być samoopisem:
- `id`, `name`, `icon` — tożsamość w markecie,
- `detect(projectDir): boolean` — czy źródło istnieje (np. `.beads/`),
- `read(projectDir): Promise<Payload>` — pobranie danych (już mamy: `readBeads`, `readGraphify`),
- `panel: ReactComponent<Payload>` — widok soczewki (już mamy: `BeadsView`, `GraphifyView`),
- `installed: boolean` — stan w markecie (persist w `~/.agentcraft`/settings).

Beady i graphify to **dwa pierwsze szczepy** spełniające ten kontrakt — istniejący kod
(`project-intel-poller`, `ArchitectHall`) jest ~90% gotowy do przepięcia.

## Zależność i dlaczego odłożone
- **Hub World Tree nie istnieje lokalnie** (sprawdzone: 7 worktree'ów `claude/*` jest stałych —
  0 ahead, czyste; nic o World Tree/plugin w commitach). Bez hubu nie ma gdzie „zainstalować" szczepu,
  a `bo7` (beady bez aktywnego bohatera) nie ma gdzie się wyrenderować.
- **Wartość niepewna** — właściciel wprost kwestionuje sens beadów/graphify w grze.

## Kiedy wznawiamy
Wznowić, gdy spełnione OBA:
1. potwierdzenie, że chcemy beady/graphify w grze (a nie wyciąć), oraz
2. istnieje hub World Tree z realnym API marketu (albo decyzja, że to my definiujemy kontrakt powyżej).

Powiązane issues: `AgeOfAgents-bo7` (beady bez bohatera), `AgeOfAgents-ve4` (skrypt+docs graphify) — odłożone.
