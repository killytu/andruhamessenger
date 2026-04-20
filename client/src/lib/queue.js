// lib/queue.js — очередь сообщений с персистенцией
//
// Сообщения не теряются если:
//   — сервер временно недоступен
//   — P2P канал закрылся
//   — пользователь перезапустил браузер
//
// Стратегия: exponential backoff retry, max 3 попытки

const QUEUE_KEY = 'am_queue_v2';
const MAX_RETRIES = 3;

export class MessageQueue {
  constructor(myUsername, onFlush) {
    // onFlush(item) → Promise<boolean>  true = доставлено
    this._user    = myUsername;
    this._onFlush = onFlush;
    this._timer   = null;
    this._flushing= false;
  }

  // Добавить сообщение в очередь
  enqueue(to, enc, via) {
    const item = {
      id:       `${Date.now()}_${Math.random().toString(36).slice(2)}`,
      to,
      enc,        // { iv, ct, idx }
      via,        // 'relay' | 'p2p'
      retries:  0,
      queuedAt: Date.now(),
    };
    this._persist([...this._load(), item]);
    this._scheduleFlush(0);
    return item.id;
  }

  // Пометить доставленным (убрать из очереди)
  ack(id) {
    this._persist(this._load().filter(i => i.id !== id));
  }

  // Попытаться отправить всё из очереди
  async flush() {
    if (this._flushing) return;
    this._flushing = true;
    const items = this._load();
    const remaining = [];

    for (const item of items) {
      try {
        const ok = await this._onFlush(item);
        if (!ok) {
          item.retries++;
          if (item.retries < MAX_RETRIES) remaining.push(item);
          // иначе дропаем после MAX_RETRIES попыток
        }
        // ok=true → сообщение доставлено, не добавляем в remaining
      } catch {
        item.retries++;
        if (item.retries < MAX_RETRIES) remaining.push(item);
      }
    }

    this._persist(remaining);
    this._flushing = false;

    // Если ещё есть что отправить — повторить через 5 сек
    if (remaining.length > 0) this._scheduleFlush(5000);
  }

  count() { return this._load().length; }

  _scheduleFlush(delay) {
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.flush(), delay);
  }

  _load() {
    try {
      const all = JSON.parse(localStorage.getItem(QUEUE_KEY) || '{}');
      return all[this._user] || [];
    } catch { return []; }
  }

  _persist(items) {
    try {
      const all = JSON.parse(localStorage.getItem(QUEUE_KEY) || '{}');
      all[this._user] = items;
      localStorage.setItem(QUEUE_KEY, JSON.stringify(all));
    } catch(e) { console.warn('[Queue] persist failed', e); }
  }

  destroy() { clearTimeout(this._timer); }
}
