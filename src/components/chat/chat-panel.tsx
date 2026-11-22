'use client';

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Loader2, MessageSquare, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CAPTION } from '@/components/styles';
import { askChat } from '@/lib/chat/ask';

const SUGGESTION = 'What is my top 10 stock concentration?';

interface Turn {
  question: string;
  reply?: string;
  error?: string;
}

/** Header button that opens and closes the chat drawer. */
export function ChatToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <Button
      variant="ghost"
      data-chat="toggle"
      aria-expanded={open}
      onClick={onToggle}
      className="text-[13px] text-white hover:bg-slate-800 hover:text-white aria-expanded:bg-slate-800 aria-expanded:text-white"
    >
      <MessageSquare className="size-3.5 text-sky-400" aria-hidden />
      Ask AI
    </Button>
  );
}

/** One question and its answer, styled as a margin note with a colored left rule. */
function TurnView({ turn }: { turn: Turn }) {
  const pending = turn.reply === undefined && turn.error === undefined;
  return (
    <div className="space-y-1.5">
      <p className="text-xs leading-4 text-muted-foreground">{turn.question}</p>
      {pending && (
        <p className="flex items-center gap-1.5 pl-3 text-[13px] text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
          Thinking
        </p>
      )}
      {turn.reply !== undefined && (
        <p data-chat="answer" className="border-l-2 border-primary pl-3 text-[13px] leading-5 whitespace-pre-wrap text-foreground">
          {turn.reply}
        </p>
      )}
      {turn.error !== undefined && (
        <p data-chat="error" className="border-l-2 border-destructive pl-3 text-[13px] leading-5 text-destructive">
          {turn.error}
        </p>
      )}
    </div>
  );
}

interface ChatPanelProps {
  open: boolean;
  onClose: () => void;
  mergeShareClasses: boolean;
}

/** Right-docked chat drawer; session-only turns, each send posts only the question and merge flag. */
export function ChatPanel({ open, onClose, mergeShareClasses }: ChatPanelProps) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const pending = turns.some((t) => t.reply === undefined && t.error === undefined);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  /** Close the drawer and hand focus back to the toggle, since the closed panel is inert. */
  function close() {
    document.querySelector<HTMLElement>('[data-chat="toggle"]')?.focus();
    onClose();
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape' && !e.defaultPrevented) close();
  }

  async function send(question: string) {
    const q = question.trim();
    if (!q || pending) return;
    setText('');
    setTurns((ts) => [...ts, { question: q }]);
    const result = await askChat(q, mergeShareClasses);
    setTurns((ts) => ts.map((t, i) => (i === ts.length - 1 ? { ...t, ...result } : t)));
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    send(text);
  }

  return (
    <aside
      data-chat="panel"
      aria-label="Ask about this portfolio"
      aria-hidden={!open}
      inert={!open}
      onKeyDown={onKeyDown}
      className={`fixed top-14 right-0 bottom-0 z-40 flex w-full flex-col border-l bg-card shadow-[-4px_0_12px_-6px_rgb(15_23_42/0.15)] transition-transform duration-150 motion-reduce:transition-none sm:w-96 ${open ? 'translate-x-0' : 'translate-x-full'}`}
    >
      <div className="flex h-10 shrink-0 items-center justify-between border-b px-4">
        <h2 className="text-sm font-semibold">Ask about this portfolio</h2>
        <Button variant="ghost" size="icon-sm" aria-label="Close chat" onClick={close}>
          <X aria-hidden />
        </Button>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-3" aria-live="polite">
        {turns.length === 0 ? (
          <div className="space-y-3">
            <p className="text-[13px] leading-5 text-muted-foreground">
              Ask a question about your holdings, sectors or overlap.
            </p>
            <Button variant="outline" className="w-full justify-start text-[13px]" onClick={() => send(SUGGESTION)}>
              {SUGGESTION}
            </Button>
          </div>
        ) : (
          turns.map((t, i) => <TurnView key={i} turn={t} />)
        )}
      </div>
      <form onSubmit={submit} className="shrink-0 space-y-2 border-t px-4 py-3">
        <div className="flex gap-2">
          <Input
            ref={input}
            data-chat="input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Ask about your portfolio"
            maxLength={500}
            className="text-[13px]"
          />
          <Button type="submit" data-chat="send" disabled={!text.trim() || pending}>
            Send
          </Button>
        </div>
        <p className={CAPTION}>Answers come from the current analysis and may be wrong.</p>
      </form>
    </aside>
  );
}
