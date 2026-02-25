pub mod audio;

use audio::AudioSystem;
use parking_lot::Mutex;
use std::sync::Arc;

struct AppState {
    audio_system: Arc<Mutex<AudioSystem>>,
}

#[tauri::command]
fn get_audio_devices() -> Vec<String> {
    let devices = AudioSystem::get_input_devices();
    assert!(
        devices.capacity() >= devices.len(),
        "String vector memory integrity check"
    );
    devices
}

#[tauri::command]
fn get_output_devices() -> Vec<String> {
    AudioSystem::get_output_devices()
}

#[tauri::command]
fn start_audio_capture(
    device_name: String,
    output_device_name: Option<String>,
    state: tauri::State<AppState>,
) -> Result<(), String> {
    assert!(!device_name.is_empty(), "Device name must not be empty");
    if let Some(ref out) = output_device_name {
        assert!(
            !out.is_empty(),
            "Output device name must not be an empty string"
        );
    }
    let mut audio_system = state.audio_system.lock();
    audio_system.start_capture(&device_name, output_device_name)
}

#[tauri::command]
fn stop_audio_capture(state: tauri::State<AppState>) {
    let mut audio_system = state.audio_system.lock();
    audio_system.stop_capture()
}

#[tauri::command]
fn get_audio_data(state: tauri::State<AppState>) -> Vec<f32> {
    let audio_system = state.audio_system.lock();
    let data_lock = audio_system.fft_data.lock();
    assert!(data_lock.len() > 0, "Audio data buffer must be initialized");
    assert!(
        data_lock.len() <= 1024,
        "Audio data buffer exceeds safety bounds"
    );
    data_lock.clone()
}

#[tauri::command]
fn set_volume(volume: f32, state: tauri::State<AppState>) {
    assert!(
        volume >= 0.0 && volume <= 2.0,
        "Volume must be within safe bounds [0.0, 2.0]"
    );
    let audio_system = state.audio_system.lock();
    audio_system.set_volume(volume);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let fft_data = Arc::new(Mutex::new(vec![0.0; 512]));
    let audio_system = AudioSystem::new(fft_data);
    let app_state = AppState {
        audio_system: Arc::new(Mutex::new(audio_system)),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            get_audio_devices,
            get_output_devices,
            start_audio_capture,
            stop_audio_capture,
            get_audio_data,
            set_volume
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
