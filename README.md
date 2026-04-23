# 🌲 Infinite Forest

<p align="center">
  <img src="./img/infinite-forest-2026-04-22T17-15-16.png" alt="Infinite Forest – exploration" width="100%"/>
</p>

<p align="center">
  <a href="https://nextjs.org/"><img src="https://img.shields.io/badge/Next.js-14-black?logo=next.js" alt="Next.js 14"/></a>
  <a href="https://threejs.org/"><img src="https://img.shields.io/badge/Three.js-0.169-049ef4?logo=threedotjs" alt="Three.js"/></a>
  <a href="https://docs.pmnd.rs/react-three-fiber/"><img src="https://img.shields.io/badge/React%20Three%20Fiber-8.17-blue" alt="R3F"/></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript" alt="TypeScript"/></a>
  <a href="https://github.com/pmndrs/zustand"><img src="https://img.shields.io/badge/Zustand-4.5-orange" alt="Zustand"/></a>
  <img src="https://img.shields.io/badge/License-MIT-green.svg" alt="MIT License"/>
</p>

<p align="center">
  <strong>Un'esperienza immersiva in prima persona attraverso una foresta infinita, generata proceduralmente in tempo reale nel browser. Ogni visita è un mondo unico.</strong>
</p>

<p align="center">
  🎮 <a href="https://infinity-forest.vercel.app"><strong>Entra nella Foresta — Gioca ora</strong></a>
</p>

---

## 📖 Indice

- [Demo](#-demo)
- [Caratteristiche](#-caratteristiche)
  - [Generazione Procedurale](#-generazione-procedurale-infinita)
  - [5 Tipi di Terreno](#-5-tipi-di-terreno)
  - [Ciclo Giorno/Notte](#-ciclo-giornonotte-reale)
  - [4 Stagioni Dinamiche](#-4-stagioni-dinamiche)
  - [Sistema Meteo a 6 Fasi](#-sistema-meteo-a-6-fasi)
  - [Fauna — 21 Specie](#-fauna--21-specie-animali)
  - [Flora — 8 Tipi di Piante](#-flora--8-tipi-di-piante-collezionabili)
  - [NPC con AI Conversazionale](#-npc-con-ai-conversazionale-deepseek)
  - [Effetti Visivi Avanzati](#-effetti-visivi-avanzati)
  - [Audio Ambientale](#-audio-ambientale)
  - [HUD & Impostazioni](#-hud--pannello-impostazioni)
- [Controlli](#-controlli)
- [Installazione](#-installazione--sviluppo)
- [Configurazione AI](#-configurazione-ai-deepseek)
- [Stack Tecnologico](#-stack-tecnologico)
- [Struttura del Progetto](#-struttura-del-progetto)
- [Roadmap](#-roadmap)
- [Contribuire](#-contribuire)

---

## 🎬 Demo

| Esplorazione collinare | Neve dinamica | Terreno vulcanico |
|:---:|:---:|:---:|
| ![Hill](./img/infinite-forest-2026-04-22T17-15-16.png) | ![Snow](./img/infinite-forest-2026-04-22T17-16-02.png) | ![Volcanic](./img/infinite-forest-2026-04-22T17-16-27.png) |

---

## ✨ Caratteristiche

### 🌍 Generazione Procedurale Infinita

Il mondo è generato al volo con **Simplex Noise multi-ottava** (4 canali di rumore indipendenti) su una griglia di chunk di 64 m × 64 m caricati e scaricati dinamicamente attorno al giocatore. Non esistono confini: cammina in qualsiasi direzione all'infinito.

- **Seed casuale ad ogni caricamento** — ogni ricarica della pagina crea un mondo completamente diverso
- **Seed condivisibile** — aggiungi `?seed=N` all'URL per rivivere o condividere un mondo preciso
- **Laghetto garantito allo spawn** — un piccolo stagno è sempre intagliato vicino al punto di partenza per una prima inquadratura scenografica
- **Densità forestale variabile** — radure procedurali rare mantengono la foresta come tema dominante
- **Chunk-based streaming** — 5×5 chunk attivi (≈320 m × 320 m), la nebbia maschera il bordo di caricamento senza pop-in visibile

---

### 🏔️ 5 Tipi di Terreno

Selezionabili dalle impostazioni; ogni tipo usa parametri di rumore, soglie d'acqua e modificatori di shader dedicati.

| Terreno | Caratteristiche tecniche | Particolarità |
|---------|--------------------------|---------------|
| **Flat** 🌱 | Ampiezza base 3.5 m, colline morbide a 0.012 freq | Laghi frequenti, prati aperti |
| **Hilly** ⛰️ | Ampiezza 6 m, creste generate con ridged noise | Dorsali accentuate, valli incassate |
| **Mountainous** 🏔️ | Ampiezza fino a 12 m + picchi con `pow(ridged,2)*8` | Meno laghi (acqua scende a valle), nevicate più intense |
| **Volcanic** 🌋 | Rumore ad alta frequenza (0.2), texture rugosa | Nessun lago (soglia irraggiungibile), colori grigi/neri |
| **Riverlands** 💧 | 3 fiumi principali + tributari procedurali con curva sinusoidale perturbata da rumore | Reti idrografiche ramificate, terreno piatto, fauna anfibia |

Il tipo di terreno influenza anche i **dialoghi degli NPC** e le **probabilità meteorologiche** (es. la montagna ha più neve e tempeste, le pianure fluviali più nebbia).

---

### 🌙 Ciclo Giorno/Notte Reale

L'orario di gioco è sincronizzato con **l'orologio locale del browser** in tempo reale. Se abilitata la geolocalizzazione, l'ora del tramonto viene calcolata in base alla **latitudine dell'utente** e al giorno dell'anno.

| Fase | Orario | Atmosfera |
|------|--------|-----------|
| **Night** 🌑 | 00:00–05:00 | Cielo indaco, luce lunare blu, stelle (9 000 particelle) |
| **Dawn** 🌅 | 05:00–07:00 | Cielo viola-rosa, nebbia mattutina più frequente |
| **Morning** 🌤️ | 07:00–10:00 | Blu caldo, luce dorata da est |
| **Day** ☀️ | 10:00–17:00 | Luce piena, massima visibilità |
| **Evening** 🌇 | 17:00–19:00 | Caldi arancioni e oro |
| **Dusk** 🌆 | 19:00–21:00 | Tramonto viola/fucsia, afterglow |

**11 keyframe di palette** (cielo, nebbia, sole, luce ambientale hemisferica) vengono interpolati ogni frame con lerp lineare. La direzione del sole segue un arco realistico basato sull'ora. Di notte appare la **luna** (luce direzionale cool da angolo opposto al sole).

**Stelle cadenti** — compaiono a notte fonda con un cooldown casuale di 15–70 secondi, tracciano un arco con fade-in/out e allungamento prospettico.

**Fasi lunari** — calcolate astronomicamente dalla data reale (0 = luna nuova, 4 = luna piena) e mostrate nel HUD.

---

### 🍂 4 Stagioni Dinamiche

La stagione è ricavata automaticamente dalla **data reale del sistema** oppure impostabile manualmente. Ogni stagione applica un tint cromatico all'intera scena:

| Stagione | Effetti visivi | Meteo preferenziale |
|----------|---------------|---------------------|
| **Primavera** 🌸 | Cielo verde pastello, nebbia chiara, terreno vivace | Piogge leggere, nebbia mattutina |
| **Estate** ☀️ | Cielo blu intenso, sole più caldo (+8 °C), luce +8% | Temporali pomeridiani |
| **Autunno** 🍁 | Toni arancio/oro, luce -5%, terreno marrone | Nebbia serale, piogge |
| **Inverno** ❄️ | Cielo grigio-azzurro, luce -15%, neve molto più frequente | Nevicate abbondanti, neve che si accumula |

---

### 🌩️ Sistema Meteo a 6 Fasi

Una **macchina a stati** gestisce le transizioni meteorologiche con rampa d'ingresso e d'uscita graduated, influenzata dall'orario, dall'umidità locale del terreno, dalla stagione e dal tipo di terreno.

| Meteo | Effetti specifici |
|-------|-------------------|
| **Clear** ☀️ | Visibilità massima (fog far 180 m), luce piena |
| **Rain** 🌧️ | Particelle di pioggia, vento aumentato, cielo grigio, visibilità ridotta |
| **Fog** 🌫️ | Nebbia densa (fog near fino a 4 m, far fino a 25 m), luce diffusa, nessun vento |
| **Post-Rain** 🌦️ | Fase transitoria: umidità residua, possibile nebbia spontanea all'alba |
| **Thunderstorm** ⛈️ | Lampi con flash luminosi (intensità 0.9–1.0), tuoni, nuvole temporalesche 3D animate, vento forte (fino a 1.8×), visibilità drasticamente ridotta, cielo charcoal con tinta viola |
| **Snow** ❄️ | Particelle di neve, accumulo progressivo sul terreno (shader dedicato), fusione lenta dopo la nevicata (più rapida in primavera/estate, lentissima in inverno) |

Ogni tipo di meteo può essere **forzato manualmente** dalle impostazioni o lasciato alla schedulazione automatica. La transizione tra stati è sempre graduata (mai istantanea).

**Nuvole temporalesche 3D** — 40 mesh sferiche composte in cluster, posizionate a 30–45 m di altezza, con drift animato e fade-in/out proporzionale all'intensità della pioggia.

---

### 🦌 Fauna — 21 Specie Animali

**110 istanze di animali** attive contemporaneamente, con modelli 3D hand-crafted in JSX (senza file di asset esterni). Ogni specie ha:

- **Pattern di attività oraria** (`activeness`) — ciascuna specie è attiva solo nelle sue finestre biologicamente corrette
- **Velocità calibrata** — da 1.1 m/s (lucciola) a 7.5 m/s (rondine)
- **Evitamento dell'acqua** — gli animali terrestri rifiutano i target in acqua (fino a 8 tentativi con fallback)
- **Reazione al meteo** — la pioggia riduce l'attività del 65% per la maggior parte delle specie

| Categoria | Specie |
|-----------|--------|
| **Mammiferi diurni** | Cervo 🦌, Capriolo, Lepre, Scoiattolo, Cinghiale |
| **Mammiferi notturni** | Volpe 🦊, Lupo, Tasso, Coniglio |
| **Uccelli diurni** | Pettirosso, Cinciallegra, Picchio, Poiana, Aquila |
| **Uccelli crepuscolari/notturni** | Civetta 🦉, Rondine, Corvo, Pipistrello 🦇 |
| **Insetti/Anfibi** | Lucciola ✨ (con luce puntiforme), Libellula (ali animate a 30 Hz), Ranocchio |

**Modelli 3D notabili:**
- **Aquila** — la più grande (scala 1.4), ali larghe con animazione di battitura lenta e potente
- **Lucciola** — emissione `emissiveIntensity: 3.5`, `pointLight` da 6 m di raggio verde-giallo
- **Libellula** — 4 ali trasparenti animate indipendentemente a 30 frame/s
- **Pipistrello** — ali a membrana larga con battito lento (9 Hz), solo notturno

**Lucciole del lago** — sistema separato: 5 lucciole fluttuano sopra l'acqua nelle vicinanze del giocatore nelle ore notturne, con drift sinusoidale tridimensionale.

---

### 🌿 Flora — 8 Tipi di Piante Collezionabili

Ogni pianta ha **condizioni di disponibilità** basate su ora del giorno, meteo e prossimità all'acqua.

| Pianta | Condizione di raccolta | Note |
|--------|----------------------|------|
| **Felce** 🌿 | Sempre disponibile | Specie base, ovunque |
| **Fungo** 🍄 | Notte (20:00–06:00) o dopo la pioggia | Cresce al buio e nell'umidità |
| **Fiore selvatico** 🌸 | Giorno (07:00–18:00), non sotto pioggia | Si chiude di notte e con la pioggia |
| **Erba aromatica** 🌱 | Alba (05:00–08:00) e tramonto (17:00–20:00) | Massima fragranza alle ore crepuscolari |
| **Ninfea** 🪷 | Solo vicino all'acqua | Richiede prossimità a laghi o fiumi |
| **Moonbloom** 🌙 | Solo di notte (21:00–05:00) | Fiore lunare raro |
| **Dewcup** 💧 | Nelle prime 150 s dopo la pioggia | Finestra temporale brevissima |
| **Bacca selvatica** 🍓 | Giorno (08:00–19:00), non sotto pioggia | Matura solo alla luce |

Il sistema di raccolta usa un **inventario persistente** (Zustand) con conteggi per specie. Il tasto `E` funziona solo se il cursore è bloccato e la pianta è nel raggio d'interazione.

---

### 🤖 NPC con AI Conversazionale (DeepSeek)

**8 personaggi** con personalità distinte, posizionati deterministicamente per chunk (seed-stable: lo stesso chunk genera sempre lo stesso NPC). Ogni personaggio adatta i suoi dialoghi al **terreno corrente**.

| Personaggio | Carattere | Colore |
|-------------|-----------|--------|
| **Viandante** 🧳 | Silenzioso, malinconico, parla per osservazioni | `#b89a68` |
| **Erborista** 🌿 | Pratica, conosce ogni pianta e rimedio | `#8fc26a` |
| **Guardaboschi** 🪵 | Sobrio, legge tracce e meteo | `#7ba85a` |
| **Cercatore di Laghi** 💧 | Lento e meditativo, segue l'acqua | `#88b4d8` |
| **Poeta del Bosco** ✍️ | Parla per metafore, mai pomposo | `#c8a4e0` |
| **Cacciatrice** 🏹 | Rispettosa, parla sottovoce, legge le tracce | `#8a6a4a` |
| **Eremita** 🏠 | Anziano schivo, frasi che sembrano proverbi | `#c8a070` |
| **Cantastorie** 📖 | Calore umano, pause teatrali, leggende brevi | `#e0b8a0` |

**Come funziona la conversazione:**
1. Avvicinati a un NPC (entro ~5 m) → appare il prompt `[E] Talk`
2. Premi `E` → si apre il pannello dialogo con la battuta d'apertura deterministica
3. Digita un messaggio → viene inviato all'**API Next.js** (`/api/npc-chat`) che chiama **DeepSeek Chat** con:
   - Contesto del mondo in tempo reale (ora, meteo, terreno, umidità, calma del giocatore, posizione)
   - Ultimi 8 messaggi di storia per mantenere la coerenza narrativa
   - Prompt di sistema in italiano con vincoli: risposte brevi (1–3 frasi, max 60 parole), mai rompere la finzione
4. L'NPC risponde nella sua voce, rimanendo sempre nel personaggio

---

### 🎨 Effetti Visivi Avanzati

#### Acqua (Shader Custom)
La superficie d'acqua infinita (piano da 500 m × 500 m, 96×96 segmenti) usa **`onBeforeCompile`** per iniettare shader GLSL personalizzati:
- **Onde vertex** — doppio layer sinusoidale per deformazione della superficie
- **Normale perturbata** — gradiente di noise in fragment shader per increspature animate
- **Fresnel** — riflesso del cielo ai bordi glancing (4° potenza)
- **Specular sparkle** — Blinn-Phong a 80 esponente + sparkle diffuso da luce solare

#### Vegetazione
- **Shader vento** — ogni materiale fogliame riceve `uTime` e `uWind` uniforms per oscillazione sinusoidale in vertex shader, con intensità proporzionale all'altezza e al meteo
- **Instanced Rendering** — alberi e vegetazione usa `InstancedMesh` per ridurre i draw call a poche unità anche con migliaia di oggetti

#### Illuminazione
- **Directional light** (sole) con shadow map 2048×2048, frustum 100×100 m centrato sul giocatore
- **HemisphereLight** — cielo/terreno separati, interpolati per stagione e meteo
- **Moon light** — luce direzionale cool `#b8c8ff` attiva nelle ore notturne
- **ACES Filmic Tone Mapping** — esposizione dinamica interpolata per fase del giorno
- **Lightning flash** — durante i temporali, intensità luce +250%, con flash di colore bianco-azzurro (doppio flash random 25% delle volte)

#### Effetti Atmosferici
- **Stelle** — 9 000 particelle con `@react-three/drei Stars`, visibili solo di notte
- **Stelle cadenti** — mesh cilindrica allungata con fade e scheduling random (15–70 s tra apparizioni)
- **Nuvole temporalesche** — 40 mesh sferiche composte, animate con drift e respiro
- **Lucciole del lago** — 5 luci puntiformi + mesh emissive al di sopra dei corpi d'acqua notturni

#### Terreno
- **Barycentric interpolation** — altezza campionata con interpolazione baricentrica triangolare (non bilineare) per zero floating degli oggetti
- **Spawn pond** — laghetto garantito vicino all'origine con smoothstep depth carving
- **Livello acqua** — costante `WATER_LEVEL = -0.2`, usata da terreno, fauna e meccaniche del giocatore

---

### 🔊 Audio Ambientale

Sistema audio contestuale che si adatta automaticamente a ora, meteo e movimento:

- **Suoni naturali** — vento, pioggia, uccelli, grilli notturni, rane
- **Volume adattivo** — pioggia più forte durante i temporali, grilli solo di notte, uccelli solo di giorno
- **Musica procedurale** — opzionale, attivabile dalle impostazioni con volume indipendente
- **Controllo separato** — ambience e musica hanno toggle e slider di volume indipendenti, persistiti in `localStorage`

---

### 🖥️ HUD & Pannello Impostazioni

L'HUD mostra in tempo reale:

- **Ora locale** con fase del giorno e stagione
- **Meteo corrente** con indicatori visivi (icone + intensità animata)
- **Temperatura** calcolata da altitudine + stagione + ora + meteo (formula fisica semplificata, range realistico)
- **Fase lunare** astronomica (8 fasi, aggiornata dalla data reale)
- **Altitudine** della posizione corrente
- **Distanza percorsa** e velocità del giocatore
- **Bussola** (N/NE/E/SE/S/SW/W/NW) e coordinate X/Z
- **Tempo di sessione** e piante raccolte
- **Inventario flora** con conteggi per specie

**Pannello Impostazioni persistenti** (salvate in `localStorage`):

| Impostazione | Valori |
|---|---|
| Orologio | Realtime (sincronizzato con ora locale) / Manuale (slider 0–23) |
| Meteo | Auto / Clear / Rain / Fog / Thunderstorm / Snow |
| Stagione | Auto (dalla data reale) / Spring / Summer / Autumn / Winter |
| Terreno | Flat / Hilly / Mountainous / Volcanic / Riverlands |
| Suoni natura | On/Off + volume |
| Musica | On/Off + volume |
| Dev Mode | Modalità sviluppatore con strumenti extra |

---

## 🎮 Controlli

| Tasto / Input | Azione |
|---|---|
| `W A S D` / `↑ ↓ ← →` | Movimento |
| `Mouse` | Guarda intorno (pointer lock) |
| `Shift` | Sprint |
| `Space` | Salta |
| `E` | Raccogli pianta / Parla con NPC |
| `F` | Sblocca cursore (pausa) |
| `Esc` | Sblocca cursore |
| **Click** sul pulsante schermata | Entra / rientra nella foresta |

---

## 🚀 Installazione & Sviluppo

### Prerequisiti

- Node.js ≥ 18
- npm ≥ 9

### Setup

```bash
# Clona il repository
git clone https://github.com/andreapianidev/infinite-forest.git
cd infinite-forest

# Installa dipendenze
npm install

# Avvia in modalità sviluppo
npm run dev
# → http://localhost:3000
```

### Build Produzione

```bash
npm run build
npm start
```

### Deploy su Vercel

```bash
npx vercel
```

Zero configurazione — Next.js è auto-rilevato da Vercel.

---

## 🤖 Configurazione AI (DeepSeek)

I dialoghi NPC richiedono una chiave API **DeepSeek**. Senza chiave, le conversazioni non funzionano ma tutto il resto dell'esperienza rimane intatto.

1. Ottieni la chiave su [platform.deepseek.com](https://platform.deepseek.com/)
2. Crea il file `.env.local` nella root del progetto:

```env
DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx
```

3. Riavvia il server di sviluppo.

> **Sicurezza** — La chiave rimane sul server Next.js (`app/api/npc-chat/route.ts`), non è mai esposta al client.

---

## 🛠️ Stack Tecnologico

| Layer | Tecnologia | Versione |
|-------|-----------|---------|
| Framework | [Next.js](https://nextjs.org/) App Router | 14.2 |
| 3D Engine | [Three.js](https://threejs.org/) | 0.169 |
| React 3D | [React Three Fiber](https://docs.pmnd.rs/react-three-fiber/) | 8.17 |
| Helpers 3D | [@react-three/drei](https://github.com/pmndrs/drei) | 9.114 |
| State | [Zustand](https://github.com/pmndrs/zustand) | 4.5 |
| Noise | [simplex-noise](https://github.com/jwagner/simplex-noise) | 4.0 |
| AI Chat | [DeepSeek API](https://platform.deepseek.com/) | deepseek-chat |
| Linguaggio | TypeScript | 5 |

---

## 📁 Struttura del Progetto

```
├── app/
│   ├── api/
│   │   └── npc-chat/route.ts   # API route Next.js → DeepSeek Chat
│   ├── globals.css             # Stili globali
│   ├── layout.tsx              # Root layout
│   └── page.tsx                # Entry point
│
├── components/
│   ├── Forest.tsx              # Scene root: Canvas, WorldTick, chunk manager,
│   │                           # InfiniteWater, ShootingStars, LakeFireflies,
│   │                           # StormClouds, IntroCamera
│   ├── Chunk.tsx               # Generazione terreno chunk-based + instanced vegetation
│   ├── Player.tsx              # FPS controller: movimento, salto, gravità, collisioni
│   ├── Animals.tsx             # 21 specie animali con modelli JSX + AI di movimento
│   ├── Weather.tsx             # Particelle pioggia/neve
│   ├── NPCs.tsx                # Spawn e loop di movimento NPC
│   ├── NPCDialog.tsx           # UI pannello dialogo + chiamata API
│   ├── HUD.tsx                 # Overlay interfaccia (ore, meteo, inventario, bussola…)
│   └── Audio.tsx               # Soundscape adattivo
│
├── lib/
│   ├── noise.ts                # Simplex noise + terrain types + river system + hash2
│   ├── world.ts                # World state, palette keyframes, weather FSM,
│   │                           # season, moon phase, geolocation, temperature
│   ├── npc.ts                  # NPC profiles × 8, terrain modifiers, DeepSeek context
│   └── store.ts                # Game state Zustand: inventario, piante, raccolta
│
├── img/                        # Screenshot
└── public/                     # Asset statici
```

---

## 🔮 Roadmap

- [ ] Sistema crafting per oggetti raccolti
- [ ] Ciclo notte/giorno visibile anche nella flora (fiori che si aprono/chiudono)
- [ ] Comportamenti di fuga animali quando il giocatore si avvicina troppo
- [ ] Sistema costruzione base-camp
- [ ] Multiplayer cooperativo (WebRTC)
- [ ] Mobile support con touch controls e gyroscope look
- [ ] VR support (WebXR)
- [ ] Esportazione screenshot in-game con watermark seed

---

## 🤝 Contribuire

Contributi benvenuti! Aree prioritarie:

- 🎨 **Modelli 3D** — nuove specie animali o varianti di alberi in JSX
- 💻 **Performance** — ottimizzazione shader, LOD, culling
- 🌍 **Localizzazione** — traduzione HUD e dialoghi NPC
- 📝 **Nuovi NPC** — nuove personalità e profili di dialogo
- 🔊 **Audio** — soundscape aggiuntivi, effetti spaziali

```bash
git checkout -b feature/nome-feature
# modifica, testa, poi:
git commit -m 'feat: descrizione della feature'
git push origin feature/nome-feature
# apri una Pull Request
```

---

## 📜 Licenza

MIT License — vedi [LICENSE](LICENSE) per i dettagli.

---

## 🙏 Ringraziamenti

- [pmndrs](https://github.com/pmndrs) — React Three Fiber, Drei e l'intero ecosistema
- [Three.js community](https://threejs.org/) — l'incredibile engine 3D open source
- [Next.js team](https://nextjs.org/) — il framework che rende tutto questo deployabile con un click
- [DeepSeek](https://platform.deepseek.com/) — LLM per i dialoghi NPC in tempo reale

---

<p align="center">
  <strong>🌲 Ogni seed è un mondo. Ogni passo è un'avventura. 🌲</strong>
</p>
