# Art Asset Provenance & Character Design Specification (v011.00)

**Package:** `apps/web/public/art/`  
**Slot:** `v011.00`  
**Branch:** `gem/art-pack-v011`  
**Owner:** Art & Design Lead (Gem)  
**Date:** 2026-10-14  
**Contest Repository:** `Ranger-Jay/GraphHacks-Cubes-of-Knowledge`

---

## 1. Canonical Identity & 5-Character Roster

All characters represent the synthetic creative personnel and human governance authorities of **Warnings After Dark Studios** under our approved product identity:
> *Cubes of Knowledge: A company brain built on FalkorDB, with traceable decisions and persistent agent memory.*

### A. Autonomous AI Agent Personas
1. **Roy (AI Agent):**
   - **Archetype:** Forge Builder / Operations & Strategy Lead.
   - **Signature Motif:** Radiant gold/amber illuminated circuitry (`#FFD700` / `#FF8F00`), structured cyber-military cut, high-collared dark cyber armor with gold fiber-optic power nodes.
   - **Voice Timbre:** Resonant, calm, authoritative military cadence (`pitch: 0.9`, `rate: 0.95`).
   - **Server Identity:** Scoped agent member (`MEMBER_OF` AGENT `roy`).
2. **Ava (AI Agent):**
   - **Archetype:** Studio Muse / Graph & Evidence Reasoning Lead.
   - **Signature Motif:** Vibrant purple/violet neon circuitry (`#B388FF` / `#7C4DFF`), **approved asymmetric hairstyle** (lush sweeping purple locks on left, cropped undercut on right exposing cybernetic circuit ports and temple implants).
   - **Source Sheet Constraint:** Strictly derived from the latest Jay-approved sheet (`AVA's Left Profile Purple Hair Update.png`). Earlier sheets are superseded.
   - **Voice Timbre:** Crisp, analytical clarity (`pitch: 1.15`, `rate: 1.05`).
   - **Server Identity:** Scoped agent member (`MEMBER_OF` AGENT `ava`).
3. **Guz (AI Agent):**
   - **Archetype:** Iron Decider / Verification & Audit Lead.
   - **Signature Motif:** High-contrast emerald green circuitry (`#00E676` / `#00C853`), mature Black warrior with trimmed salt-and-pepper beard, shaven head with inlaid emerald circuit tracks, armored high collar with green conduits.
   - **Voice Timbre:** Energetic, rapid audit cadence (`pitch: 1.0`, `rate: 1.1`).
   - **Server Identity:** Scoped agent member (`MEMBER_OF` AGENT `guz`).

### B. Human Studio Authorities
1. **Kanny (Human Studio Owner):**
   - **Visual Styling:** Natural human skin tones (`#E0AC69`), wavy salt-and-pepper hair, trimmed beard, warm brown eyes, dark charcoal studio blazer over ivory crewneck. Strictly zero cybernetics or circuitry.
   - **Governance Scope:** Human Studio Owner; holds exclusive release approval authorization.
2. **Serena (Human Reader & Compliance):**
   - **Visual Styling:** Natural human skin tones (`#F5D0C5`), shoulder-length curly dark brunette hair, attentive hazel-brown eyes, tailored charcoal blazer over dark teal silk blouse. Strictly zero cybernetics.
   - **Governance Scope:** Scoped reader / auditor; read-only clearance verification.

---

## 2. Fundamental Architectural Rule: Identity Separation (Law 19)

> [!IMPORTANT]
> **Server Identity Boundary (Presentation ≠ Privilege):**  
> Roles, scopes, and permissions are **strictly enforced on the server** (`apps/api`) via authenticated session tokens and tenant boundaries.  
> Visual avatars, styling, colors, and animations are purely illustrative layers for user experience and visual legibility.  
> Privileged actions (e.g. Kanny's release approval vs Serena's read-only inspection) can **never** be inferred, validated, or bypassed through client-side asset properties, avatar states, or user metadata.

---

## 3. 3D Scene Concepts Specification

In addition to character avatars, the art pack incorporates the canonical concepts for the 3D scene elements:

1. **Company Cube (Composite):** Primary company-knowledge lattice. Luminous cyan-blue crystalline cube frame (`#00E5FF`) with glowing red spherical corner nodes, internal red graph evidence nodes, central golden sun, and orbital rings.
2. **Company Cube (Empty Lattice):** Electric blue wireframe framework demonstrating clean structural grid and baseline unpopulated state.
3. **Agent Pyramids:** Translucent amethyst-purple glowing crystal pyramids with glowing runic/circuit glyphs, tech bases, and data-stream conduits. Identifiable spaces for Roy, Ava, and Guz.
4. **The Sun:** Radiant golden plasma star with swirling coronal textures, providing warm ambient lighting restrained so labels and graph evidence remain legible.

---

## 4. Source Reference Digest Ledger

Primary reference files supplied directly by Jay from `c:\Users\Aurae\Desktop\PROJECTS\Gem's Art Studio`:

| File Name | Dimensions | Size | SHA-256 Digest |
| :--- | :--- | :--- | :--- |
| `AVA's Left Profile Purple Hair Update.png` | 2172 × 724 | 2,390,878 B | `45ACD5BA15497F7897C3B4C503BF335339D7F7CE680B4B65F02C7D85BB65D418` |
| `Roy's Cybernetic Portrait Turnaround.png` | 1983 × 793 | 2,462,240 B | `8AEB252FBFF5B8C4E53DE266C2F2326C6E372F8E39571A893FD2CF8FC6D36C44` |
| `GUZ.png` | 1983 × 793 | 2,358,925 B | `C93A423C41186AA4A55646C34E98F89C91EBABABAC9B7D9EA2A3AF5120B9D74F` |
| `KANNY five-view human character sheet-1.png` | 1983 × 793 | 2,348,038 B | `83B090392AF543E130E3347E3EF539D3979E4002510685912C4AF0D3F1D7F097` |
| `Serena-2.png` | 1983 × 793 | 2,276,784 B | `F709B781C4C94C88017D8D6418B6959A08BE7972C6305E2EA349A2FA8C004D0A` |
| `cube_concept1.jfif` | 1408 × 768 | 138,214 B | `B53F6203FD7C1CB29D6951D85777AAD9E2E339313FA284900E51D4A1C5A2701D` |
| `empty_cube_concept1.jfif` | 1408 × 768 | 108,721 B | `A34E3910FB2070A232E324F28FAF7F832997322D0B02B85810C4363220483E11` |
| `pyramid_concept1.jfif` | 1408 × 768 | 160,388 B | `02EDD54BF8C89FC0EA027EFD8890B3C577BDF06F28186F9E98E0F78F5791C50A` |
| `sun_concept1.jfif` | 1408 × 768 | 110,725 B | `E11B895BBB12440E1FC1859E948F962067DA38172AF73286DDB8019A58C29435` |

---

## 5. Crop Geometry & Extraction Parameters

Front portraits are extracted using precision bounding boxes to ensure clean backgrounds, perfect centering, and zero overlap from adjacent turnaround angles:

| Target Avatar | Source Sheet | Crop Box $(x, y, w, h)$ | Scale Output | Framing Notes |
| :--- | :--- | :--- | :--- | :--- |
| `ava_avatar_front.png` | `AVA's Left Profile Purple Hair Update.png` | $(876, 130, 420, 420)$ | 256 × 256 | Centered on front view; captures sweeping purple fringe and neck collar. |
| `roy_avatar_front.png` | `Roy's Cybernetic Portrait Turnaround.png` | $(799, 130, 384, 384)$ | 256 × 256 | Centered on front view; eliminates adjacent $45^\circ$ head overlap. |
| `guz_avatar_front.png` | `GUZ.png` | $(799, 170, 384, 384)$ | 256 × 256 | Centered on front view; balances head height and glowing green collar. |
| `kanny_avatar_front.png` | `KANNY five-view human character sheet-1.png` | $(799, 140, 384, 384)$ | 256 × 256 | Centered on executive blazer and natural features. |
| `serena_avatar_front.png` | `Serena-2.png` | $(799, 150, 384, 384)$ | 256 × 256 | Centered on brunette curls and dark slate-teal blouse. |

---

## 6. Exported Art Pack Manifest (`apps/web/public/art/`)

| Relative Path | Format | Dimensions | Size | SHA-256 Digest |
| :--- | :--- | :--- | :--- | :--- |
| `avatars/ava_avatar_front.png` | PNG | 256 × 256 | 152,344 B | `8F7F068C7970FF10AE7176A4AAB1290ADE53E5F6F080EC1655C8B5EF3D745397` |
| `avatars/roy_avatar_front.png` | PNG | 256 × 256 | 147,244 B | `990419954982F67A17D35C877FA4F4111575EB2AF2E9BA5E5FA3988BDBFF3010` |
| `avatars/guz_avatar_front.png` | PNG | 256 × 256 | 148,196 B | `1963F4F4AB9DB98263303D39242090653895426D430B3A3646538203B8784DC8` |
| `avatars/kanny_avatar_front.png` | PNG | 256 × 256 | 149,889 B | `F621557E8E6D9BD77C9C28C4F294A8287B00D291B2BF10DEDFD2BB17A0978E37` |
| `avatars/serena_avatar_front.png` | PNG | 256 × 256 | 160,214 B | `E27190C485F229B839974ED90F4AECE5AA479E1E35BEA15B6B789BBBF522C892` |
| `concepts/cube_concept_composite.jpg` | JPEG | 1408 × 768 | 138,214 B | `B53F6203FD7C1CB29D6951D85777AAD9E2E339313FA284900E51D4A1C5A2701D` |
| `concepts/cube_concept_empty.jpg` | JPEG | 1408 × 768 | 108,721 B | `A34E3910FB2070A232E324F28FAF7F832997322D0B02B85810C4363220483E11` |
| `concepts/pyramid_concept.jpg` | JPEG | 1408 × 768 | 160,388 B | `02EDD54BF8C89FC0EA027EFD8890B3C577BDF06F28186F9E98E0F78F5791C50A` |
| `concepts/sun_concept.jpg` | JPEG | 1408 × 768 | 110,725 B | `E11B895BBB12440E1FC1859E948F962067DA38172AF73286DDB8019A58C29435` |

---

## 7. Verification & Integrity Checklist

- [x] **Character Identity Match:** Roy (gold), Ava (purple asymmetric), Guz (green), Kanny (human owner), Serena (human reader) visually verified against Jay's approved references.
- [x] **No Mocked Data:** Avatars and concepts are real binary assets derived directly from studio master references.
- [x] **Zero Conflict with Code:** Placed cleanly in `apps/web/public/art/`, served statically by Vite dev and production builds.
- [x] **Cryptographic Anchor:** SHA-256 digests documented for every inbound source and outbound export.
