# Needle

An iPad-first React/PWA shell for a tactile Spotify companion player.

## Run it

1. Run `npm install`.
2. Run `npm run dev`.
3. Open the shown address in Safari on your iPad (use the same Wi-Fi network, and start Vite with `npm run dev -- --host` if needed).

## Spotify integration plan

- Use Spotify OAuth with PKCE. Never put a Spotify client secret in this browser app.
- Use the Web Playback SDK for playback and its player-state event to replace the `demoTrack` object in `src/App.jsx`.
- Set `artwork` to `track.album.images[0]?.url`; it is rendered as the original, linked album image in the record label.
- Set `theme` from a stable hash of the Spotify track ID (or artist/album ID). This makes the background change per song without editing, cropping, or blurring Spotify artwork.

## Artwork use

Spotify supplies album artwork URLs in its track data, at no extra API charge. Its rules require the artwork to remain unmodified, accompanied by metadata, attributed to Spotify, and linked back to the matching Spotify item. This starter preserves that intended use.
