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
        .manage(Backend(Mutex::new(None)))
        .setup(|app| {
            // Launch the bundled Python backend as a sidecar. If it fails,
            // log it but still open the window so the UI can show a status.
            match app.shell().sidecar("infralens-backend") {
                Ok(sidecar) => match sidecar.spawn() {
                    Ok((mut rx, child)) => {
                        let state: State<Backend> = app.state();
                        *state.0.lock().unwrap() = Some(child);
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
                    }
                    Err(e) => eprintln!("[infralens] failed to spawn backend: {e}"),
                },
                Err(e) => eprintln!("[infralens] could not resolve backend sidecar: {e}"),
            }
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