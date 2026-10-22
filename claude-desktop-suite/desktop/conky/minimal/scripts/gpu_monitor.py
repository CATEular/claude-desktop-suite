#!/usr/bin/env python3
import subprocess
import time
import os
import re
import sys

SHM = "/dev/shm/conky_minimal"
os.makedirs(SHM, exist_ok=True)

def write_val(name, val):
    try:
        path = os.path.join(SHM, name)
        with open(path, "w") as f:
            f.write(str(val))
    except Exception:
        pass

def get_cpu_temp():
    try:
        for h in os.listdir("/sys/class/hwmon"):
            npath = os.path.join("/sys/class/hwmon", h, "name")
            if os.path.exists(npath):
                with open(npath) as f:
                    if f.read().strip() == "coretemp":
                        tpath = os.path.join("/sys/class/hwmon", h, "temp1_input")
                        if os.path.exists(tpath):
                            with open(tpath) as tf:
                                return int(int(tf.read().strip()) / 1000)
    except Exception:
        pass
    return 45

def update():
    # 1. CPU Temp
    write_val("cpu_temp", get_cpu_temp())

    # 2. GPU Overview
    try:
        out = subprocess.check_output(
            ['nvidia-smi', '--query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu', '--format=csv,noheader,nounits'],
            universal_newlines=True, timeout=2
        ).strip()
        util, used, total, temp = [x.strip() for x in out.split(',')]
        total_f = float(total)
        used_f = float(used)
        pct = int(used_f / total_f * 100) if total_f > 0 else 0
        write_val("gpu_util", util)
        write_val("vram_used", int(used_f))
        write_val("vram_total", int(total_f))
        write_val("vram_pct", pct)
        write_val("gpu_temp", temp)
    except Exception:
        write_val("gpu_util", "0")
        write_val("vram_used", "0")
        write_val("vram_total", "6144")
        write_val("vram_pct", "0")
        write_val("gpu_temp", "0")

    # 3. GPU SM / Video Engine per PID
    pmon_map = {}
    try:
        pmon = subprocess.check_output(['nvidia-smi', 'pmon', '-c', '1'], universal_newlines=True, timeout=2)
        for line in pmon.strip().splitlines():
            if line.startswith('#'): continue
            parts = line.split()
            if len(parts) >= 8:
                try:
                    pid = int(parts[1])
                    sm = float(parts[3]) if parts[3] != '-' else 0.0
                    dec = float(parts[6]) if parts[6] != '-' else 0.0
                    pmon_map[pid] = max(pmon_map.get(pid, 0.0), sm, dec)
                except ValueError:
                    pass
    except Exception:
        pass

    # 4. GPU VRAM per process with accurate PID matching
    procs_by_pid = {}
    try:
        pids_out = subprocess.check_output(['nvidia-smi', '-q', '-d', 'PIDS'], universal_newlines=True, timeout=2)
        blocks = pids_out.split('Process ID')
        for b in blocks[1:]:
            pid_m = re.search(r'^\s*:\s*(\d+)', b)
            mem_m = re.search(r'Used GPU Memory\s*:\s*(\d+)\s*MiB', b)
            if pid_m and mem_m:
                pid = int(pid_m.group(1))
                mem = float(mem_m.group(1))
                comm = "unknown"
                try:
                    with open(f"/proc/{pid}/comm") as f:
                        comm = f.read().strip()
                except Exception:
                    name_m = re.search(r'Name\s*:\s*(.+)', b)
                    if name_m: comm = name_m.group(1).split()[0].split('/')[-1]

                # Friendly names
                if "webkit" in comm.lower(): comm = "WebKit"
                elif "obsidian" in comm.lower(): comm = "Obsidian"
                elif "zotero" in comm.lower(): comm = "Zotero"
                elif "chrome" in comm.lower(): comm = "Chrome"
                elif "xorg" in comm.lower(): comm = "Xorg"
                elif "gnome" in comm.lower(): comm = "gnome-shell"
                elif "wechat" in comm.lower(): comm = "WeChat"
                elif "snipaste" in comm.lower(): comm = "Snipaste"

                sm = pmon_map.get(pid, 0.0)
                procs_by_pid[pid] = {'name': comm, 'mem': mem, 'sm': sm}
    except Exception:
        pass

    # Group by name
    grouped = {}
    for p in procs_by_pid.values():
        name = p['name']
        if name not in grouped:
            grouped[name] = {'name': name, 'mem': 0.0, 'sm': 0.0}
        grouped[name]['mem'] += p['mem']
        grouped[name]['sm'] = max(grouped[name]['sm'], p['sm'])

    # Sort by active SM compute first, then by VRAM
    procs = sorted(grouped.values(), key=lambda x: (x['sm'] > 0, x['mem']), reverse=True)

    for i in range(5):
        idx = i + 1
        if i < len(procs):
            p = procs[i]
            pname = p['name'][:20]
            sm_str = f"{p['sm']:.1f}%" if p['sm'] > 0 else "0.0%"
            if p['mem'] >= 1024:
                vram_str = f"{p['mem']/1024:.2f} GB"
            elif p['mem'] > 0:
                vram_str = f"{int(p['mem'])} MB"
            else:
                vram_str = "- "
            write_val(f"gpu_p{idx}_name", pname)
            write_val(f"gpu_p{idx}_sm", sm_str)
            write_val(f"gpu_p{idx}_vram", vram_str)
        else:
            write_val(f"gpu_p{idx}_name", "-")
            write_val(f"gpu_p{idx}_sm", "-")
            write_val(f"gpu_p{idx}_vram", "-")

if __name__ == '__main__':
    if '--once' in sys.argv:
        update()
    else:
        while True:
            try:
                update()
            except Exception:
                pass
            time.sleep(2)
