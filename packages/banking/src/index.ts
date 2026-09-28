/**
 * @keel/banking: the application modules of the banking domain (02-domain.md,
 * section 3). Each is a deep module behind a small interface that loads,
 * decides with @keel/finance, writes in one `withScope` transaction, emits
 * its realtime events and plans the follow-up through the `Dispatch` port.
 * Tested through those interfaces on PGlite. Filled from lot 2 onwards.
 */
export {};
