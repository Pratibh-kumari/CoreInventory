#!/usr/bin/env python3
"""
ArmorTrack — Single-command launcher
Starts FastAPI backend (port 8000) and Next.js frontend (port 3000) together.
Press Ctrl+C to stop both.
"""

import subprocess
import sys
import os
import time
import signal
import threading

# ── Paths ─────────────────────────────────────────────────────────────────────
ROOT = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.join(ROOT, "backend")

# Detect the venv python / uvicorn
VENV_BIN = os.path.join(ROOT, ".venv", "bin")
UVICORN = os.path.join(VENV_BIN, "uvicorn") if os.path.exists(os.path.join(VENV_BIN, "uvicorn")) else "uvicorn"
NODE = "npm"

CYAN  = "\033[96m"
GREEN = "\033[92m"
RED   = "\033[91m"
YELLOW= "\033[93m"
RESET = "\033[0m"
BOLD  = "\033[1m"

processes: list[subprocess.Popen] = []


def prefix_output(proc: subprocess.Popen, label: str, color: str):
    """Stream prefixed output from a subprocess to stdout."""
    for line in iter(proc.stdout.readline, b""):
        text = line.decode("utf-8", errors="replace").rstrip()
        print(f"{color}{BOLD}[{label}]{RESET} {text}")


def shutdown(sig=None, frame=None):
    print(f"\n{YELLOW}{BOLD}[ArmorTrack] Shutting down...{RESET}")
    for p in processes:
        try:
            p.terminate()
        except Exception:
            pass
    time.sleep(1)
    for p in processes:
        try:
            p.kill()
        except Exception:
            pass
    print(f"{GREEN}[ArmorTrack] All processes stopped. Goodbye!{RESET}")
    sys.exit(0)


def check_deps():
    """Warn if .env files are missing."""
    backend_env = os.path.join(BACKEND_DIR, ".env")
    frontend_env = os.path.join(ROOT, ".env.local")
    if not os.path.exists(backend_env):
        print(f"{YELLOW}[WARNING] backend/.env not found — backend may fail to start.{RESET}")
    if not os.path.exists(frontend_env):
        print(f"{YELLOW}[WARNING] .env.local not found — frontend may not connect to backend.{RESET}")


def main():
    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    print(f"""
{CYAN}{BOLD}
 █████╗ ██████╗ ███╗   ███╗ ██████╗ ██████╗ ████████╗██████╗  █████╗  ██████╗██╗  ██╗
██╔══██╗██╔══██╗████╗ ████║██╔═══██╗██╔══██╗╚══██╔══╝██╔══██╗██╔══██╗██╔════╝██║ ██╔╝
███████║██████╔╝██╔████╔██║██║   ██║██████╔╝   ██║   ██████╔╝███████║██║     █████╔╝
██╔══██║██╔══██╗██║╚██╔╝██║██║   ██║██╔══██╗   ██║   ██╔══██╗██╔══██║██║     ██╔═██╗
██║  ██║██║  ██║██║ ╚═╝ ██║╚██████╔╝██║  ██║   ██║   ██║  ██║██║  ██║╚██████╗██║  ██╗
╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝ ╚═════╝ ╚═╝  ╚═╝   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝
{RESET}
{BOLD}  Defence-Grade Equipment Accountability System{RESET}
{CYAN}  Backend  → http://localhost:8000   (API Docs: http://localhost:8000/docs)
  Frontend → http://localhost:3000{RESET}
""")

    check_deps()

    # ── Start Backend ──────────────────────────────────────────────────────────
    print(f"{GREEN}{BOLD}[ArmorTrack] Starting FastAPI backend...{RESET}")
    backend_proc = subprocess.Popen(
        [UVICORN, "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"],
        cwd=BACKEND_DIR,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        bufsize=1,
    )
    processes.append(backend_proc)

    # ── Wait for backend to be ready ──────────────────────────────────────────
    print(f"{CYAN}[ArmorTrack] Waiting for backend to start...{RESET}")
    time.sleep(3)

    # ── Start Frontend ─────────────────────────────────────────────────────────
    print(f"{GREEN}{BOLD}[ArmorTrack] Starting Next.js frontend...{RESET}")
    frontend_proc = subprocess.Popen(
        [NODE, "run", "dev"],
        cwd=ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        bufsize=1,
    )
    processes.append(frontend_proc)

    # ── Stream logs from both in separate threads ──────────────────────────────
    t1 = threading.Thread(target=prefix_output, args=(backend_proc,  "BACKEND ",  GREEN),  daemon=True)
    t2 = threading.Thread(target=prefix_output, args=(frontend_proc, "FRONTEND", CYAN),   daemon=True)
    t1.start()
    t2.start()

    print(f"\n{BOLD}{YELLOW}  Both servers running. Press Ctrl+C to stop.{RESET}\n")

    # ── Monitor for unexpected exits ──────────────────────────────────────────
    while True:
        if backend_proc.poll() is not None:
            print(f"{RED}{BOLD}[BACKEND] Exited unexpectedly (code {backend_proc.returncode}){RESET}")
            shutdown()
        if frontend_proc.poll() is not None:
            print(f"{RED}{BOLD}[FRONTEND] Exited unexpectedly (code {frontend_proc.returncode}){RESET}")
            shutdown()
        time.sleep(2)


if __name__ == "__main__":
    main()
