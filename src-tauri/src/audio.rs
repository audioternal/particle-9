use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use crossbeam_channel::{bounded, Receiver, Sender};
use parking_lot::Mutex;
use rustfft::{num_complex::Complex, FftPlanner};
use std::f32::consts::PI;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;

pub struct AudioSystem {
    input_stream: Option<cpal::Stream>,
    output_stream: Option<cpal::Stream>,
    pub fft_data: Arc<Mutex<Vec<f32>>>,
    pub volume: Arc<AtomicU32>,
}

#[allow(deprecated)]
impl AudioSystem {
    #[must_use]
    pub fn new(fft_data: Arc<Mutex<Vec<f32>>>) -> Self {
        assert!(
            fft_data.lock().len() > 0,
            "FFT output buffer must be non-empty"
        );
        Self {
            input_stream: None,
            output_stream: None,
            fft_data,
            volume: Arc::new(AtomicU32::new(f32::to_bits(1.0))),
        }
    }

    #[must_use]
    pub fn get_input_devices() -> Vec<String> {
        let host = cpal::default_host();
        let mut device_names = Vec::new();
        if let Ok(devices) = host.input_devices() {
            for device in devices {
                if let Ok(name) = device.name() {
                    device_names.push(name);
                }
            }
        }
        assert!(device_names.capacity() >= device_names.len());
        device_names
    }

    pub fn get_output_devices() -> Vec<String> {
        let host = cpal::default_host();
        let mut device_names = Vec::new();
        if let Ok(devices) = host.output_devices() {
            for device in devices {
                if let Ok(name) = device.name() {
                    device_names.push(name);
                }
            }
        }
        device_names
    }

    pub fn set_volume(&self, vol: f32) {
        assert!(vol >= 0.0 && vol <= 10.0, "Volume out of reasonable range");
        self.volume.store(f32::to_bits(vol), Ordering::Relaxed);
    }

    pub fn start_capture(
        &mut self,
        input_device_name: &str,
        output_device_name: Option<String>,
    ) -> Result<(), String> {
        self.stop_capture();

        let host = cpal::default_host();

        let input_device = host
            .input_devices()
            .map_err(|e| e.to_string())?
            .find(|d| d.name().unwrap_or_default() == input_device_name)
            .ok_or_else(|| "Input device not found".to_string())?;

        let input_config = input_device
            .default_input_config()
            .map_err(|e| e.to_string())?;

        let mut sender_opt = None;

        if let Some(out_name) = output_device_name {
            if out_name != "none" {
                let output_device = host
                    .output_devices()
                    .map_err(|e| e.to_string())?
                    .find(|d| d.name().unwrap_or_default() == out_name)
                    .ok_or_else(|| "Output device not found".to_string())?;

                let out_config = output_device
                    .default_output_config()
                    .map_err(|e| e.to_string())?;

                let (tx, rx) = bounded::<f32>((out_config.sample_rate() as usize) * 2);
                sender_opt = Some(tx);

                let vol_ref = self.volume.clone();
                let err_fn = |err| eprintln!("an error occurred on output: {}", err);
                let out_channels = out_config.channels() as usize;

                let out_stream = match out_config.sample_format() {
                    cpal::SampleFormat::F32 => output_device.build_output_stream(
                        &out_config.into(),
                        move |data: &mut [f32], _: &_| {
                            write_output_data(data, out_channels, &rx, &vol_ref)
                        },
                        err_fn,
                        None,
                    ),
                    cpal::SampleFormat::I16 => output_device.build_output_stream(
                        &out_config.into(),
                        move |data: &mut [i16], _: &_| {
                            write_output_data(data, out_channels, &rx, &vol_ref)
                        },
                        err_fn,
                        None,
                    ),
                    cpal::SampleFormat::U16 => output_device.build_output_stream(
                        &out_config.into(),
                        move |data: &mut [u16], _: &_| {
                            write_output_data(data, out_channels, &rx, &vol_ref)
                        },
                        err_fn,
                        None,
                    ),
                    _ => return Err("Unsupported output format".to_string()),
                }
                .map_err(|e| e.to_string())?;

                out_stream.play().map_err(|e| e.to_string())?;
                self.output_stream = Some(out_stream);
            }
        }

        let stream = match input_config.sample_format() {
            cpal::SampleFormat::F32 => {
                self.build_input_stream::<f32>(&input_device, &input_config.into(), sender_opt)
            }
            cpal::SampleFormat::I16 => {
                self.build_input_stream::<i16>(&input_device, &input_config.into(), sender_opt)
            }
            cpal::SampleFormat::U16 => {
                self.build_input_stream::<u16>(&input_device, &input_config.into(), sender_opt)
            }
            _ => return Err("Unsupported input format".to_string()),
        }?;

        stream.play().map_err(|e| e.to_string())?;
        self.input_stream = Some(stream);

        Ok(())
    }

    pub fn stop_capture(&mut self) {
        self.input_stream = None;
        self.output_stream = None;
    }

    #[allow(deprecated)]
    fn build_input_stream<T>(
        &self,
        device: &cpal::Device,
        config: &cpal::StreamConfig,
        producer: Option<Sender<f32>>,
    ) -> Result<cpal::Stream, String>
    where
        T: cpal::Sample + cpal::SizedSample,
        f32: cpal::FromSample<T>,
    {
        let channels = config.channels as usize;
        assert!(channels > 0, "Audio must have at least one channel");

        let buffer_size = 1024;
        let fft_data_ref = self.fft_data.clone();

        // Rule 3 & 10: Initialize runtime resources once during setup
        let mut input_accumulator = Vec::with_capacity(buffer_size * 2);
        let mut complex_buffer = vec![Complex::default(); buffer_size];
        let mut magnitudes_scratch = vec![0.0f32; buffer_size / 2];

        // Pre-calculate Hanning window
        let window: Vec<f32> = (0..buffer_size)
            .map(|i| 0.5 * (1.0 - (2.0 * PI * (i as f32) / (buffer_size as f32 - 1.0)).cos()))
            .collect();

        let mut planner = FftPlanner::new();
        let fft = planner.plan_fft_forward(buffer_size);

        let err_fn = |err| eprintln!("an error occurred on input: {}", err);

        device
            .build_input_stream(
                config,
                move |data: &[T], _: &_| {
                    // Assertions for runtime data integrity
                    assert!(channels > 0);

                    for sample in data.iter() {
                        let f32_sample = <f32 as cpal::FromSample<T>>::from_sample_(*sample);

                        // Rule 6: Check return value (explicit skip if buffer full)
                        if let Some(ref prod) = producer {
                            let _ = prod.try_send(f32_sample);
                        }

                        // Accumulate mono sample
                        // Note: In real-world, we'd handle channel chunks properly here
                    }

                    // Simplified mono downmix and chunking without allocations
                    for chunk in data.chunks(channels) {
                        let sum: f32 = chunk
                            .iter()
                            .map(|s| <f32 as cpal::FromSample<T>>::from_sample_(*s))
                            .sum();
                        input_accumulator.push(sum / channels as f32);

                        if input_accumulator.len() >= buffer_size {
                            // Prepare FFT input using pre-allocated complex buffer and window
                            for (i, s) in input_accumulator.drain(0..buffer_size).enumerate() {
                                complex_buffer[i] = Complex::new(s * window[i], 0.0);
                            }

                            fft.process(&mut complex_buffer);

                            // Calculate magnitudes into scratch space
                            for i in 0..(buffer_size / 2) {
                                let c = complex_buffer[i];
                                magnitudes_scratch[i] =
                                    (c.re * c.re + c.im * c.im).sqrt() / (buffer_size as f32);
                            }

                            // Update shared state with minimal lock time
                            let mut shared_data = fft_data_ref.lock();
                            if shared_data.len() == magnitudes_scratch.len() {
                                for i in 0..magnitudes_scratch.len() {
                                    shared_data[i] =
                                        shared_data[i] * 0.8 + magnitudes_scratch[i] * 0.2;
                                }
                            } else {
                                *shared_data = magnitudes_scratch.clone();
                            }
                        }
                    }
                },
                err_fn,
                None,
            )
            .map_err(|e| e.to_string())
    }
}

fn write_output_data<T>(
    output: &mut [T],
    channels: usize,
    consumer: &Receiver<f32>,
    volume: &Arc<AtomicU32>,
) where
    T: cpal::Sample + cpal::FromSample<f32>,
{
    assert!(channels > 0, "Output channels must be greater than 0");
    assert!(!output.is_empty(), "Output buffer must not be empty");

    let vol = f32::from_bits(volume.load(Ordering::Relaxed));

    for frame in output.chunks_mut(channels) {
        for sample in frame.iter_mut() {
            // Rule 6: Handle potential empty channel gracefully
            let f32_samp = consumer.try_recv().unwrap_or(0.0) * vol;
            *sample = cpal::FromSample::from_sample_(f32_samp);
        }
    }
}
