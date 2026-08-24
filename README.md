# Fleet Report — MCP App

Et eksempel på en MCP App: en MCP-server med ett verktøy (`get-fleet-report`)
som leser en Excel-fil med enkel AI-generert flåte-data og viser resultatet som et interaktivt
dashboard direkte i Claude (Desktop/web), via en `ui://`-ressurs.

Laget med Anthropics `mcp-apps`-plugin, etter oppskriften i den offisielle
"Build an MCP App"-guiden: https://modelcontextprotocol.io/extensions/apps/build.
Kommandoene og strukturen under følger den guiden så langt det lar seg gjøre —
avvik er markert eksplisitt med begrunnelse.

## Innhold

- [Hvordan appen fungerer](#hvordan-appen-fungerer)
- [Installere pluginen (via marketplace)](#installere-pluginen-via-marketplace)
- [Teste MCP-serveren lokalt](#teste-mcp-serveren-lokalt)
  - [Alternativ 1 — Claude Desktop, lokal stdio](#alternativ-1--teste-mcp-appen-i-claude-desktop-lokal-stdio)
  - [Alternativ 2 — nettleser (basic-host)](#alternativ-2--teste-mcp-appen-i-nettleseren)
  - [Alternativ 3 — Testing with Claude, via tunnel](#alternativ-3--testing-with-claude-custom-connector-via-tunnel)
- [Utfordringer under testing](#utfordringer-under-testing)
- [Begrensninger og muligheter](#begrensninger-og-muligheter)
- [Lenker](#lenker)

## Hvordan appen fungerer (for de som er nyskjerrige)

**Server** (`fleet-report-app/`):
- `main.ts` starter MCP-serveren, enten via stdio (brukes av Claude Desktop)
  eller streamable HTTP (`createServer()` i `server.ts`).
- `server.ts` registrerer ett verktøy (`get-fleet-report`) og en UI-ressurs
  (`ui://fleet-report/mcp-app.html`), koblet sammen via `_meta.ui.resourceUri`.
- `fleet-data.ts` leser `data/fleet_utilization.xlsx` med `exceljs`, mapper
  radene til `BoatRow[]`, og `analyzeFleet()` regner ut nøkkeltall (totalt
  antall båter/timer, fordeling på status/type, båter som trenger
  oppmerksomhet — lavt drivstoff, lenge inaktiv, i vedlikehold) samt en
  tekstlig oppsummering.
- Verktøyet returnerer både `content` (kort tekstoppsummering, til modellen)
  og `structuredContent` (hele analyseobjektet, til UI-en).

**UI** (`src/mcp-app.ts`, `src/charts.ts`, `mcp-app.html`):
- Bygges med Vite (`vite-plugin-singlefile`) til en selvstendig fil,
  `dist/mcp-app.html`, som er det som faktisk serveres som UI-ressursen.
- Bruker `App`-klassen fra `@modelcontextprotocol/ext-apps`: kobler til hosten,
  lytter på `ontoolresult` for å motta `structuredContent`, og tegner
  stat-tiles, søylediagrammer (egenbygget, ingen chart-bibliotek) og en
  oppmerksomhets-liste.
- Håndterer tema/fonter/safe-area fra hosten via `onhostcontextchanged`.

> **Flyt (Veldig greit å ha kjennskap til):** bruker ber om rapport -> Claude
> kaller `get-fleet-report` -> serveren leser Excel-filen -> regner ut
> analyse -> serveren svarer med `content` + `structuredContent` -> Claude
> mottar svaret (dette er responsen modellen faktisk ser) -> siden verktøyet
> har en `_meta.ui.resourceUri`, henter hosten UI-ressursen og tegner
> dashboardet (iframe) med samme `structuredContent`.

## Installere pluginen (via marketplace)

`mcp-apps`-pluginen (fra `modelcontextprotocol/ext-apps` på GitHub) gir
skills for å lage/utvide MCP Apps, bl.a.
[`mcp-apps:create-mcp-app`](https://apps.extensions.modelcontextprotocol.io/api/),
som ble brukt til å lage dette prosjektet.

I Claude Code:

```
/plugin marketplace add modelcontextprotocol/ext-apps
/plugin install mcp-apps@mcp-apps
```

Eller via `/plugin`-menyen i Claude Code (Browse marketplaces ->
`modelcontextprotocol/ext-apps` -> installer `mcp-apps`).

Etter dette kan man i en Claude Code-chat be om f.eks.
`Create an MCP App that displays ...` for å lage et nytt prosjekt med
samme oppsett som dette (`server.ts`, `mcp-app.html`, `src/mcp-app.ts`,
`package.json`, `vite.config.ts` osv.).

## Teste MCP-serveren lokalt

Alle stier under er **relative til repo-roten**.

### Forutsetninger

- Node.js 20 eller nyere, med npm (sjekk med `node -v` og `npm -v`)
- git

Du trenger *ikke* installere `bun` selv — `basic-host` (Alternativ 2, steg
3-7) har `bun` som en vanlig npm-avhengighet og installerer sin egen lokale
kopi automatisk i steg 4. Ikke bruk `--ignore-scripts` på noen `npm install`
her — det hopper over nettopp denne installasjonen og gir en `bun`-feil
senere.

### Alternativ 1 — teste MCP-appen i Claude Desktop (lokal stdio)

Brukes når du vil teste appen faktisk inne i Claude, ikke bare
MCP-serveren isolert i nettleseren. Krever ingen tunnel og ingen manuelt
startet server (Claude Desktop starter serveren selv som subprosess). En
omstart av Claude Desktop kan være nødvendig for at endringen skal tre i
kraft.

1. Fra repo-roten, installer og bygg fleet-serveren:
   ```bash
   cd fleet-report-app
   npm install
   npm run build   # bygger dist/mcp-app.html
   ```
2. Finn full sti til `fleet-report-app`-mappen (trengs i steg 3, siden
   Claude Desktop-konfigurasjonen krever en absolutt sti):
   ```bash
   pwd
   ```
3. Rediger `claude_desktop_config.json` (Settings -> Developer -> Edit
   Config i appen), og legg til under `mcpServers` — bytt ut
   `/sti/til/fleet-report-app` med stien fra steg 2:
   ```json
   "mcpServers": {
     "fleet-report": {
       "command": "wsl.exe",
       "args": [
         "-e", "bash", "-lc",
         "cd /sti/til/fleet-report-app && npx tsx main.ts --stdio"
       ]
     }
   }
   ```
   (`wsl.exe` brukes fordi Claude Desktop kjører på Windows mens prosjektet
   ligger i WSL. Kjører du alt på ren Linux/macOS, dropp `command`/`args`
   for `wsl.exe` og bruk `"command": "npx", "args": ["tsx", "main.ts", "--stdio"]`
   med `"cwd": "/sti/til/fleet-report-app"` i stedet.)
4. Start Claude Desktop helt på nytt (ikke bare lukk vinduet) etter
   endringen.

### Alternativ 2 — teste MCP-appen i nettleseren

Tilsvarer "Testing with the basic-host" i den offisielle guiden. `ext-apps`-
repoet inneholder en ferdig test-host (`basic-host`) for lokal utvikling i
nettleseren, uten at Claude er involvert i det hele tatt.

To prosesser må kjøre samtidig i to separate terminaler: fleet-serveren
(steg 1-2) og `basic-host` sitt nettgrensesnitt (steg 3-7). `basic-host` har
ingenting å koble seg til uten at fleet-serveren allerede kjører, så
rekkefølgen under må følges.

**Terminal 1 — fleet-serveren**

1. Fra repo-roten, installer og bygg fleet-serveren:
   ```bash
   cd fleet-report-app
   npm install
   npm run build   # bygger dist/mcp-app.html
   ```
2. Start serveren (la denne terminalen stå åpen):
   ```bash
   npm run serve
   ```
   Du skal se `MCP server listening on http://localhost:3002/mcp`.

**Terminal 2 — basic-host (test-klienten)**

3. Fra repo-roten, klon `basic-host`-testverktøyet fra
   `modelcontextprotocol/ext-apps` inn i `tmp/`:
   ```bash
   mkdir -p tmp
   git clone https://github.com/modelcontextprotocol/ext-apps.git tmp/mcp-ext-apps
   ```
4. Installer avhengigheter for hele `ext-apps`-repoet (dette steget
   installerer også `bun` lokalt, som `basic-host` trenger i steg 6 — du
   trenger ikke installere `bun` selv):
   ```bash
   cd tmp/mcp-ext-apps
   npm install
   ```
5. Installer avhengigheter spesifikt for `basic-host`:
   ```bash
   cd examples/basic-host
   npm install
   ```
6. Start `basic-host`, pekt mot fleet-serveren fra terminal 1 (samme
   `SERVERS`-variabel som guiden bruker):
   ```bash
   SERVERS='["http://localhost:3002/mcp"]' npm start
   ```
   Du skal se `Host server:    http://localhost:8080` og
   `Sandbox server: http://localhost:8081`.
7. Åpne `http://localhost:8080` i nettleseren. Du får et enkelt
   grensesnitt hvor du kan velge `get-fleet-report` og kalle det —
   hosten henter UI-ressursen og tegner den i en sandkasse-iframe.

For å stoppe: `Ctrl+C` i begge terminalene. Neste gang trenger du kun steg 2
og 6 (installasjonen står igjen i `fleet-report-app/node_modules` og
`tmp/mcp-ext-apps/`).

### Alternativ 3 — Testing with Claude (custom connector, via tunnel)

Tilsvarer "Testing with Claude" i den offisielle guiden. Brukes når appen
faktisk skal testes inne i Claude web/desktop som en custom connector — ikke
bare MCP-serveren isolert. Claude krever en offentlig HTTPS-URL, `localhost`
fungerer ikke direkte, så lokal utvikling må eksponeres via en tunnel. Guiden
foreslår `cloudflared`.

**Ikke anbefalt, ut fra faktisk testing:** dette ble testet på tre
forskjellige nett — jobbnettverk, mobilnett og eget hjemmenettverk — og
fungerte ikke ut av boksen på noen av dem. Samme feil dukket opp på alle
tre: `npx cloudflared tunnel` feiler med
`tls: failed to verify certificate: x509: certificate signed by unknown authority`.
Derfor brukes Alternativ 1 (lokal stdio) i stedet. Listet opp
likevel, i tilfelle det fungerer på ditt nett eller man skulle ha lyst til å teste selv.

1. Fra repo-roten, installer og bygg fleet-serveren (samme som steg 1-2 i
   Alternativ 2, om ikke allerede gjort):
   ```bash
   cd fleet-report-app
   npm install
   npm run build   # bygger dist/mcp-app.html
   ```
2. Start serveren (la denne terminalen stå åpen):
   ```bash
   npm run serve
   ```
   Du skal se `MCP server listening on http://localhost:3002/mcp`.
3. I en ny terminal, start tunnelen mot fleet-serveren:
   ```bash
   npx cloudflared tunnel --url http://localhost:3002
   ```
4. Kopier HTTPS-URL-en `cloudflared` skriver ut (f.eks.
   `https://tilfeldig-navn.trycloudflare.com`), og legg den til som en
   [custom connector](https://support.anthropic.com/en/articles/11175166-getting-started-with-custom-connectors-using-remote-mcp)
   i Claude — klikk på profilen din, gå til **Settings**, **Connectors**,
   og **Add custom connector**. Bruk `<tunnel-url>/mcp` som connector-URL.

   Custom connectors krever en betalt Claude-plan (Pro, Max eller Team).

## Utfordringer under testing

Dette er ikke en bug i MCP Apps som konsept — det er noe som faktisk oppstod
etter at `mcp-apps`-pluginen hadde generert prosjektet, og som måtte fikses
manuelt for at denne konkrete appen skulle fungere. Ingen garanti for at det
dukker opp igjen i en ny MCP App. Tas med fordi det er verdt å være
oppmerksom på denne typen problemer.

**`outputSchema` ga feil i Claude Desktop:** da `registerAppTool` i
`server.ts` deklarerte `outputSchema: z.object({...})`, feilet Claude
Desktop med *"declares an output schema in an unsupported JSON Schema
dialect (draft-07 instead of 2020-12)"*. Årsak: en bug i
zod-v4->JSON Schema-kompatibilitetslaget i `@modelcontextprotocol/sdk`, som
bruker draft-07 som standard. Løsning: `outputSchema` er valgfritt — dette
prosjektet bruker kun `structuredContent` i verktøysvaret, som fungerer
uavhengig av deklarert skjema.

## Begrensninger og muligheter

### Begrensninger

#### Rapporten er deterministisk, ikke modell-generert

UI-en er en ferdigbygget HTML/JS-bundle. Modellen bestemmer kun *om* og
*når* verktøyet kalles — ingen innflytelse på layout, farger eller
diagramvalg. Samme `structuredContent` inn gir alltid identisk dashboard ut.
Selv oppsummeringsteksten (`content`) genereres av serverkoden, ikke av
modellen.

#### Datavariasjon er OK, skjemavariasjon er skjør

Antall båter, timer, navn osv. kan variere fritt — det er det pipelinen er
bygget for. Derimot:

- Faste kategorilister (`STATUS_ORDER`, `TYPE_ORDER` i `fleet-data.ts`)
  filtrerer bort ukjente verdier stille. En ny status som f.eks.
  `"Decommissioned"` telles med i totalen, men forsvinner sporløst fra
  status-/type-fordelingen.
- Ingen kjøretids-validering av `structuredContent` på klientsiden — kun en
  TypeScript-type-assertion som ikke fanger noe ved kjøretid.
- Lite feilhåndtering ved parsing — manglende/feil celler blir stille til
  `""`/`0` i stedet for å feile synlig (f.eks. ugyldig dato -> `NaN`-dager).
- 0 båter gir `NaN%` i oppsummeringsteksten (`inUseCount / totalBoats` uten
  guard).

Fleksibilitet i input/skjema må derfor bygges programmatisk, akkurat som i
en vanlig webapp.

#### Modellen ser hele datasettet, ikke bare oppsummeringsteksten

`get-fleet-report` returnerer to deler: `content` (en kort
oppsummeringssetning) og `structuredContent` (alle 15 båtene med full
detalj — havn, ansvarlig, eksakt dato, drivstoff osv.). Modellen ser begge
deler i responsen fra MCP-serveren, ikke bare `content`.

I praksis betyr dette at **man kan fritt diskutere og analysere dataene
videre i samtalen** etter at rapporten er vist og appen er tegnet — spørre
om enkeltbåter, filtrere, sammenligne osv. — uten å måtte kalle verktøyet på
nytt for hver oppfølging.

En begrensning her: modellen bruker det samme datasnapshotet fra det
opprinnelige verktøykallet gjennom hele samtalen. Endres kildedataene
(Excel-filen) underveis, oppdager ikke modellen det uten et nytt kall til
`get-fleet-report`.

#### Datakilden i denne demoen ligger sammen med MCP-serveren

`fleet-report-app/data/fleet_utilization.xlsx` leses fra en fil på selve
serveren, ikke fra et eksternt system. Det er en begrensning ved demoen,
ikke en anbefalt løsning: det gjør det vanskelig å holde dataene oppdatert,
og vanskelig for brukere å selv gå inn og se eller validere hva som faktisk
står i filen. Et produksjonsoppsett vil trolig bruke en mer robust løsning,
se muligheter under.

### Muligheter

**Datakilde: et eksternt system i stedet for lokal fil.** Gjør det enklere å
dele og oppdatere filen på tvers av team-medlemmer, i stedet for å ha den
liggende sammen med MCP-serveren — spesielt ønskelig ved hosting (f.eks. som
Azure Web App), hvor man vil unngå at filen ligger på selve web-appen. To
retninger vurdert:

- **SharePoint** — to tilnærminger:
  - *Modell-orkestrert* (bruke en SharePoint-MCP-server): verktøyet tar filinnhold som input-parameter
    i stedet for å lese lokalt — Claude henter filen via SharePoint-MCP-
    serveren først, og sender innholdet videre til `get-fleet-report`.
    Enkelt å sette opp, men
    ikke deterministisk (modell-planlagt rekkefølge), dyrt i tokens for
    binærdata, og **fungerer potensielt ikke så pålitelig for et
    delt/hostet oppsett**. En slik løsning krever at *hver* bruker har en slik
    SharePoint-MCP-server konfigurert i sin egen Claude-klient.
  - *Serveren henter selv* (Graph API): serveren kaller Microsoft Graph
    direkte for filinnholdet, parser med samme `exceljs`-logikk som
    MCP-appen gjør nå.
    Ett deterministisk verktøykall, ingen avhengighet av andre
    MCP-servere, fungerer likt for alle brukere. Krever egen
    Graph-appregistrering (client secret/sertifikat).
- **Blob storage** (f.eks. Azure Blob Storage): serveren henter filen
  direkte via SDK og en connection string/SAS-token, samme prinsipp som
  Graph-varianten over — ett deterministisk verktøykall, ingen avhengighet
  av andre MCP-servere. Enklere authentification enn SharePoint, men
  krever at noen manuelt laster opp oppdaterte filer til storage-kontoen,
  i stedet for å hente fra et system teamet allerede oppdaterer i det
  daglige (som SharePoint).

**Generelt** — for et fleksibelt oppsett som støtter flere kilder: legg til et valgfritt
`source: "local" | "sharepoint" | "blob"`-felt i `inputSchema` (default
`local`), og splitt `loadFleetRows` i en loader per kilde bak samme
grensesnitt.

## Lenker

- **Offisiell guide** — https://modelcontextprotocol.io/extensions/apps/build
- **API-dokumentasjon** — https://apps.extensions.modelcontextprotocol.io/api/
- **GitHub-repo (`ext-apps`)** — https://github.com/modelcontextprotocol/ext-apps
