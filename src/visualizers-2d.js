// 2D Canvas visualizers: Neural, Industrial, Retro, Spectrum.

export let canvas;
export let ctx;

// Initialize 2D context (defensive)
export function init2DContext() {
    if (ctx) return true;
    canvas = document.getElementById("visualizer");
    if (!canvas) {
        console.error("visualizer canvas element not found");
        return false;
    }
    ctx = canvas.getContext("2d");
    if (!ctx) {
        console.error("2D context could not be created");
        return false;
    }
    return true;
}

// ---------------------------------------------------------------------------
// Shared state (data pools — Rule 3: no dynamic allocation in hot loops)
// ---------------------------------------------------------------------------

export const prevFft = new Array(512).fill(0);
const frameAverages = { bass: 0, mid: 0, treble: 0 };

export const MAX_NEURAL_POINTS = 256;
export const neuralPoints = Array.from({ length: MAX_NEURAL_POINTS }, () => ({ x: 0, y: 0 }));

export const MAX_SPARKS = 200;
export const MAX_SMOKE = 100;
export const industrialSparks = Array.from({ length: MAX_SPARKS }, () => ({ active: false }));
export const industrialSmoke = Array.from({ length: MAX_SMOKE }, () => ({ active: false }));
export const pistonInfo = { leftX: 0, rightX: 0, y: 0, pistonWidth: 0, pistonHeight: 0 };

let retroOffset = 0;

export const MAX_MATRIX_COLUMNS = 256;
export const matrixDrops = new Float32Array(MAX_MATRIX_COLUMNS).fill(1).map(() => Math.random() * -100);
export const MATRIX_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ$+-*/=%\"'#&_(),.;:?!\\|{}<>[]^~".split("");

export const MAX_VORTEX_RINGS = 50;
export const vortexRings = Array.from({ length: MAX_VORTEX_RINGS }, (_, i) => ({ z: (i / MAX_VORTEX_RINGS) * 2000, angle: 0 }));

// ---------------------------------------------------------------------------
// Math helpers
// ---------------------------------------------------------------------------

export function lerp(start, end, amt) {
    return (1 - amt) * start + amt * end;
}

export function calculateAverages(fft, sensitivity, maxBins) {
    let bass = 0;
    let mid = 0;
    let treble = 0;
    for (let i = 0; i < maxBins; i++) {
        const val = (fft[i] || 0) * sensitivity;
        prevFft[i] = lerp(prevFft[i] || 0, val, 0.4);
        const sVal = prevFft[i];
        if (i < 10) bass += sVal;
        else if (i < 100) mid += sVal;
        else treble += sVal;
    }
    frameAverages.bass = (bass / 10) * 5000;
    frameAverages.mid = (mid / 90) * 8000;
    frameAverages.treble = (treble / (maxBins - 100)) * 12000;
    return frameAverages;
}

// ---------------------------------------------------------------------------
// Neural Core visualizer
// ---------------------------------------------------------------------------

export function drawNeuralCore(cx, cy, bass, mid) {
    if (!init2DContext()) return 0;
    const coreRadius = 120 + (bass * 1.5);
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreRadius);
    grad.addColorStop(0, `rgba(102, 252, 241, ${0.8 + bass * 0.005})`);
    grad.addColorStop(0.5, `rgba(69, 162, 158, ${0.4 + mid * 0.005})`);
    grad.addColorStop(1, "rgba(11, 12, 16, 0)");
    ctx.beginPath();
    ctx.arc(cx, cy, coreRadius, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
    return coreRadius;
}

export function drawNeuralRing(cx, cy, coreRadius, maxBins) {
    if (!init2DContext()) return;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < maxBins; i += 2) {
        const angle = (i / maxBins) * Math.PI * 2;
        const amplitude = Math.pow(prevFft[i], 1.2) * 15000;
        const r = coreRadius + amplitude;
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r;
        neuralPoints[i].x = x;
        neuralPoints[i].y = y;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = `rgba(102, 252, 241, ${0.5 + frameAverages.treble * 0.01})`;
    ctx.stroke();
}

export function drawNeuralVisualizer(fft, sensitivity) {
    if (!init2DContext()) return;
    ctx.fillStyle = "rgba(11, 12, 16, 0.4)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const maxBins = Math.min(fft.length, MAX_NEURAL_POINTS);

    const avg = calculateAverages(fft, sensitivity, maxBins);
    const coreRadius = drawNeuralCore(cx, cy, avg.bass, avg.mid);
    drawNeuralRing(cx, cy, coreRadius, maxBins);

    if (avg.treble > 5) {
        ctx.beginPath();
        const numLines = Math.min(Math.floor(avg.treble * 2), 40);
        for (let j = 0; j < numLines; j++) {
            const p1 = neuralPoints[Math.floor(Math.random() * (maxBins / 2)) * 2];
            const p2 = neuralPoints[Math.floor(Math.random() * (maxBins / 2)) * 2];
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
        }
        ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
        ctx.lineWidth = 1;
        ctx.stroke();
    }
}

// ---------------------------------------------------------------------------
// Industrial visualizer
// ---------------------------------------------------------------------------

export function getNextFromPool(pool) {
    return pool.find(p => !p.active);
}

export function updateIndustrialSparks() {
    if (!init2DContext()) return;
    for (const s of industrialSparks) {
        if (!s.active) continue;
        s.x += s.vx;
        s.y += s.vy;
        s.vy += 1.2;
        s.life -= 0.03;
        ctx.strokeStyle = (s.life < 0.3) ? `rgba(255, 69, 0, ${s.life})` : s.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x - s.vx * 0.4, s.y - s.vy * 0.4);
        ctx.stroke();
        if (s.life <= 0) s.active = false;
    }
}

export function updateIndustrialSmoke() {
    if (!init2DContext()) return;
    for (const p of industrialSmoke) {
        if (!p.active) continue;
        p.x += p.vx;
        p.y += p.vy;
        ctx.fillStyle = `rgba(60, 60, 60, ${p.opacity})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        if (p.y < -150) p.active = false;
    }
}

export function updatePistonInfo(bass, mid, cx, cy) {
    if (!init2DContext()) return;
    const pistonWidth = Math.max(canvas.width * 0.15, 100);
    const pistonHeight = canvas.height * 0.6;
    const pistonTravel = (canvas.width * 0.5) - (pistonWidth / 2);
    const extension = Math.min((bass * 5) + (bass > 10 ? Math.pow(bass, 1.5) : 0), pistonTravel);

    pistonInfo.leftX = -pistonWidth + extension;
    pistonInfo.rightX = canvas.width - extension;
    pistonInfo.y = cy - (pistonHeight / 2);
    pistonInfo.pistonWidth = pistonWidth;
    pistonInfo.pistonHeight = pistonHeight;

    ctx.fillStyle = "#2c201d";
    ctx.strokeStyle = "#8b4513";
    ctx.lineWidth = 6;
    ctx.fillRect(pistonInfo.leftX, pistonInfo.y, pistonWidth, pistonHeight);
    ctx.strokeRect(pistonInfo.leftX, pistonInfo.y, pistonWidth, pistonHeight);
    ctx.fillRect(pistonInfo.rightX, pistonInfo.y, pistonWidth, pistonHeight);
    ctx.strokeRect(pistonInfo.rightX, pistonInfo.y, pistonWidth, pistonHeight);

    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.lineWidth = 4;
    for (let i = 1; i <= 4; i++) {
        const lineY = pistonInfo.y + (pistonHeight * 0.2 * i);
        ctx.beginPath(); ctx.moveTo(pistonInfo.leftX, lineY); ctx.lineTo(pistonInfo.leftX + pistonWidth, lineY); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(pistonInfo.rightX, lineY); ctx.lineTo(pistonInfo.rightX + pistonWidth, lineY); ctx.stroke();
    }

    ctx.fillStyle = "rgba(255, 120, 0, 0.4)";
    const midLines = Math.min(Math.floor(mid / 2), 15);
    for (let i = 0; i < midLines; i++) {
        const yRand = pistonInfo.y + Math.random() * pistonHeight;
        ctx.fillRect(pistonInfo.leftX, yRand, pistonWidth, Math.random() * 6 + 1);
        ctx.fillRect(pistonInfo.rightX, yRand, pistonWidth, Math.random() * 6 + 1);
    }
}

export function spawnIndustrialParticles(bass, mid) {
    if (Math.random() < 0.4) {
        const s = getNextFromPool(industrialSmoke);
        if (s) {
            Object.assign(s, {
                active: true, x: Math.random() * canvas.width, y: canvas.height + 50,
                size: Math.random() * 150 + 50, opacity: Math.random() * 0.08 + 0.02,
                vx: (Math.random() - 0.5) * 2, vy: -Math.random() * 2 - 1,
            });
        }
    }

    if (bass > 20 || mid > 20) {
        const numSparks = Math.floor(Math.random() * 20 * (bass / 50 + 0.5));
        for (let i = 0; i < numSparks; i++) {
            const sp = getNextFromPool(industrialSparks);
            if (!sp) break;
            const isLeft = Math.random() > 0.5;
            Object.assign(sp, {
                active: true, x: isLeft ? pistonInfo.leftX + pistonInfo.pistonWidth : pistonInfo.rightX,
                y: pistonInfo.y + Math.random() * pistonInfo.pistonHeight,
                vx: (isLeft ? 1 : -1) * (Math.random() * 20 + 5),
                vy: (Math.random() - 0.5) * 30 - 5, life: 1.0,
                color: Math.random() > 0.3 ? "#ffa500" : "#ff4500",
            });
        }
    }
}

export function drawIndustrialLightning(bass, mid, treble) {
    if (!init2DContext()) return;
    const totalHit = bass + mid + treble;
    if (totalHit > 200 || bass > 50 || treble > 100) {
        ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(totalHit * 0.005, 0.7)})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.beginPath();
        let lx = Math.max(pistonInfo.leftX + pistonInfo.pistonWidth, 0);
        let ly = pistonInfo.y + (Math.random() * pistonInfo.pistonHeight * 0.8) + (pistonInfo.pistonHeight * 0.1);
        ctx.moveTo(lx, ly);

        while (lx < pistonInfo.rightX) {
            lx += Math.random() * 80 + 20;
            if (lx > pistonInfo.rightX) lx = pistonInfo.rightX;
            ly += (Math.random() - 0.5) * 150;
            ctx.lineTo(lx, ly);
        }
        ctx.lineWidth = 5 + (bass * 0.05);
        ctx.strokeStyle = "white";
        ctx.stroke();
    }
}

export function drawIndustrialVisualizer(fft, sensitivity) {
    if (!init2DContext()) return;
    const maxBins = Math.min(fft.length, 256);
    const avg = calculateAverages(fft, sensitivity, maxBins);

    const bass = avg.bass * 7.5;
    const mid = avg.mid * 2.5;
    const treble = avg.treble * 2.5;

    ctx.fillStyle = "rgba(10, 10, 12, 0.5)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    updateIndustrialSmoke();
    updatePistonInfo(bass, mid, cx, cy);
    spawnIndustrialParticles(bass, mid);
    updateIndustrialSparks();
    drawIndustrialLightning(bass, mid, treble);

    if (treble > 10) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
        const numStrips = Math.min(Math.floor(Math.random() * treble), 40);
        for (let s = 0; s < numStrips; s++) {
            ctx.fillRect((Math.random() * canvas.width) - 50, Math.random() * canvas.height, Math.random() * canvas.width, 8);
        }
    }
}

// ---------------------------------------------------------------------------
// Retro / Synthwave visualizer
// ---------------------------------------------------------------------------

export function drawRetroSun(cx, cy, bass) {
    if (!init2DContext()) return;
    const sunRadius = 200 + (bass * 0.5);
    const sunGrad = ctx.createLinearGradient(0, cy - sunRadius, 0, cy + sunRadius);
    sunGrad.addColorStop(0, "#ff007f");
    sunGrad.addColorStop(1, "#f9a826");

    ctx.beginPath();
    ctx.arc(cx, cy, sunRadius, Math.PI, Math.PI * 2);
    ctx.fillStyle = sunGrad;
    ctx.fill();

    ctx.fillStyle = "rgba(10, 5, 20, 1)";
    const numBands = 6;
    for (let b = 1; b <= numBands; b++) {
        const thickness = b * (2 + bass * 0.02);
        const yPos = cy - (b * 30);
        ctx.fillRect(cx - sunRadius, yPos, sunRadius * 2, thickness);
    }
}

export function drawRetroGrid(cx, cy, bass) {
    if (!init2DContext()) return;
    retroOffset = (retroOffset + 2 + (bass * 0.05)) % 40;
    ctx.strokeStyle = `rgba(0, 255, 255, ${0.3 + bass * 0.005})`;
    ctx.lineWidth = 1.5;

    for (let y = cy; y < canvas.height + 100; y += 40) {
        const relativeY = y - cy + retroOffset;
        const depth = Math.pow(relativeY / (canvas.height - cy), 1.5);
        const yProj = cy + (canvas.height - cy) * depth;
        ctx.beginPath(); ctx.moveTo(0, yProj); ctx.lineTo(canvas.width, yProj); ctx.stroke();
    }

    const numVerts = 30;
    for (let i = 0; i < numVerts; i++) {
        const xDist = (i - numVerts / 2) * 150;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + (xDist * 3), canvas.height); ctx.stroke();
    }
}

export function drawRetroMtnSide(fft, sensitivity, cx, cy, maxBins, isLeft) {
    if (!init2DContext()) return;
    ctx.beginPath();
    ctx.moveTo(isLeft ? 0 : canvas.width, cy);
    for (let i = 0; i < cx; i += 20) {
        const binIndex = Math.floor((i / cx) * (maxBins - 20) + 20);
        const sVal = lerp(prevFft[binIndex] || 0, fft[binIndex] * sensitivity, 0.75);
        prevFft[binIndex] = sVal;
        const amp = Math.pow(sVal, 1.2) * 15000;
        ctx.lineTo(isLeft ? cx - i : cx + i, cy - amp * (i / cx));
    }
    ctx.lineTo(isLeft ? 0 : canvas.width, cy);
    ctx.fillStyle = "rgba(0, 255, 255, 0.2)";
    ctx.fill();
    ctx.strokeStyle = "rgba(0, 255, 255, 0.8)";
    ctx.stroke();
}

export function drawRetroMountains(fft, sensitivity, cx, cy, maxBins) {
    drawRetroMtnSide(fft, sensitivity, cx, cy, maxBins, true);
    drawRetroMtnSide(fft, sensitivity, cx, cy, maxBins, false);
}

export function drawRetroVisualizer(fft, sensitivity) {
    if (!init2DContext()) return;
    ctx.fillStyle = "rgba(10, 5, 20, 0.4)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const cx = canvas.width / 2;
    const cy = canvas.height * 0.6;
    const maxBins = Math.min(fft.length, 256);

    const avg = calculateAverages(fft, sensitivity, maxBins);
    const bass = (avg.bass / 4000) * 6000;

    drawRetroSun(cx, cy, bass);
    drawRetroGrid(cx, cy, bass);
    drawRetroMountains(fft, sensitivity, cx, cy, maxBins);
}

// ---------------------------------------------------------------------------
// Classic Spectrum EQ Bars visualizer
// ---------------------------------------------------------------------------

export function drawSpectrumVisualizer(fft, sensitivity) {
    if (!init2DContext()) return;
    ctx.fillStyle = "rgba(15, 15, 15, 0.3)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const maxBins = Math.min(fft.length, 256);
    const numBars = 64;
    const barWidth = (canvas.width / numBars) - 4;

    for (let i = 0; i < numBars; i++) {
        const ratio = i / numBars;
        const binIndex = Math.floor(Math.pow(ratio, 2) * maxBins);
        const val = fft[binIndex] * sensitivity;
        const sVal = lerp(prevFft[binIndex] || 0, val, 0.85);
        prevFft[binIndex] = sVal;

        const amp = sVal * (40000 + (ratio * 20000));
        const h = Math.min(amp, canvas.height - 20);

        const x = i * (barWidth + 4) + 2;
        const y = canvas.height - h;
        const hue = ratio * 280;

        ctx.fillStyle = `hsl(${hue}, 100%, 60%)`;
        ctx.shadowBlur = 15;
        ctx.shadowColor = `hsl(${hue}, 100%, 50%)`;

        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, h, [4, 4, 0, 0]);
        ctx.fill();
        ctx.shadowBlur = 0;
    }
}

// ---------------------------------------------------------------------------
// Matrix Digital Rain visualizer
// ---------------------------------------------------------------------------

export function drawMatrixVisualizer(fft, sensitivity) {
    if (!init2DContext()) return;
    const avg = calculateAverages(fft, sensitivity, Math.min(fft.length, 128));
    const energy = (avg.bass + avg.mid + avg.treble) / 3;

    ctx.fillStyle = "rgba(0, 0, 0, 0.15)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const fontSize = 16;
    const columns = Math.min(Math.floor(canvas.width / fontSize), MAX_MATRIX_COLUMNS);

    ctx.font = `${fontSize}px monospace`;

    for (let i = 0; i < columns; i++) {
        const char = MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)];
        const x = i * fontSize;
        const y = matrixDrops[i] * fontSize;

        const green = Math.min(155 + energy * 5, 255);
        ctx.fillStyle = `rgb(0, ${green}, 0)`;
        if (energy > 20 && Math.random() > 0.98) ctx.fillStyle = "#fff";

        ctx.fillText(char, x, y);

        const speed = 1 + (energy * 0.2);
        matrixDrops[i] += speed * (0.5 + Math.random() * 0.5);

        if (matrixDrops[i] * fontSize > canvas.height && Math.random() > 0.975) {
            matrixDrops[i] = 0;
        }
    }
}

// ---------------------------------------------------------------------------
// Vortex Tunnel visualizer
// ---------------------------------------------------------------------------

export function drawVortexVisualizer(fft, sensitivity) {
    if (!init2DContext()) return;
    const avg = calculateAverages(fft, sensitivity, 128);
    const bass = avg.bass * 2.0;

    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    for (let i = 0; i < MAX_VORTEX_RINGS; i++) {
        const ring = vortexRings[i];
        const speed = 4 + bass * 0.5;
        ring.z -= speed;
        if (ring.z <= 1) ring.z = 2000;

        const scale = 500 / ring.z;
        const radius = 100 * scale;

        if (radius > canvas.width * 2) continue;

        const hue = (i * 10 + performance.now() * 0.1) % 360;
        ctx.strokeStyle = `hsla(${hue}, 100%, 50%, ${1 - ring.z / 2000})`;
        ctx.lineWidth = 2 * scale;

        ctx.beginPath();
        const offset = Math.sin(ring.z * 0.01 + performance.now() * 0.005) * 50 * scale;
        const reactiveRadius = radius + (i % 2 === 0 ? bass * scale : 0);
        ctx.arc(cx + offset, cy, reactiveRadius, 0, Math.PI * 2);
        ctx.stroke();
    }
}

// ---------------------------------------------------------------------------
// Canvas resize / clear helpers
// ---------------------------------------------------------------------------

export function resize2DCanvas() {
    if (!init2DContext()) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

export function clear2DCanvas() {
    if (!init2DContext()) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}
