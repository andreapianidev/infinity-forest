'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useNPC,
  buildWorldContext,
  ChatMessage,
  ActiveNPC,
  getTerrainAdaptedProfile,
  contextualOpening,
  dynamicTopics,
  moodFor,
  MOOD_META,
  pickMemento,
} from '@/lib/npc';
import { world } from '@/lib/world';
import { PlayerState } from './Player';

interface Props {
  playerRef: React.MutableRefObject<PlayerState>;
}

function releaseMouse() {
  if (typeof document !== 'undefined' && document.pointerLockElement) document.exitPointerLock();
}

/** Prompt + dialog panel. Opens when user presses Interagisci near an NPC. */
export function NPCDialog({ playerRef }: Props) {
  const nearby = useNPC((s) => s.nearby);
  const dialogOpenFor = useNPC((s) => s.dialogOpenFor);
  const openDialog = useNPC((s) => s.openDialog);
  const closeDialog = useNPC((s) => s.closeDialog);
  const history = useNPC((s) => s.history);
  const append = useNPC((s) => s.appendMessage);
  const pending = useNPC((s) => s.pending);
  const setPending = useNPC((s) => s.setPending);
  const error = useNPC((s) => s.error);
  const setError = useNPC((s) => s.setError);

  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const activeNpc: ActiveNPC | null = nearby && nearby.id === dialogOpenFor ? nearby : null;
  const profile = activeNpc ? getTerrainAdaptedProfile(activeNpc.kind) : null;
  const messages: ChatMessage[] = activeNpc ? history[activeNpc.id] ?? [] : [];

  const addMemento = useNPC((s) => s.addMemento);
  const hasMementoFrom = useNPC((s) => s.hasMementoFrom);
  const incrementEncounter = useNPC((s) => s.incrementEncounter);
  const encounters = useNPC((s) => s.encounters);
  const mementos = useNPC((s) => s.mementos);
  const openMementos = useNPC((s) => s.openMementos);
  const hasMemento = activeNpc ? hasMementoFrom(activeNpc.id) : false;

  // Snapshot world context at dialog open for display (mood, topic chips).
  const [ctxSnap, setCtxSnap] = useState(() => ({ hour: world.hour, phase: world.phase, weather: world.weather }));

  // Topics tailored to current world context and kind.
  const topics = useMemo(() => {
    if (!activeNpc) return [] as string[];
    return dynamicTopics(activeNpc.kind, ctxSnap);
  }, [activeNpc, ctxSnap]);
  const mood = activeNpc ? moodFor(activeNpc.kind, ctxSnap.weather, ctxSnap.phase) : 'calm';
  const moodMeta = MOOD_META[mood];

  // Typewriter effect: tracks per-message count revealed so far (by index).
  const [revealed, setRevealed] = useState<Record<number, number>>({});
  const lastAssistantIdx = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === 'assistant') return i;
    return -1;
  }, [messages]);

  // Seed greeting when dialog opens with empty history.
  useEffect(() => {
    if (!activeNpc || !profile) return;
    // On open: snapshot context, reset typewriter state, increment encounter.
    setCtxSnap({ hour: world.hour, phase: world.phase, weather: world.weather });
    setRevealed({});
    incrementEncounter(activeNpc.kind);
    const list = history[activeNpc.id] ?? [];
    if (list.length === 0) {
      const opening = contextualOpening(profile, activeNpc.kind, activeNpc.cx, activeNpc.cz, {
        hour: world.hour,
        phase: world.phase,
        weather: world.weather,
      });
      append(activeNpc.id, { role: 'assistant', content: opening, ts: Date.now() });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNpc?.id]);

  // Typewriter tick for the latest assistant message. We intentionally do not
  // put `revealed` in the dep array: we only want to (re)start the interval
  // when a new message arrives, otherwise every 18 ms update would thrash the
  // effect. The interval stops itself when fully revealed.
  useEffect(() => {
    if (lastAssistantIdx < 0) return;
    const msg = messages[lastAssistantIdx];
    if (!msg) return;
    const id = window.setInterval(() => {
      setRevealed((prev) => {
        const cur = prev[lastAssistantIdx] ?? 0;
        if (cur >= msg.content.length) {
          window.clearInterval(id);
          return prev;
        }
        const next = Math.min(msg.content.length, cur + 2);
        return { ...prev, [lastAssistantIdx]: next };
      });
    }, 18);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastAssistantIdx, messages[lastAssistantIdx]?.content]);

  // Click on latest bubble skips the typewriter.
  function skipTypewriter() {
    if (lastAssistantIdx < 0) return;
    const msg = messages[lastAssistantIdx];
    if (!msg) return;
    setRevealed((prev) => ({ ...prev, [lastAssistantIdx]: msg.content.length }));
  }

  // Auto-scroll to newest message.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, pending, revealed]);

  // Hotkeys: E opens dialog when close; Esc closes; Ctrl/Cmd+R resets conversation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyE' && !e.repeat && nearby && !dialogOpenFor) {
        releaseMouse();
        openDialog(nearby.id);
      } else if (e.code === 'Escape' && dialogOpenFor) {
        closeDialog();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'r' && dialogOpenFor) {
        e.preventDefault();
        if (activeNpc) {
          // Reset conversation
          useNPC.setState((s) => ({ history: { ...s.history, [activeNpc.id]: [] } }));
          setRevealed({});
          const prof = getTerrainAdaptedProfile(activeNpc.kind);
          const opening = contextualOpening(prof, activeNpc.kind, activeNpc.cx, activeNpc.cz, {
            hour: world.hour,
            phase: world.phase,
            weather: world.weather,
          });
          append(activeNpc.id, { role: 'assistant', content: opening, ts: Date.now() });
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [nearby, dialogOpenFor, openDialog, closeDialog, activeNpc, append]);

  function giveMemento() {
    if (!activeNpc || !profile || hasMemento) return;
    const m = pickMemento(activeNpc.kind, activeNpc.id, profile.name, activeNpc.cx, activeNpc.cz);
    addMemento(m);
    const text = `Prendi. *${m.title}*: ${m.description}`;
    append(activeNpc.id, { role: 'assistant', content: text, ts: Date.now() });
  }

  async function sendMessage() {
    if (!activeNpc || !profile) return;
    const trimmed = draft.trim();
    if (!trimmed || pending) return;
    setDraft('');
    setError(null);
    const userMsg: ChatMessage = { role: 'user', content: trimmed, ts: Date.now() };
    append(activeNpc.id, userMsg);
    setPending(true);
    try {
      const pp = playerRef.current.position;
      // Richer context: mood, how many times the player met this archetype,
      // and mementos already received from ANY NPC of this kind.
      const kindEncounters = encounters[activeNpc.kind] ?? 0;
      const fromThisKind = mementos.filter((m) => m.fromKind === activeNpc.kind).map((m) => m.title);
      const extraCtx = [
        buildWorldContext(pp.x, pp.z),
        `umore ${mood}`,
        `incontri precedenti con ${activeNpc.kind}: ${Math.max(0, kindEncounters - 1)}`,
        fromThisKind.length ? `ricordi gia ricevuti: ${fromThisKind.join(', ')}` : '',
      ]
        .filter(Boolean)
        .join('; ');
      const res = await fetch('/api/npc-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          persona: profile.persona,
          context: extraCtx,
          history: [...messages, userMsg].map((m) => ({ role: m.role, content: m.content })),
          message: trimmed,
        }),
      });
      const data = await res.json().catch(() => ({} as { reply?: string; error?: string }));
      if (!res.ok || !data.reply) {
        setError(data?.error ?? 'errore rete');
        return;
      }
      append(activeNpc.id, { role: 'assistant', content: String(data.reply), ts: Date.now() });
    } catch (err) {
      setError((err as Error)?.message ?? 'errore rete');
    } finally {
      setPending(false);
    }
  }

  // Prompt "Interagisci" shown whenever near an NPC and no dialog open. Visible
  // regardless of pointer-lock so it also works in touch/mouse-free setups.
  const showPrompt = !!nearby && !dialogOpenFor;

  return (
    <>
      {showPrompt && nearby && (
        <div className="npc-prompt">
          <div className="npc-prompt-title">
            <strong>{getTerrainAdaptedProfile(nearby.kind).name}</strong>
            <span>· premi <kbd>E</kbd> per interagire</span>
          </div>
          <button
            type="button"
            className="npc-interact-btn"
            onClick={(e) => {
              e.stopPropagation();
              releaseMouse();
              openDialog(nearby.id);
            }}
          >
            Interagisci
          </button>
        </div>
      )}
      {activeNpc && profile && (
        <div className="npc-dialog-overlay" onClick={() => closeDialog()}>
          <div
            className="npc-dialog"
            onClick={(e) => e.stopPropagation()}
            style={{ borderColor: `${profile.accent}66` }}
          >
            <div className="npc-dialog-head">
              <div style={{ minWidth: 0 }}>
                <div className="npc-dialog-name" style={{ color: profile.accent }}>
                  <span
                    className="npc-mood"
                    title={`Umore: ${moodMeta.label}`}
                    style={{ color: moodMeta.color, borderColor: `${moodMeta.color}55` }}
                  >
                    {moodMeta.icon}
                  </span>
                  {profile.name}
                  <span className="npc-tagline">· {profile.tagline}</span>
                  {(encounters[activeNpc.kind] ?? 0) > 1 && (
                    <span className="npc-encounter" title="Incontri precedenti">
                      ×{encounters[activeNpc.kind]}
                    </span>
                  )}
                </div>
                <div className="npc-dialog-role">{profile.persona}</div>
              </div>
              <button className="npc-close" onClick={() => closeDialog()}>✕</button>
            </div>

            {/* Quick topic chips (dynamic by context) */}
            <div className="npc-topics">
              {topics.map((topic) => (
                <button
                  key={topic}
                  className="npc-topic-chip"
                  onClick={() => {
                    setDraft(topic);
                    setTimeout(() => {
                      const input = document.querySelector('.npc-input') as HTMLInputElement;
                      input?.focus();
                    }, 0);
                  }}
                  disabled={pending}
                >
                  {topic}
                </button>
              ))}
            </div>

            <div className="npc-messages" ref={scrollRef} onClick={skipTypewriter}>
              {messages.map((m, i) => {
                const isLast = i === lastAssistantIdx;
                const shown = isLast
                  ? m.content.slice(0, revealed[i] ?? 0)
                  : m.content;
                const caret = isLast && (revealed[i] ?? 0) < m.content.length;
                return (
                  <div key={i} className={`npc-msg npc-msg-${m.role}`}>
                    {shown}
                    {caret && <span className="npc-caret">▌</span>}
                  </div>
                );
              })}
              {pending && <div className="npc-msg npc-msg-assistant npc-typing">…</div>}
              {error && <div className="npc-msg npc-msg-error">Errore: {error}</div>}
            </div>
            <form
              className="npc-input-row"
              onSubmit={(e) => {
                e.preventDefault();
                sendMessage();
              }}
            >
              <input
                className="npc-input"
                autoFocus
                placeholder="Cosa vuoi dire?"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={500}
                disabled={pending}
              />
              <button
                type="submit"
                className="npc-send"
                disabled={pending || !draft.trim()}
              >
                Invia
              </button>
            </form>
            <div className="npc-actions">
              <button
                type="button"
                className="npc-action"
                onClick={giveMemento}
                disabled={hasMemento || pending}
                title={hasMemento ? 'Hai gia un ricordo da questo incontro' : 'Ricevi un piccolo ricordo'}
              >
                {hasMemento ? 'Ricordo ricevuto' : 'Chiedi un ricordo'}
              </button>
              <button
                type="button"
                className="npc-action"
                onClick={() => { closeDialog(); openMementos(); }}
                title="Apri i ricordi raccolti"
              >
                Ricordi ({mementos.length})
              </button>
            </div>
            <div className="npc-footer">
              <button
                className="npc-reset"
                onClick={() => {
                  if (!activeNpc) return;
                  useNPC.setState((s) => ({
                    history: { ...s.history, [activeNpc.id]: [] },
                  }));
                  setRevealed({});
                  const opening = contextualOpening(profile, activeNpc.kind, activeNpc.cx, activeNpc.cz, {
                    hour: world.hour,
                    phase: world.phase,
                    weather: world.weather,
                  });
                  append(activeNpc.id, { role: 'assistant', content: opening, ts: Date.now() });
                }}
              >
                Nuova conversazione
              </button>
              <div className="npc-hint">Esc per chiudere · Ctrl+R nuova · clic per saltare</div>
            </div>
          </div>
        </div>
      )}
      <MementosPanel />
    </>
  );
}

/** Persistent mementos list — opens from the dialog or future HUD shortcut. */
function MementosPanel() {
  const open = useNPC((s) => s.mementosOpen);
  const close = useNPC((s) => s.closeMementos);
  const mementos = useNPC((s) => s.mementos);
  if (!open) return null;
  return (
    <div className="npc-dialog-overlay" onClick={close}>
      <div className="npc-dialog" onClick={(e) => e.stopPropagation()} style={{ borderColor: '#8fc26a66' }}>
        <div className="npc-dialog-head">
          <div>
            <div className="npc-dialog-name" style={{ color: '#8fc26a' }}>
              Ricordi
              <span className="npc-tagline">· incontri che hai fatto</span>
            </div>
            <div className="npc-dialog-role">Piccoli oggetti o frasi che gli NPC ti hanno lasciato.</div>
          </div>
          <button className="npc-close" onClick={close}>✕</button>
        </div>
        <div className="npc-messages">
          {mementos.length === 0 && (
            <div className="npc-msg npc-msg-assistant">Nessun ricordo per ora. Prova a chiederne uno a un personaggio.</div>
          )}
          {mementos.map((m) => (
            <div key={m.id} className="npc-memento">
              <div className="npc-memento-title">{m.title}</div>
              <div className="npc-memento-from">da {m.fromName}</div>
              <div className="npc-memento-desc">{m.description}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
