const canvas = document.getElementById('bg-canvas');
const ctx = canvas.getContext('2d');

// Attitude-inspection mode (?inspect=1): craft drawn much larger, raids of
// two, short pauses - so flight attitudes can be judged by eye. Never linked
// from the page; the public view is unaffected.
const INSPECT = new URLSearchParams(location.search).has('inspect');

let width, height;

// Deck tones only - no blue.
const RADAR_RGB  = '184, 178, 186';  // deck B8B2BA - instrumentation
const LOCK_RGB   = '242, 238, 238';  // deck F2EEEE - detection symbols
const GROUND_RGB = '139, 133, 147';  // deck-adjacent warm grey - terrain
const EMBER_RGB  = '232, 205, 172';  // deck-adjacent warm, settlement light

// --- 3D craft ---
// Each aircraft is a small faceted body, rotated in three axes and projected
// onto the scene's tilted view. Faces shade by their angle to the light, so
// a banking craft visibly rolls and the silhouette changes with direction.
const CRAFT = {
    hostile: {
        // Delta-wing raider: fuselage pod through the delta, pusher tail behind
        // the trailing edge, winglets up and down at the tips.
        base: [172, 146, 132],
        verts: [[1.55, 0, 0.02],
                [0.95, -0.15, 0.13],
                [0.95, 0.15, 0.13],
                [1, -0.13, -0.09],
                [1, 0.13, -0.09],
                [-1.28, -0.13, 0.11],
                [-1.28, 0.13, 0.11],
                [-1.28, -0.11, -0.07],
                [-1.28, 0.11, -0.07],
                [-1.42, 0, 0.02],
                [0.9, -0.16, 0.02],
                [0.9, 0.16, 0.02],
                [-0.95, -0.16, 0.02],
                [-0.95, 0.16, 0.02],
                [-0.68, -1, 0.02],
                [-0.68, 1, 0.02],
                [-0.95, -1, 0.02],
                [-0.95, 1, 0.02],
                [-0.95, -1, 0.34],
                [-0.95, 1, 0.34],
                [-0.95, -1, -0.15],
                [-0.95, 1, -0.15]],
        faces: [[0,2,1], [0,3,4], [0,1,3], [0,4,2], [1,6,5], [1,2,6], [3,7,8], [3,8,4], [1,7,3], [1,5,7], [2,8,6], [2,4,8], [5,9,7], [7,9,8], [8,9,6], [6,9,5], [10,14,12], [14,16,12], [11,13,15], [15,13,17], [10,12,14], [14,12,16], [11,15,13], [15,17,13], [14,18,16], [14,16,18], [15,17,19], [15,19,17], [14,16,20], [14,20,16], [15,21,17], [15,17,21]]
    },
    interceptor: {
        // Deliberately generic: compact blended delta with a single tail fin.
        // Resembles no real configuration.
        base: [226, 224, 232],
        verts: [[1.35, 0, 0],
                [0.8, -0.155, 0.145],
                [0.8, 0.155, 0.145],
                [0.83, -0.155, -0.115],
                [0.83, 0.155, -0.115],
                [-0.83, -0.14, 0.13],
                [-0.83, 0.14, 0.13],
                [-0.83, -0.14, -0.09],
                [-0.83, 0.14, -0.09],
                [-0.94, 0, 0.01],
                [0.4, -0.155, 0.02],
                [0.4, 0.155, 0.02],
                [-0.72, -0.155, 0.02],
                [-0.72, 0.155, 0.02],
                [-0.54, -0.55, 0.02],
                [-0.54, 0.55, 0.02],
                [-0.72, -0.55, 0.02],
                [-0.72, 0.55, 0.02],
                [-0.58, 0, 0.1],
                [-0.9, 0, 0.42],
                [-0.92, 0, 0.1]],
        faces: [[0,2,1], [0,3,4], [0,1,3], [0,4,2], [1,6,5], [1,2,6], [3,7,8], [3,8,4], [1,7,3], [1,5,7], [2,8,6], [2,4,8], [5,9,7], [7,9,8], [8,9,6], [6,9,5], [10,14,12], [14,16,12], [11,13,15], [15,13,17], [10,12,14], [14,12,16], [11,15,13], [15,17,13], [18,19,20], [18,20,19]]
    }
};

const LIGHT = (() => { const l = [0.3, -0.25, 0.92];
    const n = Math.hypot(...l); return l.map(v => v / n); })();

function drawCraft(x, y, kind, yaw, bank, pitch, sizePx, alpha) {
    const m = CRAFT[kind];
    const cb = Math.cos(bank), sb = Math.sin(bank);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const cy2 = Math.cos(yaw), sy2 = Math.sin(yaw);
    const sc = sizePx / 2;

    const P = m.verts.map(v => {
        let [vx, vy, vz] = v;
        let ty = vy * cb - vz * sb, tz = vy * sb + vz * cb;   // bank about fwd
        let tx = vx * cp + tz * sp; tz = -vx * sp + tz * cp;  // pitch
        const rx = tx * cy2 - ty * sy2, ry = tx * sy2 + ty * cy2; // yaw
        return { sx: x + rx * sc, sy: y + (ry * 0.16 - tz * 0.92) * sc,
                 depth: ry * 0.92 + tz * 0.16, r3: [rx, ry, tz] };
    });

    const faces = m.faces.map(f => {
        const [a, b, c] = f.map(i => P[i]);
        const u = [b.r3[0]-a.r3[0], b.r3[1]-a.r3[1], b.r3[2]-a.r3[2]];
        const w = [c.r3[0]-a.r3[0], c.r3[1]-a.r3[1], c.r3[2]-a.r3[2]];
        let n = [u[1]*w[2]-u[2]*w[1], u[2]*w[0]-u[0]*w[2], u[0]*w[1]-u[1]*w[0]];
        const nl = Math.hypot(...n) || 1;
        n = n.map(v => v / nl);
        // faces turned away from the camera are dropped; the rest shade by
        // their true angle to the light, so bellies fall dark
        if (n[1] * 0.16 - n[2] * 0.92 > 0) return null;
        const dot = n[0]*LIGHT[0] + n[1]*LIGHT[1] + n[2]*LIGHT[2];
        const lit = 0.34 + 0.66 * Math.max(0.14, dot);
        return { pts: [a, b, c], lit, z: (a.depth + b.depth + c.depth) / 3 };
    }).filter(Boolean).sort((f1, f2) => f1.z - f2.z);

    ctx.save();
    ctx.globalAlpha = alpha;
    faces.forEach(f => {
        ctx.fillStyle = `rgb(${Math.round(m.base[0]*f.lit)}, ${Math.round(m.base[1]*f.lit)}, ${Math.round(m.base[2]*f.lit)})`;
        ctx.beginPath();
        ctx.moveTo(f.pts[0].sx, f.pts[0].sy);
        ctx.lineTo(f.pts[1].sx, f.pts[1].sy);
        ctx.lineTo(f.pts[2].sx, f.pts[2].sy);
        ctx.closePath();
        ctx.fill();
    });
    ctx.restore();
}

class Plane {
    constructor(isEnemy = true) {
        this.active = false;
        // Held for a launch that has been committed but not yet flown, so no
        // other engagement can claim this airframe in the meantime.
        this.reserved = false;
        this.isEnemy = isEnemy;
        this.x = 0;
        this.y = 0;
        this.heading = 0;
        this.baseSpeed = 0;
        this.trail = [];
        this.trailOpacity = 1.0;
    }

    // Attacker birth only - interceptors enter the world through launch3D.
    spawn(startY, target = null, startX = null, dir = null) {
        this.active = true;
        this.reserved = false;
        this.dying = false;
        this.opacity = 1.0;
        this.trailOpacity = 1.0;
        this.trail = [];
        this.target = target;
        this.lockT = null;
        this.guidedMark = false;

        // Scale speed with width so a crossing takes a similar time on any
        // screen. Clamped so it does not crawl on a phone.
        const speedScale = Math.max(0.3, width / 1440);

        this.x = startX !== null ? startX : width + 50;
        this.y = startY;
        this.baseSpeed = (4.5 / 60) * speedScale;
        // Ingress side: raids come from either flank, or from overhead.
        this.dir = dir !== null ? dir : (this.x > width * 0.5 ? -1 : 1);
        this.heading = this.dir < 0 ? Math.PI : 0;

        this.prevX = this.x;
        this.prevY = this.y;
    }

    // The attack run: over the horizon ridge, then across the ground plane to
    // the site at a small constant hover - surface-riding, not a ballistic
    // arc. The bow bends the ground track sideways, never upward. s runs 1 at
    // the crest to 0 at the aimpoint.
    setAttackRun(sx, sy, ax, ay, bow) {
        const g = sceneGeometry();
        this.gY = g.groundY;
        this.near = height - 26;
        this.S = { x: sx };
        this.A = { x: ax };
        this.d1 = Math.max(0, depthAt(sx, sy, g));
        this.d0 = Math.max(0.02, depthAt(ax, ay, g));
        this.hover = 7 + Math.random() * 9;
        this.bow = bow;
        this.s = 1;

        const p = this.posAt(1);
        this.x = p.x;
        this.y = p.y;
        this.prevX = this.x;
        this.prevY = this.y;
        this.heading = Math.atan2(ay - sy, ax - sx);
    }

    // Depth settles early (s^1.9): the run drops to the site's depth while
    // still far out, then flies the rest level - so the terminal phase and
    // the intercept read as horizontal flight over the ground. The crest
    // hold keeps the first instants ON the ridge silhouette, so the craft
    // rises from behind the mountains instead of forming on their shadow.
    // This is the run's TRUE depth - detection and the world map both key
    // on it, never on a screen position.
    depthOfS(s) {
        const settle = Math.min(1, (1 - s) / 0.035);
        const dRaw = this.d0 + (this.d1 - this.d0) * Math.pow(s, 1.9);
        return this.d1 + (dRaw - this.d1) * settle;
    }

    posAt(s) {
        const x = this.A.x + (this.S.x - this.A.x) * s + this.bow * Math.sin(Math.PI * s);
        const d = this.depthOfS(s);
        const h = horizonYAt(x, this.gY);
        const hov = this.hover * Math.min(1, (1 - s) * 6);
        // The birth climb: the craft starts BELOW the crest, behind the
        // silhouette, and rises over it - the ridge clip in the drawing
        // hides whatever is still behind the mountain.
        const emerge = Math.max(0, (s - 0.98) / 0.02);
        return { x, y: h + d * (this.near - h) - hov + emerge * 16 };
    }

    // Constant speed along the curve via numeric tangent, quickening
    // toward the end. Shared by the live loop and the planner.
    stepAt(s) {
        const h = 0.002;
        const a = this.posAt(s);
        const b = this.posAt(Math.max(s - h, 0));
        const len = Math.hypot(a.x - b.x, a.y - b.y) / h || 1;
        const sprint = 1 + (1 - s) * 0.5;
        return (this.baseSpeed * sprint) / len;
    }

    // The attack run in world terms: east, depth, and height above the
    // ground under it. The surface rider's U is its small hover - never a
    // screen quantity.
    worldAt(s) {
        const p = this.posAt(s);
        return {
            E: p.x,
            d: this.depthOfS(s),
            U: this.hover * Math.min(1, (1 - s) * 6),
            // The height this run settles at - the line an interceptor
            // should fly to meet it, constant for the whole engagement.
            Ucruise: this.hover,
            x: p.x,
            y: p.y
        };
    }

    // Put an interceptor on the rail in the world frame and point it at its
    // target's bearing. The planner mirrors this exactly.
    launch3D(E, d, target, worldSpeed) {
        this.active = true;
        this.reserved = false;
        this.dying = false;
        this.opacity = 1.0;
        this.trailOpacity = 1.0;
        this.trail = [];
        this.target = target;
        this.baseSpeed = worldSpeed;
        this.E = E;
        this.d = d;
        this.U = RAIL_U;
        const g = sceneGeometry();
        const t = target.worldAt(target.s);
        this.psi = Math.atan2((this.d - t.d) * northSpan(g), t.E - this.E);
        this.turn = 0;
        this.vU = 0;
        // Seed the target's prior state with the release instant, exactly as
        // the planner does, so the first steering frame sees one true step
        // of target motion.
        this.tgtPrev = t;
        this.x = E;
        this.y = groundScreenY(E, d, g) - this.U;
        this.minY = this.y;
        this.prevX = this.x;
        this.prevY = this.y;
        this.heading = 0;
        this.bank = 0;
        this.pitch = 0;
    }

    update(time) {
        if (!this.active) return;

        // Dying: the airframe is already hidden, the track burns back from its
        // oldest end until nothing is left.
        if (this.dying) {
            const removeSpeed = 4;
            if (this.trail.length > 0) this.trail.splice(0, removeSpeed);

            if (this.trail.length === 0) {
                this.active = false;
                this.dying = false;
            } else {
                this.updateTrailWaves(time);
            }
            return;
        }

        this.prevX = this.x;
        this.prevY = this.y;

        if (this.isEnemy) {
            this.s -= this.stepAt(this.s);
            if (this.s <= 0) {          // ran all the way to the site
                this.active = false;
                return;
            }
            const p = this.posAt(this.s);
            this.x = p.x;
            this.y = p.y;
        } else {
            // The interceptor flies the world frame; the screen position is
            // a projection of (E, d, U).
            const g2 = sceneGeometry();
            if (this.target && this.target.active && !this.target.dying) {
                const tgt = this.target.worldAt(this.target.s);
                steerInterceptor3D(this, tgt, this.tgtPrev || tgt, g2);
                this.tgtPrev = tgt;
            } else {
                // Target gone: drop the reference - the craft object may be
                // recycled into a new wave, and a stale lock would guide (and
                // kill) a newborn the frame it crests - and fly on along the
                // last bearing.
                this.target = null;
                this.E += Math.cos(this.psi) * this.baseSpeed;
                this.d -= Math.sin(this.psi) * this.baseSpeed / northSpan(g2);
            }
            this.x = this.E;
            this.y = groundScreenY(this.E, this.d, g2) - this.U;
            // The picture may only climb. The flight holds its height above
            // the ground UNDER it, so terrain rolling beneath would wave the
            // projected track; the drawn track flattens the roll and never
            // gives back a pixel. World state - and every guarantee built on
            // it - is untouched.
            if (this.minY === undefined) this.minY = this.y;
            this.minY = Math.min(this.minY, this.y);
            this.y = this.minY;
        }

        if (this.isEnemy) {
            const mdx = this.x - this.prevX;
            const mdy = this.y - this.prevY;
            // The nose belongs on the flight vector: heading is the true
            // screen track, and the yaw un-squash turns steep screen descent
            // into approach (nose-on), not dive.
            const newHeading = Math.atan2(mdy, mdx);
            let dh = newHeading - this.heading;
            while (dh >  Math.PI) dh -= Math.PI * 2;
            while (dh < -Math.PI) dh += Math.PI * 2;
            // Bank follows turn rate, smoothed, so the raider rolls into its
            // ground-plane curves and levels out of them.
            // negative: roll INTO the turn (right turn drops the right wing)
            this.bank = (this.bank || 0) * 0.92 + Math.max(-0.5, Math.min(0.5, -dh * 26)) * 0.08;
            this.heading = newHeading;
        } else {
            // World attitude, straight from the world states: the nose rides
            // the bearing, pitch is the true climb over the ground, and the
            // wings roll into azimuth turns.
            this.bank = (this.bank || 0) * 0.9
                + Math.max(-0.5, Math.min(0.5, (this.turn || 0) * 20)) * 0.1;
            this.pitch = Math.atan2(this.vU || 0, this.baseSpeed || 1);
            this.heading = Math.atan2(this.y - this.prevY, this.x - this.prevX);
        }

        // Apparent size follows depth: small at the horizon, full in the near
        // field. This is what carries the third dimension.
        this.vis = 0.3 + 0.85 * Math.max(0, Math.min(1.1,
            this.isEnemy ? depthAt(this.x, this.y, sceneGeometry()) : this.d));
        // The raider appears fast and crisp at the crest - rising from
        // behind the ridge, not fading in on its shadow.
        this.opacity = this.isEnemy ? Math.min(1, (1 - this.s) * 45) : 1.0;
        this.trailOpacity = this.opacity;

        if (!this.isEnemy || this.s < 0.975) {
            this.trail.push({ x: this.x, y: this.y, phase: time * 0.005 });
        }

        let maxTrailLength = this.isEnemy ? 150 : 45;
        if (window.innerWidth < 600) maxTrailLength *= 0.6;
        if (this.trail.length > maxTrailLength) this.trail.shift();

        this.updateTrailWaves(time);

        // Deactivate bounds; an interceptor that crosses the far ridge in
        // depth is gone from the world, whatever its screen y.
        if (this.isEnemy && (this.x < -300 || this.x > width + 300)) this.active = false;
        if (!this.isEnemy && (this.x > width + 200 || this.x < -200
                              || this.y < -200 || (this.d ?? 1) < -0.08)) {
            this.active = false;
        }
    }

    updateTrailWaves(time) {
        const isMobile = window.innerWidth < 600;
        for (let i = 0; i < this.trail.length; i++) {
            const point = this.trail[i];
            const waveSpeed = this.isEnemy ? 0.0000000001 : 0.000001;
            let waveAmp = this.isEnemy ? 0.005 : 0.01;
            if (isMobile) waveAmp *= 0.5;
            point.y += Math.sin(time * waveSpeed + point.phase) * waveAmp;
        }
    }

    draw() {
        if (!this.active) return;

        if (this.isEnemy && !this.dying && this.hover !== undefined && this.s < 0.96) {
            const gy = this.y + this.hover;
            const k = this.vis || 1;
            ctx.save();
            ctx.globalAlpha = 0.32;
            ctx.fillStyle = '#000';
            ctx.beginPath();
            ctx.ellipse(this.x, gy, 12 * k, 2.9 * k, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        this.drawTrail(ctx);

        if (!this.dying) {
            ctx.save();
            ctx.globalAlpha = this.opacity;
            this.drawPlaneSprite(ctx, null, true, this.x, this.y);
            ctx.restore();
        }
    }

    drawTrail(ctx) {
        if (this.trail.length < 2) return;

        const start = this.trail[0];
        const end = this.trail[this.trail.length - 1];
        if (Math.abs(end.x - start.x) < 1 && Math.abs(end.y - start.y) < 1) return;

        ctx.save();
        ctx.lineCap = 'round';

        // The interceptor's exhaust line runs short and a shade heavier than
        // the raider's thread.
        if (window.innerWidth < 600) {
            ctx.lineWidth = this.isEnemy ? 1.1 : 1.5;
            ctx.shadowBlur = 3;
        } else {
            ctx.lineWidth = this.isEnemy ? 1.4 : 1.9;
            ctx.shadowBlur = 4;
        }

        ctx.shadowColor = this.isEnemy ? 'hsla(20, 20%, 58%, 0.5)' : 'hsla(30, 12%, 88%, 0.5)';

        const grad = ctx.createLinearGradient(start.x, start.y, end.x, end.y);
        if (this.isEnemy) {
            grad.addColorStop(0, 'hsla(20, 20%, 58%, 0)');
            grad.addColorStop(1, 'hsla(20, 20%, 58%, 1)');
        } else {
            grad.addColorStop(0, 'hsla(30, 12%, 88%, 0)');
            grad.addColorStop(1, 'hsla(30, 12%, 88%, 1)');
        }
        ctx.strokeStyle = grad;

        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        for (let i = 1; i < this.trail.length; i++) {
            ctx.lineTo(this.trail[i].x, this.trail[i].y);
        }
        ctx.stroke();
        ctx.restore();
    }

    drawPlaneSprite(ctx2, img, loaded, x, y) {
        const baseSize = (window.innerWidth < 600 ? 25 : 21) * (this.vis || 1)
                       * (INSPECT ? 3 : 1);
        const sizePx = this.isEnemy ? baseSize : baseSize * 0.8;
        // Both craft draw from their WORLD attitude. Attacker: its screen
        // heading un-squashes into ground yaw. Interceptor: it carries its
        // world azimuth directly (drawCraft's yaw runs south-positive, psi
        // runs north-positive - hence the sign), and its pitch is the true
        // climb over the ground. Negated: in the draw transform positive
        // pitch lowers the nose. The surface rider flies level.
        const yaw = this.isEnemy
            ? Math.atan2(Math.sin(this.heading) / 0.16, Math.cos(this.heading))
            : -(this.psi || 0);
        const pitch = this.isEnemy
            ? 0
            : -(this.pitch || 0);

        // While a raider is still climbing over the crest, the mountain
        // hides everything below its silhouette: only the part that has
        // cleared the ridge line shows.
        const emerging = this.isEnemy && this.s > 0.975 && this.gY !== undefined;
        if (emerging) {
            ctx.save();
            const x0 = x - sizePx * 1.6, x1 = x + sizePx * 1.6;
            ctx.beginPath();
            ctx.moveTo(x0, 0);
            for (let xx = x0; xx <= x1 + 6; xx += 7) {
                ctx.lineTo(xx, horizonYAt(xx, this.gY) + 1);
            }
            ctx.lineTo(x1, 0);
            ctx.closePath();
            ctx.clip();
        }
        drawCraft(x, y, this.isEnemy ? 'hostile' : 'interceptor',
                  yaw, this.bank || 0, pitch, sizePx, this.opacity);
        if (emerging) ctx.restore();
    }

}

// Interceptors committed to a target, waiting out their lead before launching
let pendingLaunches = [];

// Frames until the next raid may form, counted only while the sky is clear.
// Short at page load: the visitor should not stare at an empty sky.
let raidCooldown = 40;

// Pool sized for two raids in the air at once - the next wave crests while
// the last one is still being finished, one interceptor per attacker.
const RAID_MAX = 16;
const planes = Array.from({ length: RAID_MAX }, () => new Plane(true));
const goodPlanes = Array.from({ length: RAID_MAX }, () => new Plane(false));

// --- Explosions ---
class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 2;
        this.vy = (Math.random() - 0.5) * 2;
        this.life = 1.0;
        this.color = color;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.life -= 0.04;
    }

    draw() {
        if (this.life <= 0) return;
        ctx.globalAlpha = Math.max(0, this.life) * 0.9;
        const d = 3.5 + (1 - this.life) * 3;
        ctx.drawImage(glowWarm, this.x - d / 2, this.y - d / 2, d, d);
        ctx.globalAlpha = 1.0;
    }
}

let explosions = [];
let flashes = [];

function triggerExplosion(x, y, k = 1) {
    const colors = ['#F2EEEE', '#E3DFDF', '#B8B2BA', '#8B8593'];
    for (let i = 0; i < 20; i++) {
        explosions.push(new Particle(x, y, colors[Math.floor(Math.random() * colors.length)]));
    }
    // Distant kills go unstaged: no bloom, just the motes and the trails
    // converging - the defence is watched, not celebrated.
    if (k > 0.55) flashes.push({ x, y, t0: null, k });
}

function drawFlashes(time) {
    flashes = flashes.filter(f => {
        if (f.t0 === null) f.t0 = time;
        const p = (time - f.t0) / 480;
        if (p >= 1) return false;
        const d = (9 + p * 32) * f.k;
        ctx.globalAlpha = (1 - p) * (1 - p) * 0.9;
        ctx.drawImage(glowCool, f.x - d / 2, f.y - d / 2, d, d);
        ctx.globalAlpha = (1 - p) * 0.5;
        ctx.drawImage(glowWarm, f.x - d * 0.35, f.y - d * 0.35, d * 0.7, d * 0.7);
        return true;
    });
    ctx.globalAlpha = 1;
}

// ============================================================
//  The scene: ground, protected sites, coverage dome
// ============================================================

// Single source of truth for the scene's geometry, so the engagement and the
// detection symbols can both be gated on the coverage the dome actually has.
function sceneGeometry() {
    const isMobile = window.innerWidth < 600;
    const groundY = height - (isMobile ? 104 : 126);
    return { cx: width / 2, groundY, isMobile };
}

// The land between the far ridge and the bottom of the frame is a depth
// field: 0 at the horizon, 1 at the near edge. Everything lives on it -
// sites, their coverage footprints, and the attackers coming over the ridge.
function horizonYAt(x, groundY) {
    return ridgeY(x, groundY, 0);
}

function depthAt(x, y, g) {
    const h = horizonYAt(x, g.groundY);
    const near = height - 26;
    return (y - h) / Math.max(near - h, 1);
}

// Ground footprints, one per marker; drawing and gating share this shape.
function siteLobe(site, g) {
    return {
        x: site.x,
        d: site.depth,
        rx: width * (g.isMobile ? 0.58 : 0.44),
        rd: 0.62
    };
}

function coverageQ(x, y, g, margin = 1) {
    const d = depthAt(x, y, g);
    if (d < -0.02) return Infinity;         // beyond the horizon: unseen
    let best = Infinity;
    for (const site of sites) {
        const L = siteLobe(site, g);
        const qx = (x - L.x) / (L.rx * margin);
        const qd = (d - L.d) / (L.rd * margin);
        const q = qx * qx + qd * qd;
        if (q < best) best = q;
    }
    return best;
}

// Contact range scales with apparent depth, so the hit looks like a hit at
// any distance. Shared by the live loop and the planner.
function contactRangeAt(x, y, g) {
    const d = Math.max(0, Math.min(1.1, depthAt(x, y, g)));
    return (g.isMobile ? 13.5 : 15) * (0.3 + 0.85 * d) + 1;
}

function insideCoverage(x, y, g, margin = 1) {
    return coverageQ(x, y, g, margin) <= 1;
}

// Terrain profile, evaluated as a function of x so nothing needs storing.
// Wavelengths are set relative to the viewport rather than in pixels: fixed
// pixel wavelengths are wider than a phone screen, which leaves the horizon
// looking like a ruled diagonal instead of ground.
function terrainY(x, groundY) {
    const u = (x / Math.max(width, 1)) * Math.PI * 2;
    return groundY
        - Math.sin(u * 2.1 + 1.3) * 11
        - Math.sin(u * 4.7 + 0.4) * 6
        - Math.sin(u * 9.3 + 2.7) * 3;
}

let glowWarm = null, glowCool = null;

function makeGlowSprite(r, g2, b) {
    const c = document.createElement('canvas');
    c.width = 32; c.height = 32;
    const x = c.getContext('2d');
    const grad = x.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0,    `rgba(255, 255, 255, 1)`);
    grad.addColorStop(0.25, `rgba(${r}, ${g2}, ${b}, 0.85)`);
    grad.addColorStop(0.6,  `rgba(${r}, ${g2}, ${b}, 0.25)`);
    grad.addColorStop(1,    `rgba(${r}, ${g2}, ${b}, 0)`);
    x.fillStyle = grad;
    x.fillRect(0, 0, 32, 32);
    return c;
}

let sites = [];
let stars = [];
let cityLights = [];
let cityClusters = [];
let majorCities = [];

// Settlements. Each cluster is a town: a bright core, a sprawl that thins
// with distance, and a few street-like rows. The clusters also cast a soft
// glow into the sky above themselves, which is what the stars answer.
function layoutCityLights() {
    const { groundY } = sceneGeometry();
    cityLights = [];
    cityClusters = [];

    const near = height - 26;

    let clusterOut = null;
    const addCluster = (cx, depth) => {
        const h = horizonYAt(cx, groundY);
        const cy = h + depth * (near - h);
        const size = 0.45 + depth * 1.0;              // near towns are bigger
        const c = { x: cx, y: cy, depth, size, buildings: [] };
        cityClusters.push(c);
        clusterOut = c;

        // Structures: a modest skyline around the core. Heights and widths
        // scale with depth, and every building carries a few lit windows that
        // join the same twinkle pass as the street lights.
        const nB = 26 + Math.floor(depth * 40);
        for (let b = 0; b < nB; b++) {
            const bw = (3 + Math.random() * 5) * size;
            const bh = (7 + Math.random() * 18) * size * (0.5 + depth * 0.8);
            const bx = cx + (Math.random() - 0.5) * 1.7 * (48 + depth * 165) * size * 0.72;
            const by = cy + (Math.random() - 0.5) * 0.8 * (7 + depth * 26) * size;
            if (by <= horizonYAt(bx, groundY) + 1 || by > height - 4) continue;
            c.buildings.push({ x: bx, y: by, w: bw, h: bh });

            const cols = Math.max(1, Math.floor(bw / 2.6));
            const rows = Math.max(1, Math.floor(bh / 4));
            // per-building grid phase: rows align within one facade, never
            // across the skyline
            const gpx = Math.random() * 2.6, gpy = Math.random() * 4;
            for (let wc = 0; wc < cols; wc++) {
                for (let wr = 0; wr < rows; wr++) {
                    if (Math.random() > 0.55) continue;      // dark windows too
                    cityLights.push({
                        x: bx - bw / 2 + 1 + gpx + wc * 2.6,
                        y: by - bh + 2 + gpy + wr * 4,
                        r: 1,
                        a: 0.68 * (0.5 + depth * 0.7),
                        warm: true,
                        phase: Math.random() * Math.PI * 2,
                        rate: 0.0004 + Math.random() * 0.0012
                    });
                }
            }
        }

        // Core and sprawl: density falls off from the centre.
        const n = Math.round((72 + depth * 165) * (0.7 + Math.random() * 0.6));
        const spreadX = (48 + depth * 165) * size;
        const spreadY = (7 + depth * 26) * size;
        for (let i = 0; i < n; i++) {
            const gx = (Math.random() + Math.random() + Math.random()) / 3 - 0.5;
            const gy = (Math.random() + Math.random() + Math.random()) / 3 - 0.5;
            const x = cx + gx * 2.4 * spreadX;
            const y = cy + gy * 2.4 * spreadY;
            if (y <= horizonYAt(x, groundY) + 1 || y > height - 4) continue;
            const core = Math.hypot(gx, gy) < 0.16;
            cityLights.push({
                x, y,
                r: core ? 1.7 : (depth > 0.6 ? 1.2 : 0.9),
                a: (core ? 1.0 : 0.55) * (0.5 + depth * 0.7) * (0.6 + Math.random() * 0.6),
                warm: core || Math.random() < 0.45,
                phase: Math.random() * Math.PI * 2,
                rate: 0.0006 + Math.random() * 0.0016
            });
        }

        // Lanes: short walked lamp strings through the town - no ruled rows.
        const rows = 6 + Math.floor(depth * 6);
        for (let rIdx = 0; rIdx < rows; rIdx++) {
            const sx2 = cx + (Math.random() - 0.5) * 1.4 * spreadX;
            const sy2 = cy + (Math.random() - 0.5) * 1.6 * spreadY;
            const a2 = Math.random() * Math.PI * 2;
            const len = 26 + Math.random() * 46;
            walkRoad(sx2, sy2,
                sx2 + Math.cos(a2) * len, sy2 + Math.sin(a2) * len * 0.4,
                { r: 1, a: 0.62 * (0.5 + depth * 0.7), lamp: true, step: 6.5 });
        }
        return clusterOut;
    };

    // Three major cities on a fixed plan - these are the protected places the
    // raids come for - plus a few independent settlements between them.
    const majorsPlan = [
        { fx: 0.18, depth: 0.62 },
        { fx: 0.50, depth: 0.86 },
        { fx: 0.82, depth: 0.68 }
    ];
    majorCities = majorsPlan.map(m => addCluster(width * m.fx, m.depth));

    const extras = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < extras; i++) {
        addCluster(width * (0.08 + Math.random() * 0.84), 0.12 + Math.random() * 0.55);
    }

    // Roads: strings of lamps. A main street through each town, and gently
    // bowed connecting roads between neighbouring settlements.
    const road = (x1, y1, x2, y2, depthMix) =>
        walkRoad(x1, y1, x2, y2, { r: 0.9, a: 0.3 * (0.45 + depthMix * 0.55) });

    cityClusters.forEach(c => {
        const spread = (48 + c.depth * 165) * c.size;
        const streets = 1 + (c.depth > 0.45 ? 1 : 0);
        for (let st = 0; st < streets; st++) {
            // A bearing through the town: mostly across, but never a ruled
            // horizontal - each street leans into the depth field.
            const a = (Math.random() - 0.5) * 0.9 + (st === 1 ? 0.7 : 0);
            const dxs = Math.cos(a) * spread * 0.9;
            const dys = Math.sin(a) * spread * 0.28;   // depth axis is squashed
            road(c.x - dxs, c.y - dys, c.x + dxs, c.y + dys, c.depth);
        }
    });

    const byX = [...cityClusters].sort((a, b) => a.x - b.x);
    for (let i = 0; i + 1 < byX.length; i++) {
        const a = byX[i], b2 = byX[i + 1];
        if (Math.abs(b2.x - a.x) < width * 0.55) {
            road(a.x, a.y, b2.x, b2.y, (a.depth + b2.depth) / 2);
        }
    }
}

// Lamp strings from each city to the battery that defends it; needs the
// batteries standing, so it runs after layoutSites.
function layoutServiceRoads() {
    majorCities.forEach((c, i) => {
        const b2 = sites[i];
        if (!b2) return;
        walkRoad(c.x, c.y, b2.x, b2.y,
            { r: 0.9, a: 0.22 * (0.45 + ((c.depth + b2.depth) / 2) * 0.55) });
    });
}

// Sky. Stars are brightest where the night is darkest: each one is dimmed by
// the glow of the towns beneath it and by the horizon haze, so the deep sky
// far from the cities carries the significant stars.
function layoutStars() {
    const { groundY } = sceneGeometry();
    const count = Math.round((width * Math.max(groundY - 90, 1)) / 7000);

    stars = [];
    for (let i = 0; i < count; i++) {
        const x = Math.random() * width;
        const ceiling = horizonYAt(x, groundY) - 14;
        if (ceiling < 4) continue;
        const y = Math.random() * ceiling;

        // City glow shadowing: nearby, low stars fade; high, remote ones gain.
        let shadow = 0;
        for (const c of cityClusters) {
            const dx = Math.abs(x - c.x) / (170 * c.size + 1);
            const dy = Math.max(0, y - (horizonYAt(c.x, groundY) - 260)) / 260;
            shadow = Math.max(shadow, Math.max(0, 1 - dx) * Math.max(0, dy) * (0.35 + c.depth * 0.65));
        }
        const clear = 1 - Math.min(1, shadow);
        if (clear < 0.25 && Math.random() < 0.6) continue;   // washed out entirely

        const significant = clear > 0.75 && Math.random() < 0.32;
        stars.push({
            x, y,
            r: significant ? 2.1 : (Math.random() < 0.18 ? 1.6 : 1.1),
            a: (significant ? 0.75 : 0.2 + Math.random() * 0.4) * (0.35 + clear * 0.65),
            phase: Math.random() * Math.PI * 2,
            rate: 0.0004 + Math.random() * 0.0011
        });
    }
}

function lightWave(x, time) {
    const w = 0.5 * Math.sin(x * 0.004 - time * 0.0012)
            + 0.35 * Math.sin(x * 0.0017 + time * 0.00068 + 2.1)
            + 0.3 * Math.sin(x * 0.0009 - time * 0.00041 + 4.4);
    const surge = Math.pow(Math.max(0, Math.sin(time * 0.00013 + 1.3)), 3);
    return Math.max(0.25, 1 + (0.38 + 0.5 * surge) * w * 0.55);
}

function drawStars(time) {
    ctx.save();
    stars.forEach(s => {
        const tw = (0.75 + 0.25 * Math.sin(time * s.rate + s.phase))
                 * (0.5 + 0.5 * lightWave(s.x, time));
        const d = s.r * 3.5;
        ctx.globalAlpha = Math.min(0.92, s.a * tw);
        ctx.drawImage(glowCool, s.x - d / 2, s.y - d / 2, d, d);
    });
    ctx.globalAlpha = 1;
    ctx.restore();
}

// Every lit line in the scene is walked, never ruled: heading wanders with
// persistent curvature and is pulled to the destination only as it nears.
function walkRoad(x1, y1, x2, y2, opts) {
    const { groundY } = sceneGeometry();
    const dist = Math.hypot(x2 - x1, y2 - y1);
    if (dist < 22) return;
    const step = opts.step || 11;
    let x = x1, y = y1;
    let heading = Math.atan2(y2 - y1, x2 - x1) + (Math.random() - 0.5) * 0.7;
    let curv = 0;
    const maxPts = Math.round((dist / step) * 2.4);
    for (let k = 0; k < maxPts; k++) {
        const remaining = Math.hypot(x2 - x, y2 - y);
        if (remaining < step * 1.4) break;
        if (Math.random() < 0.22) curv = (Math.random() - 0.5) * 0.5;
        const toGoal = Math.atan2(y2 - y, x2 - x);
        let dh = toGoal - heading;
        while (dh > Math.PI) dh -= Math.PI * 2;
        while (dh < -Math.PI) dh += Math.PI * 2;
        heading += curv * 0.5 + dh * (0.06 + 0.5 * Math.max(0, 1 - remaining / (dist * 0.5)));
        x += Math.cos(heading) * step;
        y += Math.sin(heading) * step * 0.45;
        if (y <= horizonYAt(x, groundY) + 2 || y > height - 4 || x < 2 || x > width - 2) continue;
        cityLights.push({
            x: x + (Math.random() - 0.5) * 2,
            y: y + (Math.random() - 0.5) * 3.6,
            r: opts.r,
            a: opts.a,
            warm: true,
            lamp: opts.lamp || false,
            phase: Math.random() * Math.PI * 2,
            rate: 0.0003 + Math.random() * 0.0008
        });
    }
}

let cityBase = null;

function buildCityBase() {
    const { groundY } = sceneGeometry();
    cityBase = document.createElement('canvas');
    cityBase.width = width; cityBase.height = height;
    const b = cityBase.getContext('2d');
    const w = 1;   // static layer carries the mean; the waves live on the points

    cityClusters.forEach(c => {
        const pw = (150 * c.size + 90);
        const ph = (28 * c.size + 13);
        const pool = b.createRadialGradient(0, 0, 0, 0, 0, pw);
        pool.addColorStop(0, `rgba(${EMBER_RGB}, ${Math.min(0.13, 0.085 * (0.35 + c.depth * 0.65) * w)})`);
        pool.addColorStop(1, `rgba(${EMBER_RGB}, 0)`);
        b.save(); b.translate(c.x, c.y); b.scale(1, ph / pw);
        b.beginPath(); b.arc(0, 0, pw, 0, Math.PI * 2); b.fillStyle = pool; b.fill(); b.restore();
    });

    cityClusters.forEach(c => {
        const h = horizonYAt(c.x, groundY);
        const r = 130 * c.size + 80;
        const glow = b.createRadialGradient(c.x, h, 0, c.x, h, r);
        glow.addColorStop(0, `rgba(${EMBER_RGB}, ${Math.min(0.05, 0.03 * (0.4 + c.depth * 0.6))})`);
        glow.addColorStop(1, `rgba(${EMBER_RGB}, 0)`);
        b.fillStyle = glow;
        b.fillRect(c.x - r, h - r, r * 2, r);
    });

    cityClusters.forEach(c => {
        const iw = (48 + c.depth * 165) * c.size * 0.95;
        const ih = (7 + c.depth * 26) * c.size * 2.4;
        const core = b.createRadialGradient(0, 0, 0, 0, 0, iw);
        core.addColorStop(0, `rgba(${EMBER_RGB}, ${Math.min(0.13, 0.085 * (0.35 + c.depth * 0.65) * w)})`);
        core.addColorStop(0.6, `rgba(${EMBER_RGB}, ${Math.min(0.05, 0.032 * (0.35 + c.depth * 0.65) * w)})`);
        core.addColorStop(1, `rgba(${EMBER_RGB}, 0)`);
        b.save(); b.translate(c.x, c.y); b.scale(1, ih / iw);
        b.beginPath(); b.arc(0, 0, iw, 0, Math.PI * 2); b.fillStyle = core; b.fill(); b.restore();
    });

    cityClusters.forEach(c => {
        c.buildings.forEach(bl => {
            b.fillStyle = 'rgba(11, 11, 17, 0.92)';
            b.fillRect(bl.x - bl.w / 2, bl.y - bl.h, bl.w, bl.h);
            const lit = b.createLinearGradient(0, bl.y, 0, bl.y - bl.h);
            const base = Math.min(0.3, 0.2 * (0.35 + c.depth * 0.65) * w);
            lit.addColorStop(0, `rgba(${EMBER_RGB}, ${base})`);
            lit.addColorStop(0.55, `rgba(${EMBER_RGB}, ${base * 0.25})`);
            lit.addColorStop(1, `rgba(${EMBER_RGB}, 0)`);
            b.fillStyle = lit;
            b.fillRect(bl.x - bl.w / 2, bl.y - bl.h, bl.w, bl.h);
        });
    });

    cityLights.forEach(l => {
        if (!l.lamp) return;
        const pw2 = l.r * 13, ph2 = l.r * 4.5;
        b.globalAlpha = Math.min(0.34, l.a * 0.42);
        b.drawImage(glowWarm, l.x - pw2 / 2, l.y - ph2 * 0.3, pw2, ph2);
    });
    b.globalAlpha = 1;
}

function drawCityLights(time) {
    ctx.save();
    if (cityBase) ctx.drawImage(cityBase, 0, 0);

    // Big points keep their halo sprite; the thousands of 1px points batch
    // into alpha buckets - two colors, four buckets, eight fills a frame.
    const buckets = [[], [], [], [], [], [], [], []];
    cityLights.forEach(l => {
        const tw = (0.72 + 0.28 * Math.sin(time * l.rate + l.phase))
                 * lightWave(l.x, time);
        const a = Math.min(1, l.a * tw);
        if (l.r > 1) {
            const d = l.r * 2.7;
            ctx.globalAlpha = a;
            ctx.drawImage(l.warm ? glowWarm : glowCool, l.x - d / 2, l.y - d / 2, d, d);
        } else {
            const bi = Math.min(3, Math.floor(a * 4)) + (l.warm ? 0 : 4);
            buckets[bi].push(l);
        }
    });
    const alphas = [0.16, 0.4, 0.65, 0.9];
    for (let bi = 0; bi < 8; bi++) {
        const list = buckets[bi];
        if (!list.length) continue;
        ctx.globalAlpha = alphas[bi % 4];
        ctx.fillStyle = bi < 4 ? `rgb(${EMBER_RGB})` : `rgb(${LOCK_RGB})`;
        ctx.beginPath();
        list.forEach(l => ctx.rect(l.x, l.y, 1.4, 1.4));
        ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
}

// Sites are spread in depth as well as across, from the horizon down to the
// near ground. Distance is carried by three things at once: how high up the
// screen a site sits, how small it is drawn, and how faint. Spreading them
// along a single line reads as a row of markers; spreading them in depth
// reads as a network holding ground.
function layoutSites() {
    const { groundY } = sceneGeometry();
    const near = height - 26;

    // The battery stands between the city it shields and the horizon the
    // threat comes over - forward of the town, never inside it.
    sites = majorCities.map((c, i) => {
        // Well forward: the meets then close under the ridge by geometry,
        // far above the town glow.
        const depth = Math.max(0.12, c.depth * 0.32);
        const x = Math.max(30, Math.min(width - 30,
            c.x + (Math.random() - 0.5) * width * 0.05));
        const horizon = horizonYAt(x, groundY);   // same datum as the gate
        return {
            x,
            y: horizon + depth * (near - horizon),
            depth,
            scale: 0.45 + depth * 0.95,
            phase: i * 1.7
        };
    });
}


// Distant ridge lines behind the near terrain. Each layer sits higher, is
// flatter, and is drawn lighter than the one in front of it, which is what
// makes the horizon read as land receding rather than as a single cut-out.
function ridgeY(x, groundY, layer) {
    const u = (x / Math.max(width, 1)) * Math.PI * 2;
    if (layer === 0) {
        return groundY - 78
            - Math.sin(u * 1.3 + 2.1) * 15
            - Math.sin(u * 3.1 + 0.4) * 7;
    }
    return groundY - 40
        - Math.sin(u * 1.7 + 4.6) * 18
        - Math.sin(u * 3.9 + 1.9) * 8
        - Math.sin(u * 7.1 + 0.8) * 3;
}

function drawGround() {
    const { groundY } = sceneGeometry();

    ctx.save();

    // Glow from behind the mountains: a soft warm band low in the sky, as if
    // lit country lies beyond the ridge. Drawn before the ridges, which then
    // cut into it as dark silhouettes - the mountains themselves stay dark.
    let rMin = Infinity, rMax = -Infinity;
    for (let x = 0; x <= width; x += 48) {
        const r = horizonYAt(x, groundY);
        if (r < rMin) rMin = r;
        if (r > rMax) rMax = r;
    }
    const bandTop = rMin - 52;
    const bandBot = rMax + 6;
    const back = ctx.createLinearGradient(0, bandTop, 0, bandBot);
    back.addColorStop(0, `rgba(${EMBER_RGB}, 0)`);
    back.addColorStop(1, `rgba(${EMBER_RGB}, 0.125)`);
    ctx.fillStyle = back;
    ctx.fillRect(0, bandTop, width, bandBot - bandTop);

    // Haze sitting on the horizon, so the far ridge emerges from the sky
    // instead of being pasted onto it.
    const haze = ctx.createLinearGradient(0, groundY - 110, 0, groundY + 10);
    haze.addColorStop(0, 'rgba(184, 178, 186, 0)');
    haze.addColorStop(1, 'rgba(184, 178, 186, 0.015)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, groundY - 110, width, 120);

    // Back to front: two distant ridges, then the near terrain the sites
    // stand on. Each is darker than the last, which reads as depth.
    const layers = [
        { at: x => ridgeY(x, groundY, 0), fill: '#12121B', edge: 0.16 },
        { at: x => ridgeY(x, groundY, 1), fill: '#0C0C13', edge: 0.24 },
        { at: x => terrainY(x, groundY),  fill: '#05050A', edge: 0.42 }
    ];

    layers.forEach(layer => {
        ctx.beginPath();
        ctx.moveTo(0, height);
        ctx.lineTo(0, layer.at(0));
        for (let x = 0; x <= width; x += 5) ctx.lineTo(x, layer.at(x));
        ctx.lineTo(width, height);
        ctx.closePath();
        ctx.fillStyle = layer.fill;
        ctx.fill();

    });

    ctx.restore();
}

// Protected locations. Deliberately generic: a footprint and a standing mark,
// no iconography that says what kind of site it is.
function drawSites(time) {
    ctx.save();
    sites.forEach(site => {
        const { x, y } = site;
        const k = site.scale;
        const fade = 0.42 + site.depth * 0.5;

        // Steady core
        const d = 10 * k;
        ctx.globalAlpha = 0.55 * fade;
        ctx.drawImage(glowCool, x - d / 2, y - d / 2, d, d);

        // Breathing halo, flattened onto the ground
        const pulse = (Math.sin(time * 0.0009 + site.phase) + 1) / 2;
        const hw = (26 + pulse * 16) * k;
        ctx.globalAlpha = 0.16 * (1 - pulse) * fade;
        ctx.drawImage(glowCool, x - hw / 2, y - hw * 0.17, hw, hw * 0.34);
    });
    ctx.globalAlpha = 1;
    ctx.restore();
}

// --- Coverage ---
// How far a circle drawn flat on the ground is squashed by the viewing angle.
// This is what turns the footprint into a volume rather than a flat cut-out.
const GROUND_TILT = 0.15;

function drawDome(time) {
    const g = sceneGeometry();
    const near = height - 26;

    ctx.save();
    ctx.lineWidth = 1;

    // No shell standing in the sky: the radar picture lies on the ground.
    // Each site's footprint is its coverage, drawn exactly where the
    // engagement gate believes it to be - the ellipse below is siteLobe
    // mapped through the depth field.
    sites.forEach(site => {
        const L = siteLobe(site, g);
        const h = horizonYAt(site.x, g.groundY);
        const ryScreen = L.rd * Math.max(near - h, 1);
        const fade = 0.28 + site.depth * 0.72;

        const wash = ctx.createRadialGradient(site.x, site.y, 0, site.x, site.y, L.rx);
        wash.addColorStop(0, `rgba(${RADAR_RGB}, ${0.042 * fade})`);
        wash.addColorStop(1, `rgba(${RADAR_RGB}, 0)`);
        ctx.save();
        ctx.translate(site.x, site.y);
        ctx.scale(1, ryScreen / L.rx);
        ctx.beginPath();
        ctx.arc(0, 0, L.rx, 0, Math.PI * 2);
        ctx.fillStyle = wash;
        ctx.fill();
        ctx.restore();
    });

    // The wheel at speed: the whole footprint glows, and the turning shows
    // as a soft bright sector gliding around it - blur, not spokes.
    sites.forEach((site, i) => {
        const L = siteLobe(site, g);
        const h = horizonYAt(site.x, g.groundY);
        const ryScreen = L.rd * Math.max(near - h, 1);
        const fade = 0.28 + site.depth * 0.72;

        const a0 = time * (0.00058 + i * 0.00006) + site.phase;
        const SEG = 24;
        const step = (Math.PI * 2) / SEG;

        ctx.save();
        ctx.translate(site.x, site.y);
        ctx.scale(1, ryScreen / L.rx);
        ctx.globalCompositeOperation = 'lighter';   // the wheel adds light
        // Master gain: three overlapping lobes sum in additive mode, so the
        // layer is scaled as a whole to keep the overlap zones out of clip.
        ctx.globalAlpha = 0.85;

        for (let k = 0; k < SEG; k++) {
            const a = k * step;
            // full-disc base + rotating highlight, smooth around the rim
            const hi = (1 + Math.cos(a - a0)) / 2;
            // Three soft arms carry the rotation - structure the eye can track
            // at a slow rate - under one brighter gliding zone.
            const arm = (1 + Math.cos(4 * (a - a0))) / 2;
            const alpha = (0.013 + 0.11 * arm * arm + 0.1 * hi * hi * hi) * fade;

            // Light lives at mid-radius: a ring profile, so the rotating
            // arms are visible where a wheel is actually seen - at its rim -
            // instead of stacking into a static blob at the hub.
            const wash = ctx.createRadialGradient(0, 0, 0, 0, 0, L.rx);
            wash.addColorStop(0,    `rgba(${RADAR_RGB}, 0)`);
            wash.addColorStop(0.3,  `rgba(${RADAR_RGB}, ${alpha * 0.35})`);
            wash.addColorStop(0.72, `rgba(${RADAR_RGB}, ${alpha})`);
            wash.addColorStop(1,    `rgba(${RADAR_RGB}, 0)`);

            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.arc(0, 0, L.rx, a - step * 0.62, a + step * 0.62);
            ctx.closePath();
            ctx.fillStyle = wash;
            ctx.fill();
        }
        ctx.restore();
    });

    ctx.restore();
}

// --- Detection symbols ---
function drawLock(x, y, size, alpha, guided) {
    const h = size / 2;
    const arm = size * 0.3;

    ctx.save();
    ctx.strokeStyle = `rgba(${LOCK_RGB}, ${alpha})`;
    ctx.lineWidth = guided ? 1.8 : 1.2;
    ctx.lineCap = 'square';
    ctx.beginPath();
    ctx.moveTo(x - h, y - h + arm); ctx.lineTo(x - h, y - h); ctx.lineTo(x - h + arm, y - h);
    ctx.moveTo(x + h - arm, y - h); ctx.lineTo(x + h, y - h); ctx.lineTo(x + h, y - h + arm);
    ctx.moveTo(x + h, y + h - arm); ctx.lineTo(x + h, y + h); ctx.lineTo(x + h - arm, y + h);
    ctx.moveTo(x - h + arm, y + h); ctx.lineTo(x - h, y + h); ctx.lineTo(x - h, y + h - arm);
    ctx.stroke();

    // The guiding mark carries a centre dot: the track is no longer just
    // seen, it is being flown at.
    if (guided) {
        ctx.fillStyle = `rgba(${LOCK_RGB}, ${Math.min(1, alpha * 1.4)})`;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(1.2, size * 0.045), 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

function drawLocks() {
    const g = sceneGeometry();

    planes.forEach(enemy => {
        if (!enemy.active || enemy.dying) return;

        // A detection symbol exists the moment the track shows over the real
        // horizon - by its TRUE depth, so the mark never appears while the
        // craft is still climbing out from behind the crest.
        const dEnemy = enemy.depthOfS(enemy.s);
        if (dEnemy < DETECT_DEPTH) return;
        const inCoverage = Math.min(1, (dEnemy - DETECT_DEPTH) / 0.025);

        // The mark changes state a beat after detection: a wide early-
        // detection box on the crest, then - once the track is held - the
        // tighter, brighter guiding mark, which also takes over the moment
        // an interceptor is in the air.
        // One-way street: the guiding mark takes over AT the launch - which
        // the planner books one to three seconds after detection - and once
        // under guidance a track NEVER falls back to a search box.
        let guided = enemy.guidedMark === true;
        let nearest = Infinity;
        goodPlanes.forEach(good => {
            if (!good.active || good.dying) return;
            if (good.target === enemy) guided = true;
            const d = Math.hypot(enemy.x - good.x, enemy.y - good.y);
            if (d < nearest) nearest = d;
        });
        if (guided) enemy.guidedMark = true;

        const closeness = nearest === Infinity
            ? 0
            : Math.max(0, Math.min(1, 1 - nearest / 900));

        // Early detection wears a wide, generous box - clearly visible the
        // moment the track rises from the horizon - which hands over to the
        // tighter guiding mark hugging the craft.
        const base = (window.innerWidth < 600 ? 54 : 62) * (enemy.vis || 1);
        const size = guided ? base * 0.8 - 12 * closeness
                            : Math.max(base, window.innerWidth < 600 ? 26 : 32);
        const alpha = guided ? (0.5 + closeness * 0.4) * inCoverage
                             : 0.42 * inCoverage;
        drawLock(enemy.x, enemy.y, size, alpha, guided);
    });
}

// ============================================================
//  Scene setup and loop
// ============================================================
function initScene() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
    if (!glowWarm) { glowWarm = makeGlowSprite(232, 205, 172); glowCool = makeGlowSprite(228, 228, 238); }
    layoutCityLights();   // the protected cities come first
    layoutSites();        // batteries deploy forward of them
    layoutServiceRoads(); // lamp strings from each city to its battery
    layoutStars();        // stars answer the city glow
    buildCityBase();      // static urban mass, rendered once
}

// Night sky: a plain gradient, deepest overhead, lifting a little towards the
// horizon. No stars - the sky is the backdrop, the dome and the ground are the
// subject.
function drawSky() {
    const { groundY } = sceneGeometry();
    const sky = ctx.createLinearGradient(0, 0, 0, groundY);
    sky.addColorStop(0, '#0D0D14');
    sky.addColorStop(0.72, '#0F0F16');
    sky.addColorStop(1, '#101018');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, groundY + 2);
}

// A raid: attackers converging on one protected city, each engaged
// separately at its own point along the way in - a layered defence rather
// than one duel repeated. Planning is INCREMENTAL: forming a wave runs many
// flight simulations, so the work is spread ONE PAIR PER FRAME - the craft
// crest and ride the ridge while their engagements are booked, and the
// animation never hitches.
let wavePlan = null;

function scheduleRaid() {
    // A geometry that cannot form a wave against one city tries the others
    // - an awkward roll must not quiet the sky.
    wavePlan = { cities: [...majorCities].sort(() => Math.random() - 0.5),
                 ctx: null, done: false, formed: false };
}

function stepRaidPlan() {
    if (!wavePlan || wavePlan.done) return;
    const ctx = wavePlan.ctx;
    if (!ctx) {
        const city = wavePlan.cities.shift();
        if (!city) { wavePlan.done = true; return; }
        wavePlan.ctx = beginCityPlan(city);
        return;
    }
    ctx.age++;
    if (ctx.idx < ctx.pairs.length) {
        planOnePair(ctx, ctx.pairs[ctx.idx]);
        ctx.idx++;
        return;
    }
    // The city's plan is complete: keep the wave, or stand it down and try
    // the next city.
    if (ctx.placed < (INSPECT ? 2 : 4)) {
        pendingLaunches.splice(ctx.queuedBefore).forEach(L => {
            L.plane.reserved = false;
            L.target.active = false;
        });
        for (const pr of ctx.pairs) if (!pr.committed) pr.attacker.active = false;
        wavePlan.ctx = null;
    } else {
        wavePlan.done = true;
        wavePlan.formed = true;
    }
}

function beginCityPlan(city) {
    const freeAttackers = planes.filter(p => !p.active && !p.reserved);
    const freeInterceptors = goodPlanes.filter(p => !p.active && !p.reserved);

    const wanted = INSPECT ? 2
                 : 5 + Math.floor(Math.random() * 6);   // 5..10
    const size = Math.min(wanted, freeAttackers.length, freeInterceptors.length);
    if (size < (INSPECT ? 2 : 4)) return null;

    const g = sceneGeometry();
    const { groundY } = g;

    const aimX = city.x;
    const aimY = city.y - 6;
    // The city's own depth line: every kill must close north of it.
    const cityDepth = depthAt(aimX, aimY, g);

    const speedScale = Math.max(0.3, width / 1440);
    // The interceptor's WORLD speed over the ground - the planner and
    // launch3D must use the same number.
    const goodBaseSpeed = (42 / 60) * speedScale;

    // A raid may be co-ordinated on more than one axis, the crossing points
    // kept apart so the axes read as distinct approach corridors.
    const axisCount = size >= 6 ? 1 + Math.floor(Math.random() * 3)
                    : size >= 4 ? 1 + Math.floor(Math.random() * 2)
                    : 1;
    const axes = [];
    for (let a = 0; a < axisCount; a++) {
        for (let tries = 0; tries < 24; tries++) {
            const side = Math.random() < 0.5 ? -1 : 1;
            const off = side * (0.24 + Math.random() * 0.42) * width;
            const crossX = Math.max(30, Math.min(width - 30, aimX + off));
            if (Math.abs(crossX - aimX) < width * 0.2) continue;
            if (axes.every(b => Math.abs(b - crossX) > width * 0.14)) { axes.push(crossX); break; }
        }
    }
    if (!axes.length) {
        axes.push(aimX < width / 2 ? Math.min(width - 30, aimX + width * 0.3)
                                   : Math.max(30, aimX - width * 0.3));
    }

    const ctx = {
        g, groundY, aimX, aimY, cityDepth, goodBaseSpeed, axes,
        ripple: 7,
        queuedBefore: pendingLaunches.length,
        placed: 0,
        lastAt: -Infinity,
        lastLaunch: -Infinity,
        idx: 0,
        age: 0,
        pairs: []
    };

    // Crest the far ridge at the axis point, then down through the depth
    // field. The bow bends the run sideways so it arrives on a curve, capped
    // against its own lateral span so it can never cancel the crossing.
    // rollAge records WHEN the run was (re)rolled, so bookings can convert
    // the simulation's crest-zero timeline into live countdown frames.
    ctx.rollIngress = (pair, attempt) => {
        const spreadStep = width * 0.035;
        const sx = Math.max(20, Math.min(width - 20,
            ctx.axes[(pair.i + attempt) % ctx.axes.length]
            + (Math.random() - 0.5) * 2 * spreadStep
            + Math.floor(pair.i / ctx.axes.length) * spreadStep * (Math.random() < 0.5 ? -1 : 1)));
        // Born ON the crest line: the clamp in setAttackRun pins the birth
        // depth to the ridge itself, so the craft pops over the silhouette.
        const sy = horizonYAt(sx, ctx.groundY) - 4;
        pair.attacker.spawn(sy, null, sx, sx > ctx.aimX ? -1 : 1);
        const bow = (Math.random() < 0.5 ? -1 : 1)
            * Math.min(width * (0.015 + Math.random() * 0.035), Math.abs(sx - ctx.aimX) * 0.18);
        pair.attacker.setAttackRun(sx, sy, ctx.aimX, ctx.aimY, bow);
        pair.rollAge = ctx.age;
    };

    // Frames until a run reaches its aimpoint - a coarse arc length is
    // enough: only the ORDER of arrivals matters.
    const framesToImpact = attacker => {
        let len = 0, prev = attacker.posAt(1);
        for (let k = 1; k <= 24; k++) {
            const p = attacker.posAt(1 - k / 24);
            len += Math.hypot(p.x - prev.x, p.y - prev.y);
            prev = p;
        }
        return len / Math.max(attacker.baseSpeed, 0.001);
    };
    const distToSites = attacker =>
        Math.min(...sites.map(s => Math.hypot(s.x - attacker.x, s.y - attacker.y)));

    // The whole wave crests NOW; the defence answers in threat order, one
    // engagement booked per frame while the raiders ride the crest.
    for (let i = 0; i < size; i++) {
        const pair = { attacker: freeAttackers[i], interceptor: freeInterceptors[i],
                       i, committed: false, rollAge: 0 };
        ctx.rollIngress(pair, 0);
        pair.eta = framesToImpact(pair.attacker);
        pair.dist = distToSites(pair.attacker);
        ctx.pairs.push(pair);
    }
    ctx.pairs.sort((a, b) => (a.eta - b.eta) || (a.dist - b.dist));
    return ctx;
}

// Book one attacker's engagement: contacts and launches must land in threat
// order - the closest attacker dies first, and an interceptor sent at a far
// target never leaves before the one meeting the near target.
function planOnePair(ctx, pair) {
    const g = ctx.g;
    const attacker = pair.attacker;
    const interceptor = pair.interceptor;
    let committed = false;

    // A pair whose geometry yields no achievable engagement re-rolls its
    // ingress and tries again, so a planned seven-ship raid arrives as
    // seven, not as whatever happened to survive the first dice.
    for (let attempt = 0; attempt < 3 && !committed; attempt++) {
        if (attempt > 0) ctx.rollIngress(pair, attempt);

        // Respond only to what is on the board, after a short delay.
        const detected = detectionFrame(attacker, g);
        if (detected === null) continue;

        // The engagement belongs to the site closest to where the fight
        // will happen: the middle of this attacker's run. That site is on
        // the raid's own road - never a rail across the screen. If it has
        // no achievable timing, the ingress re-rolls rather than the shot
        // wandering to a flank.
        const midTrack = [];
        for (let ss = 0.86; ss > 0.45; ss -= 1 / 24) midTrack.push(attacker.posAt(ss));
        const distToTrack = site =>
            Math.min(...midTrack.map(pt => Math.hypot(site.x - pt.x, site.y - pt.y)));
        const batteries = [...sites]
            .sort((a, b) => distToTrack(a) - distToTrack(b))
            .slice(0, 1);

        // Only commit to timings the flight model confirms.
        const earliest = detected + REACTION_FRAMES + ctx.placed * ctx.ripple;
        let chosen = null, chosenAt = 0, launchSite = null;

        outer:
        for (const from of batteries) {
            for (const delay of [0, 20, 40, 65, 90, 115]) {
                const launchFrame = Math.ceil(earliest + delay);
                // Systematic: the launch leaves within the deadline after
                // this track's detection, or the ingress re-rolls.
                if (launchFrame - detected > LAUNCH_DEADLINE) break;
                const shot = flyEngagement(attacker, launchFrame, from, ctx.goodBaseSpeed);
                // Gates: contact level (slope), opposed (headOn floor - the
                // meeting-point law drives the real angle far tighter), far
                // out (sAtContact), before the first city line (dContact),
                // drawn track converged (drawnGap), heights aligned (dU),
                // and in threat order (at/launch monotonic).
                if (shot && insideCoverage(shot.x, shot.y, g, 1.15)
                         && shot.sAtContact >= 0.6
                         && shot.dContact <= ctx.cityDepth - 0.1
                         && shot.slope <= 0.42
                         && shot.headOn <= -0.5
                         && shot.drawnGap <= 1.2
                         && shot.dU <= 2
                         && shot.at >= ctx.lastAt
                         && launchFrame >= ctx.lastLaunch) {
                    chosen = launchFrame;
                    chosenAt = shot.at;
                    launchSite = from;
                    break outer;
                }
            }
        }

        if (chosen === null) continue;

        interceptor.reserved = true;
        pendingLaunches.push({
            plane: interceptor,
            x: launchSite.x,
            d: launchSite.depth,
            target: attacker,
            // The simulation counts from this run's crest; the live craft
            // has already flown (age - rollAge) frames of it.
            frames: Math.max(1, chosen - (ctx.age - pair.rollAge)),
            speed: ctx.goodBaseSpeed
        });
        ctx.lastAt = chosenAt;
        ctx.lastLaunch = chosen;
        committed = true;
        pair.committed = true;
        ctx.placed++;
    }

    if (!committed) attacker.active = false;
}

// The system's rhythm, in frames after a track's detection: three seconds
// of early detection, then the interceptor is launched - never later than
// six seconds. The guiding mark takes over at the launch itself.
const REACTION_FRAMES = 180;
const LAUNCH_DEADLINE = 360;

// Detection is line of sight to the REAL horizon: a track exists the
// moment it crests the far ridge, wherever it crests - the network sees
// everything the ground lets it see. Seeing is not shooting: the
// engagement footprint still bounds where a kill may close.
const DETECT_DEPTH = 0.015;   // past the ridge by this much = on the board

// --- The world frame ---
// Every craft lives in world coordinates: E = east (screen x, 1:1), d =
// depth fraction (0 at the far ridge, growing toward the viewer; north is
// -d), U = height above the ground AT ITS OWN POSITION, in pixels. The
// screen is only a projection of this frame: the camera squashes one world
// pixel of north into DEPTH_SQUASH pixels of screen-down, altitude projects
// 1:1, and apparent size follows d. Altitude is always measured against the
// ground under the craft, never against the screen.
const DEPTH_SQUASH = 0.16;
// Launch from the ground itself: the first vertical move is then ALWAYS a
// climb onto the target's line - a rail above the cruise height would make
// the interceptor open by descending.
const RAIL_U = 0;

// Screen y of the ground at (E, d).
function groundScreenY(E, d, g) {
    const h = horizonYAt(E, g.groundY);
    return h + d * ((height - 26) - h);
}

// World-north pixels spanned by one unit of depth.
function northSpan(g) {
    return ((height - 26) - g.groundY) / DEPTH_SQUASH;
}

// One frame of interceptor flight in the world frame, shared verbatim by
// the live craft and the planner. st: {E, d, U, psi, turn, vU, baseSpeed}.
// tgt/tgtPrev: the target's world state now and a frame ago.
function steerInterceptor3D(st, tgt, tgtPrev, g) {
    const NS = northSpan(g);

    // World offsets to the target: east, north, up.
    const dE = tgt.E - st.E;
    const dN = (st.d - tgt.d) * NS;
    const hRange = Math.hypot(dE, dN);

    // Azimuth: fly at the meeting point on the target's own track. Launched
    // early from the site on the raid's road, that line is the target's
    // course reversed - so the merge closes head-on even though the
    // interceptor left seconds after detection, long before the target
    // turned in. On course the command is a constant; the critically damped
    // spring settles onto it once, stiffening as the range closes.
    const tvE = tgt.E - tgtPrev.E;
    const tvN = (tgtPrev.d - tgt.d) * NS;
    const vrad = hRange > 0.001 ? (tvE * dE + tvN * dN) / hRange : 0;
    const closing = Math.max(st.baseSpeed - vrad, st.baseSpeed * 0.25);
    const tGo = hRange / closing;
    const psiCmd = Math.atan2(dN + tvN * tGo, dE + tvE * tGo);
    let dpsi = psiCmd - st.psi;
    while (dpsi >  Math.PI) dpsi -= Math.PI * 2;
    while (dpsi < -Math.PI) dpsi += Math.PI * 2;
    const w = 0.035 * (1 + 2.5 * Math.max(0, Math.min(1, 1 - hRange / 400)));
    st.turn = (st.turn || 0) + w * w * dpsi - 2 * w * (st.turn || 0);
    st.psi += st.turn;

    // Vertical: climb first to the target's height, then hold it level into
    // the hit. The command is the target's ACTUAL height - it only ever
    // rises toward its cruise line, so the climb is monotonic and the two
    // heights agree at the merge. A critically damped spring closes the
    // climb early and never overshoots.
    const ALT_W = 0.06;
    const aU = ALT_W * ALT_W * (tgt.U - st.U)
             - 2 * ALT_W * (st.vU || 0);
    st.vU = (st.vU || 0) + aU;
    st.U += st.vU;

    // Advance over the ground at world speed.
    st.E += Math.cos(st.psi) * st.baseSpeed;
    st.d -= Math.sin(st.psi) * st.baseSpeed / NS;
}

// The frame at which a track first shows over the real horizon - judged on
// its TRUE depth, so a craft still climbing out from behind the crest is
// not yet on the board.
function detectionFrame(attacker, g) {
    let s = 1;
    for (let f = 0; f < 8000; f++) {
        if (attacker.depthOfS(s) >= DETECT_DEPTH) return f;
        s -= attacker.stepAt(s);
        if (s <= 0) return null;
    }
    return null;
}

// Fly a candidate engagement forward in the world frame, under the same
// steering the live interceptor uses, and report where it ends. Positions
// only - no trails, no drawing - so a whole raid can be checked in the
// frame it is planned.
function flyEngagement(attacker, launchFrame, site, goodBaseSpeed) {
    const gGeom = sceneGeometry();
    const NS = northSpan(gGeom);

    // The live loop decrements the countdown before testing it, so a launch
    // booked for N frames actually leaves the rail on frame N-1.
    const launchAt = Math.ceil(launchFrame) - 1;
    let sIm = 1, flying = false, tgtPrev = null;
    const st = { E: site.x, d: site.depth, U: RAIL_U,
                 psi: 0, turn: 0, vU: 0, baseSpeed: goodBaseSpeed };
    // The flight must READ as a climb-out: its screen track may only rise
    // from the rail to the merge. A timing whose opening bearing points
    // south of the site would dip first - it is not a solution.
    let minY = groundScreenY(site.x, site.depth, gGeom) - RAIL_U;

    for (let f = 0; f < 8000; f++) {
        // Order mirrors the live loop exactly: the interceptor is released
        // first and takes its bearing from where the target is at that
        // instant, then the target moves, then steering runs.
        if (!flying && f >= launchAt) {
            const t0 = attacker.worldAt(sIm);
            st.psi = Math.atan2((st.d - t0.d) * NS, t0.E - st.E);
            tgtPrev = t0;
            flying = true;
        }

        sIm -= attacker.stepAt(sIm);
        // Past the far-kill line no contact can be accepted anyway - stop
        // simulating. This is what keeps a planning frame cheap.
        if (sIm < 0.55) return null;
        const tgt = attacker.worldAt(sIm);

        if (flying) {
            steerInterceptor3D(st, tgt, tgtPrev, gGeom);

            // The drawn track never descends, so terrain rolling under the
            // flight leaves it floating a little above the world track. That
            // debt must be paid back BEFORE the merge: reject timings where
            // the drawn craft would still sit above its true height - and
            // above the target - at the hit.
            const iyNow = groundScreenY(st.E, st.d, gGeom) - st.U;
            if (iyNow > minY + 1.2) return null;
            minY = Math.min(minY, iyNow);
            const drawnGap = iyNow - minY;

            // Contact is a WORLD proximity - same place on the range, same
            // height over it - never a screen overlap between different
            // depths.
            const dE = tgt.E - st.E;
            const dN = (st.d - tgt.d) * NS;
            const dU = tgt.U - st.U;
            if (Math.hypot(dE, dN, dU) <= contactRangeAt(tgt.x, tgt.y, gGeom)) {
                // How opposed the two ground tracks close: -1 = pure head-on.
                const tvE = tgt.E - tgtPrev.E;
                const tvN = (tgtPrev.d - tgt.d) * NS;
                const tv = Math.hypot(tvE, tvN) || 1;
                const headOn = (Math.cos(st.psi) * tvE
                              + Math.sin(st.psi) * tvN) / tv;
                const iy = groundScreenY(st.E, st.d, gGeom) - st.U;
                return { x: (tgt.x + st.E) / 2, y: (tgt.y + iy) / 2, at: f,
                         sAtContact: sIm, headOn, drawnGap,
                         dU: Math.abs(dU),
                         dContact: tgt.d,
                         slope: Math.abs(st.vU) / st.baseSpeed };
            }

            // Off the world: past the far ridge in depth or off the sides.
            if (st.d < -0.08 || st.E < -180 || st.E > width + 180) return null;
        }

        tgtPrev = tgt;
        if (tgt.E < -220 || tgt.E > width + 220) return null;
    }
    return null;
}

function animate(time) {
    ctx.clearRect(0, 0, width, height);

    drawSky();
    drawStars(time);

    // Waves form only when fully paired.
    // Raids come in waves: the sky clears, then the next one arrives.
    // Waves ROLL: the next raid may crest while the last few of the
    // previous one are still being run down - the sky never stands empty.
    // Planning is incremental: one engagement is booked per frame.
    {
        if (wavePlan) {
            stepRaidPlan();
            if (wavePlan.done) {
                // A roll that failed to form a wave retries almost at once -
                // a failed roll must never cost the viewer a quiet spell.
                raidCooldown = INSPECT ? 60
                    : wavePlan.formed ? 60 + Math.random() * 130
                    : 25;
                wavePlan = null;
            }
        } else {
            const aloft = planes.filter(p => p.active || p.reserved).length;
            if (aloft <= 2 && pendingLaunches.length <= 2) {
                if (--raidCooldown <= 0) scheduleRaid();
            }
        }
    }

    // Release any interceptor whose lead has run out
    for (let i = pendingLaunches.length - 1; i >= 0; i--) {
        const launch = pendingLaunches[i];
        if (--launch.frames <= 0) {
            launch.plane.launch3D(launch.x, launch.d, launch.target, launch.speed);
            pendingLaunches.splice(i, 1);
        }
    }

    // Land first, then the coverage over it, then the shadow the terrain casts
    // into that coverage, then the sites standing on the ground.
    drawGround();
    drawDome(time);
    // Towns are lit whether or not the radar can see over the hill in front of
    // them, so they go on after the shadow rather than under it.
    drawCityLights(time);
    drawSites(time);

    const allPlanes = [...planes, ...goodPlanes];
    allPlanes.forEach(p => {
        p.update(time);
        p.draw();
    });

    drawLocks();

    // Collisions - true WORLD range: same spot on the ground, same height
    // over it. Two craft at different depths never fake a screen hit.
    const gW = sceneGeometry();
    const NSW = northSpan(gW);
    planes.forEach(enemy => {
        if (!enemy.active) return;
        const ew = enemy.worldAt(enemy.s);
        goodPlanes.forEach(good => {
            if (!good.active) return;

            const range = Math.hypot(ew.E - good.E,
                                     (good.d - ew.d) * NSW,
                                     ew.U - good.U);

            if (good.target === enemy && !enemy.dying && !good.dying
                && range <= contactRangeAt(enemy.x, enemy.y, gW)) {
                const midX = (enemy.x + good.x) / 2;
                const midY = (enemy.y + good.y) / 2;

                triggerExplosion(midX, midY, enemy.vis || 1);

                enemy.dying = true;
                good.dying = true;
                enemy.opacity = 0;
                good.opacity = 0;

                // Both end exactly at the meeting point: the trails converge
                // to one spot and the burst sits on it.
                enemy.x = midX; enemy.y = midY;
                good.x  = midX; good.y  = midY;
            }
        });
    });

    explosions = explosions.filter(p => p.life > 0);
    explosions.forEach(p => {
        p.update();
        p.draw();
    });
    drawFlashes(time);

    requestAnimationFrame(animate);
}

let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(initScene, 100);
});

initScene();
requestAnimationFrame(animate);
