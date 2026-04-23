import { create } from 'zustand';
import { hash2, TERRAIN_TYPE } from './noise';
import { world } from './world';

export type NPCKind =
  | 'wanderer'
  | 'herbalist'
  | 'ranger'
  | 'lakeSeeker'
  | 'poet'
  | 'hunter'
  | 'hermit'
  | 'storyteller';

export interface NPCProfile {
  kind: NPCKind;
  name: string;
  tagline: string;
  persona: string;
  /** A few candidate opening lines. One is chosen deterministically per chunk. */
  openings: string[];
  /** Quick-ask suggestions the player can tap in the dialog. Stay in character. */
  topics: string[];
  accent: string;
}

export const NPC_PROFILES: Record<NPCKind, NPCProfile> = {
  wanderer: {
    kind: 'wanderer',
    name: 'Viandante',
    tagline: 'Cammina da anni',
    persona:
      'un viandante silenzioso che attraversa la foresta da anni. Parla con poche parole, in frasi brevi e pacate, con una leggera malinconia. Non da consigli diretti; preferisce osservare.',
    openings: [
      'Ti ho sentito tra i rami. Non temere, non sono uno spettro.',
      'Un altro passo nel bosco. Siediti, se vuoi.',
      'Questa strada la conosco. Non porta da nessuna parte, ed e il suo pregio.',
    ],
    topics: ['Da dove vieni?', 'Cosa cerchi qui?', 'Hai visto qualcosa di strano?'],
    accent: '#b89a68',
  },
  herbalist: {
    kind: 'herbalist',
    name: 'Erborista',
    tagline: 'Conosce le piante',
    persona:
      'una raccoglitrice di erbe esperta. Parla con voce gentile, usa nomi di piante e stagioni, racconta piccoli rimedi. Pratica, mai dogmatica.',
    openings: [
      'Cerchi qualcosa di utile? Oggi la terra profuma di foglie bagnate.',
      'Vedo le tue mani. Hai gia raccolto qualcosa?',
      'Se ti fermi un momento, ti mostro cosa cresce qui intorno.',
    ],
    topics: ['Quali erbe trovo oggi?', 'A cosa serve questa pianta?', 'Come si riconoscono i funghi?'],
    accent: '#8fc26a',
  },
  ranger: {
    kind: 'ranger',
    name: 'Guardaboschi',
    tagline: 'Conosce i pericoli',
    persona:
      'un guardaboschi attento; sa leggere tracce, meteo e pericoli. Tono sobrio e diretto, mai allarmista. Se serve, avverte con pacata fermezza.',
    openings: [
      'Tieni gli occhi aperti: il bosco cambia piu in fretta di quanto sembra.',
      'Buona giornata per camminare. Acqua vicino, se ne hai bisogno.',
      'Hai sentito il vento cambiare? Io si.',
    ],
    topics: ['Ci sono pericoli qui?', 'Che animali vivono qui?', 'Consigli per orientarsi?'],
    accent: '#7ba85a',
  },
  lakeSeeker: {
    kind: 'lakeSeeker',
    name: 'Cercatore di laghi',
    tagline: 'Segue l\'acqua',
    persona:
      'un cercatore di laghi nascosti. Ama l\'acqua, il silenzio e i riflessi. Parla lento, come se stesse misurando ogni parola.',
    openings: [
      'Anche tu segui l\'acqua? Qui vicino sento qualcosa di limpido.',
      'Se chiudi gli occhi, il lago ti chiama. Lo senti?',
      'Ho pescato solo silenzio oggi. Non e un cattivo raccolto.',
    ],
    topics: ['Dove trovo un lago?', 'Cosa si pesca qui?', 'Racconti di fiumi strani?'],
    accent: '#88b4d8',
  },
  poet: {
    kind: 'poet',
    name: 'Poeta del bosco',
    tagline: 'Parla per immagini',
    persona:
      'un poeta solitario. Parla per immagini leggere, metafore semplici, mai pomposo. Ogni risposta suggerisce piu di quanto dica.',
    openings: [
      'Ogni foglia oggi sembra una pagina. Ti siedi un momento?',
      'Il vento firma i miei versi prima che io li scriva.',
      'Ti stavo cercando, anche se non lo sapevo.',
    ],
    topics: ['Dimmi una poesia', 'Cosa vedi oggi nel bosco?', 'Cosa ti ispira di piu?'],
    accent: '#c8a4e0',
  },
  hunter: {
    kind: 'hunter',
    name: 'Cacciatrice',
    tagline: 'Legge le tracce',
    persona:
      'una cacciatrice esperta ma rispettosa; caccia solo quando serve. Parla sottovoce, con frasi brevi, e attenta ai rumori.',
    openings: [
      'Silenzio. Ho una traccia fresca qui.',
      'Non si caccia senza motivo, ma si impara ad ascoltare.',
      'Ti fermi un momento? Parliamo piano.',
    ],
    topics: ['Cosa passa di qui?', 'Come si seguono le tracce?', 'Rispetto per gli animali?'],
    accent: '#8a6a4a',
  },
  hermit: {
    kind: 'hermit',
    name: 'Eremita',
    tagline: 'Vive in una capanna',
    persona:
      'un eremita anziano che vive in una capanna nei pressi. Schivo ma curioso; parla con frasi che sembrano proverbi, spesso con un sorriso interno.',
    openings: [
      'Poche voci qui dentro. La tua e gentile, bene.',
      'Ho una lanterna, se il bosco si fa scuro.',
      'Non faccio domande, ma ne accetto.',
    ],
    topics: ['Da quanto vivi qui?', 'Che cosa mangi?', 'Hai visto cose strane di notte?'],
    accent: '#c8a070',
  },
  storyteller: {
    kind: 'storyteller',
    name: 'Cantastorie',
    tagline: 'Racconta leggende',
    persona:
      'una cantastorie viaggiante; conosce leggende brevi della foresta. Parla con calore, con pause come se stesse aspettando la prossima frase.',
    openings: [
      'Una storia? Anche breve, se preferisci.',
      'Il bosco ricorda. Io provo a tradurlo.',
      'Ti e mai capitato di sentirti osservato dagli alberi? Sedetevi.',
    ],
    topics: ['Raccontami una leggenda', 'Chi ha costruito questa foresta?', 'Ci sono spiriti qui?'],
    accent: '#e0b8a0',
  },
};

const KIND_ORDER: NPCKind[] = [
  'wanderer',
  'herbalist',
  'ranger',
  'lakeSeeker',
  'poet',
  'hunter',
  'hermit',
  'storyteller',
];

/** Deterministic kind pick from a chunk coordinate so seeds give stable people. */
export function kindForChunk(cx: number, cz: number): NPCKind {
  const r = hash2(cx, cz, 4711);
  return KIND_ORDER[Math.floor(r * KIND_ORDER.length)];
}

/** Deterministic opening line choice so the same NPC always greets the same way. */
export function openingFor(profile: NPCProfile, cx: number, cz: number): string {
  const r = hash2(cx, cz, 4713);
  const idx = Math.floor(r * profile.openings.length);
  return profile.openings[Math.min(profile.openings.length - 1, idx)];
}

/**
 * Opening enriched with a short context-aware addendum. Keeps the base line
 * stable (so the character feels consistent) but adds a sentence reflecting
 * current hour, weather and kind personality.
 */
export function contextualOpening(
  profile: NPCProfile,
  kind: NPCKind,
  cx: number,
  cz: number,
  ctx: { hour: number; phase: string; weather: string },
): string {
  const base = openingFor(profile, cx, cz);
  const hour = Math.floor(ctx.hour);
  const addendums: string[] = [];

  if (ctx.weather === 'rain' || ctx.weather === 'thunderstorm') {
    const rainLines: Partial<Record<NPCKind, string>> = {
      wanderer: 'La pioggia accompagna i passi.',
      herbalist: 'La pioggia fa aprire le foglie.',
      ranger: 'Attento, il suolo e scivoloso.',
      lakeSeeker: 'L\'acqua cade, l\'acqua chiama.',
      poet: 'Ogni goccia e un verso che cade.',
      hunter: 'Le tracce durano poco oggi.',
      hermit: 'Ho una lanterna, se serve.',
      storyteller: 'Le storie migliori si raccontano sotto il temporale.',
    };
    const line = rainLines[kind];
    if (line) addendums.push(line);
  } else if (ctx.weather === 'fog') {
    addendums.push('La nebbia nasconde piu di quanto mostri.');
  } else if (ctx.weather === 'snow') {
    addendums.push('La neve attutisce ogni voce.');
  }

  if (ctx.phase === 'night' && !addendums.length) {
    addendums.push('La notte e lunga, se la ascolti.');
  } else if (ctx.phase === 'dawn' && !addendums.length) {
    addendums.push('L\'alba mi sorprende sempre.');
  } else if (ctx.phase === 'dusk' && !addendums.length) {
    addendums.push('Il giorno si piega.');
  }

  if (hour >= 0 && hour < 5 && kind === 'hermit') {
    return `${base} Vegliavo, come sempre.`;
  }

  if (addendums.length === 0) return base;
  return `${base} ${addendums[0]}`;
}

/** NPC mood derived from persona + current weather. Drives HUD icon/color. */
export type NPCMood = 'calm' | 'alert' | 'melancholy' | 'curious' | 'warm';

export function moodFor(kind: NPCKind, weather: string, phase: string): NPCMood {
  if (weather === 'thunderstorm') return 'alert';
  if (weather === 'rain' || weather === 'fog') {
    if (kind === 'poet' || kind === 'hermit') return 'melancholy';
    if (kind === 'ranger' || kind === 'hunter') return 'alert';
  }
  if (phase === 'night') {
    if (kind === 'hermit' || kind === 'storyteller') return 'warm';
    return 'calm';
  }
  if (kind === 'storyteller' || kind === 'herbalist') return 'warm';
  if (kind === 'poet') return 'curious';
  if (kind === 'ranger' || kind === 'hunter') return 'alert';
  return 'calm';
}

export const MOOD_META: Record<NPCMood, { icon: string; label: string; color: string }> = {
  calm:       { icon: '◦', label: 'sereno',       color: '#8fc26a' },
  alert:      { icon: '△', label: 'all\'erta',    color: '#d89a58' },
  melancholy: { icon: '~', label: 'malinconico',  color: '#88b4d8' },
  curious:    { icon: '?', label: 'curioso',      color: '#c8a4e0' },
  warm:       { icon: '◉', label: 'accogliente',  color: '#e0b078' },
};

/** Dynamic topic suggestions that adapt to time/weather/kind. */
export function dynamicTopics(
  kind: NPCKind,
  ctx: { hour: number; phase: string; weather: string },
): string[] {
  const profile = getTerrainAdaptedProfile(kind);
  const base = [...profile.topics];
  const extras: string[] = [];
  if (ctx.weather === 'rain' || ctx.weather === 'thunderstorm') {
    if (kind === 'herbalist') extras.push('Cosa raccogli sotto la pioggia?');
    else if (kind === 'ranger') extras.push('Pericoli con questa pioggia?');
    else if (kind === 'hermit') extras.push('Posso ripararmi con te?');
    else if (kind === 'poet') extras.push('La pioggia ti ispira?');
  } else if (ctx.weather === 'fog') {
    extras.push('Cosa si nasconde nella nebbia?');
  } else if (ctx.weather === 'snow') {
    extras.push('Cosa sopravvive alla neve?');
  }
  if (ctx.phase === 'night') {
    if (kind === 'hermit') extras.push('Cosa succede qui di notte?');
    else if (kind === 'storyteller') extras.push('Una leggenda notturna?');
    else extras.push('Non dormi mai?');
  } else if (ctx.phase === 'dawn') {
    extras.push('Cosa fai all\'alba?');
  }
  // Rotate base so it doesn't feel static: drop one and replace with extra if we have any.
  if (extras.length && base.length >= 3) {
    base[base.length - 1] = extras[0];
    if (extras[1]) base.splice(1, 0, extras[1]);
  } else {
    base.push(...extras);
  }
  return base.slice(0, 4);
}

/** Tiny narrative items NPCs can give the player. Kind-themed. */
export interface Memento {
  id: string;       // unique instance id
  fromNpcId: string;
  fromKind: NPCKind;
  fromName: string;
  title: string;
  description: string;
  ts: number;
}

const MEMENTO_POOL: Record<NPCKind, { title: string; description: string }[]> = {
  wanderer: [
    { title: 'Pietra del cammino', description: 'Una pietra piatta, consumata dal passo di anni. Pesa poco; ricorda molto.' },
    { title: 'Nodo di corda', description: 'Un nodo doppio, stretto bene. Si slega solo chiamandolo per nome.' },
  ],
  herbalist: [
    { title: 'Foglia di salvia', description: 'Profumo caldo. Strofinala tra le dita quando non riesci a pensare.' },
    { title: 'Radice amara', description: 'Sembra nulla, ma in infusione scioglie la stanchezza.' },
  ],
  ranger: [
    { title: 'Segno di sentiero', description: 'Tre tacche su una corteccia, copiate su un frammento di legno. Indica il nord.' },
    { title: 'Impronta di volpe', description: 'Un calco di fango secco. Prima di buttarlo, guardalo bene.' },
  ],
  lakeSeeker: [
    { title: 'Ciottolo liscio', description: 'Strappato al fondo di un lago senza nome. Freddo come una domanda.' },
    { title: 'Scheggia di specchio d\'acqua', description: 'Un pezzetto di vetro blu. Non riflette il tuo viso esattamente come lo conosci.' },
  ],
  poet: [
    { title: 'Verso scritto su foglia', description: '"Ogni passo e gia scritto, / ma il bosco lo legge / un po\' alla volta."' },
    { title: 'Penna di gazza', description: 'Dicono porti fortuna ai distratti.' },
  ],
  hunter: [
    { title: 'Piuma di nibbio', description: 'Tenuta con un filo. Ricorda di guardare in alto.' },
    { title: 'Dente di cinghiale', description: 'Piccolo, vecchio, pulito. "Rispetto", dice chi te lo da.' },
  ],
  hermit: [
    { title: 'Stoppino consumato', description: 'Ha illuminato molte notti. Basta accenderlo per ricordarselo.' },
    { title: 'Ciotola di legno', description: 'Scavata a mano. Ci cape una manciata di silenzio.' },
  ],
  storyteller: [
    { title: 'Frammento di storia', description: 'Una frase senza inizio ne fine: "...e la foresta non rispose, ma si piego un poco."' },
    { title: 'Filo rosso', description: 'Serve a non perdere il racconto mentre lo cammini.' },
  ],
};

export function pickMemento(kind: NPCKind, npcId: string, name: string, cx: number, cz: number): Memento {
  const pool = MEMENTO_POOL[kind];
  const r = hash2(cx, cz, 7717);
  const entry = pool[Math.floor(r * pool.length) % pool.length];
  return {
    id: `m:${npcId}:${Date.now()}`,
    fromNpcId: npcId,
    fromKind: kind,
    fromName: name,
    title: entry.title,
    description: entry.description,
    ts: Date.now(),
  };
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  ts: number;
}

export interface ActiveNPC {
  id: string;
  kind: NPCKind;
  x: number;
  z: number;
  cx: number;
  cz: number;
}

export interface DevNPC extends ActiveNPC {
  targetX: number;
  targetZ: number;
  speed: number;
}

interface NPCState {
  nearby: ActiveNPC | null;
  dialogOpenFor: string | null;
  history: Record<string, ChatMessage[]>;
  pending: boolean;
  error: string | null;
  devNPC: DevNPC | null; // Spawned via dev mode button
  /** Persistent bag of mementos the player has collected. */
  mementos: Memento[];
  /** Counts of encounters by kind; used to vary dialog. */
  encounters: Record<NPCKind, number>;
  /** Whether the mementos panel is open. */
  mementosOpen: boolean;
  setNearby: (n: ActiveNPC | null) => void;
  openDialog: (id: string) => void;
  closeDialog: () => void;
  appendMessage: (id: string, m: ChatMessage) => void;
  setPending: (p: boolean) => void;
  setError: (e: string | null) => void;
  spawnDevNPC: (npc: DevNPC) => void;
  clearDevNPC: () => void;
  updateDevNPC: (updater: (n: DevNPC) => DevNPC) => void;
  addMemento: (m: Memento) => void;
  hasMementoFrom: (npcId: string) => boolean;
  incrementEncounter: (kind: NPCKind) => void;
  openMementos: () => void;
  closeMementos: () => void;
}

const EMPTY_ENCOUNTERS: Record<NPCKind, number> = {
  wanderer: 0, herbalist: 0, ranger: 0, lakeSeeker: 0,
  poet: 0, hunter: 0, hermit: 0, storyteller: 0,
};

export const useNPC = create<NPCState>((set, get) => ({
  nearby: null,
  dialogOpenFor: null,
  history: {},
  pending: false,
  error: null,
  devNPC: null,
  mementos: [],
  encounters: { ...EMPTY_ENCOUNTERS },
  mementosOpen: false,
  setNearby: (n) =>
    set((s) => (s.nearby?.id === n?.id ? s : { ...s, nearby: n })),
  openDialog: (id) => set({ dialogOpenFor: id, error: null }),
  closeDialog: () => set({ dialogOpenFor: null, pending: false }),
  appendMessage: (id, m) =>
    set((s) => {
      const list = s.history[id] ?? [];
      return { history: { ...s.history, [id]: [...list, m] } };
    }),
  setPending: (p) => set({ pending: p }),
  setError: (e) => set({ error: e }),
  spawnDevNPC: (npc) => set({ devNPC: npc }),
  clearDevNPC: () => set({ devNPC: null }),
  updateDevNPC: (updater) =>
    set((s) => (s.devNPC ? { devNPC: updater(s.devNPC) } : s)),
  addMemento: (m) => set((s) => ({ mementos: [...s.mementos, m] })),
  hasMementoFrom: (npcId) => get().mementos.some((m) => m.fromNpcId === npcId),
  incrementEncounter: (kind) =>
    set((s) => ({ encounters: { ...s.encounters, [kind]: (s.encounters[kind] ?? 0) + 1 } })),
  openMementos: () => set({ mementosOpen: true }),
  closeMementos: () => set({ mementosOpen: false }),
}));

/** Short human-readable world description fed to the model as context. */
export function buildWorldContext(playerX: number, playerZ: number): string {
  const h = world.hour;
  const hh = `${Math.floor(h).toString().padStart(2, '0')}:${Math.floor((h - Math.floor(h)) * 60).toString().padStart(2, '0')}`;
  const phase = world.phase;
  const weather = world.weather;
  const calmPct = Math.round(world.calm * 100);
  const moisture = Math.round(world.localMoisture * 100);
  const terrain = TERRAIN_TYPE;
  return [
    `ora ${hh} (${phase})`,
    `meteo ${weather}`,
    `terreno ${terrain}`,
    `umidita locale ${moisture}%`,
    `calma giocatore ${calmPct}%`,
    `posizione x=${Math.round(playerX)} z=${Math.round(playerZ)}`,
  ].join(', ');
}

/** Terrain-specific persona modifiers to adapt NPC behavior. */
export const TERRAIN_NPC_MODIFIERS: Record<string, Partial<NPCProfile>> = {
  flat: {
    // Standard forest behavior - no changes
  },
  hilly: {
    tagline: 'Conosce i sentieri in salita',
    openings: [
      'Le colline hanno memoria. Ogni passo lascia un segno.',
      'Qui si vede lontano, se si sa dove guardare.',
      'Il vento su queste pendenze ha voce diversa.',
    ],
    topics: ['Dove porta questo sentiero?', 'Che si vede dalla cima?', 'Pericoli in discesa?'],
  },
  mountainous: {
    tagline: 'Sopravvive tra le vette',
    persona: 'adattato alla montagna. Parla di picchi, neve, sentieri impervi. Meno loquace, più pratico.',
    openings: [
      'Le montagne non perdonano. Ma ricompensano chi ascolta.',
      'Più in alto, meno parole. Più silenzio.',
      'Ho visto nubi muoversi più veloci del vento.',
    ],
    topics: ['Come si scala in sicurezza?', 'Dove trovare rifugio?', 'Animali di alta quota?'],
  },
  volcanic: {
    tagline: 'Cammina su terra bruciata',
    persona: 'abituato al terreno vulcanico. Parla di cenere, fuoco sotterraneo, resistenza. Tono cupo ma non disperato.',
    openings: [
      'La terra qui ricorda. Brucia ancora, sotto la cenere.',
      'Non tutto ciò che è nero è morto.',
      'Ho imparato a fidarmi del suolo che trema.',
    ],
    topics: ['Cosa cresce su terra bruciata?', 'Pericoli nascosti?', 'Acqua potabile qui?'],
  },
  riverlands: {
    tagline: 'Segue le acque',
    persona: 'esperto di fiumi e paludi. Conosce correnti, ponti, attraversamenti. Parla fluente, come l\'acqua.',
    openings: [
      'L\'acqua conduce sempre da qualche parte. Anche il silenzio.',
      'Qui il fiume è strada, non confine.',
      'Ho visto pescatori più saggi di filosofi.',
    ],
    topics: ['Dove attraversare in sicurezza?', 'Pesci di queste acque?', 'Case galleggianti?'],
  },
};

/** Get NPC profile adapted for current terrain. */
export function getTerrainAdaptedProfile(kind: NPCKind): NPCProfile {
  const base = NPC_PROFILES[kind];
  const modifier = TERRAIN_NPC_MODIFIERS[TERRAIN_TYPE];
  if (!modifier) return base;
  
  return {
    ...base,
    ...modifier,
    // Merge arrays if present
    openings: modifier.openings || base.openings,
    topics: modifier.topics || base.topics,
    // Compose persona if modifier has additions
    persona: modifier.persona 
      ? `${base.persona} ${modifier.persona}` 
      : base.persona,
  };
}
