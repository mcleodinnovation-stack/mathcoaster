# 🎢 Function Coaster

Every roller coaster here is the **graph of a function**. Students type a function and choose where the track starts and ends (the domain). Then they ride it in 3D, with real physics, and study the math of their track.

**▶ Play it: https://hackthemarket.github.io/functional_rollercoaster/**

## Opening it

**On phones, tablets and Chromebooks, share the link above.** Phones can't run the app from a file sent by text, email or chat: their preview screens don't run apps, so you'd only see an empty page with a notice pointing to the link.

On a computer you can also use the files directly:

| File | When to use it |
|---|---|
| **`index.html`** (~470 KB) | Double-click to open in any modern browser. The 3D park loads its graphics engine from a free CDN, so it needs internet. Without internet the 3D view is off, but everything else still works, including the ride in the graph. |
| **`function-coaster-offline.html`** (~1.1 MB) | The same app with the 3D engine built in. It works with **no internet at all**. Use it for flaky school Wi-Fi or blocked CDNs. |

Nothing to install and no accounts. Saved tracks and badges stay in each student's own browser.

## What students do

1. **Type a function** such as `-2x^4 + 7x^3 - 4x^2 - 0.5x + 1`. The line under the box shows how the app read it, e.g. "f(x) = −2x⁴ + 7x³ − …", so typos are easy to catch.
2. **Pick the domain** (the track's start and end x). The **⤓0** button snaps both ends onto zeros, so the track starts and ends at ground level.
3. **🔨 Build, then ▶ Ride.** They can switch between four views: front seat, chase camera, side view, and a free "orbit" camera. The graph underneath follows the train and shows the tangent line, the slope, and the point (x, f(x)).

### 🧩 Piecewise coasters
Flip the top-left switch from **ƒ One function** to **🧩 Pieces** and build the track section by section. Each piece has its own formula and its own interval, with ≤ or < at each end.
- **Joint checker:** as students type, the 🧩 Pieces tab marks each joint as:
  - **✓ smooth:** same height and same slope
  - **⚠ corner:** connected, but the slope jumps, so riders feel a jolt
  - **✗ jump:** the train flies off and drops, or slams into a wall if the next piece starts higher
  - **gap:** no piece covers some x-values
- **One-click fixes** come with each problem joint. Examples: "Move piece 2 down 3", "Move the joint to where the pieces cross". If a piece uses a letter like k, the checker writes out the equation to solve (e.g. 2² = k − 2) before offering the answer.
- **Not-a-function errors:** overlapping pieces, or an x included in two pieces with different heights, are refused. The message explains the vertical line test.
- **Graphs:** pieces are color-coded on the graph and the 3D rails, with closed ● and open ○ endpoint dots.
- **Evaluate f(c):** shows which piece an x uses and the substitution step, e.g. f(3) = 2·3 − 2 = 4.
- **Examples** include Find k!, Tangent Takeoff, Stair Steps, Gap Jump, the absolute value written as two pieces, and a smooth 4-piece Smooth Operator.
- You can also type piecewise functions directly: `{2x if 0 <= x < 3; 6 if 3 <= x <= 5}`.

### 📐 Blueprint: the math of the track
- Domain, range, and the start and end heights.
- **Landmarks** (click one to highlight it on the graph):
  - zeros, with multiplicity
  - y-intercept
  - local max and min
  - inflection points
  - sharp corners
  - asymptotes, jumps, holes, and places where the function is undefined, with the reason (e.g. "square root of a negative number")
- Where the function is increasing, decreasing, concave up and concave down (as intervals), the steepest point, the average rate of change, and even/odd symmetry.
- **Polynomials:** standard, factored and vertex forms; degree; leading coefficient; end behavior; real and complex zeros; turning points compared with the degree − 1 maximum; the discriminant for quadratics.
- **Other families:**
  - sinusoids: amplitude, period, midline
  - exponentials: growth or decay factor, asymptote
  - absolute value: the vertex

### 🎢 Real physics
- Gravity is 9.81 m/s², with a little friction.
- **Starting the train:** chain lift, one lift hill, a launch, or gravity only.
- Speed follows **v = √(2gh)**, and an energy bar shows height turning into speed.
- **G-forces** come from how sharply the track curves:
  - concave up (∪) pushes riders into their seats
  - concave down (∩) gives airtime
- A **safety inspector** flags anything above 5 G or below −1.5 G.
- **Flights:** if the track ends in mid-air or has a gap, the train flies along a **parabola**. The app shows that parabola's equation in vertex form, and the train lands at one of its zeros.
- **Ratings:** each ride gets RollerCoaster-Tycoon-style Excitement, Intensity and Nausea scores.

A key idea students discover: G-forces depend on the **shape** of the curve, not its size. At a valley, G ≈ 1 + 2·(drop height)·f″(x). Building the coaster bigger doesn't make it gentler; stretching it horizontally does, because curvature shrinks by k².

### 🧬 Remix
- **Transformation cards:** f(x)+k, f(x−h), a·f(x), f(bx), −f(x), f(−x), |f(x)|, and "add wiggles". Each card shows the rule, what it does, and a before/after preview.
- **Coach tips** come from real test rides. For example: "stretch ×3 → 2.2 G, excitement 8.5".
- **🧪 Thrill Lab** makes a dozen mutations of your track, test-rides each one, and suggests the most exciting ones that are still safe.
- **🎲 Surprise me** generates a new track. It favors fun, ground-to-ground rides.
- **Track library** of 16 examples, including this one: *Teacher's Classic* (the quartic above on [−0.40907, 2.76854]).
- **Parameter sliders:** type letters such as `a(x - h)^2 + k` or `a sin(b x) + c`, and sliders appear. The ▶ button next to a slider animates it.

### 🏅 Missions & challenges
- **28 badges**, each tied to a concept. Examples: Ground to Ground (zeros), Vertex Vision (vertex form), Maxed Out (degree vs. turning points), Mirror Mirror (even functions), Wave Rider (amplitude and period), Zero Hero (factored form), Sky Jump (parabolas), Safety Inspector Approved (curvature and G-forces), and 8 piecewise badges like Seamless (continuity), Butter Smooth (matching slopes), The Missing k, Stair Master (step functions) and Leap of Faith (jump discontinuities).
- **🧩 Match the Track:** 18 levels, from linear functions up to sinusoids, plus 4 piecewise puzzles. A ghost track appears, and students write the function that matches it. They earn stars for the accuracy of the match, and hints reveal key points.
- **🔮 Predict first:** before the ride, students click where they think the train will go fastest, then see how close they were.

### 🗂️ Garage
- Every track built is saved automatically, with its stats.
- **Hall of Fame:** fastest, most exciting, biggest drop, longest jump, and more.
- **Sharing:**
  - Each track has a share link that opens that exact track, and a short code (starts with `FC1-`) that students can paste into "📋 Load a code".
  - **Export** writes all tracks to a `.json` file, e.g. to hand in work. **Import** loads that file on another computer.

## Typing functions

| | |
|---|---|
| powers | `x^2`, `x²` |
| multiply | `2x`, `3(x+1)`, `(x-1)(x+2)` |
| divide | `1/(x+2)` |
| roots | `sqrt(x)`, `√x`, `cbrt(x)`, `x^(1/3)` (odd roots of negative numbers work) |
| absolute value | `|x-3|`, `abs(x-3)` |
| constants | `pi`, `e` |
| trig (radians) | `sin(x)`, `cos(2x)`, `tan(x)`, `sin^2(x)`, `arcsin(x)` |
| logs & exponentials | `ln(x)`, `log(x)`, `log_2(x)`, `e^x`, `2^x` |
| steps | `floor(x)`, `ceil(x)`, `round(x)` |
| piecewise | `{x^2 if 0 <= x < 2; 6 - x if 2 <= x <= 6}` (or use 🧩 Pieces mode) |

## Classroom ideas
- **Warm-up:** ride the Teacher's Classic. Why is it rated "Ultra-extreme"? Use the 🧬 Remix tab to make it pass the safety inspector.
- **Zeros:** build a track that starts and ends on the ground. Then write the same track in factored form.
- **Transformations:** predict what f(x − 2) and 2·f(x) will do to the track *before* clicking the card.
- **Energy:** turn on 🔮 Predict first, and use "🚀 Launch → min?" to discuss v = √(2gh).
- **Algebra 2:** the Blueprint lists complex zeros, a way into the Fundamental Theorem of Algebra. The Wave Lab preset covers amplitude and period.
- **Piecewise functions:** have students predict each joint (smooth, corner or jump) *before* pressing Build, then ride to check. "Find k!" and "Tangent Takeoff" are classic continuity problems. Smoothness, meaning matching slopes, is how real coaster track is designed.

## For developers
The deliverables are built from `src/`, so edit `src/` and rebuild rather than editing the HTML files.

```bash
node build.mjs            # → index.html
node build.mjs --offline  # → function-coaster-offline.html (downloads three.js into vendor/ once)
node tests/math.test.mjs && node tests/analysis.test.mjs && node tests/physics.test.mjs && node tests/piecewise.test.mjs
```

- **`src/js/`**, in load order:
  - util, math (parser, pretty-printer, polynomials, piecewise functions)
  - analysis (zeros, extrema, gaps, piecewise joints)
  - physics (motion, G-forces, flights)
  - 2D graph, 3D world (Three.js r160), audio, storage, content, remix, app and panels
- **`src/style.css`** and **`src/template.html`** hold the styles and page shell.
- **`tests/`** has Node tests for the math and physics engines. They check parsing, root finding, v = √(2gh), G = 1 + v²κ/g, and that landing points are zeros of the flight parabola.
