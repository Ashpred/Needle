# Needle

An iPad-first React/PWA shell for a tactile Spotify companion player.

## Current interaction

- The app is designed for iPad landscape first.
- The record is the visual focus and its artwork is the current selected Spotify record.
- The tonearm is the sole playback control on the turntable.
- Tap the tonearm to lower/lift it and toggle playback.
- Drag the tonearm: when the stylus is brought over the record, playback starts; moving it away pauses playback.
- There is no progress bar, bottom transport control, or persistent song-title panel on the turntable.
- The library button opens a separate selection/search surface. Selecting a track loads its artwork and metadata onto the turntable.

## Run it

1. Run `npm install`.
2. Run `npm run dev`.
3. Open the shown address in Safari on your iPad (use the same Wi-Fi network, and start Vite with `npm run dev -- --host` if needed).

## Spotify integration plan

The current library uses local demo records so the interaction can be developed without credentials. The intended live integration is:

- Use Spotify OAuth with PKCE. Never put a Spotify client secret in this browser app.
- Use Spotify Web API search/library endpoints to populate the library UI.
- Use the Web Playback SDK for playback and its player-state event to synchronize the turntable with Spotify.
- Map the selected Spotify track to the current record. The track's album artwork should come from `track.album.images[0]?.url`.
- Keep Spotify artwork unmodified. The artwork remains the original linked album image in the record label, and the library provides the accompanying track/artist/album metadata and Spotify attribution/link.
- The album-art link opens the matching Spotify item.

## Artwork use

Spotify supplies album artwork URLs in its track data. The app does not generate, recolor, blur, or edit the artwork itself. The ambient background can use a color analysis of the artwork, but that effect is kept outside the artwork image. Live Spotify artwork and metadata should be wired into the same `selectedTrack` shape used by the demo library.

## Next integration boundary

Replace `demoTracks` and the demo selection logic with:

1. PKCE login/session handling.
2. Spotify search + saved library/playlist retrieval.
3. Web Playback SDK initialization and device/player-state handling.
4. `selectedTrack` updates from Spotify player state.
5. Arm movement as the UI layer over the SDK's `play`, `pause`, and queue/track-selection operations.


## Turntable interaction

- The tonearm is recreated entirely with CSS/HTML so its edges stay crisp on iPad displays.
- Raised arm = paused; lowered arm = playing.
- The record visibly rotates continuously while playback is active and stops when paused.
- Tap the arm to toggle playback, or drag it over the record to set the playback state.
- The previous bottom transport/progress metadata UI has been removed.
- When no Spotify artwork is available, the record label is intentionally blank rather than showing placeholder text.

## Spotify integration

Needle uses Spotify Authorization Code with PKCE in the browser and the Web Playback SDK. The production callback is:

`https://needlevinyl.vercel.app/callback`

No Spotify Client Secret belongs in this repository or in Vercel's frontend environment. The Client ID is public. The Web Playback SDK requires Spotify Premium, and Spotify's current developer policy includes restrictions on synchronizing Spotify audio with visual media.

The record animation is intentionally set to **5 seconds per rotation** in the current UI build.
