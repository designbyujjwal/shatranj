// The duel server keeps the courier invite rooms and links the two players of a live duel. It usually runs
// beside the game, but the game can also be served on its own (GitHub Pages) with the server elsewhere.
const configured = import.meta.env.VITE_DUEL_SERVER?.replace(/\/$/, '');

/** Address of one of the duel server's HTTP endpoints, e.g. duelApiUrl('/api/room/x'). */
export const duelApiUrl = (path: string) => (configured ? configured + path : path);

/** Address of the duel server's live connection. */
export const duelSocketUrl = () => {
  if (configured) return configured.replace(/^http/, 'ws') + '/api/ws';
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/api/ws`;
};

/** A free server sleeps when nobody plays; this starts it waking as the game opens, so a duel finds it ready. */
export const wakeDuelServer = () => {
  if (!configured) return;
  fetch(duelApiUrl('/api/health'), { mode: 'no-cors' }).catch(() => {});
};
