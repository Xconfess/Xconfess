# Feed screen-reader announcements

The public feed exposes one polite live region
(`app/components/confession/ConfessionFeed.tsx`). It announces state changes
only:

- `Loading feed...`, `Updating feed contents...`, and
  `Loading more confessions...` while requests are in flight.
- `0 confessions found.`, `1 confession available.`, or
  `N confessions available.` when a load or refresh finishes.
- `Unable to load feed.` on failure.

Confession bodies, author names, raw URLs, query strings, and backend error
messages are never copied into the live region. No configuration is required;
the announcements derive from the existing feed query state and loaded result
count.

Coverage lives in `useLiveAnnouncement.test.ts` and `ConfessionFeed.test.tsx`,
including an axe accessibility check.
