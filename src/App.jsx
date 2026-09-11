import { useEffect, useMemo, useRef, useState } from 'react'
import { beginSpotifyLogin, clearSpotifySession, connectSpotifyPlayer, finishSpotifyLogin, getAccessToken, getSavedTracks, isSpotifyConnected, pauseSpotify, playSpotifyTrack, searchSpotify } from './spotify.js'

const demoTracks = [
  {
    id: 'demo-1',
    name: 'A quiet beginning',
    artist: 'Needle Demo',
    album: 'Needle Sessions',
    albumUrl: 'https://open.spotify.com',
    artwork: null,
    theme: ['#e27b54', '#281a2f', '#101018'],
  },
  {
    id: 'demo-2',
    name: 'Midnight City',
    artist: 'M83',
    album: 'Hurry Up, We’re Dreaming',
    albumUrl: 'https://open.spotify.com',
    artwork: null,
    theme: ['#b75a76', '#2a183b', '#101018'],
  },
  {
    id: 'demo-3',
    name: 'Nights',
    artist: 'Frank Ocean',
    album: 'Blonde',
    albumUrl: 'https://open.spotify.com',
    artwork: null,
    theme: ['#d2b59c', '#483a31', '#151217'],
  },
  {
    id: 'demo-4',
    name: 'Everything In Its Right Place',
    artist: 'Radiohead',
    album: 'Kid A',
    albumUrl: 'https://open.spotify.com',
    artwork: null,
    theme: ['#8498a4', '#29333c', '#101216'],
  },
]

function colorHazeFromArtwork(url, fallback) {
  if (!url) return Promise.resolve(fallback)
  return new Promise((resolve) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = 24
        const context = canvas.getContext('2d', { willReadFrequently: true })
        context.drawImage(image, 0, 0, 24, 24)
        const pixels = context.getImageData(0, 0, 24, 24).data
        const samples = []
        for (let i = 0; i < pixels.length; i += 4) {
          const r = pixels[i] / 255; const g = pixels[i + 1] / 255; const b = pixels[i + 2] / 255
          const max = Math.max(r, g, b); const min = Math.min(r, g, b)
          const saturation = max === 0 ? 0 : (max - min) / max
          const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
          if (luminance > 0.025 && luminance < 0.97) samples.push({ r, g, b, saturation, luminance })
        }
        if (!samples.length) return resolve(fallback)

        const distance = (a, b) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b)
        const ranked = [...samples].sort((a, b) => (b.saturation * .7 + b.luminance * .3) - (a.saturation * .7 + a.luminance * .3))
        const palette = [ranked[0]]
        for (const candidate of ranked.slice(1)) {
          if (palette.every((picked) => distance(candidate, picked) > .22)) palette.push(candidate)
          if (palette.length === 3) break
        }
        while (palette.length < 3) palette.push(samples[Math.floor(samples.length * palette.length / 3)])

        const rgb = (color, amount) => {
          const lift = (value) => Math.max(0, Math.min(255, Math.round(value * 255 * amount)))
          return `rgb(${lift(color.r)} ${lift(color.g)} ${lift(color.b)})`
        }
        // Keep the background abstract: only a few sampled colors are used,
        // never the artwork pixels themselves.
        resolve([
          rgb(palette[0], 0.92),
          rgb(palette[1], 0.55),
          rgb(palette[2], 0.16),
        ])
      } catch { resolve(fallback) }
    }
    image.onerror = () => resolve(fallback)
    image.src = url
  })
}
function Artwork({ track, className = '' }) {
  return track.artwork ? (
    <img className={className} src={track.artwork} alt={`${track.album} album artwork`} draggable="false" />
  ) : (
    <span className={`${className} artwork-placeholder`} aria-hidden="true" />
  )
}

export default function App() {
  const [tracks, setTracks] = useState(demoTracks)
  const [spotifyConnected, setSpotifyConnected] = useState(isSpotifyConnected())
  const [spotifyBusy, setSpotifyBusy] = useState(false)
  const [spotifyError, setSpotifyError] = useState('')
  const [searchBusy, setSearchBusy] = useState(false)
  const [selectedTrack, setSelectedTrack] = useState(demoTracks[0])
  const [isPlaying, setIsPlaying] = useState(false)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [haze, setHaze] = useState(demoTracks[0].theme)
  const [dragging, setDragging] = useState(false)
  const [armAngle, setArmAngle] = useState(-8)
  const turntableRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    finishSpotifyLogin()
      .then(async (didFinish) => {
        if (cancelled) return
        if (didFinish) setSpotifyConnected(true)
        const token = await getAccessToken()
        if (token) {
          try {
            await connectSpotifyPlayer((state) => {
              if (!state) return
              const current = state.track_window?.current_track
              if (current) {
                setSelectedTrack((previous) => ({
                  ...previous,
                  id: current.id,
                  spotifyId: current.id,
                  name: current.name,
                  artist: current.artists?.map((artist) => artist.name).join(', ') || previous.artist,
                  album: current.album?.name || previous.album,
                  artwork: current.album?.images?.[0]?.url || previous.artwork,
                  albumUrl: current.album?.external_urls?.spotify || previous.albumUrl,
                  uri: current.uri,
                }))
              }
            })
          } catch (error) {
            console.error(error)
          }
        }
      })
      .catch((error) => {
        if (!cancelled) setSpotifyError(error.message)
      })
    return () => { cancelled = true }
  }, [])

  const handleSpotifyLogin = async () => {
    setSpotifyError('')
    await beginSpotifyLogin()
  }

  const loadSpotifyLibrary = async () => {
    setSpotifyError('')
    setSearchBusy(true)
    try {
      const saved = await getSavedTracks()
      setTracks(saved.length ? saved : demoTracks)
    } catch (error) {
      setSpotifyError(error.message)
    } finally {
      setSearchBusy(false)
    }
  }

  const handleSearch = async (value) => {
    setQuery(value)
    if (!spotifyConnected || !value.trim()) return
    setSearchBusy(true)
    setSpotifyError('')
    try {
      setTracks(await searchSpotify(value.trim()))
    } catch (error) {
      setSpotifyError(error.message)
    } finally {
      setSearchBusy(false)
    }
  }

  const handleSpotifyPlayback = async (shouldPlay) => {
    setSpotifyError('')
    if (!spotifyConnected) {
      await handleSpotifyLogin()
      return
    }
    setSpotifyBusy(true)
    try {
      if (shouldPlay) {
        await playSpotifyTrack(selectedTrack, (state) => {
          const current = state?.track_window?.current_track
          if (!current) return
          setSelectedTrack((previous) => ({
            ...previous,
            id: current.id,
            spotifyId: current.id,
            name: current.name,
            artist: current.artists?.map((artist) => artist.name).join(', ') || previous.artist,
            album: current.album?.name || previous.album,
            artwork: current.album?.images?.[0]?.url || previous.artwork,
            albumUrl: current.album?.external_urls?.spotify || previous.albumUrl,
            uri: current.uri,
          }))
        })
      } else {
        await pauseSpotify()
      }
      setIsPlaying(shouldPlay)
      setArmAngle(shouldPlay ? 17 : -8)
    } catch (error) {
      setIsPlaying(false)
      setArmAngle(-8)
      setSpotifyError(error.message)
    } finally {
      setSpotifyBusy(false)
    }
  }

  const filteredTracks = useMemo(() => {
    const value = query.trim().toLowerCase()
    if (!value) return tracks
    return tracks.filter((track) => `${track.name} ${track.artist} ${track.album}`.toLowerCase().includes(value))
  }, [query, tracks])

  const selectTrack = (track) => {
    setSelectedTrack(track)
    setIsPlaying(false)
    setArmAngle(-8)
    setLibraryOpen(false)
    colorHazeFromArtwork(track.artwork, track.theme).then(setHaze)
  }

  const togglePlayback = () => {
    handleSpotifyPlayback(!isPlaying)
  }

  const updateArmFromPointer = (event) => {
    const bounds = turntableRef.current?.getBoundingClientRect()
    if (!bounds) return
    const x = event.clientX - (bounds.left + bounds.width * 0.5)
    const y = event.clientY - (bounds.top + bounds.height * 0.48)
    const distance = Math.hypot(x, y)
    const onRecord = distance < bounds.width * 0.24
    if (onRecord !== isPlaying && !spotifyBusy) handleSpotifyPlayback(onRecord)
  }

  const handlePointerMove = (event) => {
    if (!dragging) return
    updateArmFromPointer(event)
  }

  const handlePointerUp = () => {
    setDragging(false)
  }

  return (
    <main
      className="player"
      style={{ '--theme-a': haze[0], '--theme-b': haze[1], '--theme-c': haze[2] }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div className="ambient one" /><div className="ambient two" />

      <header className="topbar">
        <div className="wordmark">Needle</div>
        <button className="library" onClick={() => setLibraryOpen(true)} aria-label="Open Spotify library">
          <span aria-hidden="true">☰</span>
        </button>
      </header>

      <section className="turntable" ref={turntableRef} aria-label="Needle turntable">
        <div className="turntable-stage">
          <a
            className="album-sleeve"
            href={selectedTrack.albumUrl}
            target="_blank"
            rel="noreferrer"
            aria-label={`Open ${selectedTrack.album} in Spotify`}
          >
            <Artwork track={selectedTrack} />
            <div className="sleeve-sheen" aria-hidden="true" />
          </a>

          <div className="record" aria-label={`${selectedTrack.name} by ${selectedTrack.artist}`}>
            <div className={isPlaying ? 'record-rotor spinning' : 'record-rotor'}>
              <div className="record-grooves" aria-hidden="true" />
              <div className="record-waves" aria-hidden="true"><span /><span /><span /></div>
              <div className="groove first" /><div className="groove second" />
              <a
                className="label"
                href={selectedTrack.albumUrl}
                target="_blank"
                rel="noreferrer"
                aria-label={`Open ${selectedTrack.album} in Spotify`}
              >
                <Artwork track={selectedTrack} />
              </a>
              <div className="spindle" />
            </div>
            <div className="record-shine" aria-hidden="true" />
            <div className="record-edge" aria-hidden="true" />
          </div>

          <div className={`tonearm-wrap ${dragging ? 'dragging' : ''}`} style={{ '--arm-angle': `${armAngle}deg` }}>
            <button
              className="tonearm-trigger"
              onClick={togglePlayback}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId)
                setDragging(true)
              }}
              aria-label={isPlaying ? `Lift arm to pause ${selectedTrack.name}` : `Lower arm to play ${selectedTrack.name}`}
            >
              <span className="tonearm-pivot" aria-hidden="true">
                <span className="pivot-ring" />
                <span className="pivot-cap" />
              </span>
              <span className="tonearm-rod" aria-hidden="true" />
              <span className="tonearm-collar" aria-hidden="true" />
              <span className="tonearm-head" aria-hidden="true">
                <span className="head-highlight" />
                <span className="stylus" />
              </span>
            </button>
          </div>
        </div>

      </section>

      <footer className="attribution">
        <span className="spotify-dot" /> Spotify
      </footer>

      {libraryOpen && (
        <div className="library-overlay" role="dialog" aria-modal="true" aria-label="Spotify library">
          <div className="library-panel">
            <div className="library-heading">
              <div>
                <p className="eyebrow">SPOTIFY LIBRARY</p>
                <h2>Choose a record</h2>
              </div>
              <button className="close-library" onClick={() => setLibraryOpen(false)} aria-label="Close library">×</button>
            </div>

            <label className="search-box">
              <span>⌕</span>
              <input autoFocus value={query} onChange={(event) => handleSearch(event.target.value)} placeholder={spotifyConnected ? 'Search Spotify' : 'Search songs, artists, albums'} />
            </label>

            {!spotifyConnected ? (
              <button className="spotify-connect" onClick={handleSpotifyLogin}>
                <span className="spotify-dot" /> Connect Spotify
              </button>
            ) : (
              <div className="spotify-actions">
                <button className="spotify-secondary" onClick={loadSpotifyLibrary} disabled={searchBusy}>
                  {searchBusy ? 'Loading…' : 'Your saved tracks'}
                </button>
                <button className="spotify-secondary" onClick={() => { clearSpotifySession(); setSpotifyConnected(false); setTracks(demoTracks); setQuery('') }}>
                  Disconnect
                </button>
              </div>
            )}

            {spotifyError && <p className="spotify-error">{spotifyError}</p>}

            <div className="track-list">
              {filteredTracks.map((track) => (
                <button className="track-row" key={track.id} onClick={() => selectTrack(track)}>
                  <div className="track-art"><Artwork track={track} /></div>
                  <div className="track-copy">
                    <strong>{track.name}</strong>
                    <span>{track.artist} · {track.album}</span>
                  </div>
                  {track.id === selectedTrack.id && <span className="selected-mark">●</span>}
                </button>
              ))}
              {!filteredTracks.length && <p className="empty-state">No matching tracks.</p>}
            </div>

            <div className="spotify-note">
              <span className="spotify-dot" />
              <span>{spotifyConnected ? 'Connected to Spotify. Select a track, then lower the tonearm to play it.' : 'Connect Spotify to search your library and play tracks through Needle.'}</span>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
