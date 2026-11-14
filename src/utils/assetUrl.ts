/** A file from public/, wherever the game is served from: the site root, or a sub-path such as GitHub Pages' /shatranj/. */
export const assetUrl = (path: string) => import.meta.env.BASE_URL + path.replace(/^\//, '');
