import os
import subprocess
import requests
import time
from portpicker import pick_unused_port
import threading
import contextlib

port_lock = threading.Lock()

instance_name = "carnitas"
instance_secret = "4361726e697461732c206c69746572616c6c79206d65616e696e6720226c6974"
admin_key = "0135d8598650f8f5cb0f30c34ec2e2bb62793bc28717c8eb6fb577996d50be5f4281b59181095065c5d0f86a2c31ddbe9b597ec62b47ded69782cd"

@contextlib.contextmanager
def convex_backend(backend_dir: str):
    storage_dir = os.path.abspath(os.path.join(backend_dir, "convex_local_storage"))
    os.makedirs(storage_dir, exist_ok=True)
    sqlite_path = os.path.abspath(os.path.join(backend_dir, "convex_local_backend.sqlite3"))    
    convex_binary = os.path.abspath("convex-local-backend")
    
    with port_lock:
        port = pick_unused_port()
        site_proxy_port = pick_unused_port()
        convex_process = subprocess.Popen(
            [
                convex_binary,
                "--port",
                str(port),
                "--site-proxy-port",
                str(site_proxy_port),
                "--instance-name",
                instance_name,
                "--instance-secret",
                instance_secret,
                "--local-storage",
                storage_dir,
                sqlite_path,
            ],
            cwd=backend_dir,
            stdout=open(os.path.join(backend_dir, "backend.stdout.log"), "w"),
            stderr=open(os.path.join(backend_dir, "backend.stderr.log"), "w"),
        )
    try:
        # Do a health check and then make sure that *our* process is still running.
        health_check(port)
        if convex_process.poll() is not None:
            raise ValueError("Convex process failed to start")        
        yield {
            "port": port,
            "site_proxy_port": site_proxy_port,
            'process': convex_process,
        }
    finally:
        convex_process.terminate()


def deploy(output_dir: str):
    project_dir = os.path.abspath(os.path.join(output_dir, "project"))

    backend_dir = os.path.join(output_dir, "backend")
    os.makedirs(backend_dir, exist_ok=True)

    with convex_backend(backend_dir) as backend:
        subprocess.check_call(
            [
                "bunx",
                "convex",
                "dev",
                "--once",
                "--admin-key",
                admin_key,
                "--url",
                f"http://localhost:{backend['port']}",
            ],
            cwd=project_dir,
        )        
    
    print("Deploy OK!")    


def health_check(port: int):
    deadline = time.time() + 10
    num_attempts = 0
    while True:
        try:
            requests.get(f"http://localhost:{port}/version").raise_for_status()
            return True
        except Exception as e:
            remaining = deadline - time.time()
            if remaining < 0:
                raise e
            time.sleep(min(0.1 * (2**num_attempts), remaining))
            num_attempts += 1
