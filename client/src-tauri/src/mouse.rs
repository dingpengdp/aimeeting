use enigo::{Button, Coordinate, Direction, Enigo, Mouse, Settings};
use std::sync::mpsc::Receiver;
use std::time::{Duration, Instant};

pub enum MouseCmd {
    Move(f64, f64),
    Click(f64, f64),
    RightClick(f64, f64),
    Stop,
}

/// Runs a blocking mouse-control loop on a dedicated OS thread.
/// Receives normalized coordinates (0.0–1.0) and applies them to the display.
pub fn run_mouse_thread(rx: Receiver<MouseCmd>) {
    let mut enigo = match Enigo::new(&Settings::default()) {
        Ok(e) => e,
        Err(e) => {
            eprintln!("[mouse] failed to create enigo instance: {e}");
            return;
        }
    };

    let (screen_w, screen_h) = enigo.main_display().unwrap_or((1920, 1080));
    let move_interval = Duration::from_millis(33); // ~30 fps cap for moves
    let mut last_move = Instant::now() - move_interval;

    loop {
        match rx.recv() {
            Ok(MouseCmd::Move(nx, ny)) => {
                let now = Instant::now();
                if now.duration_since(last_move) < move_interval {
                    continue; // throttle to ~30 fps
                }
                last_move = now;
                let x = (nx * screen_w as f64) as i32;
                let y = (ny * screen_h as f64) as i32;
                let _ = enigo.move_mouse(x, y, Coordinate::Abs);
            }
            Ok(MouseCmd::Click(nx, ny)) => {
                let x = (nx * screen_w as f64) as i32;
                let y = (ny * screen_h as f64) as i32;
                let _ = enigo.move_mouse(x, y, Coordinate::Abs);
                let _ = enigo.button(Button::Left, Direction::Click);
            }
            Ok(MouseCmd::RightClick(nx, ny)) => {
                let x = (nx * screen_w as f64) as i32;
                let y = (ny * screen_h as f64) as i32;
                let _ = enigo.move_mouse(x, y, Coordinate::Abs);
                let _ = enigo.button(Button::Right, Direction::Click);
            }
            Ok(MouseCmd::Stop) | Err(_) => break,
        }
    }
}
