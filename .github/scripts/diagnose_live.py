import json
import os
import shutil
import subprocess
import time
from pathlib import Path

import requests
import websocket

BASE = "https://vitoriaregia-pro.onrender.com"
BROWSERS = ["google-chrome-stable", "google-chrome", "chromium", "chromium-browser"]

browser = next((shutil.which(name) for name in BROWSERS if shutil.which(name)), None)
if not browser:
    raise SystemExit("Chrome/Chromium não encontrado")

log_path = Path("/tmp/vr-chrome-compact.log")
log_handle = log_path.open("w", encoding="utf-8")
url = f"{BASE}/?diagnostic={int(time.time())}"
process = subprocess.Popen(
    [
        browser,
        "--headless=new",
        "--no-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--remote-debugging-port=9223",
        "--remote-allow-origins=*",
        "--user-data-dir=/tmp/vr-chrome-profile-compact",
        url,
    ],
    stdout=log_handle,
    stderr=subprocess.STDOUT,
)

try:
    pages = []
    for _ in range(80):
        try:
            pages = requests.get("http://127.0.0.1:9223/json", timeout=1).json()
            if pages:
                break
        except Exception:
            pass
        time.sleep(0.25)

    page = next((item for item in pages if item.get("type") == "page"), None)
    if not page:
        raise RuntimeError("Nenhuma página foi criada pelo Chrome")

    ws = websocket.create_connection(
        page["webSocketDebuggerUrl"], timeout=1, origin="http://localhost"
    )
    next_id = 1

    def send(method, params=None):
        nonlocal_state = None
        global next_id
        current = next_id
        next_id += 1
        ws.send(json.dumps({"id": current, "method": method, "params": params or {}}))
        return current

    for method in ("Runtime.enable", "Log.enable", "Page.enable", "Network.enable"):
        send(method)

    errors = []
    bad_responses = []
    failed_requests = []
    request_urls = {}
    deadline = time.time() + 12

    while time.time() < deadline:
        try:
            message = json.loads(ws.recv())
        except Exception:
            continue
        method = message.get("method", "")
        params = message.get("params", {})

        if method == "Network.requestWillBeSent":
            request_urls[params.get("requestId")] = params.get("request", {}).get("url")
        elif method == "Runtime.exceptionThrown":
            detail = params.get("exceptionDetails", {})
            errors.append(
                {
                    "kind": "exception",
                    "text": detail.get("text"),
                    "url": detail.get("url"),
                    "line": detail.get("lineNumber"),
                    "column": detail.get("columnNumber"),
                    "description": detail.get("exception", {}).get("description"),
                    "stack": detail.get("stackTrace"),
                }
            )
        elif method == "Log.entryAdded":
            entry = params.get("entry", {})
            if entry.get("level") in ("error", "warning"):
                errors.append(
                    {
                        "kind": "console",
                        "level": entry.get("level"),
                        "text": entry.get("text"),
                        "url": entry.get("url"),
                        "line": entry.get("lineNumber"),
                    }
                )
        elif method == "Network.loadingFailed":
            request_id = params.get("requestId")
            failed_requests.append(
                {
                    "url": request_urls.get(request_id),
                    "error": params.get("errorText"),
                    "blocked": params.get("blockedReason"),
                    "canceled": params.get("canceled"),
                }
            )
        elif method == "Network.responseReceived":
            response = params.get("response", {})
            if int(response.get("status", 0)) >= 400:
                bad_responses.append(
                    {
                        "status": response.get("status"),
                        "url": response.get("url"),
                        "mime": response.get("mimeType"),
                    }
                )

    expression = """
    JSON.stringify({
      readyState: document.readyState,
      title: document.title,
      url: location.href,
      bodyText: (document.body?.innerText || '').slice(0, 5000),
      bodyChildren: document.body?.children?.length || 0,
      rootExists: !!document.getElementById('root'),
      rootChildren: document.getElementById('root')?.children?.length || 0,
      rootHtml: (document.getElementById('root')?.innerHTML || '').slice(0, 12000),
      activeElement: document.activeElement?.outerHTML?.slice(0,1000) || '',
      scripts: [...document.scripts].map(s => ({src:s.src,type:s.type,defer:s.defer})),
      loginInputs: [...document.querySelectorAll('input')].map(i => ({type:i.type,name:i.name,placeholder:i.placeholder})),
      hrefs: [...document.querySelectorAll('link[rel=stylesheet]')].map(l => l.href)
    })
    """
    eval_id = send("Runtime.evaluate", {"expression": expression, "returnByValue": True})
    snapshot = None
    end = time.time() + 5
    while time.time() < end:
        try:
            message = json.loads(ws.recv())
        except Exception:
            continue
        if message.get("id") == eval_id:
            result = message.get("result", {}).get("result", {})
            snapshot = result.get("value") or result.get("description")
            break

    print("=== SNAPSHOT ===")
    print(snapshot)
    print("=== ERRORS ===")
    print(json.dumps(errors, ensure_ascii=False, indent=2))
    print("=== BAD_RESPONSES ===")
    print(json.dumps(bad_responses, ensure_ascii=False, indent=2))
    print("=== FAILED_REQUESTS ===")
    print(json.dumps(failed_requests, ensure_ascii=False, indent=2))
    ws.close()
finally:
    process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()
    log_handle.close()
    chrome_lines = [
        line.strip()
        for line in log_path.read_text(encoding="utf-8", errors="replace").splitlines()
        if any(token in line for token in ("Uncaught", "SyntaxError", "ReferenceError", "TypeError", "ERR_", "FATAL"))
    ]
    print("=== CHROME_RELEVANT ===")
    print("\n".join(chrome_lines[-40:]))
