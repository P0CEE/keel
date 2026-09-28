/**
 * This tab's identity, sent with every tRPC request (`x-client-id`). The
 * events a tab's own writes cause come back tagged with it, and the tab
 * skips them: its optimistic update already shows the result.
 */
export const clientId: string = crypto.randomUUID();
