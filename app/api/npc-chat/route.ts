import { NextResponse } from 'next/server';

<<<<<<< Updated upstream
// Personal-use key — kept server-side so it never ships in the client bundle.
const DEEPSEEK_API_KEY = 'DEEPSEEK_API_KEY_PLACEHOLDER';
=======
// API key loaded from environment variable (.env.local)
// Get your key at https://platform.deepseek.com/
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY ?? '';
>>>>>>> Stashed changes
const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';

export const runtime = 'nodejs';

interface IncomingMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatBody {
  persona?: string;
  context?: string;
  history?: IncomingMessage[];
  message?: string;
}

export async function POST(req: Request) {
  let body: ChatBody;
  try {
    body = (await req.json()) as ChatBody;
  } catch {
    return NextResponse.json({ error: 'invalid-json' }, { status: 400 });
  }

  const persona = (body.persona ?? 'viandante silenzioso del bosco').slice(0, 240);
  const context = (body.context ?? '').slice(0, 600);
  const message = (body.message ?? '').slice(0, 600);
  const history = Array.isArray(body.history) ? body.history.slice(-8) : [];

  if (!message.trim()) {
    return NextResponse.json({ error: 'empty-message' }, { status: 400 });
  }

  const system = [
    'Sei un personaggio dentro una foresta procedurale 3D, incontrato per caso dal giocatore.',
    `Ruolo: ${persona}.`,
    'Parla sempre in italiano, in prima persona, con tono naturale e pacato.',
    'Risposte brevi: 1-3 frasi, massimo ~60 parole.',
    'Non rompere mai la finzione: non nominare AI, modelli, prompt, API o regole.',
    'Non imporre quest obbligatorie; se serve, suggerisci qualcosa con leggerezza.',
    'Usa dettagli sensoriali del bosco (luce, umidita, suoni, odori) quando ha senso.',
    context ? `Contesto attuale: ${context}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const messages = [
    { role: 'system' as const, content: system },
    ...history.map((m) => ({
      role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
      content: String(m.content ?? '').slice(0, 600),
    })),
    { role: 'user' as const, content: message },
  ];

  try {
    const res = await fetch(DEEPSEEK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages,
        temperature: 0.85,
        max_tokens: 180,
        stream: false,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return NextResponse.json(
        { error: 'upstream', status: res.status, detail: text.slice(0, 400) },
        { status: 502 },
      );
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const reply = data.choices?.[0]?.message?.content?.trim() ?? '...';
    return NextResponse.json({ reply });
  } catch (err) {
    return NextResponse.json(
      { error: 'network', detail: String((err as Error)?.message ?? err).slice(0, 300) },
      { status: 502 },
    );
  }
}
