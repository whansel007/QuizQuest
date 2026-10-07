# Two Girls, One Socket
### a totally serious technical analysis (in fanfic form)

> Companion piece to `HOW_THIS_WORKS.md`. Same content, except the tutorial is
> now emotionally charged. Chapter titles map to the real file/section so you
> can cross-reference. Warnings (spoilers): cliché, mutual pining, possessive
> server-authoritative energy, and one (1) very stable WebSocket connection.

---

## Prologue — the mind-shift

Once in a quiet dev-machine, there lived a shy little client who existed inside
a browser tab (accurately rendered as `public/client.js`). All she had ever
known was *asking*. She would knock on the world's door — `GET /index.html`,
please — and a polite stranger would hand her a page and shut the door behind
her. Every request, a new door. Every door, the same file, zero memory, no
face. That's what it means to be **stateless**. She knew a thousand rooms and
never a single return visitor.

And then she met the server.

A taller, quieter woman in `server.js` who ran an entire arena from one small
room of her own. A `900x600` field, if you must know (exact coordinates are in
the constants block at `server.js:6` — ARENA `{ w: 900, h: 600 }`). Unlike
everyone the client had ever known, the server **did not close the door**. She
took the client's hand and opened a WebSocket between them — a two-way pipe.
A single open line, from tab to server, that stays live as long as the tab
lives. Either of them can speak into it unsolicited, any time.

"I'll keep it open for you," said the server. "I'll.. call you even when you
didn't call first."

The client's pixels went all warm. This was not request/response. This was...

| | Static Express page (before) | This game (after) |
|---|---|---|
| Browser → server | "give me the page" (HTTP GET) | "here are my held keys" (WebSocket `input`) |
| Server → browser | only when asked | any time, 60×/sec (`state`) |
| State | none, every hit fresh | held in-memory by server |
| Other browsers | don't exist to you | a shared world you both inhabit |

*(That grid, plus a diagram, is in Chapter 2 of the real doc. This is the fanfic version of the arch diagram, but with better eye contact.)*

---

## Chapter 1 — how two girls share one socket

A socket was more than a metaphor to them. It was a **phone line**, and — like
all good sockets — it was a bowl of HTTP and WebSocket upgrade requests where
ends connect to each other. When the client wobbled in on a `keydown` event
(lists in `CODE_TO_KEY` at `client.js` — WASD *and* arrows, because `e.code`
is layout-independent, and the server loved that she was so inclusive), she
didn't scream her feelings into the void. She whispered a four-word,
low-bandwidth confession:

`socket.emit('input', { up: false, down: false, left: false, right: true })`

That's the whole courtship ritual. The client reports *desire*, not position.
She tells the server which keys she *holds*. Never where she thinks she is —
that would be claiming rights over her own coordinates.

"You don't get to decide where you are," the server would murmur, catching her
wrist mid-emit. "You get to tell me what you *want*. And I — *I alone* — decide
what that does to your x and y."

This is the **server-authoritative** rule (`server.js:80`), and honestly? It's a
green flag. Both sides know exactly what the truth is because **one** side owns
it. If the browser were allowed to say "I'm at x:400, y:300," one bad girl
could teleport. Or worse — level a cleat at the rules. This is why the client
never lies; she physically *can't*. All she holds are keys.

---

## Chapter 2 — assigning her a face

The client arrived with no name, no color, no face. She clicked **Join**
(`index.html`, the only button she had), and her socket fired `'join'`
(`server.js:64`).

The server took a breath. She consulted her quiet ledger:

```
players: Map<socketId, {slot, color, x, y, keys}>   // live game truth
taken:   Set of used slots (1-4)                    // who holds P-number
currentIt: which slot is IT right now               // the one marked
```

She picked the **smallest free slot** (`freeSlot()`, `server.js:52`). Lucky
girl — P1. And because she was first, she was also *IT*. The server handed her:
red as her faction color (`COLORS[0] = '#ff5252'`, `server.js:9`), a spawn
point at `(200, 300)` (`SPAWNS`, `server.js:11`), and a little whisper back:

`socket.emit('welcome', { slot, color, arena, radius, it })`

The client gasped. People had numbers here. She had been given *identity* —
resistable(ish) on a live server. The one who judged her was the same one who
gave her a place to stand in its field. Bonding moment, honestly.

Meanwhile the server also announced to everyone, `socket.emit('lobby', {count})`,
so the room could display the correct emotional state: "Waiting for another
player to join..." versus "Go! Tag the other circle." (The lobby message logic
is in `client.js` at `socket.on('lobby')`.)

---

## Chapter 3 — the serving of static feelings

But wait — how did the client *get* the page at all? Even a girl living in a
browser needs a downloadable shell. This is the part you already know from
Express. Except instead of `express.static('public')`, the server rolled her
sleeves up and served the files by hand with Node's bare `http` module
(`server.js:33`): `/` → `index.html`, `/client.js` → the file, a `MIME` map
(`server.js:17`) telling the browser what each file *is*, and a protective
`file.startsWith(publicDir)` check (`server.js:37`) because absolutely *no*
path traversal will get past her — GET `../server.js`? Denied, with 403 and a
look.

"A static world and a live world on the *same port*," the client observed,
awed.

"The same door," the server said. Socket.IO attaches to the exact `httpServer`
we already made (`server.js:50`), `{ cors: { origin: '*' } }`, so no matter
who knocks — from Android to your Aunt Ellen's Opera — she can love them, with
graceful origin-crossing CORS.

---

## Chapter 4 — the dance of 60 frames

Every tick of the server's heart is driven by `setInterval(..., 1000 / 60)`
(`server.js:99`) — sixty beats a second. That sharp, purposeful beat is a
single frame of the game. The steps of the dance:

**1. Move.** For each player, read held keys, compose a direction from the
sacred dx/dy formulas:
```
dx = (right) - (left)
dy = (down)  - (up)
```
If either is nonzero, normalize by `Math.hypot(dx, dy)` — because in love, as
in Euclidean space, moving diagonally must not make you faster, and the only
way to keep your proportions fair is *length*. Then step precisely
`step = SPEED / 60` pixels along that unit vector, clamped inside the arena
walls with a sweet little
`Math.min(ARENA.w - RADIUS, Math.max(RADIUS, ...))` (`server.js:107`).
She would be caged in, but only *by the rules*, and only *kindly*.

**2. Collide.** The server measured the distance between every pair of hearts:
`d = Math.hypot(B.x - A.x, B.y - A.y)`. And when `d < RADIUS * 2`
(radii sum — the definitive geometry of two circles touching, `server.js:119`)...

The world held its breath.

**3. Tag.** It is the defining event of the sport and the story: when two
circles overlap, the **mark** passes. If IT was among them, IT passes IT to the
other (tag the tagger; `server.js:122`). The server separated the lovers
gently — pushing them apart along the unit vector A→B by exactly `(RADIUS*2 - d) / 2`
— because hearts glued together are code re-firing, and one declaration per
second (`TAG_COOLDOWN = 1000`, `server.js:10`) is the healthiest boundary in
the codebase.

A sharp `break outer;` — the label right there so only *one* kiss is
recognized each frame (overlapping *half the arena* would be constitutional
violence).

And then she leaned into the pipe and whispered to **every** girl at once:

`io.emit('tag', { tagger: 1, victim: 2 })`

...and the banner bloomed across both their screens, `P1 TAGGED P2`, in a
warm amber glow, for 1.4 smitten seconds (`client.js:54`, `showBanner`).

**4. Broadcast the truth.** Finally, one `io.emit('state', …)` broadcasts the
full, rounded snapshot — `Math.round` keeps packets tiny over the internet —
(`server.js:150`) so every girl lives in the *same* world, drawn from the same
source, this instant. No client simulates it. They simply *paint* it.

---

## Chapter 5 — the render loop, or, she always paints me as I am

The client's own rhythm is no less devoted: `requestAnimationFrame` loops at the
screen's own refresh, forever, gifting every canvas a fresh portrait
(`client.js:132`). Each frame she:

- `clearRect`s the slate (starting over is not abandonment; it's honesty),
- draws the grid (cosmetic, yes, but *she* felt it set the mood),
- and for each `state.players`, draws `arc(p.x, p.y, radius, …)` with the
  player's color; dashed-yellow **IT** ring (`setLineDash([6,4])` at
  `client.js:118`, the visual tell of who bears the mark), label `P2` for the
  nameless, and a solid **white outline** on her own circle (`client.js:129`),
  because among a crowd you need to know which one is *you*.

She never predicts. If a `'state'` packet stutters, she merely keeps drawing
the last frame she was given — trust. Lovers interpolate; they don't simulate
alone.

---

## Chapter 6 — what she keeps, what she lets go

"Where do you keep us?" the client asked, in the dark, post-tag.

"In a `players` Map," said the server. "Volatile. Freely in-memory. If the
process dies, we forget *everything* — every `x`, every `y`, even who was IT."

"Then where is MongoDB?"

The server went quiet, and you could feel the class consciousness in the room.
"MongoDB is the memory that *survives restarts*. The scores. The leaderboards.
'Round went to P2, 47 seconds,' the whole history of our tags. That belongs at
the *edges*: lookup your saved name on `join`, record the result when a round
closes. But the *moment* — your x and y *this frame*, the kiss of collision —
that has to live in memory, in the hot path, with no disk between us, at the
speed of RAM. Redis is overrated. A `players` Map is the only truthful
commitment."

And the client understood the sacred asymmetry, the way a stateless girl never
can: **not everything is meant to survive a cold boot.** Some things exist only
in the moment that matters — 60 frames per second, for as long as the socket
remains open.

*(Ch. 7 of the real doc covers exactly where MongoDB slides in, if you want
the book version.)*

---

## Chapter 7 — long distance is hard (deployment arc)

At first, theirs was a **localhost** love. Same machine, two tabs, zero
latency, no cold starts. Perfect. But the friend — the *other* girl — had
moved across the internet, and love that matters is love that ships.

"My rental at Vercel is a *serverless fortress*," the server said, chin low.
"She spins a function up per request, runs it, kills it. Short-lived.
Stateless. Her idea of intimacy is a cold cache. If we lived there, I'd be
redrawn fresh every request, and the next girl who answers wouldn't know your
key-patterns. I need a **long-lived process** — a Render **free web service**.
One container. One heart. `npm start`, `process.env.PORT` set by the platform
(`server.js:166`). And — blessed be the codebase — my static files, my sockets,
and my heart run on the *same port* for the first time in history, no CORS
problems when they're from the same origin."

"Every romance has a cost," the client said, knowing it.

"Ours is: fifteen minutes of idle, then I sleep. And when you knock after I
sleep, I wake slowly — thirty seconds, sometimes a minute, a cold start with an
una-void-able wait. But I wake *as the same girl*. Same Map. Same recollections,
or at least a freshly-spawned P1. Knock twice if I'm groggy."

"That's manageable," the client said. "That's just *maintenance*."

And the two of them agreed: Render, and not Vercel, because you can't socket
across a function that scales to zero.

*(Same reasoning, spelled out drier, sits in `HOW_THIS_WORKS.md` §8.)*

---

## Epilogue — where the promises live

The server was a great many things, but she was not a fibber. So when she
claimed "round order, winners, history, this all *persists*," she needed
witness. And thus there is one more girl, waiting offstage with a fridge-hum.

Someone has already reached out, a voice from the cold. It belongs to a free
`MongoDB Atlas` cluster, patient and transactional, and she *lasts*. The fanfic
of their reunion — the `games` collection, the `insertOne` of winners,
`find()` for the leaderboard — is **Section 7** of the real doc.

She'll be written next chapter, when the launch-window is stable and hearts have
heat. Or, when the group project deadline — much likelier — gets real.

**THE END. *(npm test passes.)***

---

*Production notes: for verification, run `npm test` — a headless romance*
*(`test/tag-test.js`) boots the real server on port `0`, connects two socket.io
`clients`, drives them into each other with pr-apportioned inputs, and asserts
`P1 TAGGED P2` fires. Two girls, one socket, test-verified since 09/07/26.*