// English copy for the static guide pages. Facts here must match the game (SPEC.md, src/sim, src/ui/i18n.js).
// Body fragments may use {{url:how}} {{url:rules}} {{url:faq}} {{url:play}} {{url:home}} placeholders (same-language, relative).

const RINGS = [
  ['#ffb020', 'Amber', 'The ball is coming. It is not time to swing yet, so get ready.'],
  ['#45ff7a', 'Green', 'Press a hit key now and you will make contact.'],
  ['#c8ff3a', 'Lime', 'Perfect timing: hit now for the steadiest, strongest shot.'],
  ['#ff4d4d', 'Red', 'Swinging now is a fault (a volley before the bounce, or standing in the kitchen).'],
];
const ringTable = `<div class="tablewrap"><table class="rings"><caption class="sr">Foot ring colours</caption>
<thead><tr><th scope="col">Ring colour</th><th scope="col">What it means</th></tr></thead><tbody>
${RINGS.map(([c, n, d]) => `<tr><th scope="row"><i class="dot" style="--c:${c}"></i>${n}</th><td>${d}</td></tr>`).join('\n')}
</tbody></table></div>`;

export const en = {
  lang: 'en', htmlLang: 'en', hreflang: 'en', ogLocale: 'en_US', playLang: 'en',
  ui: {
    skip: 'Skip to content', navLabel: 'Guides', home: 'Home', how: 'How to play', rules: 'Rules', faq: 'FAQ',
    play: 'Play now', switchLabel: '繁體中文', switchLang: 'zh-Hant', switchTitle: '切換為繁體中文',
    toc: 'On this page', crumbs: 'Breadcrumb', related: 'More guides', sr: 'Screen readers',
    ctaTitle: 'Ready to play?',
    ctaText: 'Pickle Ball Dual is free in your browser: no download, no sign-up. Pick singles or doubles, choose an opponent level and serve.',
    footer: 'Pickle Ball Dual is a free 3D pickleball game for your browser, made by <a href="https://www.linkedin.com/in/edward-shih-43942786" rel="author">Edward Shih</a> and released under the MIT License. It is not affiliated with USA Pickleball or DUPR.',
    footerPlay: 'Play the game', footerSource: 'Source on GitHub',
    homeName: 'Pickle Ball Dual',
  },
  pages: {
    how: {
      name: 'How to play',
      title: 'How to Play Pickle Ball Dual: Controls, Shots, Timing',
      description: 'Pickle Ball Dual controls and tips: WASD to move, Space/J/K/L for drive, drop, dink and lob, the foot-ring timing colours and DUPR 3.0–6.0 levels.',
      h1: 'How to Play Pickle Ball Dual: Controls, Shots and Timing',
      lede: 'Pickle Ball Dual is played with the keyboard: <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> to move, <kbd>Space</kbd> to drive, and <kbd>J</kbd> <kbd>K</kbd> <kbd>L</kbd> for the drop, dink and lob. This guide covers every control, every shot, the foot-ring timing colours, the game modes and the four DUPR difficulty levels.',
      howto: {
        name: 'How to play Pickle Ball Dual',
        description: 'Start and win your first match of Pickle Ball Dual, the free 3D pickleball game in your browser.',
        steps: [
          ['Open the game and press Play', 'Open Pickle Ball Dual in a desktop browser such as Chrome or Safari and press Play on the main menu.'],
          ['Choose mode and scoring', 'Pick Doubles (you and an AI partner against two AI opponents) or Singles, then Traditional scoring (to 11) or Rally scoring (to 15).'],
          ['Choose the opponent level', 'Pick the opponent DUPR level from 3.0 to 6.0 (and your partner\'s level in doubles), choose your paddle hand and graphics quality, then press Start match.'],
          ['Serve', 'When it is your serve, press Space for a fast deep serve (J or K for a soft serve, L for a lob serve). Hold A or D as you serve to aim left or right.'],
          ['Return and rally', 'Let the serve bounce before you return it. Move with WASD and press a hit key when the ring under your feet turns green; lime is perfect timing.'],
          ['Win the game', 'Move up to the kitchen line, use drops and dinks, and attack high balls with a smash. In traditional scoring the first side to 11 points wins by 2; in rally scoring the first to 15 wins by 2.'],
        ],
      },
      body: `
<h2 id="start">How do I start a match?</h2>
<p>Open the game, press <b>Play</b>, choose Doubles or Singles, a scoring system and the opponents' DUPR level (3.0, 4.0, 5.0 or 6.0), then press <b>Start match</b>. It runs in your browser, with no download and no sign-up.</p>
<ol class="steps">
<li><b>Open the game and press Play</b> in a desktop browser such as Chrome or Safari.</li>
<li><b>Choose mode and scoring:</b> Doubles (you and an AI partner against two AI opponents) or Singles, then Traditional scoring (to 11) or Rally scoring (to 15).</li>
<li><b>Choose the opponent level:</b> DUPR 3.0, 4.0, 5.0 or 6.0 (plus your partner's level in doubles), your paddle hand and graphics quality, then press Start match.</li>
<li><b>Serve:</b> press <kbd>Space</kbd> for a fast deep serve (<kbd>J</kbd> or <kbd>K</kbd> for a soft serve, <kbd>L</kbd> for a lob serve). Hold <kbd>A</kbd> or <kbd>D</kbd> as you serve to aim left or right.</li>
<li><b>Return and rally:</b> let the serve bounce before you return it. Move with WASD and press a hit key when the ring under your feet turns green; lime is perfect timing.</li>
<li><b>Win the game:</b> move up to the kitchen line, use drops and dinks, and attack high balls with a smash. In traditional scoring the first side to 11 wins by 2; in rally scoring the first to 15 wins by 2.</li>
</ol>

<h2 id="controls">What are the controls in Pickle Ball Dual?</h2>
<p>Move with <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> (or the arrow keys), hit with <kbd>Space</kbd> (drive), <kbd>J</kbd> (drop), <kbd>K</kbd> (dink) and <kbd>L</kbd> (lob), and hold <kbd>A</kbd>/<kbd>D</kbd> (or <kbd>←</kbd>/<kbd>→</kbd>) as you hit to aim left or right. The mouse is used for the menus.</p>
<div class="tablewrap"><table>
<caption class="sr">Keyboard controls</caption>
<thead><tr><th scope="col">Action</th><th scope="col">Keys</th><th scope="col">What it does</th></tr></thead>
<tbody>
<tr><th scope="row">Move</th><td><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or arrow keys</td><td>W moves toward the net, S back toward the baseline, A and D sideways.</td></tr>
<tr><th scope="row">Drive</th><td><kbd>Space</kbd></td><td>Tap for a quick drive; hold to charge power (about 0.7 s to full) and release to hit. A high ball automatically becomes a smash.</td></tr>
<tr><th scope="row">Drop</th><td><kbd>J</kbd></td><td>A soft arc that lands in the opponent's kitchen: the classic third-shot drop.</td></tr>
<tr><th scope="row">Dink</th><td><kbd>K</kbd></td><td>A soft shot into the kitchen; works best from near the net.</td></tr>
<tr><th scope="row">Lob</th><td><kbd>L</kbd></td><td>A high arc that pushes the opponents back to the baseline.</td></tr>
<tr><th scope="row">Aim</th><td>Hold <kbd>A</kbd>/<kbd>←</kbd> or <kbd>D</kbd>/<kbd>→</kbd> as you hit</td><td>Left or right. Hold neither for a safe shot down the middle.</td></tr>
<tr><th scope="row">Serve</th><td><kbd>Space</kbd> <kbd>J</kbd> <kbd>K</kbd> <kbd>L</kbd></td><td>On your serve press any hit key: Space is a fast deep serve, L a lob serve, J or K a soft serve.</td></tr>
<tr><th scope="row">Pause</th><td><kbd>Esc</kbd></td><td>Pause or resume. The game also pauses by itself when you switch to another tab or window.</td></tr>
<tr><th scope="row">Other</th><td><kbd>M</kbd> <kbd>H</kbd> <kbd>R</kbd></td><td>M mutes sound, H hides the key hints, R (or a click) skips an instant replay.</td></tr>
</tbody></table></div>

<h2 id="shots">What shots can I hit, and when should I use each?</h2>
<p>You have four button shots (drive, drop, dink and lob) and two the game triggers for you, the smash and the around-the-post shot (ATP). Use soft shots to take control at the net and hard shots to finish a point.</p>
<div class="tablewrap"><table>
<caption class="sr">Shots at a glance</caption>
<thead><tr><th scope="col">Shot</th><th scope="col">How</th><th scope="col">Flight</th><th scope="col">Use it when</th></tr></thead>
<tbody>
<tr><th scope="row">Drive</th><td><kbd>Space</kbd></td><td>Fast, flat, deep</td><td>Opponents are back or out of position.</td></tr>
<tr><th scope="row">Drop</th><td><kbd>J</kbd></td><td>Soft arc into the kitchen</td><td>You are at the baseline and want to move forward (third shot).</td></tr>
<tr><th scope="row">Dink</th><td><kbd>K</kbd></td><td>Very soft, low, into the kitchen</td><td>Everyone is at the kitchen line.</td></tr>
<tr><th scope="row">Lob</th><td><kbd>L</kbd></td><td>High arc, deep near the baseline</td><td>Opponents crowd the net.</td></tr>
<tr><th scope="row">Smash</th><td>Automatic on <kbd>Space</kbd></td><td>Steep, very fast, downward</td><td>The ball is above about 1.6 m (5 ft 3 in).</td></tr>
<tr><th scope="row">ATP</th><td>Automatic</td><td>Low, around the net post</td><td>You are pulled wide of the sideline near the net.</td></tr>
</tbody></table></div>

<h3 id="drive">What is a drive?</h3>
<p>A drive is a fast, flat, deep groundstroke, played with <kbd>Space</kbd>. Tap for a quick drive or hold to charge more power and release to hit. Use it when the opponents are standing back or out of position, which is common against 3.0 opponents who stay at the baseline.</p>
<h3 id="drop">What is a drop shot (the third-shot drop)?</h3>
<p>A drop is a soft arcing shot that lands in the opponent's kitchen, played with <kbd>J</kbd>. After the serve and the return have each bounced, the serving side's third shot is usually a drop from the baseline: it gives you time to walk up to the kitchen line, and a ball that bounces in the kitchen cannot easily be attacked.</p>
<h3 id="dink">What is a dink?</h3>
<p>A dink is a very soft, low shot that lands in the opponent's kitchen, played with <kbd>K</kbd>. Trade dinks patiently from the kitchen line and wait for a high ball to attack. In the game a dink from far back turns into a weak drop, so move up to the net first.</p>
<h3 id="lob">What is a lob?</h3>
<p>A lob is a high arc that lands deep near the opponents' baseline, played with <kbd>L</kbd>. Use it to push opponents away from the net or to catch them while they are crowding the kitchen line. A lob that lands in for a winner earns a highlight replay.</p>
<h3 id="smash">What is a smash?</h3>
<p>A smash is a steep, very fast overhead shot hit downward at a high ball. You do not need a special key: when you press <kbd>Space</kbd> and the contact point is above about 1.6 m (5 ft 3 in), the drive automatically becomes a smash. Save it for pop-ups near the net.</p>
<h3 id="atp">What is an ATP shot?</h3>
<p>An ATP (around the post) is a shot hit around the outside of the net post instead of over the net. It is legal at any height, even below the net, as long as it lands in the opponent's court. In Pickle Ball Dual it happens automatically: if you reach a ball while you are wide outside the sideline near the net (about 3.5 m from the centre line) and a path around the post exists, your shot becomes a low ATP. 6.0 opponents attempt it too.</p>

<h2 id="timing">How does the foot ring show me when to swing?</h2>
<p>A ring under your player's feet changes colour to tell you when to press a hit key: amber means the ball is coming, green means press now and you will make contact, lime means perfect timing, and red means swinging now would be a fault.</p>
${ringTable}
<p>A yellow circle on the court marks where the ball will land. The paddle meets the ball about 0.17 seconds after you press the key, so press when the ring turns green rather than when the ball is on top of you. Lime gives the steadiest, strongest shot.</p>

<h2 id="modes">What game modes does Pickle Ball Dual have?</h2>
<p>You can play doubles (you and an AI partner against two AI opponents) or singles (you against one AI), with traditional side-out scoring to 11 or rally scoring to 15; both are won by 2. Details of each are on the <a href="{{url:rules}}">rules page</a>.</p>
<ul>
<li><b>Doubles or singles:</b> in doubles you also choose your partner's DUPR level.</li>
<li><b>Scoring:</b> traditional (only the serving side scores, to 11) or rally (every rally scores, to 15).</li>
<li><b>Setup options:</b> right- or left-handed paddle, and Low, Medium or High graphics. Your choices are saved in your browser.</li>
<li><b>Instant replays:</b> after a highlight point (a smash, ATP or lob winner, a rally of 10 or more shots, or the point that wins the game) the game replays it in slow motion. Press <kbd>R</kbd> or click to skip.</li>
<li><b>Languages:</b> English or Traditional Chinese (繁體中文), switchable from the main menu or Settings.</li>
</ul>

<h2 id="referee">Does the game call the score like a real referee?</h2>
<p>Yes. Before each serve an English referee voice calls the score ("four, two, one", or "zero, zero, two" at the start of a doubles game) and the call is also shown on screen. It also announces side outs, second servers, points, faults and game point. You can turn the voice off in Settings.</p>

<h2 id="dupr">What do the DUPR difficulty levels mean?</h2>
<p>DUPR (Dynamic Universal Pickleball Rating) is a real-world skill rating that runs from about 2.0 to 8.0. Pickle Ball Dual borrows four levels (3.0, 4.0, 5.0 and 6.0) as presets for how strongly the AI plays: a higher level moves faster, reacts sooner, makes fewer errors and plays smarter.</p>
<div class="tablewrap"><table>
<caption class="sr">DUPR difficulty levels</caption>
<thead><tr><th scope="col">Level</th><th scope="col">Skill</th><th scope="col">How the AI plays</th></tr></thead>
<tbody>
<tr><th scope="row">3.0</th><td>Beginner</td><td>Slow to move, reacts in roughly 0.45 s and makes plenty of errors. Stays back, mostly drives and lobs, and pops balls up. Good for learning the controls.</td></tr>
<tr><th scope="row">4.0</th><td>Intermediate</td><td>Medium speed, reacts in roughly 0.30 s. Mixes in third-shot drops, comes up to the kitchen and dinks.</td></tr>
<tr><th scope="row">5.0</th><td>Advanced</td><td>Fast, reacts in roughly 0.20 s. Reliable drops, patient dinking, attacks high balls and targets your weaker side. Occasionally tries an ATP.</td></tr>
<tr><th scope="row">6.0</th><td>Expert</td><td>Very fast, reacts in roughly 0.12 s and rarely misses. Changes pace, speeds the ball up at your body, takes the net and often goes for an ATP.</td></tr>
</tbody></table></div>
<p>These are AI presets, not an official rating: playing here does not change anyone's real DUPR. Your own player moves at about the speed of a 4.5 player.</p>

<h2 id="tips">What tips help a beginner win?</h2>
<p>Start against 3.0 opponents, let the serve and return bounce, get to the kitchen line, and be patient: most points are won by the side that makes fewer mistakes.</p>
<ul>
<li>Read the hint line on screen: it reminds you of the two-bounce rule and warns you when you are standing in the kitchen.</li>
<li>Press the hit key when the ring is green or lime, not before.</li>
<li>After your serve is returned, play a drop with <kbd>J</kbd> and move forward behind it.</li>
<li>Do not volley from inside the kitchen. If the ring is red, let the ball bounce or step back.</li>
<li>Aim down the middle (hold no direction key) while you are learning; it is the safe shot.</li>
<li>Dink until a high ball appears, then smash it.</li>
</ul>
`,
    },

    rules: {
      name: 'Rules',
      title: 'Pickleball Rules: Serve, Two-Bounce, Kitchen, Scoring',
      description: 'Pickleball rules explained as Pickle Ball Dual plays them: court size, serve, two-bounce rule, kitchen, faults, 0-0-2 doubles scoring, singles and rally scoring.',
      h1: 'Pickleball Rules as Played in Pickle Ball Dual',
      lede: 'Pickleball is played on a 20 × 44 ft (6.10 × 13.41 m) court over a 34 to 36 in net. The serve and its return must bounce, and nobody may volley inside the 7 ft (2.13 m) kitchen. This page explains each rule as Pickle Ball Dual implements it and says plainly where the game simplifies the official rules.',
      body: `
<h2 id="basics">What are the basic rules of pickleball?</h2>
<p>The server hits an underhand serve diagonally into the opposite service court; the serve and the return must each bounce before anyone volleys; nobody may volley while standing in the kitchen; and in traditional scoring only the serving side scores, with games played to 11 points and won by 2.</p>
<ul>
<li>Serve underhand and diagonally, past the kitchen line.</li>
<li>Let the serve bounce, and let the return bounce (the two-bounce rule).</li>
<li>No volleys in the kitchen (the non-volley zone).</li>
<li>A rally ends when a side faults: the ball goes out, into the net, bounces twice, or a rule is broken.</li>
<li>First to 11 points, winning by 2 (traditional scoring), or first to 15, winning by 2 (rally scoring in this game).</li>
</ul>

<h2 id="court">How big is a pickleball court and how high is the net?</h2>
<p>A pickleball court is 20 ft wide and 44 ft long (6.10 m × 13.41 m), the same for singles and doubles. The net is 36 in (0.914 m) high at the posts and 34 in (0.864 m) high at the centre.</p>
<div class="tablewrap"><table>
<caption class="sr">Court dimensions</caption>
<thead><tr><th scope="col">Part</th><th scope="col">Imperial</th><th scope="col">Metric</th></tr></thead>
<tbody>
<tr><th scope="row">Court</th><td>20 ft × 44 ft</td><td>6.10 m × 13.41 m</td></tr>
<tr><th scope="row">Kitchen (non-volley zone)</th><td>7 ft from the net on each side</td><td>2.13 m from the net</td></tr>
<tr><th scope="row">Each service court</th><td>10 ft × 15 ft</td><td>3.05 m × 4.57 m</td></tr>
<tr><th scope="row">Net height at the posts</th><td>36 in</td><td>0.914 m</td></tr>
<tr><th scope="row">Net height at the centre</th><td>34 in</td><td>0.864 m</td></tr>
</tbody></table></div>
<p>All lines are part of the court: a ball that touches a line is in. The one exception is the kitchen line on a serve, which counts as short.</p>

<h2 id="serve">How do you serve in pickleball?</h2>
<p>You serve underhand from behind your baseline, diagonally across the net into the opposite service court, and the ball must clear the kitchen line. You get one attempt, and a serve that touches the net but lands in the correct court is simply in play.</p>
<ul>
<li>A serve landing on the sideline, baseline or centreline is good. Landing in the kitchen or on the kitchen line is a short serve, and landing in the wrong court is a fault.</li>
<li>You serve from the right half when your side's score is even and from the left half when it is odd.</li>
<li>In Pickle Ball Dual press a hit key to serve: <kbd>Space</kbd> is a fast deep serve, <kbd>L</kbd> a lob serve and <kbd>J</kbd> or <kbd>K</kbd> a soft serve. The game does not check the paddle height at contact that the official underhand-serve rule requires.</li>
</ul>

<h2 id="two-bounce">What is the two-bounce rule in pickleball?</h2>
<p>The two-bounce rule says the ball must bounce once on each side after the serve before anyone may volley it: the receiving side must let the serve bounce, and the serving side must let the return bounce before hitting its third shot. After those two bounces, volleys are allowed.</p>
<p>It stops the serving team from rushing the net behind a big serve and keeps the opening shots a rally rather than a smash contest. In Pickle Ball Dual, volleying too early is a "Two-bounce violation" fault, the hint line reminds you whenever the rule applies, and the foot ring turns red when swinging would be a fault.</p>

<h2 id="kitchen">What is the kitchen (non-volley zone) in pickleball?</h2>
<p>The kitchen is the 7 ft (2.13 m) zone on each side of the net where you may not volley, meaning hit the ball before it bounces. The kitchen lines belong to the kitchen, so standing on the line counts as standing in it.</p>
<ul>
<li>You may stand in the kitchen at any time, and you may hit a ball that has bounced there.</li>
<li>It is a fault to volley while standing in or touching the kitchen.</li>
<li>It is also a fault if your momentum after a volley carries you into the kitchen. The game uses a simple version of this: stepping into the kitchen within 0.6 s of a volley is a fault.</li>
<li>The kitchen is why dinking exists: a soft ball that bounces in the kitchen cannot be volleyed by an opponent standing there.</li>
</ul>

<h2 id="faults">What counts as a fault in pickleball?</h2>
<p>A fault ends the rally and the side that committed it loses the rally. In Pickle Ball Dual the faults are: the ball landing out, the ball hitting the net and not crossing, bouncing twice on your side, volleying against the two-bounce rule, a kitchen violation, the ball hitting a player's body, and serving short or into the wrong court.</p>
<div class="tablewrap"><table>
<caption class="sr">Faults in the game</caption>
<thead><tr><th scope="col">Game call</th><th scope="col">What happened</th></tr></thead>
<tbody>
<tr><th scope="row">Out</th><td>The ball landed outside the lines (the lines themselves are in).</td></tr>
<tr><th scope="row">Into the net</th><td>The ball hit the net and did not cross.</td></tr>
<tr><th scope="row">Double bounce</th><td>The ball bounced twice on one side before it was returned.</td></tr>
<tr><th scope="row">Two-bounce violation</th><td>The serve or the return was volleyed before it bounced.</td></tr>
<tr><th scope="row">Kitchen fault</th><td>A volley from the kitchen, or stepping in within 0.6 s of a volley.</td></tr>
<tr><th scope="row">Hit by the ball</th><td>The ball hit a player's body: that player's side loses the rally.</td></tr>
<tr><th scope="row">Short serve / wrong service court</th><td>The serve landed in the kitchen or on its line, or outside the diagonal service court.</td></tr>
</tbody></table></div>
<p>The game does not call every real-world fault. It does not model, for example, touching the net with the paddle or body, hitting the ball twice, or the exact paddle position on a serve.</p>

<h2 id="doubles-scoring">How does traditional (side-out) scoring work in doubles?</h2>
<p>In traditional scoring only the serving side can score a point. Each side gets two servers per turn (except the very first turn of the game), and the side loses the serve, called a side out, when both servers have lost a rally. Games are played to 11 and won by 2.</p>

<h3 id="zero-zero-two">What does 0-0-2 mean in pickleball?</h3>
<p>0-0-2 is the score call at the start of a doubles game: the serving side has 0, the receiving side has 0, and the person serving is server number 2. The side that serves first gets only one server in its first turn, so it starts on server 2 and loses the serve after its first lost rally.</p>

<h3 id="server-numbers">What do server 1 and server 2 mean?</h3>
<p>The score is called as three numbers: the serving side's points, the receiving side's points, and the server number (1 or 2). Server 1 serves first in each turn; if the serving side loses a rally, server 2, the partner, serves next; if server 2 loses a rally, it is a side out.</p>
<ul>
<li>A turn starts with the player standing in the <b>right</b> court as server 1 (except the opening 0-0-2 serve).</li>
<li>When the serving side wins a rally it scores a point, the two partners swap halves, and the same server serves again from the other half.</li>
<li>When the serving side loses a rally, server 1 becomes server 2 (the partner serves from the half they are already standing in); if server 2 loses, it is a side out.</li>
<li>The receiving side never swaps halves, and the receiver is the opponent diagonally opposite the server.</li>
</ul>
<p><b>Example:</b> the game starts at 0-0-2. If the serving side wins the rally, it is 1-0-2. If it loses the rally instead, it is a side out and the other side serves at 0-0-1. If that side then wins a rally, it is 1-0-1; if it then loses a rally, it is 1-0-2 (the partner serves), and a second lost rally hands the serve back.</p>

<h2 id="singles-scoring">How does scoring work in singles?</h2>
<p>In singles there is one server per turn and only the server scores. You serve from the right half when your score is even and from the left half when it is odd, and the call has two numbers: the server's score, then the receiver's. A lost rally by the server is an immediate side out.</p>

<h2 id="rally-scoring">What is rally scoring in pickleball?</h2>
<p>In rally scoring every rally scores a point for the side that wins it, whether that side served or not. In Pickle Ball Dual rally games go to 15 points and are won by 2.</p>
<ul>
<li>The serving side serves from the right half when its score is even and from the left half when it is odd.</li>
<li>In doubles the players do not swap halves; the player standing on the correct half serves.</li>
<li>There is no second server: when the serving side loses a rally, it is a side out.</li>
<li>The call has two numbers: the server's score, then the receiver's.</li>
</ul>
<p>Official rally-scoring formats vary in the real world (games to 15 or 21 are common), so check your event's rules if you play outside the game.</p>

<h2 id="winning">How many points do you need to win a pickleball game?</h2>
<p>In traditional scoring a game is played to 11 points and must be won by 2, so 11-9 wins but 11-10 does not and play continues. In Pickle Ball Dual rally scoring is played to 15, also win by 2. Real tournaments sometimes use 15 or 21 points.</p>

<h2 id="simplified">Which official rules does Pickle Ball Dual simplify?</h2>
<p>The game follows the core rules but simplifies a few details to suit a keyboard game against the AI. If you are learning for real play, remember these differences.</p>
<ul>
<li><b>Kitchen momentum:</b> the real rule is about momentum carrying you into the kitchen after a volley; the game uses a 0.6 s window.</li>
<li><b>Not modelled:</b> end changes, time-outs, touching the net, double hits and the paddle position on a serve.</li>
<li><b>Serve return:</b> returning a serve with the receiver's partner is not penalised.</li>
<li><b>Net cord:</b> a ball that clips the net and carries on is live for any shot.</li>
<li><b>Rally scoring:</b> the game plays to 15, win by 2; real formats vary.</li>
</ul>
`,
    },

    faq: {
      name: 'FAQ',
      title: 'Pickle Ball Dual FAQ: Free Play, Mac, Rules, DUPR',
      description: 'Answers about Pickle Ball Dual: is it free, how to play on a Mac, the two-bounce rule, 0-0-2, dinks, ATP shots, the kitchen, DUPR levels and scoring.',
      h1: 'Pickle Ball Dual FAQ',
      lede: 'Quick answers about the free 3D pickleball game and about pickleball itself. Each answer stands on its own; follow the links for the full guides.',
      faq: [
        ['What is Pickle Ball Dual?', 'Pickle Ball Dual is a free 3D pickleball game that runs in your web browser. You play singles or doubles against computer-controlled opponents at DUPR levels 3.0 to 6.0, using the real rules of pickleball, with no download and no sign-up.'],
        ['Can I play pickleball online for free?', 'Yes. Pickle Ball Dual is free to play online in your browser: open the page, press Play and start a match, with no download, account or payment. You play against AI opponents, because there is no online multiplayer.'],
        ['Does Pickle Ball Dual need a download, plug-in or account?', 'No. It runs as a web page and needs only a recent desktop browser with WebGL and a keyboard. Your settings and last match setup are saved in your own browser, not on a server.'],
        ['How do I play on a Mac?', 'Open Pickle Ball Dual in Safari or Chrome on your Mac, press Play and use the keyboard: W, A, S, D to move, Space to drive, and J, K and L for the drop, dink and lob. If the court does not appear, turn on hardware acceleration in your browser, and choose Low graphics on an older Mac.'],
        ['Which browsers and devices does it work on?', 'Pickle Ball Dual is built for desktop browsers such as recent Chrome and Safari, with WebGL and a keyboard. It has no touch controls, so it is not playable on a phone or tablet without a keyboard.'],
        ['Can I play with friends or against other people online?', 'No. Pickle Ball Dual is single-player: in doubles you and an AI partner face two AI opponents, and in singles you face one. It has no online multiplayer and no accounts.'],
        ['What is the two-bounce rule in pickleball?', 'The two-bounce rule says the serve must bounce on the receiving side and the return must bounce on the serving side before anyone may volley. After those two bounces, players can hit the ball out of the air, except in the kitchen.'],
        ['What does 0-0-2 mean in pickleball?', '0-0-2 is the opening score call in doubles: the serving side has 0, the receiving side has 0, and the server is server number 2. The first serving side gets only one server in its first turn, so it begins as server 2 and loses the serve after its first lost rally.'],
        ['What is the kitchen in pickleball?', 'The kitchen, or non-volley zone, is the 7 ft (2.13 m) area on each side of the net where you may not hit the ball out of the air. You may stand in it, and you may hit a ball that has bounced there. Its lines count as part of the kitchen.'],
        ['What is a dink in pickleball?', 'A dink is a soft, low shot that lands in the opponent\'s kitchen so they cannot attack it. Players trade dinks from the kitchen line until someone pops up a high ball to smash. In the game you dink with the K key.'],
        ['What is an ATP shot in pickleball?', 'An ATP, or around-the-post shot, is hit around the outside of the net post instead of over the net, so it may pass below net height. It is legal if it lands in the opponent\'s court. In Pickle Ball Dual it happens automatically when you reach a wide ball near the net.'],
        ['What is DUPR?', 'DUPR stands for Dynamic Universal Pickleball Rating, a skill rating for pickleball players that runs from about 2.0 to 8.0. Pickle Ball Dual uses four levels (3.0, 4.0, 5.0 and 6.0) to set how strong the AI plays; it is not an official rating and does not change your real DUPR.'],
        ['Which DUPR level should I choose?', 'Start at 3.0 to learn the controls: that AI is slow and makes many errors. Move up to 4.0 when you win comfortably, and try 5.0 and 6.0 when you want fast, patient opponents that attack high balls and rarely make errors.'],
        ['What is the difference between traditional and rally scoring?', 'In traditional (side-out) scoring only the serving side can score and games go to 11, win by 2, with two servers per turn in doubles. In rally scoring every rally gives a point to its winner and the game here goes to 15, win by 2.'],
        ['Does Pickle Ball Dual follow the real pickleball rules?', 'Mostly. It implements the diagonal serve, the two-bounce rule, the kitchen, the common faults, side-out and rally scoring and the 0-0-2 start. It simplifies a few details: kitchen momentum is a 0.6 second window, and it has no end changes, time-outs or net-touch faults.'],
        ['How do I know when to hit the ball?', 'Watch the ring under your player\'s feet: amber means the ball is coming, green means press a hit key now, lime is perfect timing, and red means swinging now would be a fault. The paddle meets the ball about 0.17 seconds after you press.'],
        ['Can I play Pickle Ball Dual in Chinese?', 'Yes. The game and these guides are available in English and Traditional Chinese (繁體中文). Switch language from the main menu or Settings. The referee voice is always English.'],
      ],
      bodyAfter: `<p class="more">Still stuck? Read the full <a href="{{url:how}}">how-to-play guide</a> or the <a href="{{url:rules}}">pickleball rules</a> as the game plays them.</p>`,
    },
  },

  // llms.txt copy
  llms: {
    summary: 'Pickle Ball Dual is a free 3D pickleball game that runs in a desktop web browser. You play singles or doubles against AI opponents at DUPR levels 3.0, 4.0, 5.0 and 6.0, with real pickleball rules. No install, no sign-up, no online multiplayer.',
    facts: [
      'Modes: doubles (you plus an AI partner vs two AI opponents) or singles (you vs one AI).',
      'Scoring: traditional side-out scoring to 11 (win by 2, doubles start at 0-0-2, server 1 and server 2) or rally scoring to 15 (win by 2).',
      'Rules implemented: diagonal serve, two-bounce rule, kitchen (non-volley zone, 7 ft / 2.13 m), faults, line calls (lines are in), around-the-post (ATP) shots.',
      'Shots: drive (Space), drop (J), dink (K), lob (L), automatic smash on high balls, automatic ATP when pulled wide near the net.',
      'Controls: WASD or arrow keys to move, A/D to aim, Esc to pause, M mute, H hide key hints, R skip replay. Keyboard only; no touch controls.',
      'Extras: slow-motion instant replays of highlight points, English referee score calls, English and Traditional Chinese interface, Low/Medium/High graphics.',
      'Court facts used in the game: 20 x 44 ft (6.10 x 13.41 m); net 36 in (0.914 m) at the posts, 34 in (0.864 m) at the centre.',
      'Built with plain ES modules and three.js; no build step. Made by Edward Shih (https://www.linkedin.com/in/edward-shih-43942786). MIT License.',
    ],
  },

  // landing page copy for the home alternate (zh-tw/index.html has its own in content-zh)
};
