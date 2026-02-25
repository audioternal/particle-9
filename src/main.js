import { initGLContext, gl, glCanvas, drawStarNestVisualizer, drawDustyMengerVisualizer, drawIndustrial3DVisualizer, drawCursed4DVisualizer, drawLiquidAcidVisualizer, drawSurveillanceVisualizer, drawCustomVisualizer, drawGLVisualizer, compileCustomShader, resetActiveShaderMode, resizeGLCanvas, clearGL } from './gl-renderer.js';
import * as v2d from './visualizers-2d.js';
import * as shaders from './shaders.js';
const { init2DContext, drawNeuralVisualizer, drawIndustrialVisualizer, drawRetroVisualizer, drawSpectrumVisualizer, drawMatrixVisualizer, drawVortexVisualizer, resize2DCanvas, clear2DCanvas } = v2d;

const { invoke } = window.__TAURI__.core;

console.log("Particle 9 main.js starting...");

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------

let canvas, deviceSelect, outputDeviceSelect, modeSelect, btnStart, btnStop, statusDot, statusText, sensitivitySlider, volumeSlider, controlsPanel, btnEditor, editorOverlay, editorInput, btnApplyShader, btnCloseEditor, shaderError, editorNameInput, shaderSuccess, deleteSuccess, editorLanguageLabel, btnNew, btnDelete;
let textureControls, texInputs = [];

function initDOMRefs() {
  canvas = document.getElementById("visualizer");
  deviceSelect = document.getElementById("device-select");
  outputDeviceSelect = document.getElementById("output-device-select");
  modeSelect = document.getElementById("mode-select");
  btnStart = document.getElementById("btn-start");
  btnStop = document.getElementById("btn-stop");
  statusDot = document.getElementById("status-dot");
  statusText = document.getElementById("status-text");
  sensitivitySlider = document.getElementById("sensitivity-slider");
  volumeSlider = document.getElementById("volume-slider");
  controlsPanel = document.getElementById("controls");
  btnEditor = document.getElementById("btn-editor");
  editorOverlay = document.getElementById("editor-overlay");
  editorInput = document.getElementById("custom-shader-input");
  btnApplyShader = document.getElementById("btn-apply-shader");
  btnCloseEditor = document.getElementById("btn-close-editor");
  shaderError = document.getElementById("shader-error");
  editorNameInput = document.getElementById("custom-shader-name");
  shaderSuccess = document.getElementById("shader-success");
  deleteSuccess = document.getElementById("delete-success");
  editorLanguageLabel = document.getElementById("editor-language-label");
  btnNew = document.getElementById("btn-new");
  btnDelete = document.getElementById("btn-delete");
  textureControls = document.getElementById("texture-controls");
  texInputs = [
    document.getElementById("tex-0"),
    document.getElementById("tex-1"),
    document.getElementById("tex-2"),
    document.getElementById("tex-3")
  ];
}

// ---------------------------------------------------------------------------
// Constants & Defaults
// ---------------------------------------------------------------------------

const STORAGE_KEY = "particle9_custom_visualizers";
const DEFAULT_GL_TEMPLATE = `precision highp float;
uniform vec2 iResolution;
uniform float iTime;
uniform float iAudio;

void main() {
    vec2 uv = gl_FragCoord.xy / iResolution.xy;
    vec3 col = 0.5 + 0.5*cos(iTime + uv.xyx + vec3(0,2,4));
    col *= (0.2 + iAudio * 0.8);
    gl_FragColor = vec4(col, 1.0);
}`;

const BUILTIN_GL_SOURCES = {
  starnest: shaders.STARNEST_FS_SOURCE,
  dusty: shaders.DUSTY_MENGER_FS_SOURCE,
  industrial_3d: shaders.INDUSTRIAL_3D_FS_SOURCE,
  cursed_4d: shaders.CURSED_4D_FS_SOURCE,
  acid: shaders.LIQUID_ACID_FS_SOURCE,
  surveillance: shaders.SURVEILLANCE_FS_SOURCE,
};

const BUILTIN_LIST = [
  { id: "neural", name: "Particle 9 (Neural Core)", type: "2d", fn: drawNeuralVisualizer },
  { id: "starnest", name: "Star Nest (Deep Space)", type: "gl" },
  { id: "industrial_3d", name: "Industrial Engine (Masterpiece)", type: "gl" },
  { id: "cursed_4d", name: "4D Machine (Cursed)", type: "gl" },
  { id: "dusty", name: "Dusty Menger (Masterpiece)", type: "gl" },
  { id: "surveillance", name: "Surveillance (Legacy 4K)", type: "gl" },
  { id: "acid", name: "Liquid Acid (Psychedelic)", type: "gl" },
  { id: "industrial", name: "Industrial (Brutalist Machine)", type: "2d", fn: drawIndustrialVisualizer },
  { id: "retro", name: "Synthwave (Grid & Sun)", type: "2d", fn: drawRetroVisualizer },
  { id: "spectrum", name: "Classic EQ Bars", type: "2d", fn: drawSpectrumVisualizer },
  { id: "matrix", name: "Digital Rain (The Matrix)", type: "2d", fn: drawMatrixVisualizer },
  { id: "vortex", name: "Vortex Tunnel (Warp Speed)", type: "2d", fn: drawVortexVisualizer },
];

const BUILTIN_GL_TEXTURES = {
  cursed_4d: ["/assets/cursed_texture.jpg", "", "", ""],
  dusty: ["/assets/dusty_texture.jpg", "", "", ""]
};

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let isCapturing = false;
let animationId;
const CUSTOM_GL_SOURCES = {};
const CUSTOM_GL_TEXTURES = {};
const CUSTOM_2D_SOURCES = {};
const USER_VISUALIZERS = {};
const VISUALIZERS = {};

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function resizeCanvas() {
  init2DContext();
  initGLContext();
  if (v2d.canvas) {
    v2d.canvas.width = window.innerWidth;
    v2d.canvas.height = window.innerHeight;
  }
  resize2DCanvas();
  resizeGLCanvas();
}

// ---------------------------------------------------------------------------
// CRUD Logic
// ---------------------------------------------------------------------------

function refreshModeSelect() {
  if (!modeSelect) return;
  const currentVal = modeSelect.value;

  // Clear the visualizer dispatch table to prevent stale references
  for (let key in VISUALIZERS) delete VISUALIZERS[key];

  modeSelect.innerHTML = "";

  // Built-ins
  BUILTIN_LIST.forEach(b => {
    const opt = document.createElement("option");
    opt.value = b.id;
    opt.textContent = b.name;
    modeSelect.appendChild(opt);

    if (b.type === "2d") {
      VISUALIZERS[b.id] = {
        type: "2d",
        fn: (fft, sensitivity) => {
          const source = CUSTOM_2D_SOURCES[b.id];
          if (source) {
            try {
              const sandboxArgs = Object.keys(v2d);
              const sandboxVals = Object.values(v2d);
              const factory = new Function(...sandboxArgs, `return ${source}`);
              return factory(...sandboxVals)(fft, sensitivity);
            } catch (e) { console.error("Error in user 2D source:", e); }
          }
          return b.fn(fft, sensitivity);
        }
      };
    } else {
      VISUALIZERS[b.id] = {
        type: "gl",
        fn: (fft, sensitivity) => {
          const source = CUSTOM_GL_SOURCES[b.id] || BUILTIN_GL_SOURCES[b.id];
          const texArray = CUSTOM_GL_TEXTURES[b.id] || BUILTIN_GL_TEXTURES[b.id] || ["", "", "", ""];
          drawGLVisualizer(source, b.id, fft, sensitivity, texArray);
        }
      };
    }
  });

  // User customs
  Object.entries(USER_VISUALIZERS).forEach(([id, data]) => {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = data.name;
    modeSelect.appendChild(opt);

    if (data.type === "2d") {
      VISUALIZERS[id] = {
        type: "2d",
        fn: (fft, sensitivity) => {
          try {
            const sandboxArgs = Object.keys(v2d);
            const sandboxVals = Object.values(v2d);
            const factory = new Function(...sandboxArgs, `return ${data.source}`);
            return factory(...sandboxVals)(fft, sensitivity);
          } catch (e) { console.error("Error in user visualizer:", e); }
        }
      };
    } else {
      VISUALIZERS[id] = {
        type: "gl",
        fn: (fft, sensitivity) => drawGLVisualizer(data.source, id, fft, sensitivity, data.textures || [])
      };
    }
  });

  if (currentVal && Array.from(modeSelect.options).some(o => o.value === currentVal)) {
    modeSelect.value = currentVal;
  }
}

function saveVisualizers() {
  const data = {
    gl_customs: CUSTOM_GL_SOURCES,
    gl_custom_textures: CUSTOM_GL_TEXTURES,
    v2d_customs: CUSTOM_2D_SOURCES,
    user_visualizers: USER_VISUALIZERS
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function loadVisualizers() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    refreshModeSelect();
    return;
  }
  try {
    const data = JSON.parse(saved);
    if (data.gl_customs) Object.assign(CUSTOM_GL_SOURCES, data.gl_customs);
    if (data.gl_custom_textures) Object.assign(CUSTOM_GL_TEXTURES, data.gl_custom_textures);
    if (data.v2d_customs) Object.assign(CUSTOM_2D_SOURCES, data.v2d_customs);
    if (data.user_visualizers) Object.assign(USER_VISUALIZERS, data.user_visualizers);
  } catch (e) {
    console.error("Failed to load visualizers:", e);
  }
  refreshModeSelect();
}

// ---------------------------------------------------------------------------
// Audio Logic
// ---------------------------------------------------------------------------

async function loadDevices() {
  console.log("loadDevices start...");
  try {
    const inputDevices = await invoke("get_audio_devices");
    const outputDevices = await invoke("get_output_devices");

    if (deviceSelect) {
      deviceSelect.innerHTML = "";
      if (inputDevices.length === 0) {
        deviceSelect.innerHTML = '<option value="">No audio devices found</option>';
      } else {
        inputDevices.forEach(d => {
          const opt = document.createElement("option");
          opt.value = opt.textContent = d;
          deviceSelect.appendChild(opt);
        });
      }
    }

    if (outputDeviceSelect) {
      outputDeviceSelect.innerHTML = '<option value="none">No Passthrough (Visuals Only)</option>';
      outputDevices.forEach(d => {
        const opt = document.createElement("option");
        opt.value = opt.textContent = d;
        outputDeviceSelect.appendChild(opt);
      });
    }
    console.log("loadDevices success.");
  } catch (err) {
    console.error("Error loading devices:", err);
    if (deviceSelect) {
      deviceSelect.innerHTML = '<option value="">Error connecting to audio backend</option>';
    }
  }
}

function setupAudioEvents() {
  if (btnStart) {
    btnStart.addEventListener("click", async () => {
      const device = deviceSelect.value;
      if (!device) return;
      let output = outputDeviceSelect.value;
      if (output === "none") output = null;

      console.log("Starting capture with:", { deviceName: device, outputDeviceName: output });
      try {
        await invoke("start_audio_capture", { deviceName: device, outputDeviceName: output });
        isCapturing = true;
        btnStart.disabled = deviceSelect.disabled = outputDeviceSelect.disabled = true;
        btnStop.disabled = false;
        if (output && volumeSlider) {
          volumeSlider.disabled = false;
          await invoke("set_volume", { volume: parseFloat(volumeSlider.value) });
        }
        if (statusDot) statusDot.classList.add("connected");
        if (statusText) statusText.textContent = "Visualizing";
        renderLoop();
      } catch (err) {
        console.error("Failed to start capture:", err);
        if (statusText) statusText.textContent = "Error: " + err;
      }
    });
  }

  if (btnStop) {
    btnStop.addEventListener("click", async () => {
      try { await invoke("stop_audio_capture"); } catch (e) { }
      isCapturing = false;
      btnStart.disabled = deviceSelect.disabled = outputDeviceSelect.disabled = false;
      btnStop.disabled = (volumeSlider ? (volumeSlider.disabled = true) : true);
      if (statusDot) statusDot.classList.remove("connected");
      if (statusText) statusText.textContent = "Disconnected";
      if (animationId) cancelAnimationFrame(animationId);
      clear2DCanvas();
      clearGL();
    });
  }

  if (volumeSlider) {
    volumeSlider.addEventListener("input", async e => {
      try { await invoke("set_volume", { volume: parseFloat(e.target.value) }); } catch (err) { }
    });
  }
}

async function renderLoop() {
  if (!isCapturing) return;
  try {
    const fftData = await invoke("get_audio_data");
    if (fftData && fftData.length > 0) {
      const sensitivity = (sensitivitySlider ? parseFloat(sensitivitySlider.value) : 1.0);
      const mode = modeSelect.value;
      const config = VISUALIZERS[mode];
      if (config) {
        if (config.type === "gl") {
          if (v2d.canvas) v2d.canvas.style.display = "none";
          if (glCanvas) glCanvas.style.display = "block";
          config.fn(fftData, sensitivity);
        } else {
          if (glCanvas) glCanvas.style.display = "none";
          if (v2d.canvas) v2d.canvas.style.display = "block";
          config.fn(fftData, sensitivity);
        }
      }
    }
  } catch (err) {
    console.error("Render loop error:", err);
  }
  animationId = requestAnimationFrame(renderLoop);
}

// ---------------------------------------------------------------------------
// Editor Event Handlers
// ---------------------------------------------------------------------------

function refreshEditorButtons() {
  if (!btnDelete || !modeSelect) return;
  const mode = modeSelect.value;
  const isUser = !!USER_VISUALIZERS[mode];
  const hasRemix = !!(CUSTOM_GL_SOURCES[mode] || CUSTOM_2D_SOURCES[mode]);
  btnDelete.classList.toggle("hidden", !(isUser || hasRemix));
}

function refreshEditorContent() {
  const mode = modeSelect.value;
  if (!mode) return;

  const isUser = !!USER_VISUALIZERS[mode];
  const config = VISUALIZERS[mode];
  if (!config) return;

  refreshEditorButtons();

  const option = modeSelect.querySelector(`option[value="${mode}"]`);
  editorNameInput.value = option ? option.textContent : "";

  if (config.type === "2d") {
    editorLanguageLabel.textContent = "Visualizer Logic (JavaScript)";
    const builtin = BUILTIN_LIST.find(b => b.id === mode);
    editorInput.value = isUser ? USER_VISUALIZERS[mode].source : (CUSTOM_2D_SOURCES[mode] || (builtin ? builtin.fn.toString() : ""));
    if (textureControls) textureControls.classList.add("hidden");
  } else {
    editorLanguageLabel.textContent = "Fragment Shader (GLSL)";
    editorInput.value = isUser ? USER_VISUALIZERS[mode].source : (CUSTOM_GL_SOURCES[mode] || BUILTIN_GL_SOURCES[mode] || "");
    if (textureControls) textureControls.classList.remove("hidden");

    // Clear/hydrate texture fields
    texInputs.forEach(input => { if (input) input.value = ""; });
    let texArray = ["", "", "", ""];
    if (isUser && USER_VISUALIZERS[mode].textures) {
      texArray = USER_VISUALIZERS[mode].textures;
    } else if (!isUser) {
      texArray = CUSTOM_GL_TEXTURES[mode] || BUILTIN_GL_TEXTURES[mode] || ["", "", "", ""];
    }
    for (let i = 0; i < 4; i++) {
      if (texInputs[i]) texInputs[i].value = texArray[i] || "";
    }
  }
}

function setupEditorEvents() {
  if (btnEditor) {
    btnEditor.addEventListener("click", () => {
      editorOverlay.classList.toggle("hidden");
      if (!editorOverlay.classList.contains("hidden")) {
        refreshEditorContent();
      }
    });
  }

  if (btnNew) {
    btnNew.addEventListener("click", () => {
      const id = "user_" + Date.now();
      USER_VISUALIZERS[id] = {
        type: "gl",
        name: "New Visualizer",
        source: DEFAULT_GL_TEMPLATE,
        textures: ["", "", "", ""]
      };
      refreshModeSelect();
      modeSelect.value = id;
      saveVisualizers(); // Persist the new skeleton
      if (editorOverlay.classList.contains("hidden")) btnEditor.click();
      else refreshEditorContent();
    });
  }

  // Use delegation for the delete button to be ultra-resilient
  document.addEventListener("click", (e) => {
    const delTarget = e.target.closest("#btn-delete");
    if (delTarget) {
      const id = modeSelect.value;
      console.log("[DELETE] Clicked for ID:", id);

      if (!id || id === "neural") {
        alert("Standard built-in visualizers cannot be deleted.");
        return;
      }

      console.log("Purging ID from memory and storage:", id);

      // 1. Remove from all possible state objects
      delete USER_VISUALIZERS[id];
      delete CUSTOM_GL_SOURCES[id];
      delete CUSTOM_GL_TEXTURES[id];
      delete CUSTOM_2D_SOURCES[id];

      // 2. Persist immediately
      saveVisualizers();

      // 3. Force UI Reset: Point to a safe default BEFORE rebuilding
      modeSelect.value = "neural";

      // 4. Rebuild the entire dropdown
      refreshModeSelect();

      // 5. Hard-set the value again to ensure the browser syncs
      modeSelect.value = "neural";

      // Provide visual feedback
      if (deleteSuccess) {
        deleteSuccess.textContent = "Deleted successfully!";
        deleteSuccess.classList.remove("hidden");
        setTimeout(() => {
          deleteSuccess.classList.add("hidden");
          if (editorOverlay) editorOverlay.classList.add("hidden");
        }, 1500);
      } else {
        if (editorOverlay) editorOverlay.classList.add("hidden");
      }

      console.log("Deletion successful. ID removed.");
    }
  });

  if (btnApplyShader) {
    btnApplyShader.addEventListener("click", () => {
      const source = editorInput.value;
      const mode = modeSelect.value;
      const config = VISUALIZERS[mode];
      if (!config) return;

      const name = editorNameInput.value.trim() || "Untitled";
      const option = modeSelect.querySelector(`option[value="${mode}"]`);
      const oldName = option ? option.textContent : "";
      const isUser = !!USER_VISUALIZERS[mode];
      const textures = texInputs.map(input => input ? input.value.trim() : "");

      let targetMode = mode;

      if (name !== oldName) {
        if (isUser && oldName === "New Visualizer") {
          // Rename placeholder
          USER_VISUALIZERS[mode].name = name;
        } else {
          // Create new creation
          const newId = "user_" + Date.now();
          USER_VISUALIZERS[newId] = {
            type: config.type,
            name: name,
            source: source,
            textures: textures
          };
          targetMode = newId;
        }
      }

      // Finalize the update/save
      if (config.type === "2d") {
        try {
          const sandboxArgs = Object.keys(v2d);
          const sandboxVals = Object.values(v2d);
          const factory = new Function(...sandboxArgs, `return ${source}`);
          if (typeof factory(...sandboxVals) !== 'function') throw new Error("Must be a function");

          if (USER_VISUALIZERS[targetMode]) {
            USER_VISUALIZERS[targetMode].source = source;
          } else {
            CUSTOM_2D_SOURCES[targetMode] = source;
          }

          refreshModeSelect();
          modeSelect.value = targetMode;

          refreshEditorButtons();

          saveVisualizers();
          showSuccessFeedback();
        } catch (err) { showErrorFeedback(err.message); }
      } else {
        const result = compileCustomShader(source);
        if (result.success) {
          if (USER_VISUALIZERS[targetMode]) {
            USER_VISUALIZERS[targetMode].source = source;
            if (config.type === "gl") {
              USER_VISUALIZERS[targetMode].textures = textures;
            }
          } else {
            CUSTOM_GL_SOURCES[targetMode] = source;
            if (config.type === "gl") {
              CUSTOM_GL_TEXTURES[targetMode] = textures;
            }
          }

          resetActiveShaderMode();
          refreshModeSelect();
          modeSelect.value = targetMode;

          refreshEditorButtons();

          saveVisualizers();
          showSuccessFeedback();
        } else { showErrorFeedback(result.error); }
      }
    });
  }

  if (btnCloseEditor) {
    btnCloseEditor.addEventListener("click", () => editorOverlay.classList.add("hidden"));
  }
}

function showSuccessFeedback() {
  if (shaderError) shaderError.classList.add("hidden");
  if (shaderSuccess) shaderSuccess.classList.remove("hidden");
  setTimeout(() => {
    if (shaderSuccess) shaderSuccess.classList.add("hidden");
  }, 3000);
}

function showErrorFeedback(msg) {
  if (shaderSuccess) shaderSuccess.classList.add("hidden");
  if (shaderError) {
    shaderError.textContent = msg;
    shaderError.classList.remove("hidden");
  }
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

window.addEventListener("DOMContentLoaded", async () => {
  console.log("DOMContentLoaded fired.");
  initDOMRefs();
  init2DContext();
  initGLContext();

  // Initial UI Setup
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);
  window.addEventListener("keydown", e => {
    if (controlsPanel && e.key.toLowerCase() === "h") controlsPanel.classList.toggle("hidden");
  });

  setupAudioEvents();
  setupEditorEvents();

  if (modeSelect) {
    modeSelect.addEventListener("change", () => {
      if (editorOverlay && !editorOverlay.classList.contains("hidden")) {
        refreshEditorContent();
      }
    });
  }

  try {
    await loadDevices();
    loadVisualizers();
  } catch (err) {
    console.error("Error during initialization:", err);
  }
});
