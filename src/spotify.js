const CLIENT_ID = '9408abedbe2f40ca928dfe453000452d'
const REDIRECT_URI = 'https://needlevinyl.vercel.app/callback'
const TOKEN_KEY = 'needle_spotify_token'
const VERIFIER_KEY = 'needle_spotify_verifier'
const STATE_KEY = 'needle_spotify_state'

export const SPOTIFY_SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-library-read',
].join(' ')

function randomString(length = 64) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
  const values = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(values, (value) => chars[value % chars.length]).join('')
}

async function sha256(value) {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
}

function base64url(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

function saveToken(token) {
  localStorage.setItem(TOKEN_KEY, JSON.stringify({
    ...token,
    expires_at: Date.now() + token.expires_in * 1000,
  }))
}

function readToken() {
  try {
    return JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null')
  } catch {
    return null
  }
}

export function isSpotifyConnected() {
  const token = readToken()
  return Boolean(token?.access_token)
}

export function clearSpotifySession() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(VERIFIER_KEY)
  localStorage.removeItem(STATE_KEY)
}

export async function beginSpotifyLogin() {
  const verifier = randomString(64)
  const challenge = base64url(await sha256(verifier))
  const state = randomString(32)
  localStorage.setItem(VERIFIER_KEY, verifier)
  localStorage.setItem(STATE_KEY, state)

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    scope: SPOTIFY_SCOPES,
    redirect_uri: REDIRECT_URI,
    state,
    code_challenge_method: 'S256',
    code_challenge: challenge,
  })

  window.location.assign(`https://accounts.spotify.com/authorize?${params}`)
}

export async function finishSpotifyLogin() {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  const returnedState = params.get('state')
  const error = params.get('error')

  if (!code && !error) return false
  if (error) throw new Error(`Spotify authorization failed: ${error}`)

  const expectedState = localStorage.getItem(STATE_KEY)
  if (!returnedState || returnedState !== expectedState) {
    throw new Error('Spotify authorization state did not match.')
  }

  const verifier = localStorage.getItem(VERIFIER_KEY)
  if (!verifier) throw new Error('Spotify PKCE verifier is missing. Please sign in again.')

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
    }),
  })

  const token = await response.json()
  if (!response.ok) throw new Error(token.error_description || 'Spotify token exchange failed.')

  saveToken(token)
  localStorage.removeItem(VERIFIER_KEY)
  localStorage.removeItem(STATE_KEY)
  window.history.replaceState({}, document.title, window.location.pathname)
  return true
}

async function refreshToken(token) {
  if (!token?.refresh_token) return null
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: token.refresh_token,
    }),
  })
  const refreshed = await response.json()
  if (!response.ok) {
    clearSpotifySession()
    return null
  }
  saveToken({ ...refreshed, refresh_token: refreshed.refresh_token || token.refresh_token })
  return readToken()
}

export async function getAccessToken() {
  let token = readToken()
  if (!token) return null
  if (token.expires_at && token.expires_at > Date.now() + 60_000) return token.access_token
  token = await refreshToken(token)
  return token?.access_token || null
}

export async function spotifyFetch(path, options = {}) {
  let accessToken = await getAccessToken()
  if (!accessToken) throw new Error('Spotify is not connected.')

  const request = () => fetch(`https://api.spotify.com/v1${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
      Authorization: `Bearer ${accessToken}`,
    },
  })

  let response = await request()
  if (response.status === 401) {
    const token = readToken()
    const refreshed = await refreshToken(token)
    accessToken = refreshed?.access_token
    if (!accessToken) throw new Error('Spotify session expired. Please sign in again.')
    response = await request()
  }

  if (!response.ok) {
    let message = `Spotify request failed (${response.status}).`
    try {
      const body = await response.json()
      message = body?.error?.message || message
    } catch {}
    throw new Error(message)
  }

  if (response.status === 204) return null
  return response.json()
}

export async function searchSpotify(query) {
  const params = new URLSearchParams({ q: query, type: 'track,album', limit: '20' })
  const data = await spotifyFetch(`/search?${params}`)
  const tracks = (data.tracks?.items || []).map(normalizeTrack)
  const albums = (data.albums?.items || []).map((album) => ({
    id: `album-${album.id}`,
    spotifyId: album.id,
    type: 'album',
    name: album.name,
    artist: album.artists?.map((artist) => artist.name).join(', ') || 'Unknown artist',
    album: album.name,
    albumUrl: album.external_urls?.spotify || `https://open.spotify.com/album/${album.id}`,
    artwork: album.images?.[0]?.url || null,
    theme: ['#5f5662', '#241d2a', '#0e0e12'],
    albumUri: album.uri,
  }))
  return [...tracks, ...albums]
}

export async function getSavedTracks() {
  const data = await spotifyFetch('/me/tracks?limit=50')
  return (data.items || []).map((item) => normalizeTrack(item.track))
}

function normalizeTrack(track) {
  return {
    id: track.id,
    spotifyId: track.id,
    type: 'track',
    name: track.name,
    artist: track.artists?.map((artist) => artist.name).join(', ') || 'Unknown artist',
    album: track.album?.name || 'Unknown album',
    albumUrl: track.album?.external_urls?.spotify || track.external_urls?.spotify || `https://open.spotify.com/track/${track.id}`,
    artwork: track.album?.images?.[0]?.url || null,
    theme: ['#5f5662', '#241d2a', '#0e0e12'],
    uri: track.uri,
    albumUri: track.album?.uri,
  }
}

let sdkPromise
let playerPromise
let spotifyPlayer
let spotifyDeviceId

function loadSpotifySdk() {
  if (window.Spotify) return Promise.resolve()
  if (sdkPromise) return sdkPromise
  sdkPromise = new Promise((resolve, reject) => {
    const previous = window.onSpotifyWebPlaybackSDKReady
    window.onSpotifyWebPlaybackSDKReady = () => {
      previous?.()
      resolve()
    }
    const script = document.createElement('script')
    script.src = 'https://sdk.scdn.co/spotify-player.js'
    script.async = true
    script.onerror = () => reject(new Error('Could not load the Spotify Web Playback SDK.'))
    document.body.appendChild(script)
  })
  return sdkPromise
}

export async function getSpotifyPlayer(onStateChange) {
  if (playerPromise) return playerPromise
  playerPromise = (async () => {
    const token = await getAccessToken()
    if (!token) throw new Error('Connect Spotify before starting playback.')
    await loadSpotifySdk()

    spotifyPlayer = new window.Spotify.Player({
      name: 'Needle',
      volume: 0.75,
      getOAuthToken: async (cb) => cb(await getAccessToken()),
    })

    spotifyPlayer.addListener('ready', ({ device_id }) => {
      spotifyDeviceId = device_id
    })
    spotifyPlayer.addListener('not_ready', ({ device_id }) => {
      if (spotifyDeviceId === device_id) spotifyDeviceId = null
    })
    spotifyPlayer.addListener('player_state_changed', (state) => {
      onStateChange?.(state)
    })
    spotifyPlayer.addListener('initialization_error', ({ message }) => console.error(message))
    spotifyPlayer.addListener('authentication_error', ({ message }) => console.error(message))
    spotifyPlayer.addListener('account_error', ({ message }) => console.error(message))
    spotifyPlayer.addListener('playback_error', ({ message }) => console.error(message))

    const connected = await spotifyPlayer.connect()
    if (!connected) throw new Error('Needle could not connect to Spotify.')
    return spotifyPlayer
  })()

  try {
    return await playerPromise
  } catch (error) {
    playerPromise = null
    throw error
  }
}

export async function activateSpotifyPlayer(onStateChange) {
  const player = await getSpotifyPlayer(onStateChange)
  await player.activateElement()
  return player
}

export async function playSpotifyTrack(track, onStateChange) {
  if (!track?.uri) throw new Error('That item is not a playable Spotify track.')
  const player = await activateSpotifyPlayer(onStateChange)

  if (!spotifyDeviceId) {
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  if (!spotifyDeviceId) throw new Error('Needle is still connecting to Spotify. Try lowering the arm again.')

  await spotifyFetch('/me/player', {
    method: 'PUT',
    body: JSON.stringify({ device_ids: [spotifyDeviceId], play: false }),
  })
  await spotifyFetch(`/me/player/play?device_id=${encodeURIComponent(spotifyDeviceId)}`, {
    method: 'PUT',
    body: JSON.stringify({ uris: [track.uri] }),
  })
}

export async function pauseSpotify() {
  if (spotifyPlayer) return spotifyPlayer.pause()
  return spotifyFetch('/me/player/pause', { method: 'PUT' })
}

export async function connectSpotifyPlayer(onStateChange) {
  return getSpotifyPlayer(onStateChange)
}
