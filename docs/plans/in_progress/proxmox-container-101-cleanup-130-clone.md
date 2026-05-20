# Plan: Proxmox — Decommission CT 101, Rename CT 107, and Clone as CT 130

**Status:** In Progress
**Date:** 2026-05-04

---

## Goal

Record the IP of LXC container 101 (experimental), delete it, rename CT 107 from "rag" to "personal", then clone CT 107 as a new container 130 named "rag".

## Background

Container 101 ("experimental") is an Ubuntu LXC running on Proxmox that is no longer needed. Its IP must be noted before deletion to avoid address conflicts. Container 107 (currently "rag") will be renamed to "personal", then cloned as CT 130 which takes on the "rag" hostname.

---

## Current Proxmox Inventory

| VMID | Name         | Type | Status  | Notes                        |
|------|--------------|------|---------|------------------------------|
| 100  | work         | LXC  | running |                              |
| 101  | experimental | LXC  | running | **To be deleted**            |
| 103  | work2        | LXC  | running |                              |
| 104  | Frigate      | LXC  | running |                              |
| 106  | ML8          | VM   | stopped |                              |
| 107  | rag → personal | LXC  | running | Rename to "personal"; source for clone → CT 130 |
| 108  | terraCT      | LXC  | running |                              |
| 109  | Main         | VM   | running |                              |
| 110  | template     | LXC  | stopped |                              |
| 111  | gh-runner    | LXC  | running |                              |

---

## Container 101 — Noted IP Address

| Field     | Value            |
|-----------|------------------|
| Hostname  | experimental     |
| IP        | **192.168.2.22** |
| Gateway   | 192.168.2.1      |
| Network   | 192.168.2.0/24   |
| Storage   | local-lvm, 32G   |
| Memory    | 8192 MB          |
| Cores     | 4                |
| Tags      | docker           |

> **IP 192.168.2.22 is freed when CT 101 is deleted. Do not reuse this IP without checking DHCP/static reservations.**

---

## Phases

### Phase 1 — Record CT 101 IP and Verify Readiness

**Status:** ✅ Completed 2026-05-04

**Goal:** Confirm CT 101 IP and ensure nothing depends on it before deletion.

**Deliverables:**

- [x] Note CT 101 IP address: `192.168.2.22`
- [x] Record CT 101 config (see table above)
- [ ] Verify no active services/SSH sessions depend on 192.168.2.22

**Manual verification:**
```bash
# Check if anything is connected to CT 101
ssh -t proxmox "sudo /usr/sbin/pct exec 101 -- ss -tp"
```

---

### Phase 2 — Delete CT 101

**Status:** Not started

**Goal:** Stop and destroy LXC container 101 (experimental).

**Deliverables:**

- [ ] Stop CT 101
- [ ] Destroy CT 101 (including disk)
- [ ] Confirm CT 101 no longer appears in `pct list`

**Commands:**
```bash
# 1. Stop the container
ssh -t proxmox "sudo /usr/sbin/pct stop 101"

# 2. Destroy the container and its disk
ssh -t proxmox "sudo /usr/sbin/pct destroy 101 --purge"

# 3. Verify removal
ssh -t proxmox "sudo /usr/sbin/pct list"
```

**Stability Criteria:** `pct list` no longer shows VMID 101.

**Notes:** `--purge` removes associated disk volumes from storage. Omit if you want to keep the disk as a backup.

---

### Phase 3 — Rename CT 107 to "personal" and Clone as CT 130 "rag"

**Status:** Not started

**Goal:** Rename CT 107's hostname from "rag" to "personal", then create a full clone of CT 107 as container 130, named "rag".

**CT 107 (rag) Config:**

| Field      | Value                          |
|------------|--------------------------------|
| Hostname   | rag → **personal** (to be renamed) |
| IP         | 192.168.2.28                   |
| Storage    | local-lvm, 64G                 |
| Memory     | 8192 MB                        |
| Cores      | 4                              |
| Tags       | docker                         |
| GPU devs   | nvidia0, nvidiactl, nvidia-uvm, nvidia-uvm-tools, nvidia-modeset |
| Privileged | unprivileged=1                 |

**Deliverables:**

- [ ] Rename CT 107 hostname from "rag" to "personal"
- [ ] Clone CT 107 → CT 130 with name "rag"
- [ ] Assign a new static IP to CT 130 (e.g. 192.168.2.30 or the freed 192.168.2.22)
- [ ] Start CT 130 and verify SSH access
- [ ] Confirm CT 130 appears in `pct list`

**Commands:**
```bash
# 1. Rename CT 107 hostname to "personal"
ssh -t proxmox "sudo /usr/sbin/pct set 107 --hostname personal"

# 2. Clone CT 107 → CT 130 named "rag" (full clone, not linked)
ssh -t proxmox "sudo /usr/sbin/pct clone 107 130 --hostname rag --full"

# 3. Update the network config — assign a new IP (e.g. 192.168.2.30)
ssh -t proxmox "sudo /usr/sbin/pct set 130 --net0 name=eth2,bridge=vmbr0,firewall=1,gw=192.168.2.1,ip=192.168.2.30/24,ip6=dhcp,type=veth"

# 4. Start CT 130
ssh -t proxmox "sudo /usr/sbin/pct start 130"

# 5. Verify
ssh -t proxmox "sudo /usr/sbin/pct list"
ssh -t proxmox "sudo /usr/sbin/pct exec 130 -- ip -4 addr show eth2"
ssh -t proxmox "sudo /usr/sbin/pct exec 107 -- hostname"
```

**Stability Criteria:** CT 107 hostname returns "personal"; CT 130 is running, reachable at its assigned IP, and `hostname` inside the container returns "rag".

**Notes:**
- `--full` creates an independent copy of the disk. Without it, a linked clone is created which requires a snapshot on CT 107 first.
- CT 107 is unprivileged — CT 130 will also be unprivileged.
- CT 107 has NVIDIA GPU passthrough (`dev0`–`dev4`) and cgroup2 device rules. These will be copied to CT 130. Remove them if GPU access is not needed in the experiment.
- Choose an IP not already assigned — 192.168.2.22 (freed from CT 101) is a valid option.
- The cloned disk will require ~64G free on `local-lvm`. Verify with `ssh proxmox "sudo pvesm status"`.

---

## Risks & Notes

- **Data loss:** `pct destroy --purge` is irreversible. Double-check VMID before running.
- **IP conflicts:** 192.168.2.22 becomes available after CT 101 deletion. Ensure no static DHCP reservation or other device holds it before reassigning.
- **Running services:** CT 101 is tagged `docker` — confirm no production containers are running inside it before deletion.
- **Clone storage:** A full clone of CT 107's 64G disk requires ~64G free on `local-lvm`. Verify with `ssh -t proxmox "sudo pvesm status"`.
- **GPU passthrough:** CT 107 has NVIDIA device passthrough configured. The clone will inherit this. Ensure NVIDIA drivers on the host are still valid for the clone, or remove GPU devs if not needed.
