// WebGL renderer: shader compilation, texture management, and GL visualizers.
import { VS_SOURCE, STARNEST_FS_SOURCE, DUSTY_MENGER_FS_SOURCE, INDUSTRIAL_3D_FS_SOURCE, CURSED_4D_FS_SOURCE, LIQUID_ACID_FS_SOURCE, SURVEILLANCE_FS_SOURCE } from './shaders.js';

export let glCanvas;
export let gl;

let glProgram;
let positionBuffer;
let glTimeLocation;
let glResolutionLocation;
let glAudioLocation;
let activeShaderMode = null;
const textures = {};

// Initialize GL context (defensive)
export function initGLContext() {
    if (gl) return true;
    glCanvas = document.getElementById("gl-visualizer");
    if (!glCanvas) {
        console.error("gl-visualizer element not found");
        return false;
    }
    gl = glCanvas.getContext("webgl");
    if (!gl) {
        console.error("WebGL context could not be created");
        return false;
    }
    return true;
}

export function resetActiveShaderMode() {
    activeShaderMode = null;
}

// ---------------------------------------------------------------------------
// Shader / Program helpers
// ---------------------------------------------------------------------------

function createShader(glCtx, type, source) {
    const shader = glCtx.createShader(type);
    glCtx.shaderSource(shader, source);
    glCtx.compileShader(shader);
    if (!glCtx.getShaderParameter(shader, glCtx.COMPILE_STATUS)) {
        console.error(glCtx.getShaderInfoLog(shader));
        glCtx.deleteShader(shader);
        return null;
    }
    return shader;
}

function initWebGL(fsSource) {
    if (!initGLContext()) return false;

    const vs = createShader(gl, gl.VERTEX_SHADER, VS_SOURCE);
    const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
    glProgram = gl.createProgram();
    gl.attachShader(glProgram, vs);
    gl.attachShader(glProgram, fs);
    gl.linkProgram(glProgram);

    positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);

    glTimeLocation = gl.getUniformLocation(glProgram, "iTime");
    glResolutionLocation = gl.getUniformLocation(glProgram, "iResolution");
    glAudioLocation = gl.getUniformLocation(glProgram, "iAudio");

    for (let i = 0; i < 4; i++) {
        const loc = gl.getUniformLocation(glProgram, `iChannel${i}`);
        if (loc) {
            gl.useProgram(glProgram);
            gl.uniform1i(loc, i);
        }
    }

    return true;
}

export function compileCustomShader(fsSource) {
    if (!initGLContext()) return { success: false, error: "WebGL not initialized" };

    const vs = createShader(gl, gl.VERTEX_SHADER, VS_SOURCE);
    const shader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(shader, fsSource);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const info = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        return { success: false, error: info || "Unknown compilation error" };
    }

    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, shader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const info = gl.getProgramInfoLog(program);
        gl.deleteProgram(program);
        return { success: false, error: info || "Linking failed" };
    }

    return { success: true };
}

// ---------------------------------------------------------------------------
// Texture helpers
// ---------------------------------------------------------------------------

function getTexture(url) {
    if (!initGLContext()) return null;
    if (textures[url]) return textures[url];

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([128, 128, 128, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

    const img = new Image();
    img.onload = () => {
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    };
    img.onerror = () => {
        const size = 256;
        const data = new Uint8Array(size * size * 4);
        for (let i = 0; i < size * size * 4; i += 4) {
            data[i] = Math.random() * 255;
            data[i + 1] = Math.random() * 255;
            data[i + 2] = Math.random() * 255;
            data[i + 3] = 255;
        }
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    };
    img.src = url;

    textures[url] = tex;
    return tex;
}

// ---------------------------------------------------------------------------
// Core GL draw call
// ---------------------------------------------------------------------------

export function getAudioEnergy(fft, sensitivity) {
    if (!fft || fft.length === 0) return 0;
    let energy = 0;
    const bins = Math.min(fft.length, 64);
    for (let i = 0; i < bins; i++) {
        energy += Math.abs(fft[i]);
    }
    return Math.min((energy / bins) * sensitivity * 100.0, 5.0);
}

export function drawGLVisualizer(fsSource, modeName, fft, sensitivity, customTextures = []) {
    if (!initGLContext()) return;

    if (activeShaderMode !== modeName) {
        initWebGL(fsSource);
        activeShaderMode = modeName;
    }

    const energy = getAudioEnergy(fft, sensitivity);

    gl.useProgram(glProgram);
    const positionLocation = gl.getAttribLocation(glProgram, "position");
    gl.enableVertexAttribArray(positionLocation);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    gl.uniform2f(glResolutionLocation, glCanvas.width, glCanvas.height);
    gl.uniform1f(glTimeLocation, performance.now() / 1000);
    gl.uniform1f(glAudioLocation, energy);

    // Unbind all textures by default
    for (let i = 0; i < 4; i++) {
        gl.activeTexture(gl.TEXTURE0 + i);
        gl.bindTexture(gl.TEXTURE_2D, null);
    }

    if (modeName === "cursed_4d") {
        const tex0 = getTexture("/assets/cursed_texture.jpg");
        if (tex0) {
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, tex0);
        }
    } else if (modeName === "dusty") {
        const tex0 = getTexture("/assets/dusty_texture.jpg");
        if (tex0) {
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, tex0);
        }
    } else if (customTextures && customTextures.length > 0) {
        for (let i = 0; i < 4; i++) {
            if (customTextures[i]) {
                const tex = getTexture(customTextures[i]);
                if (tex) {
                    gl.activeTexture(gl.TEXTURE0 + i);
                    gl.bindTexture(gl.TEXTURE_2D, tex);
                }
            }
        }
    }

    gl.drawArrays(gl.TRIANGLES, 0, 6);
}

// ---------------------------------------------------------------------------
// Public GL visualizer entry points
// ---------------------------------------------------------------------------

export function drawStarNestVisualizer(fft, sensitivity) {
    drawGLVisualizer(STARNEST_FS_SOURCE, "starnest", fft, sensitivity);
}

export function drawDustyMengerVisualizer(fft, sensitivity) {
    drawGLVisualizer(DUSTY_MENGER_FS_SOURCE, "dusty", fft, sensitivity);
}

export function drawIndustrial3DVisualizer(fft, sensitivity) {
    drawGLVisualizer(INDUSTRIAL_3D_FS_SOURCE, "industrial_3d", fft, sensitivity);
}

export function drawCursed4DVisualizer(fft, sensitivity) {
    drawGLVisualizer(CURSED_4D_FS_SOURCE, "cursed_4d", fft, sensitivity);
}

export function drawLiquidAcidVisualizer(fft, sensitivity) {
    drawGLVisualizer(LIQUID_ACID_FS_SOURCE, "acid", fft, sensitivity);
}

export function drawSurveillanceVisualizer(fft, sensitivity) {
    drawGLVisualizer(SURVEILLANCE_FS_SOURCE, "surveillance", fft, sensitivity);
}

export function drawCustomVisualizer(source, fft, sensitivity) {
    drawGLVisualizer(source, "custom", fft, sensitivity);
}

// ---------------------------------------------------------------------------
// Canvas resize
// ---------------------------------------------------------------------------

export function resizeGLCanvas() {
    if (!initGLContext()) return;
    glCanvas.width = window.innerWidth;
    glCanvas.height = window.innerHeight;
    if (gl) gl.viewport(0, 0, glCanvas.width, glCanvas.height);
}

export function clearGL() {
    if (gl) {
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
    }
}
