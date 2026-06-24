#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{Manager, RunEvent, State, WindowEvent};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

struct Backend(Mutex<Option<CommandChild>>);

fn wait_for_backend(port: u16, timeout_secs: u64) -> bool {
    let url = format!("http://127.0.0.1:{}/api/v1/meta", port);
    let deadline = Instant::now() + Duration::from_secs(timeout_secs);
    while Instant::now() < deadline {
        if let Ok(resp) = ureq::get(&url).call() {
            if resp.status() == 200 {
                return true;
            }
        }
        std::thread::sleep(Duration::from_millis(300));
    }
    false
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(Backend(Mutex::new(None)))
        .setup(|app| {
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.hide();
            }

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

            let app_handle = app.handle().clone();
            std::thread::spawn(move || {
                wait_for_backend(8756, 30);
                if let Some(win) = app_handle.get_webview_window("main") {
                    let _ = win.show();
                    let _ = win.set_focus();
                }
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building InfraLens")
        .run(|app_handle, event| {
            match event {
                RunEvent::Exit => {
                    let state: State<Backend> = app_handle.state();
                    let backend_process = state.0.lock().unwrap().take();
                    if let Some(child) = backend_process {
                        let _ = child.kill();
                        println!("[infralens] Backend process terminated successfully.");
                    }
                }
                RunEvent::WindowEvent {
                    event: WindowEvent::Destroyed,
                    ..
                } => {
                    if app_handle.webview_windows().is_empty() {
                        app_handle.exit(0);
                    }
                }
                _ => {}
            }
        });
}