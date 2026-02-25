# Particle 9 – First Public Beta (v0.1.0-beta.2)

Particle 9 is an experimental, real-time audio visualizer for desktop.  
It listens to your system audio and renders responsive, high-fidelity visuals that react to the music you play, helping you **see** your sound as clearly as you hear it. It also follows NASA’s coding guidelines for mission-critical software, so you can use it on the ISS, moon lander or any else place where safety is critical.



---

## Install instructions

### macOS (Apple Silicon)

1. Download the `particle-9-...-macos.dmg` asset from this release.
2. Open the `.dmg` and drag `Particle 9` into your `Applications` folder.
3. If macOS reports that the app is from an unidentified developer and refuses to open, clear the quarantine flag in Terminal:
   ```bash
   xattr -d com.apple.quarantine "/Applications/Particle 9.app"
   ```
4. Launch **Particle 9** and keep it running while you play audio from your usual player (Spotify, Apple Music, browser, etc.).

### Windows

1. Download the `particle-9-...-windows-setup.exe` (or `.msi`) asset.
2. Run the installer and follow the prompts.
3. Launch **Particle 9** from the Start Menu.
4. Keep the app running while you play audio from your usual player.

### Linux

1. Download the appropriate Linux asset for your distro (e.g. `.AppImage` or `.deb`).
2. If using an AppImage:
   ```bash
   chmod +x particle-9-...-linux.AppImage
   ./particle-9-...-linux.AppImage
   ```
3. If using a `.deb`, install with your package manager, then launch **Particle 9** from your app menu or via terminal.

---

## Audio routing setup

Particle 9 works best when it can “see” your system output audio.  
On most systems this requires a virtual audio device and a small routing tweak.

### macOS – BlackHole + Audio MIDI Setup

#### 1. Install BlackHole

1. Install **BlackHole (2ch)** from Existential Audio.
2. Reboot if prompted.

#### 2. Create a Multi-Output Device

1. Open **Audio MIDI Setup** (`/Applications/Utilities/Audio MIDI Setup.app`).
2. Bottom-left `+` button → **Create Multi-Output Device**.
3. In the right-hand list, enable:
   - **Your physical output** (e.g. “MacBook Speakers” or “External Headphones”)
   - **BlackHole 2ch**
4. (Optional) Rename it to something like **“Speakers + Particle 9”**.

#### 3. Set system output and use Particle 9

1. In **System Settings → Sound → Output**, choose your new **Multi-Output Device**.
2. Start playing audio (Spotify, Apple Music, browser, etc.).
3. Open **Particle 9**:
   - In its input device selector (if present), choose **BlackHole 2ch**.
   - The visuals should now follow your system audio in real time.

To go back to normal audio behavior, switch your macOS **Output** back to your usual device.

---

### Windows – Virtual Audio Cable / VoiceMeeter

#### 1. Install a virtual audio device

You can use **VB-Audio Virtual Cable** (simple) or **VoiceMeeter** (more advanced). Example with VB-Audio Virtual Cable:

1. Install **VB-CABLE Virtual Audio Device**.
2. Reboot if required.

This will create a new device, usually named **“CABLE Input (VB-Audio Virtual Cable)”** and **“CABLE Output”**.

#### 2. Route system audio into the cable

1. Right-click the speaker icon → **Sound settings** → **More sound settings** (or old Control Panel).
2. Under **Playback**:
   - Set **CABLE Input** as the **default output** device.
3. Under **Recording**:
   - Find **CABLE Output**.
   - Open **Properties → Listen** tab.
   - Check **“Listen to this device”** and choose your real speakers/headphones as the playback device.
   - Apply.

Now your system audio flows:  
`Player → CABLE Input → CABLE Output → Speakers`, and Particle 9 can listen to the cable.

#### 3. Use Particle 9

1. Launch **Particle 9**.
2. In its audio input selector, choose **CABLE Output** (or equivalent).
3. Play audio from your usual apps and watch the visuals react.

To revert, set your normal speakers back as the default playback device and/or disable “Listen to this device”.

---

### Linux – PipeWire / PulseAudio loopback

Linux setups vary, but the idea is the same: create a virtual sink, route audio to it, and let Particle 9 listen in.

#### Option A: PipeWire / `pw-loopback` (modern distros)

1. Ensure PipeWire is running (most modern distros do).
2. Create a loopback node (example):
   ```bash
   pw-loopback --capture-props='node.name=Particle9Capture' \
               --playback-props='media.class=Audio/Sink' &
   ```
3. In your system sound settings (or tools like `helvum` / `qpwgraph`):
   - Set the **loopback sink** as the output for your media player or system audio.
   - Route the loopback’s monitor/source into **Particle 9**.

#### Option B: PulseAudio `null-sink`

1. Create a virtual sink:
   ```bash
   pactl load-module module-null-sink sink_name=particle9_sink sink_properties=device.description="Particle9Sink"
   ```
2. Set your player or system audio to output to **Particle9Sink**.
3. In **Particle 9**, select the **monitor** of that sink (often `Monitor of Particle9Sink`) as input.

---

## Known limitations (beta)

- This is an early beta; visuals, performance, and routing UX will evolve.
- Some systems may require manual tweaking of audio devices the first time.
- If you get silence in Particle 9:
  - Double-check the virtual device routing for your OS.
  - Confirm that Particle 9 is listening to the correct input device.

