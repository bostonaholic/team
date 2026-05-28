// Team plugin office demo — Phaser 3 scene.
//
// Slice 2: Phaser bootstrap (canvas + camera zoom).
// Slice 4: player-controlled sprite + walk/idle anims + flip + load-error overlay.
// Slice 5: 6-desk hitbox config, OCCUPIED Set, 12 deterministic NPC spawns.
// Slice 6: per-NPC state machine (idle -> walking -> working), desk-occupation
//          checks, 4-6s sit timer via this.time.addEvent, walking/working
//          text indicator above each NPC.
//
// Source of truth for the design and slicing:
// docs/plans/2026-05-28-phaser-office-demo/{design,structure,plan}.md

const GAME_WIDTH = 320;
const GAME_HEIGHT = 240;
const PLAYER_SPEED = 60;
const NPC_SPEED = 40;
const ARRIVAL_THRESHOLD = 4; // pixels — NPC has arrived at desk center
const IDLE_DELAY_MIN = 2000;
const IDLE_DELAY_MAX = 4000;
const SIT_DURATION_MIN = 4000;
const SIT_DURATION_MAX = 6000;

const DESKS = [
  { id: 'desk-0', x: 20, y: 110, w: 36, h: 18 },
  { id: 'desk-1', x: 142, y: 110, w: 36, h: 18 },
  { id: 'desk-2', x: 264, y: 110, w: 36, h: 18 },
  { id: 'desk-3', x: 20, y: 180, w: 36, h: 18 },
  { id: 'desk-4', x: 142, y: 180, w: 36, h: 18 },
  { id: 'desk-5', x: 264, y: 180, w: 36, h: 18 }
];

const OCCUPIED = new Set();

// 12 NPC spawn positions arranged on a 4x3 grid (rows y=96/144/210/232,
// columns x=50/160/270). Constraints encoded here:
//   * Horizontal separation between sprite centers on the same row is 110px.
//     The widest agent labels (`structure-planner`, `security-reviewer`) are
//     ~55px wide, so 110px guarantees ~55px of clear gap between adjacent
//     labels at spawn — no two labels can overlap horizontally on a row.
//   * Rows y=96 and y=144 sit above the top desk band (y=110..128); rows
//     y=210 and y=232 sit below the bottom desk band (y=180..198), so no
//     NPC spawns inside a desk hitbox.
//   * Row spacing keeps name labels (rendered 20px above each sprite) from
//     stacking visually: y=144 vs y=96 -> 48px gap; y=210 vs y=144 -> 66px;
//     y=232 vs y=210 -> 22px (label top on bottom row sits at world-y
//     ≈ 212, well below the y=210 row's working/walking indicator bottom
//     at world-y ≈ 198, so the two rows no longer crowd). The y=232 row
//     stays within the 320x240 canvas: sprite half-height 8 + label
//     extending ~10px below the sprite center keeps the bottom edge
//     above y=240.
const NPC_SPAWNS = [
  { x: 50,  y: 96  },
  { x: 160, y: 96  },
  { x: 270, y: 96  },
  { x: 50,  y: 144 },
  { x: 160, y: 144 },
  { x: 270, y: 144 },
  { x: 50,  y: 210 },
  { x: 160, y: 210 },
  { x: 270, y: 210 },
  { x: 50,  y: 232 },
  { x: 160, y: 232 },
  { x: 270, y: 232 }
];

const NPC_TINTS = [
  0xe05050, 0xe09a50, 0xd0c050, 0x70b050,
  0x50b09a, 0x5090d0, 0x7060c0, 0xc060b0,
  0xc06060, 0x90a060, 0x60a090, 0xa07060
];

// 13 plugin agent names in registry.json order. Index 0 names the player;
// indices 1..12 name the NPCs in NPC_SPAWNS order. The registry is the
// source of truth — keep this array byte-identical to the names returned
// by `grep -oE '"name": "[a-z-]+"' skills/team/registry.json`.
const AGENT_NAMES = [
  'questioner',
  'file-finder',
  'researcher',
  'design-author',
  'structure-planner',
  'planner',
  'test-architect',
  'implementer',
  'code-reviewer',
  'security-reviewer',
  'technical-writer',
  'ux-reviewer',
  'verifier'
];

const DEBUG_DESKS = false;

// Center coordinate of a desk (NPCs walk to this point).
function deskCenter(desk) {
  return { x: desk.x + desk.w / 2, y: desk.y + desk.h / 2 };
}

class OfficeScene extends Phaser.Scene {
  constructor() {
    super({ key: 'OfficeScene' });
    this.assetLoadFailed = false;
  }

  preload() {
    this.load.image('office', 'assets/backgrounds/office.png');
    this.load.spritesheet('agent', 'assets/sprites/agent.png', {
      frameWidth: 16,
      frameHeight: 16
    });
    this.load.on('loaderror', (file) => {
      this.assetLoadFailed = true;
      // eslint-disable-next-line no-console
      console.error('asset load failed:', file && file.key);
    });
  }

  create() {
    this.cameras.main.setZoom(2);

    if (this.assetLoadFailed) {
      this.showAssetLoadFailureOverlay();
      return;
    }

    // Clear any stale desk occupations from a previous scene instance.
    // The OCCUPIED Set is module-scoped, so it survives `this.scene.restart()`;
    // without this clear the NPCs would deadlock in the retry loop after a
    // restart. The demo never restarts today, but the latent bug is cheap
    // to defuse.
    OCCUPIED.clear();

    this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'office');

    if (DEBUG_DESKS) {
      for (const desk of DESKS) {
        this.add.rectangle(
          desk.x + desk.w / 2,
          desk.y + desk.h / 2,
          desk.w,
          desk.h,
          0xff0000,
          0.3
        );
      }
    }

    if (!this.anims.exists('walk')) {
      this.anims.create({
        key: 'walk',
        frames: this.anims.generateFrameNumbers('agent', { start: 0, end: 3 }),
        frameRate: 8,
        repeat: -1
      });
    }
    if (!this.anims.exists('idle')) {
      this.anims.create({
        key: 'idle',
        frames: [{ key: 'agent', frame: 0 }],
        frameRate: 1
      });
    }

    this.player = this.physics.add.sprite(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'agent', 0);
    this.player.body.setSize(12, 14).setOffset(2, 1);
    this.player.setCollideWorldBounds(true);
    this.player.play('idle');
    this.player.agentName = AGENT_NAMES[0];
    this.player.nameLabel = this.makeNameLabel(this.player.agentName);

    // NPC sprites + per-NPC state machine.
    this.npcs = [];
    for (let i = 0; i < NPC_SPAWNS.length; i++) {
      const spawn = NPC_SPAWNS[i];
      const npc = this.physics.add.sprite(spawn.x, spawn.y, 'agent', 0);
      npc.body.setSize(12, 14).setOffset(2, 1);
      npc.setCollideWorldBounds(true);
      npc.setTint(NPC_TINTS[i]);
      npc.play('idle');
      // State machine attached to the sprite for slice 6.
      npc.mode = 'idle';
      npc.targetDeskId = null;
      npc.releaseEvent = null;
      npc.indicator = this.add.text(npc.x, npc.y - 12, '', {
        fontSize: '6px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 2
      }).setOrigin(0.5, 1);
      // Name label (slice 7) — separate Text so sprite flip doesn't mirror it.
      npc.agentName = AGENT_NAMES[i + 1];
      npc.nameLabel = this.makeNameLabel(npc.agentName);
      this.npcs.push(npc);
      // Stagger initial walks so they don't all surge at once.
      const delay = Phaser.Math.Between(IDLE_DELAY_MIN, IDLE_DELAY_MAX);
      this.time.addEvent({
        delay,
        callback: () => this.pickNextDestination(npc)
      });
    }

    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys('W,A,S,D');
  }

  makeNameLabel(name) {
    return this.add.text(0, 0, name, {
      fontSize: '7px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2
    }).setOrigin(0.5, 1);
  }

  // Clamp a center-anchored label's x so it stays fully within the
  // canvas with a 4px margin on each side. Long labels at corner desks
  // (e.g. `structure-planner`, `security-reviewer`) would otherwise
  // clip off the canvas by a fraction of a pixel up to several pixels.
  // Short labels are untouched (clamp is a no-op when they already fit).
  clampLabelX(label, desiredX) {
    const half = label.width / 2;
    const minX = 4 + half;
    const maxX = GAME_WIDTH - 4 - half;
    if (maxX < minX) {
      // Label is wider than the safe band; center it.
      label.x = GAME_WIDTH / 2;
      return;
    }
    label.x = Phaser.Math.Clamp(desiredX, minX, maxX);
  }

  showAssetLoadFailureOverlay() {
    const text = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'asset load failed', {
      fontSize: '10px',
      color: '#ff8080',
      backgroundColor: '#000000',
      padding: { x: 4, y: 2 }
    });
    text.setOrigin(0.5, 0.5);
  }

  pickNextDestination(npc) {
    if (!npc.active) return; // sprite destroyed; do nothing
    const available = DESKS.filter((d) => !OCCUPIED.has(d.id));
    if (available.length === 0) {
      // All desks busy; try again shortly.
      npc.mode = 'idle';
      npc.indicator.setText('');
      this.time.addEvent({
        delay: Phaser.Math.Between(IDLE_DELAY_MIN, IDLE_DELAY_MAX),
        callback: () => this.pickNextDestination(npc)
      });
      return;
    }
    const target = available[Phaser.Math.Between(0, available.length - 1)];
    npc.targetDeskId = target.id;
    npc.mode = 'walking';
    npc.indicator.setText('walking');
    const center = deskCenter(target);
    this.physics.moveTo(npc, center.x, center.y, NPC_SPEED);
    if (npc.body.velocity.x < 0) npc.setFlipX(true);
    else if (npc.body.velocity.x > 0) npc.setFlipX(false);
    if (npc.anims.currentAnim?.key !== 'walk') npc.play('walk');
  }

  arriveAtDesk(npc) {
    const targetDesk = DESKS.find((d) => d.id === npc.targetDeskId);
    if (!targetDesk) {
      // Defensive: lost target somehow; restart.
      npc.mode = 'idle';
      npc.indicator.setText('');
      npc.setVelocity(0, 0);
      this.time.addEvent({
        delay: Phaser.Math.Between(IDLE_DELAY_MIN, IDLE_DELAY_MAX),
        callback: () => this.pickNextDestination(npc)
      });
      return;
    }
    // Concurrency check (design §Edge cases "Concurrency"): if the desk
    // became occupied while this NPC was walking, pick a different target.
    if (OCCUPIED.has(targetDesk.id)) {
      this.pickNextDestination(npc);
      return;
    }
    OCCUPIED.add(targetDesk.id);
    npc.mode = 'working';
    npc.setVelocity(0, 0);
    if (npc.anims.currentAnim?.key !== 'idle') npc.play('idle');
    // Snap to desk center so the sprite sits cleanly on the desk.
    const center = deskCenter(targetDesk);
    npc.setPosition(center.x, center.y);
    npc.indicator.setText('working');
    const sitDuration = Phaser.Math.Between(SIT_DURATION_MIN, SIT_DURATION_MAX);
    npc.releaseEvent = this.time.addEvent({
      delay: sitDuration,
      callback: () => this.releaseDesk(npc)
    });
  }

  releaseDesk(npc) {
    if (!npc.active) return;
    if (npc.targetDeskId) OCCUPIED.delete(npc.targetDeskId);
    npc.targetDeskId = null;
    npc.releaseEvent = null;
    npc.mode = 'idle';
    npc.indicator.setText('');
    // Small idle delay before picking the next desk so the room doesn't
    // feel mechanical.
    this.time.addEvent({
      delay: Phaser.Math.Between(IDLE_DELAY_MIN, IDLE_DELAY_MAX),
      callback: () => this.pickNextDestination(npc)
    });
  }

  update() {
    if (!this.player) return;

    // Player input.
    const left = this.cursors.left.isDown || this.wasd.A.isDown;
    const right = this.cursors.right.isDown || this.wasd.D.isDown;
    const up = this.cursors.up.isDown || this.wasd.W.isDown;
    const down = this.cursors.down.isDown || this.wasd.S.isDown;

    let vx = 0;
    let vy = 0;
    if (left) vx -= PLAYER_SPEED;
    if (right) vx += PLAYER_SPEED;
    if (up) vy -= PLAYER_SPEED;
    if (down) vy += PLAYER_SPEED;
    this.player.setVelocity(vx, vy);

    const playerMoving = vx !== 0 || vy !== 0;
    if (playerMoving) {
      if (this.player.anims.currentAnim?.key !== 'walk') this.player.play('walk');
      if (vx < 0) this.player.setFlipX(true);
      else if (vx > 0) this.player.setFlipX(false);
    } else {
      if (this.player.anims.currentAnim?.key !== 'idle') this.player.play('idle');
    }

    // Player name label tracks the player position; clamped to stay onscreen.
    // Labels are bottom-anchored (origin 0.5, 1); a y of 8 means the label's
    // bottom is at canvas row 8 and it extends upward from there. X is
    // clamped via clampLabelX so long labels never clip the canvas edges.
    this.clampLabelX(this.player.nameLabel, this.player.x);
    this.player.nameLabel.y = Math.max(8, this.player.y - 20);

    // NPC state machine.
    for (const npc of this.npcs) {
      if (npc.mode === 'walking' && npc.targetDeskId) {
        const target = DESKS.find((d) => d.id === npc.targetDeskId);
        if (target) {
          const center = deskCenter(target);
          const dx = center.x - npc.x;
          const dy = center.y - npc.y;
          if (Math.hypot(dx, dy) < ARRIVAL_THRESHOLD) {
            this.arriveAtDesk(npc);
          } else {
            // Keep facing right direction as we walk.
            if (npc.body.velocity.x < -1) npc.setFlipX(true);
            else if (npc.body.velocity.x > 1) npc.setFlipX(false);
          }
        }
      }
      // Sync indicator below the name label; name label clamped to canvas
      // on both axes. Both labels are NOT sprite children, so sprite flip
      // never mirrors them. Name label sits at y-20; indicator at y-12
      // (just below name, above head). X-clamp keeps long labels like
      // `structure-planner` from clipping at corner-desk x positions.
      this.clampLabelX(npc.nameLabel, npc.x);
      npc.nameLabel.y = Math.max(8, npc.y - 20);
      this.clampLabelX(npc.indicator, npc.x);
      npc.indicator.y = Math.max(16, npc.y - 12);
    }
  }
}

const config = {
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  pixelArt: true,
  backgroundColor: '#3a5a40',
  physics: {
    default: 'arcade',
    arcade: { debug: false }
  },
  scene: [OfficeScene]
};

new Phaser.Game(config);
