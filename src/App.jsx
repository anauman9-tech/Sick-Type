import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

const WORD_BANK = [
  'velocity', 'orbital', 'future', 'design', 'motion', 'silicon', 'signal', 'focus', 'syntax',
  'matrix', 'vector', 'glimmer', 'oxygen', 'neural', 'echo', 'pixel', 'horizon', 'fusion',
  'quantum', 'ambient', 'circuit', 'spectrum', 'gravity', 'dynamic', 'sick', 'rhythm', 'style',
  'hyper', 'smooth', 'aura',
]
const MODES = [30, 60, 120]
const VIEWS = ['social', 'leaderboards']
const USERS_KEY = 'sicktype.users'
const SESSIONS_KEY = 'sicktype.sessions'
const ACTIVE_USER_KEY = 'sicktype.activeUser'
const THEME_KEY = 'sicktype.theme'
const ADSENSE_CLIENT = 'ca-pub-1868198307031706'
const ADSENSE_RESULT_SLOT = import.meta.env.VITE_ADSENSE_RESULT_SLOT || '2218296380'

function makeWords(length = 70, allowNumbers = false, allowPunctuation = false) {
  const source = [...WORD_BANK]
  if (allowNumbers) source.push('2026', '404', '777', '12345')
  if (allowPunctuation) source.push('focus,', 'style.', 'smooth!', 'glow?')
  return Array.from({ length }, () => source[Math.floor(Math.random() * source.length)]).join(' ')
}

function loadJSON(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || '') ?? fallback
  } catch {
    return fallback
  }
}

function safeId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export default function App() {
  const [view, setView] = useState('leaderboards')
  const [mode, setMode] = useState(60)
  const [allowNumbers, setAllowNumbers] = useState(false)
  const [allowPunctuation, setAllowPunctuation] = useState(false)
  const [targetText, setTargetText] = useState(() => makeWords(70))
  const [input, setInput] = useState('')
  const [isActive, setIsActive] = useState(false)
  const [isFinished, setIsFinished] = useState(false)
  const [timeLeft, setTimeLeft] = useState(mode)
  const [focusMode, setFocusMode] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const [users, setUsers] = useState(() => loadJSON(USERS_KEY, []))
  const [sessions, setSessions] = useState(() => loadJSON(SESSIONS_KEY, []))
  const [activeUserId, setActiveUserId] = useState(() => localStorage.getItem(ACTIVE_USER_KEY) || '')
  const [usernameInput, setUsernameInput] = useState('')
  const [friendInput, setFriendInput] = useState('')
  const [roomCode, setRoomCode] = useState('')
  const [opponentState, setOpponentState] = useState(null)
  const [duelState, setDuelState] = useState('idle')
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_KEY) || 'light')
  const inputRef = useRef(null)
  const typingAreaRef = useRef(null)
  const channelRef = useRef(null)

  useEffect(() => {
    if (!isActive || isFinished) return undefined
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          setIsFinished(true)
          setIsActive(false)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [isActive, isFinished])

  useEffect(() => localStorage.setItem(USERS_KEY, JSON.stringify(users)), [users])
  useEffect(() => localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions)), [sessions])
  useEffect(() => {
    if (activeUserId) localStorage.setItem(ACTIVE_USER_KEY, activeUserId)
  }, [activeUserId])
  useEffect(() => localStorage.setItem(THEME_KEY, theme), [theme])

  useEffect(() => {
    channelRef.current = new BroadcastChannel('sicktype-live')
    channelRef.current.onmessage = (event) => {
      const payload = event.data
      if (!payload || payload.roomId !== roomCode || payload.userId === activeUserId) return
      setOpponentState(payload)
    }
    return () => channelRef.current?.close()
  }, [activeUserId, roomCode])

  const charsTyped = input.length
  const correctChars = useMemo(() => {
    let score = 0
    for (let i = 0; i < input.length; i += 1) if (input[i] === targetText[i]) score += 1
    return score
  }, [input, targetText])
  const elapsed = mode - timeLeft
  const wpm = elapsed > 0 ? Math.round((correctChars / 5 / elapsed) * 60) : 0
  const accuracy = charsTyped > 0 ? Math.round((correctChars / charsTyped) * 100) : 100
  const activeUser = users.find((user) => user.id === activeUserId) || null
  const friendIds = activeUser?.friends || []

  useEffect(() => {
    if (!roomCode || !isActive) return
    channelRef.current?.postMessage({
      roomId: roomCode,
      userId: activeUserId,
      username: activeUser?.name || 'anonymous',
      progress: targetText.length ? Math.min(100, Math.round((input.length / targetText.length) * 100)) : 0,
      wpm,
      accuracy,
      finished: isFinished,
    })
  }, [accuracy, activeUser?.name, activeUserId, input.length, isActive, isFinished, roomCode, targetText.length, wpm])

  useEffect(() => {
    if (!isFinished) return
    setShowResults(true)
    if (activeUserId) {
      setSessions((prev) => [
        {
          id: safeId(),
          userId: activeUserId,
          wpm,
          accuracy,
          mode,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ].slice(0, 500))
    }
    if (roomCode) setDuelState('finished')
  }, [accuracy, activeUserId, isFinished, mode, roomCode, wpm])

  useEffect(() => {
    if (!showResults) return undefined
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setShowResults(false)
      if (event.shiftKey && event.key === 'Enter') {
        event.preventDefault()
        handleRestart()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showResults])

  useEffect(() => {
    if (!showResults) return
    if (!window?.adsbygoogle) return
    try {
      window.adsbygoogle.push({})
    } catch {
      // AdSense may throw if an ad instance is already initialized.
    }
  }, [showResults])

  const friendLeaderboard = useMemo(() => {
    const pool = sessions.filter((s) => s.userId === activeUserId || friendIds.includes(s.userId))
    const byUser = new Map()
    for (const s of pool) {
      const c = byUser.get(s.userId)
      if (!c || s.wpm > c.wpm) byUser.set(s.userId, s)
    }
    return [...byUser.values()]
      .sort((a, b) => b.wpm - a.wpm)
      .map((e) => ({ ...e, username: users.find((u) => u.id === e.userId)?.name || 'unknown' }))
  }, [activeUserId, friendIds, sessions, users])

  const globalLeaderboard = useMemo(() => {
    const bestByUser = new Map()
    for (const s of sessions) {
      const c = bestByUser.get(s.userId)
      if (!c || s.wpm > c.wpm) bestByUser.set(s.userId, s)
    }
    return [...bestByUser.values()]
      .sort((a, b) => b.wpm - a.wpm)
      .slice(0, 50)
      .map((e) => ({ ...e, username: users.find((u) => u.id === e.userId)?.name || 'unknown' }))
  }, [sessions, users])

  const userSessions = sessions.filter((s) => s.userId === activeUserId)
  const caretIndex = input.length
  const wpmTone = wpm >= 80 ? 'good' : wpm >= 45 ? 'mid' : 'bad'
  const wpmNote =
    wpm >= 80 ? "that's crazy good!" : wpm >= 45 ? 'solid pace, keep pushing!' : 'you need to work harder!'

  function handleRestart(newMode = mode) {
    setMode(newMode)
    setTargetText(makeWords(70, allowNumbers, allowPunctuation))
    setInput('')
    setTimeLeft(newMode)
    setIsActive(false)
    setIsFinished(false)
    setShowResults(false)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  function createOrLoginUser() {
    const name = usernameInput.trim().toLowerCase()
    if (!name) return
    const existing = users.find((u) => u.name === name)
    if (existing) {
      setActiveUserId(existing.id)
      setShowAuthModal(false)
    } else {
      const newUser = { id: safeId(), name, friends: [] }
      setUsers((prev) => [newUser, ...prev])
      setActiveUserId(newUser.id)
      setShowAuthModal(false)
    }
    setUsernameInput('')
  }

  function addFriend() {
    if (!activeUser) return
    const name = friendInput.trim().toLowerCase()
    const friend = users.find((u) => u.name === name)
    if (!friend || friend.id === activeUser.id || activeUser.friends.includes(friend.id)) return
    setUsers((prev) =>
      prev.map((u) =>
        u.id === activeUser.id
          ? { ...u, friends: [...u.friends, friend.id] }
          : u.id === friend.id
            ? { ...u, friends: [...u.friends, activeUser.id] }
            : u,
      ),
    )
    setFriendInput('')
  }

  function handleInputChange(event) {
    const next = event.target.value
    if (isFinished || next.length > targetText.length) return
    if (!isActive && next.length > 0) setIsActive(true)
    setInput(next)
    if (next.length === targetText.length) {
      setIsFinished(true)
      setIsActive(false)
    }
  }

  function startLiveRoom() {
    if (!activeUserId) return
    setRoomCode(Math.random().toString(36).slice(2, 8).toUpperCase())
    setOpponentState(null)
    setDuelState('waiting')
  }

  function joinLiveRoom() {
    if (!activeUserId || !roomCode.trim()) return
    setDuelState('connected')
  }

  function handleMainClick(event) {
    if (event.target.closest('input, button, textarea, select, a, label')) {
      return
    }
    if (focusMode && typingAreaRef.current && !typingAreaRef.current.contains(event.target)) {
      setFocusMode(false)
      return
    }
    inputRef.current?.focus()
  }

  return (
    <main className={`app-shell ${focusMode ? 'focus-mode' : ''} theme-${theme}`} onClick={handleMainClick}>
      <div className="orb one" aria-hidden="true" />
      <div className="orb two" aria-hidden="true" />
      <header className="top-bar">
        <div className="top-actions">
          <button
            type="button"
            className={`restart theme-toggle ${theme === 'light' ? 'on' : 'off'}`}
            aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
            onClick={(event) => {
              event.stopPropagation()
              setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))
            }}
          >
            <span className="theme-toggle-icon" aria-hidden="true">
              <span className="bulb-core" />
              <span className="bulb-base" />
            </span>
          </button>

          {!activeUser ? (
            <button
              type="button"
              className="restart auth-cta"
              onClick={(event) => {
                event.stopPropagation()
                setShowAuthModal(true)
              }}
            >
              Set username
            </button>
          ) : (
            <div className="account-chip">
              <span>@{activeUser.name}</span>
              <button type="button" onClick={() => setActiveUserId('')}>logout</button>
            </div>
          )}
        </div>
        <h1>SickType</h1>
        <p>Type fast. Stay smooth. Compete live.</p>
      </header>

      <section className="glass panel controls compact">
        <div className="mode-pills">
          {MODES.map((item) => (
            <button key={item} type="button" className={mode === item ? 'active' : ''} onClick={() => handleRestart(item)}>{item}s</button>
          ))}
          <button type="button" className={allowNumbers ? 'active' : ''} onClick={() => { setAllowNumbers((p) => !p); handleRestart() }}>numbers</button>
          <button type="button" className={allowPunctuation ? 'active' : ''} onClick={() => { setAllowPunctuation((p) => !p); handleRestart() }}>punctuation</button>
        </div>
        <div className="stats">
          <article><span>WPM</span><strong>{wpm}</strong></article>
          <article><span>ACC</span><strong>{accuracy}%</strong></article>
          <article><span>TIME</span><strong className={timeLeft < 10 ? 'danger' : ''}>{timeLeft}s</strong></article>
        </div>
      </section>

      <section className="glass panel typing-area" ref={typingAreaRef}>
        <div className="text-layer" aria-label="typing prompt">
          {targetText.split('').map((char, idx) => {
            let className = 'pending'
            if (idx < input.length) className = input[idx] === char ? 'correct' : 'wrong'
            if (idx === caretIndex && !isFinished) className += ' caret'
            return <span key={`${char}-${idx}`} className={className}>{char}</span>
          })}
        </div>
        <input
          ref={inputRef}
          className="hidden-input"
          value={input}
          onChange={handleInputChange}
          disabled={isFinished}
          autoFocus
          spellCheck="false"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          aria-label="Type the shown text"
        />
      </section>

      <footer className="glass panel footer-bar compact">
        <div className="mode-pills">
          <button type="button" className={focusMode ? 'active' : ''} onClick={() => setFocusMode((p) => !p)}>Focus mode</button>
          <button type="button" className="restart" onClick={() => handleRestart()}>New run</button>
        </div>
        <div className="result muted-line">{isActive ? `${charsTyped} typed - ${Math.max(0, charsTyped - correctChars)} mistakes` : 'Ready for your next PB'}</div>
      </footer>

      <section className="glass panel controls">
        <div className="mode-pills view-tabs">
          {VIEWS.map((item) => (
            <button key={item} type="button" className={view === item ? 'active' : ''} onClick={() => setView(item)}>
              {item}
            </button>
          ))}
        </div>
        <div className="muted-line">{activeUser ? 'Social features require account' : 'Set a username to save personal scores'}</div>
      </section>

      {view === 'social' && (
        <section className="glass panel social-grid social-disabled-wrap">
          <article className="glass panel">
            <h3>Friends</h3>
            <div className="row">
              <input value={friendInput} onChange={(e) => setFriendInput(e.target.value)} placeholder="add friend by username" />
              <button type="button" className="restart" onClick={addFriend}>Add</button>
            </div>
            <ul>{friendIds.map((id) => <li key={id}>@{users.find((u) => u.id === id)?.name || 'unknown'}</li>)}</ul>
          </article>
          <article className="glass panel">
            <h3>Live duel</h3>
            <p>Create a room and share the code with a friend in another tab/browser.</p>
            <div className="row">
              <button type="button" className="restart" onClick={startLiveRoom}>Create room</button>
              <input value={roomCode} onChange={(e) => setRoomCode(e.target.value.toUpperCase())} placeholder="ROOM01" />
              <button type="button" className="restart" onClick={joinLiveRoom}>Join</button>
            </div>
            {duelState !== 'idle' ? <p>Status: {duelState}</p> : null}
            {opponentState && (
              <div className="duel-card">
                <strong>@{opponentState.username}</strong>
                <span>{opponentState.progress}% progress</span>
                <span>{opponentState.wpm} WPM / {opponentState.accuracy}% ACC</span>
              </div>
            )}
          </article>
          <div className="social-full-lock">
            <strong>Multiplayer coming soon</strong>
            <span>Friends, room races, and live duels are being rebuilt for a premium release.</span>
          </div>
        </section>
      )}

      {view === 'leaderboards' && (
        <section className="glass panel leaderboard-grid">
          <article className="glass panel friends-board-disabled-wrap">
            <h3>Friends leaderboard</h3>
            <div className="lockable-content">
              <ol>{friendLeaderboard.map((e) => <li key={e.userId}><span>@{users.find((u) => u.id === e.userId)?.name || 'unknown'}</span><strong>{e.wpm} WPM</strong></li>)}</ol>
              <div className="soft-glass-overlay small">
                <strong>Coming soon</strong>
                <span>Friends leaderboard returns with multiplayer.</span>
              </div>
            </div>
          </article>
          <article className="glass panel">
            <h3>Global leaderboard</h3>
            <ol>{globalLeaderboard.map((e) => <li key={e.userId}><span>@{users.find((u) => u.id === e.userId)?.name || 'unknown'}</span><strong>{e.wpm} WPM</strong></li>)}</ol>
          </article>
          <article className="glass panel">
            <h3>Your recent runs</h3>
            <ol>{userSessions.slice(0, 10).map((e) => <li key={e.id}><span>{e.mode}s mode</span><strong>{e.wpm} WPM / {e.accuracy}%</strong></li>)}</ol>
          </article>
        </section>
      )}

      {showResults && (
        <section className="modal-wrap" role="dialog" aria-modal="true">
          <div className="modal glass panel">
            <button type="button" className="modal-close" aria-label="Close results" onClick={() => setShowResults(false)}>
              ×
            </button>
            <h2>run complete</h2>
            <div className="result-grid">
              <article className={`wpm-card ${wpmTone}`}>
                <span>wpm</span>
                <strong className={`wpm-${wpmTone}`}>{wpm}</strong>
                <em className={`wpm-note ${wpmTone}`}>{wpmNote}</em>
              </article>
              <article>
                <span>acc</span>
                <strong>{accuracy}%</strong>
              </article>
              <article>
                <span>time</span>
                <strong>{mode}s</strong>
              </article>
            </div>
            <div className="ad-slot">
              <div className="ad-box">
                <ins
                  className="adsbygoogle"
                  style={{ display: 'block', width: '100%', height: '100%' }}
                  data-ad-client={ADSENSE_CLIENT}
                  data-ad-slot={ADSENSE_RESULT_SLOT}
                  data-ad-format="auto"
                  data-full-width-responsive="true"
                />
              </div>
            </div>
            <div className="mode-pills modal-actions">
              <button type="button" className="restart" onClick={() => handleRestart()}>Play again</button>
              <span className="shortcut-hint">shift + enter</span>
            </div>
          </div>
        </section>
      )}

      {showAuthModal && (
        <section className="modal-wrap" role="dialog" aria-modal="true" onClick={() => setShowAuthModal(false)}>
          <div className="modal glass panel" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="modal-close" aria-label="Close login" onClick={() => setShowAuthModal(false)}>
              ×
            </button>
            <h2>your username</h2>
            <p className="muted-line">Choose any username. You can change it anytime.</p>
            <div className="row">
              <input
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                placeholder="your custom username"
              />
              <button type="button" className="restart" onClick={createOrLoginUser}>
                Continue
              </button>
            </div>
          </div>
        </section>
      )}
    </main>
  )
}

