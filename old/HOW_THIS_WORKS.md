# HOW_THIS_WORKS

A plain-English tour of the Circle Tag proof-of-concept, written for someone
coming from building **static pages with Express**. If you've never touched
WebSockets before, start here.

---

## 1. The big mental shift: request/response vs. a pipe

**What Express taught you.** The browser does a `GET /page`, Express runs a
handler, sends HTML back, and that's it. The connection closes. The server can
*only* respond after the browser asks. This is "request/response".

**What real-time needs.** Two browsers must see *each other* the instant a tag
happens — with no one clicking "refresh". That means the server has to be able
to talk to a browser *unsolicited*, whenever something changes.

**The WebSocket.** A WebSocket is a two-way pipe that, once opened from the
browser, stays open for as long as the tab lives. Either side can push a
message down it at any time. You can think of each open browser as a phone
line into your server that never hangs up.

| | Static Express page | This game |
|---|---|---|
| Browser → server | "give me the page" (HTTP GET) | "here are my pressed keys" (websocket `input`) |
| Server → browser | only after being asked | any time, 60x/sec (`state`) |
| State | none, each request is fresh | server holds it all in memory |
| Multiple browsers | each sees the same static file | each sees a live, shared world |

---

## 2. The architecture

```
   Tab A (your browser)              Node server (single file!)           Tab B (friend's browser)
 -------------------------        ----------------------------      -------------------------
  index.html + client.js            server.js (static files)          index.html + client.js
   canvas (paints)    |                                                |   canvas (paints)
                      │          http module serves index.html         │
 keydown ──▶ send keys │─────────▶ Socket.IO attaches to same port ◀───│◀── send keys ── keydown
                      │                    │                           │
                      │      houses the truth in memory:               │
                      │        players Map + currentIt                 │
                      │                    │                           │
                      │     60x/sec: move, check tags,                │
                      │     io.emit('state') to BOTH tabs ────────────► paints circles
               ◀──────│───── io.emit('tag') ───▶ banner P1 TAGGED P2
```

Three collaborating pieces:

1. **`server.js`** — the referee. Owns positions, movement, tag logic and
   broadcasts state 60 times a second.
2. **`public/index.html`** — the shell: one canvas, a Join button, a banner.
3. **`public/client.js`** — the screen: listens on the pipe, paints whatever
   the server says, and reports which keys you're holding.

The browser has **zero** game logic. It cannot say "I'm at x:400". It can only
say "I'm holding Right", and the server decides if that's allowed and where it
puts you. That's called **server-authoritative** and it's what makes the 
circle positions identical on everyone's screen.

---

## 3. server.js, line by line (conceptually)

### Constants (`server.js:6`)
The "rules": a fixed `900x600` arena, circle radius `24`, max speed `280`
pixels/sec, colors per player, spawn positions, a `1000` ms collision cooldown
(so the banner doesn't strobe while circles overlap).

### Static file serving (`server.js:33`)
The browser still has to *download* the page somehow, so we keep the part you
already know. Instead of `express.static('public')` we wrote a ~15 line `http`
handler that does the same job: `/` → `index.html`, `/client.js` → the file.
This matters mainly for deploy: the final bundle can run with zero dependencies
besides Socket.IO.

### In-memory game state (`server.js:27`)
```
players: Map<socketId, {slot, color, x, y, keys}>
taken:   Set of used slots (1-4)
currentIt: which slot is IT right now
```
This is the "database" of the *live* game. It lives and dies with the server
process. **MongoDB is for later** — for scores/history that must survive a
restart. In a 60fps game you never want a disk read in the hot path; memory is
the right place for "where is P2 right now".

### Rooms / join (:63)
Every browser that connects gets a `socket` object. Clicking Join emits
`'join'`; the server assigns the smallest free slot (P1..P4), a color, a spawn
point, and declares the first joiner IT. It replies with `'welcome'` so that
client learns its own identity, and `'lobby'` so clients can show
"waiting for another player…".

### The game loop (`setInterval`, `server.js:99`)
The heart: a block that runs **60 times per second**. Each "tick":

1. **Move** — for each player, read their held keys, build a direction
   vector, normalize it (so diagonals aren't faster), then step forward one
   frame's worth of distance. Clamp inside the arena walls.
2. **Collide / tag** — check every pair of circles with the distance formula.
   Two circles overlap when their centers are closer than `2 × RADIUS`.
   If IT is one of the pair, IT tags the other → role swaps, the pair gets
   pushed apart, and everyone gets a `'tag'` event.
3. **Broadcast** — send every client the full new list of
   `{slot, color, x, y, isIt}`. One message per tick, received by all.

### Why positions, not key states, get broadcast
If we only forwarded "P1 pressed Right", each browser would have to *simulate*
the world to render it — and tiny differences (lag, rounding) would make the
two screens drift apart. Broadcasting the **authoritative snapshot** guarantees
both screens show the identical world. The cost is a few hundred bytes × 60/sec
per player, trivial on localhost and fine over the internet.

---

## 4. client.js, the two loops

There are effectively two independent loops in the browser:

**The input loop (event-driven):** `keydown`/`keyup` update a local `keys`
object; whenever a key state changes we send the whole object via
`socket.emit('input', keys)`. Note the client sends *only events, not frames*
— it says "I started holding Right" once, and the server keeps moving the
circle until it hears "Right released". If the tab loses focus, a `blur`
handler releases everything so you don't drift forever in the background.

**The render loop (`requestAnimationFrame`):** fires up to 60x/sec and
repaints the canvas from the latest snapshot stored in `state`. No simulation,
no prediction — just "draw a circle at (x, y) with color c; dash the ring if
it's IT; put a white outline on my own circle." If the network hiccups, it
simply draws the last known state until the next `'state'` message lands.

---

## 5. The message protocol

| direction | event | payload | meaning |
|---|---|---|---|
| client → server | `join` | — | "give me a slot" |
| client → server | `input` | `{up,down,left,right}` | "these are the keys I hold" |
| server → client | `welcome` | `{slot, color, arena, radius}` | "you are P2" |
| server → client (all) | `lobby` | `{count}` | room population changed |
| server → client (all) | `state` | `[{slot,color,x,y,it}]` | 60fps world snapshot |
| server → client (all) | `tag` | `{tagger, victim}` | a tag happened |
| server → client | `full` | — | all 4 slots taken |

Socket.IO gives you rooms, auto-reconnect, and a fallback to long-polling if
proxies block websockets — which is exactly why it was picked for this rather
than a hand-rolled WebSocket.

---

## 6. Playing it

```bash
npm install
npm start          # http://localhost:3000
```
Open **two tabs** of `http://localhost:3000` and click Join in both. P1 starts
with the yellow dashed ring (IT). Touch the other circle → big banner + IT
swaps. `npm test` runs a headless version: it connects two fake players,
drives them into each other, and asserts the tag event fires with the right
tagger/victim. Useful as a regression check when you extend the game.

---

## 7. Where MongoDB would slide in (later)

Mongo isn't involved in the instant of gameplay. It belongs on the *edges*:

- **On join**: look up a player's saved name/skin.
- **On tag/round end**: insert `{winner, duration, players}` records.
- **Lobbies/leaderboards**: persisted state that must outlive the process.

The in-memory `players` Map stays — it's the realtime data. Mongo just makes
sure that when the server restarts, history survives and identities can be
re-established.

---

## 8. Deployment gotchas worth knowing

- **Render free tier** sleeps after ~15 min idle and cold-starts slowly.
  First visitor after idle waits up to a minute — that's expected, refresh.
- **Serverless (Vercel) is the wrong fit** for this shape: it wants short,
  stateless functions, while a game server needs a long-lived process
  holding in-memory state and open sockets.
- **Localhost ≠ friend's laptop**: same-Wi-Fi friends use your LAN IP;
  over-the-internet play needs Render (or an ngrok tunnel for a temporary
  session).

---

## 9. Ideas to poke at next

- Start a **round timer** and a "score" that Mongo persists.
- Broadcast **interpolated** positions or use a lower tick rate with
  client-side prediction for smoother internet play.
- Add **more rooms** — Socket.IO rooms make a lobby list almost free.
- Let players join with a **name** instead of just "P2".