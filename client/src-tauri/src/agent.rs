use crate::mouse;

use futures_util::FutureExt;
use rust_socketio::{
    asynchronous::{Client, ClientBuilder},
    Payload,
};
use serde_json::Value;
use tokio::sync::oneshot::Receiver;

pub async fn run(server_url: String, token: String, room_id: String, shutdown: Receiver<()>) {
    // Channel for forwarding input events to the dedicated mouse thread
    let (mouse_tx, mouse_rx) = std::sync::mpsc::sync_channel::<mouse::MouseCmd>(64);

    // Dedicated OS thread for enigo mouse control — avoids Send issues
    std::thread::spawn(move || mouse::run_mouse_thread(mouse_rx));

    let room_id_for_connect = room_id.clone();
    let mouse_tx_for_input = mouse_tx.clone();

    let socket = match ClientBuilder::new(&server_url)
        .auth(serde_json::json!({ "token": token }))
        .reconnect(true)
        .max_reconnect_attempts(10)
        .reconnect_delay(1000, 5000)
        .on("connect", move |_payload: Payload, socket: Client| {
            let room_id = room_id_for_connect.clone();
            async move {
                if let Err(e) =
                    socket.emit("agent-register", serde_json::json!({ "roomId": room_id })).await
                {
                    eprintln!("[agent] failed to register: {e}");
                } else {
                    println!("[agent] registered for room {room_id}");
                }
            }
            .boxed()
        })
        .on("remote-input", move |payload: Payload, _socket: Client| {
            let tx = mouse_tx_for_input.clone();
            async move {
                if let Payload::Text(texts) = payload {
                    if let Some(val) = texts.first() {
                        dispatch_input(val, &tx);
                    }
                }
            }
            .boxed()
        })
        .connect()
        .await
    {
        Ok(s) => s,
        Err(e) => {
            eprintln!("[agent] connection failed: {e}");
            let _ = mouse_tx.send(mouse::MouseCmd::Stop);
            return;
        }
    };

    println!("[agent] connected to {server_url}");

    // Block until shutdown signal
    let _ = shutdown.await;

    let _ = socket.disconnect().await;
    let _ = mouse_tx.send(mouse::MouseCmd::Stop);
    println!("[agent] disconnected");
}

fn dispatch_input(val: &Value, tx: &std::sync::mpsc::SyncSender<mouse::MouseCmd>) {
    let action = val.get("action").and_then(|v| v.as_str()).unwrap_or("");
    let x = val.get("x").and_then(|v| v.as_f64()).unwrap_or(0.0);
    let y = val.get("y").and_then(|v| v.as_f64()).unwrap_or(0.0);

    let cmd = match action {
        "move" => Some(mouse::MouseCmd::Move(x, y)),
        "click" => Some(mouse::MouseCmd::Click(x, y)),
        "rightclick" => Some(mouse::MouseCmd::RightClick(x, y)),
        _ => None,
    };

    if let Some(cmd) = cmd {
        // Non-blocking send — drop the event if the mouse thread is behind
        let _ = tx.try_send(cmd);
    }
}
