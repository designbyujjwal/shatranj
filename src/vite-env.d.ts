/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Origin of the duel server (invite rooms and the live duel link) when the game is served from elsewhere,
   *  e.g. https://playshatranj.onrender.com for the GitHub Pages build. Unset: the page's own origin. */
  readonly VITE_DUEL_SERVER?: string;
}
