import os, signal, sys, time
path, port, flag = sys.argv[1:]
from redislite import FalkorDB
db = FalkorDB(path, serverconfig={"port": port, "bind": "127.0.0.1"})
pid = db.client.pid
print("READY", db.client.info("server").get("redis_version"), pid, flush=True)
while not os.path.exists(flag): time.sleep(0.2)
os.kill(pid, signal.SIGTERM); time.sleep(1)
