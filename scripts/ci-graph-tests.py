"""Run the actual Node graph suites on an isolated vendor FalkorDB server.

CI-only embedded/binary proof, not Docker/Cloud parity or persistent deployment.
Install falkordblite==0.10.0 in the invoking Python environment first.
"""
import os
from pathlib import Path
import secrets
import socket
import subprocess
import tempfile
import time

import redis
import redislite


def main():
    binaries = Path(redislite.__file__).resolve().parent / "bin"
    server_binary = binaries / "redis-server"
    module = binaries / "falkordb.so"
    if not server_binary.is_file() or not module.is_file():
        raise RuntimeError("Pinned FalkorDBLite vendor binaries are missing")
    with socket.socket() as reservation:
        reservation.bind(("127.0.0.1", 0))
        port = reservation.getsockname()[1]
    with tempfile.TemporaryDirectory(prefix="cubes-ci-graph-") as directory:
        env = {**os.environ, "FALKORDB_HOST": "127.0.0.1", "FALKORDB_PORT": str(port),
               "FALKORDB_GRAPH": "ci_" + secrets.token_hex(8), "FALKORDB_TLS": "false",
               "FALKORDB_USERNAME": "", "FALKORDB_PASSWORD": "",
               "GRAPH_EVIDENCE_KEY": secrets.token_hex(32)}
        # No existing database is touched; this process owns the fresh data directory.
        with open(Path(directory) / "server.log", "w+") as log:
            server = subprocess.Popen([str(server_binary), "--bind", "127.0.0.1", "--port", str(port),
                                       "--dir", directory, "--appendonly", "yes", "--loadmodule", str(module)],
                                      stdout=log, stderr=subprocess.STDOUT)
            client = redis.Redis(host="127.0.0.1", port=port, socket_timeout=1)
            try:
                deadline = time.monotonic() + 15
                while True:
                    if server.poll() is not None:
                        raise RuntimeError("Vendor FalkorDB server exited during startup")
                    try:
                        client.ping()
                        break
                    except redis.ConnectionError:
                        if time.monotonic() >= deadline:
                            raise RuntimeError("Vendor FalkorDB startup timeout")
                        time.sleep(0.1)
                print("Runtime: FalkorDBLite 0.10.0 vendor server; isolated loopback; no Docker parity", flush=True)
                print("Redis version:", client.info("server")["redis_version"], flush=True)
                print("Modules:", client.execute_command("MODULE", "LIST"), flush=True)
                result = subprocess.run(["npm", "run", "test:integration"], env=env)
                return result.returncode
            finally:
                client.close()
                if server.poll() is None:
                    server.terminate()
                    try:
                        server.wait(timeout=10)
                    except subprocess.TimeoutExpired:
                        server.kill()
                        server.wait()
                if server.returncode not in (0, -15):
                    log.seek(0)
                    print(log.read())


if __name__ == "__main__":
    raise SystemExit(main())
