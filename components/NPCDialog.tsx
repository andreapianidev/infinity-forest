'use client';
import { useEffect, useRef, useState } from 'react';
import { NPC_PROFILES, useNPC, buildWorldContext, ChatMessage, openingFor, ActiveNPC, getTerrainAdaptedProfile } from '@/lib/npc';
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

  // Seed greeting when dialog opens with empty history.
  useEffect(() => {
    if (!activeNpc || !profile) return;
    const list = history[activeNpc.id] ?? [];
    if (list.length === 0) {
      // Deterministic opening based on chunk location
      const opening = openingFor(profile, activeNpc.cx, activeNpc.cz);
      append(activeNpc.id, { role: 'assistant', content: opening, ts: Date.now() });
    }
  }, [activeNpc, profile, append, history]);

  // Auto-scroll to newest message.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, pending]);

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
          useNPC.getState().history[activeNpc.id] = [];
          useNPC.setState({ history: { ...useNPC.getState().history } });
          const profile = getTerrainAdaptedProfile(activeNpc.kind);
          const opening = openingFor(profile, activeNpc.cx, activeNpc.cz);
          append(activeNpc.id, { role: 'assistant', content: opening, ts: Date.now() });
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [nearby, dialogOpenFor, openDialog, closeDialog, activeNpc, append]);

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
      const res = await fetch('/api/npc-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          persona: profile.persona,
          context: buildWorldContext(pp.x, pp.z),
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

  // Prompt "Interagisci" is shown only when pointer is locked, near NPC, not in dialog.
  const showPrompt =
    !!nearby &&
    !dialogOpenFor &&
    typeof document !== 'undefined' &&
    !!document.pointerLockElement;

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
              <div>
                <div className="npc-dialog-name" style={{ color: profile.accent }}>
                  {profile.name}
                  <span className="npc-tagline">· {profile.tagline}</span>
                </div>
                <div className="npc-dialog-role">{profile.persona}</div>
              </div>
              <button className="npc-close" onClick={() => closeDialog()}>✕</button>
            </div>

            {/* Quick topic chips */}
            <div className="npc-topics">
              {profile.topics.map((topic) => (
                <button
                  key={topic}
                  className="npc-topic-chip"
                  onClick={() => {
                    setDraft(topic);
                    // Focus input after selection
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

            <div className="npc-messages" ref={scrollRef}>
              {messages.map((m, i) => (
                <div key={i} className={`npc-msg npc-msg-${m.role}`}>
                  {m.content}
                </div>
              ))}
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
            <div className="npc-footer">
              <button
                className="npc-reset"
                onClick={() => {
                  if (!activeNpc) return;
                  useNPC.setState((s) => ({
                    history: { ...s.history, [activeNpc.id]: [] },
                  }));
                  const opening = openingFor(profile, activeNpc.cx, activeNpc.cz);
                  append(activeNpc.id, { role: 'assistant', content: opening, ts: Date.now() });
                }}
              >
                Nuova conversazione
              </button>
              <div className="npc-hint">Esc per chiudere · Ctrl+R per nuova conversazione</div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
