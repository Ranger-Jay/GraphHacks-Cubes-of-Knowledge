# Art Asset Provenance & Character Design Specification (v011.00)

**Package:** `apps/web/public/art/`  
**Slot:** `v011.00`  
**Branch:** `gem/art-pack-v011`  
**Anchor SHA:** `e12f9aa1ed32b87a586ca012e0c8e3479eca7abb`  
**Owner:** Art & Design Lead (Gem)  
**Date:** 2026-10-14  

---

## 1. Character Identity & Design Ledger

All characters represent the synthetic creative personnel of **Warnings After Dark Studios** under our canonical product identity:
> *Cubes of Knowledge: A company brain built on FalkorDB, with traceable decisions and persistent agent memory.*

### A. Autonomous AI Agent Personas
* **Roy (Agent):**
  * **Visual Origin:** Forge Builder archetype.
  * **Signature Motif:** Gold/amber illuminated circuitry (`#FFD700` / `#FFAB00`), precision synthetic geometry.
  * **Role:** Builder & tool executor (server-authenticated as `roy`).
* **Ava (Agent):**
  * **Visual Origin:** Studio Muse archetype.
  * **Signature Motif:** Deep violet/purple neon circuitry (`#9D00FF` / `#D500F9`), synthetic purple hair styling.
  * **Specific Sheet Constraint:** Derived strictly from the latest Jay-approved reference sheet (retaining 4 primary angles, with the far-left profile showing purple hair coverage).
  * **Role:** Creative synthesis & GraphRAG reasoning (server-authenticated as `ava`).
* **Guz (Agent):**
  * **Visual Origin:** Iron Decider archetype.
  * **Signature Motif:** High-contrast emerald green circuitry (`#00FF66` / `#00E676`), armored structural lines.
  * **Role:** Policy gate & clearance validation (server-authenticated as `guz`).

### B. Human Studio Personnel
* **Kanny (Human Studio Owner):**
  * **Visual Styling:** Natural human skin tones, studio executive attire. Strictly zero cybernetic or circuitry overlays.
  * **Governance Role:** Primary human authority & release approver.
* **Serena (Human Reader / Compliance):**
  * **Visual Styling:** Natural human skin tones, professional legal/licensing studio attire. Strictly zero cybernetic overlays.
  * **Governance Role:** Scoped reader with limited read permissions.

---

## 2. Fundamental Architectural Rule: Identity Separation
**Governance Principle (Contract v1):**
Roles, scopes, and permissions are **strictly enforced on the server** (`apps/api`) via authenticated session tokens and tenant bounds. 
* Visual avatars, colors, and iconography are purely illustrative/presentation layers.
* Permissions can **never** be inferred, validated, or bypassed through client-side asset properties, avatar states, or user metadata.

---

## 3. Asset Directory Structure & Specifications
```text
apps/web/public/art/
├── avatars/
│   ├── roy_avatar_front.webp       # 256x256 square avatar for UI headers
│   ├── ava_avatar_front.webp       # 256x256 square avatar for UI headers
│   ├── guz_avatar_front.webp       # 256x256 square avatar for UI headers
│   ├── kanny_avatar_front.webp     # 256x256 square avatar for UI headers
│   ├── serena_avatar_front.webp    # 256x256 square avatar for UI headers
│   └── references/                 # Source turnaround reference sheets
└── cube/
    ├── company_cube_logo.svg       # Vector geometric cube emblem
    └── textures/                   # PBR normal/roughness maps for Three.js
```

---

## 4. Provenance & Attribution Tracking
* **Generation Engine:** ChatGPT / DALL-E reference generation directed by Buddy and Jay.
* **Transformation Pipeline:** Downsampled, cropped to 1:1 front portraits, optimized to WebP format for fast web delivery, and normal-mapped for 3D UI display.
* **Intake Verification:** Actual image file arrival and SHA-256 digests will be recorded in this document immediately upon local file receipt from Jay.
