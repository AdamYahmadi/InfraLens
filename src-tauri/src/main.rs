// Prevents an extra console window on Windows in release; harmless elsewhere.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Mutex;
use tauri::{Manager, RunEvent, State};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

/// Holds the running backend process so we can terminate it on exit.
struct Backend(Mutex<Option<CommandChild>>);

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(Backend(Mutex::new(None)))
        .setup(|app| {
            // Launch the bundled Python backend as a sidecar process.
            let sidecar = app
                .shell()
                .sidecar("infralens-backend")
                .expect("failed to resolve `infralens-backend` sidecar");

            let (mut rx, child) = sidecar
                .spawn()
                .expect("failed to spawn InfraLens backend");

            // Keep the handle so we can kill it when the app closes.
            let state: State<Backend> = app.state();
            *state.0.lock().unwrap() = Some(child);

            // Surface backend logs in the app's stdout for debugging.
            tauri::async_runtime::spawn(async move {
                while let Some(event) = rx.recv().await {
                    match event {
                        CommandEvent::Stdout(line) => {
                            print!("[backend] {}", String::from_utf8_lossy(&line));
                        }
                        CommandEvent::Stderr(line) => {
                            eprint!("[backend] {}", String::from_utf8_lossy(&line));
                        }
                        _ => {}
                    }
                }
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building InfraLens")
        .run(|app_handle, event| {
            // Make sure the backend dies with the app.
            if let RunEvent::ExitRequested { .. } = event {
                let state: State<Backend> = app_handle.state();
                let child = state.0.lock().unwrap().take();
                if let Some(child) = child {
                    let _ = child.kill();
                }
            }
        });
}
