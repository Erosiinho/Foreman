export interface TelegramConfig {
    botToken: string;
    chatId: string;
}

export type Notifier = (text: string) => Promise<void>;

/**
 * End-of-task notification with a link to the generated PR. Plain text (no parse_mode): task
 * titles/error messages are free-form and shouldn't need HTML-escaping to render safely. A missing
 * config makes this a no-op rather than a hard dependency — Telegram is a nice-to-have, not
 * something that should stop the worker from running tasks.
 */
export function createNotifier(config: TelegramConfig | undefined): Notifier {
    if (!config) return async () => undefined;

    return async (text: string) => {
        try {
            const res = await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: config.chatId, text, disable_web_page_preview: false }),
            });
            if (!res.ok) console.error('[telegram] notify failed:', res.status, await res.text());
        } catch (err) {
            console.error('[telegram] notify error:', err);
        }
    };
}
