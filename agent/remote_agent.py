#!/usr/bin/env python3
"""
AiMeeting Remote Agent
======================
Connects to the AiMeeting server via Socket.IO and executes real mouse
events using pyautogui when a remote controller sends input.

Usage:
  pip3 install "python-socketio[client]" pyautogui requests
  python3 remote_agent.py --server https://192.168.3.84:3001 \
                          --room  <room-id>   \
                          --email user@example.com \
                          --password yourpassword

The agent authenticates with the server, registers itself for the given
room, and executes mouse move / click events sent by the controller.
All participants in the room will see the pointer overlay in the browser;
this agent additionally performs the real OS-level mouse movement.
"""

import argparse
import sys
import time
import requests
import socketio
import urllib3

try:
    import pyautogui
except ImportError:
    print("[error] pyautogui not installed. Run: pip3 install pyautogui")
    sys.exit(1)

# Suppress self-signed-cert warnings (the dev server uses basic-ssl)
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# Throttle move events to ~30 fps
MOVE_INTERVAL = 1 / 30
last_move_time = 0.0


def parse_args():
    p = argparse.ArgumentParser(description="AiMeeting Remote Agent")
    p.add_argument("--server", required=True,
                   help="Backend URL, e.g. https://192.168.3.84:3001")
    p.add_argument("--room", required=True, help="Room ID to register for")
    p.add_argument("--email", required=True, help="Login email")
    p.add_argument("--password", required=True, help="Login password")
    return p.parse_args()


def login(server: str, email: str, password: str) -> str:
    url = f"{server}/api/auth/login"
    resp = requests.post(url, json={"email": email, "password": password},
                         verify=False, timeout=10)
    resp.raise_for_status()
    data = resp.json()
    token = data.get("token")
    if not token:
        print("[error] Login response did not contain a token:", data)
        sys.exit(1)
    print(f"[auth] Logged in as {data.get('user', {}).get('email', email)}")
    return token


def main():
    args = parse_args()

    # 1. Authenticate
    token = login(args.server, args.email, args.password)

    # 2. Create Socket.IO client
    sio = socketio.Client(ssl_verify=False, logger=False, engineio_logger=False)
    screen_w, screen_h = pyautogui.size()
    print(f"[agent] Screen size: {screen_w}x{screen_h}")

    @sio.event
    def connect():
        print("[socket] Connected — registering for room", args.room)
        sio.emit("agent-register", {"roomId": args.room})

    @sio.event
    def disconnect():
        print("[socket] Disconnected from server")

    @sio.on("remote-input")
    def on_remote_input(data):
        global last_move_time
        action = data.get("action")
        x = int(data.get("x", 0) * screen_w)
        y = int(data.get("y", 0) * screen_h)

        if action == "move":
            now = time.monotonic()
            if now - last_move_time < MOVE_INTERVAL:
                return
            last_move_time = now
            pyautogui.moveTo(x, y, duration=0)

        elif action == "click":
            pyautogui.click(x, y)
            print(f"[agent] click at ({x},{y})")

        elif action == "rightclick":
            pyautogui.rightClick(x, y)
            print(f"[agent] right-click at ({x},{y})")

    # 3. Connect (Socket.IO auth via query / Authorization header)
    server_no_trailing = args.server.rstrip("/")
    print(f"[agent] Connecting to {server_no_trailing} ...")
    sio.connect(
        server_no_trailing,
        auth={"token": token},
        transports=["websocket"],
        wait_timeout=15,
    )

    print("[agent] Running. Press Ctrl+C to stop.")
    try:
        sio.wait()
    except KeyboardInterrupt:
        print("\n[agent] Stopping.")
        sio.disconnect()


if __name__ == "__main__":
    main()
