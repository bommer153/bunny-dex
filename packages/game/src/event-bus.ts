type Handler = (payload: Record<string, unknown>) => void | Promise<void>;

const handlers = new Map<string, Handler[]>();

export const EventBus = {
  on(event: string, handler: Handler) {
    const list = handlers.get(event) ?? [];
    list.push(handler);
    handlers.set(event, list);
  },
  async emit(event: string, payload: Record<string, unknown> = {}) {
    const list = handlers.get(event) ?? [];
    for (const handler of list) {
      await handler(payload);
    }
  },
};
