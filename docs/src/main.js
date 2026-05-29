// Team plugin office demo — Phaser 3 scene.
//
// The player character at canvas center represents "You" — the orchestrator
// session that walks the QRSPI phase table. The 13 NPCs are the specialist
// agents listed in skills/team/registry.json (questioner through verifier).
//
// Slice 2: Phaser bootstrap (canvas + camera zoom).
// Slice 4: player-controlled sprite + walk/idle anims + flip + load-error overlay.
// Slice 5: desk hitbox config, OCCUPIED Set, 13 deterministic NPC spawns.
// Slice 6: per-NPC state machine (idle -> walking -> working), desk-occupation
//          checks, 4-6s sit timer via this.time.addEvent, walking/working
//          text indicator above each NPC.
//
// Source of truth for the design and slicing:
// docs/plans/2026-05-28-phaser-office-demo/{design,structure,plan}.md

const GAME_WIDTH = 640;
const GAME_HEIGHT = 480;
const PLAYER_SPEED = 120;
const NPC_SPEED = 80;
const ARRIVAL_THRESHOLD = 4; // pixels — NPC has arrived at desk center
const IDLE_DELAY_MIN = 2000;
const IDLE_DELAY_MAX = 4000;
const SIT_DURATION_MIN = 4000;
const SIT_DURATION_MAX = 6000;

// Player label — the orchestrator session is "You".
const PLAYER_NAME = 'You';
const PLAYER_LABEL_COLOR = '#ffeb3b'; // bright yellow, distinct from NPC labels

// 15 desks on a 3x5 grid. Two extra over the 13 NPCs so the room never
// deadlocks waiting for an open desk. Each desk is 48x24 px and the row
// y-positions sit cleanly in the floor band (y >= 160).
const DESKS = [
  // Row 1 (y=200)
  { id: 'desk-0',  x: 32,  y: 200, w: 48, h: 24 },
  { id: 'desk-1',  x: 164, y: 200, w: 48, h: 24 },
  { id: 'desk-2',  x: 296, y: 200, w: 48, h: 24 },
  { id: 'desk-3',  x: 428, y: 200, w: 48, h: 24 },
  { id: 'desk-4',  x: 560, y: 200, w: 48, h: 24 },
  // Row 2 (y=290)
  { id: 'desk-5',  x: 32,  y: 290, w: 48, h: 24 },
  { id: 'desk-6',  x: 164, y: 290, w: 48, h: 24 },
  { id: 'desk-7',  x: 296, y: 290, w: 48, h: 24 },
  { id: 'desk-8',  x: 428, y: 290, w: 48, h: 24 },
  { id: 'desk-9',  x: 560, y: 290, w: 48, h: 24 },
  // Row 3 (y=380)
  { id: 'desk-10', x: 32,  y: 380, w: 48, h: 24 },
  { id: 'desk-11', x: 164, y: 380, w: 48, h: 24 },
  { id: 'desk-12', x: 296, y: 380, w: 48, h: 24 },
  { id: 'desk-13', x: 428, y: 380, w: 48, h: 24 },
  { id: 'desk-14', x: 560, y: 380, w: 48, h: 24 }
];

const OCCUPIED = new Set();

// 13 NPC spawn positions distributed in the aisles between desk rows.
// Constraints encoded here:
//   * Columns x = 70 / 230 / 410 / 570 give >= 160px horizontal gap between
//     sprite centers; the widest agent labels (`structure-planner`,
//     `security-reviewer`) are ~110px at 12px sans-serif, so adjacent
//     labels on the same row clear each other by ~50px.
//   * Aisle rows y = 170 / 255 / 345 / 440 sit in the gaps between desk
//     rows (200..224, 290..314, 380..404), so no NPC spawns inside a desk
//     hitbox.
//   * Row spacing is 85px / 90px / 95px — comfortably above the 80px floor
//     called out in the redesign brief, so name labels (12px) and
//     walking/working indicators (10px) never collide vertically.
//   * Bottom row y=440 keeps sprite feet at y=448, leaving a 32px margin
//     above the y=480 canvas edge.
//   * 13 of 16 grid slots — the three slots geometrically closest to the
//     player-spawn at (320, 240) are omitted so the player has breathing
//     room at the room's heart.
const NPC_SPAWNS = [
  { x: 70,  y: 170 },
  { x: 230, y: 170 },
  { x: 410, y: 170 },
  { x: 570, y: 170 },
  { x: 70,  y: 255 },
  { x: 570, y: 255 },
  { x: 70,  y: 345 },
  { x: 230, y: 345 },
  { x: 410, y: 345 },
  { x: 570, y: 345 },
  { x: 70,  y: 440 },
  { x: 230, y: 440 },
  { x: 570, y: 440 }
];

// 13 distinct NPC tints — one per specialist agent. Extended from the
// previous 12-color palette with a bright cyan to give the new 13th NPC
// its own identity.
const NPC_TINTS = [
  0xe05050, 0xe09a50, 0xd0c050, 0x70b050,
  0x50b09a, 0x5090d0, 0x7060c0, 0xc060b0,
  0xc06060, 0x90a060, 0x60a090, 0xa07060,
  0x40b0e0
];

// 13 NPC agent names in skills/team/registry.json order. The player
// character at canvas center is "You" (the orchestrator) and is named
// separately via PLAYER_NAME — it is NOT one of these 13.
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

    // Player ("You" — the orchestrator) spawns at canvas center.
    // No tint so the player visually stands out from the 13 tinted NPCs.
    this.player = this.physics.add.sprite(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'agent', 0);
    this.player.body.setSize(12, 14).setOffset(2, 1);
    this.player.setCollideWorldBounds(true);
    this.player.play('idle');
    this.player.agentName = PLAYER_NAME;
    this.player.nameLabel = this.makeNameLabel(PLAYER_NAME, PLAYER_LABEL_COLOR);

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
      npc.indicator = this.add.text(npc.x, npc.y - 11, '', {
        fontSize: '10px',
        fontFamily: 'sans-serif',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 3
      }).setOrigin(0.5, 1);
      // Name label (slice 7) — separate Text so sprite flip doesn't mirror it.
      npc.agentName = AGENT_NAMES[i];
      npc.nameLabel = this.makeNameLabel(npc.agentName, '#ffffff');
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

  makeNameLabel(name, color) {
    return this.add.text(0, 0, name, {
      fontSize: '12px',
      fontFamily: 'sans-serif',
      color: color,
      stroke: '#000000',
      strokeThickness: 3
    }).setOrigin(0.5, 1);
  }

  // Clamp a center-anchored label's x so it stays fully within the
  // canvas with an 8px margin on each side. Long labels at corner desks
  // (e.g. `structure-planner`, `security-reviewer`) would otherwise
  // clip off the canvas. Short labels are untouched (clamp is a no-op
  // when they already fit).
  clampLabelX(label, desiredX) {
    const half = label.width / 2;
    const minX = 8 + half;
    const maxX = GAME_WIDTH - 8 - half;
    if (maxX < minX) {
      // Label is wider than the safe band; center it.
      label.x = GAME_WIDTH / 2;
      return;
    }
    label.x = Phaser.Math.Clamp(desiredX, minX, maxX);
  }

  showAssetLoadFailureOverlay() {
    const text = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'asset load failed', {
      fontSize: '16px',
      fontFamily: 'sans-serif',
      color: '#ff8080',
      backgroundColor: '#000000',
      padding: { x: 6, y: 3 }
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
    // Labels are bottom-anchored (origin 0.5, 1); a min y of 12 keeps the
    // top of the 12px font visible. X is clamped via clampLabelX so long
    // labels never clip the canvas edges.
    this.clampLabelX(this.player.nameLabel, this.player.x);
    this.player.nameLabel.y = Math.max(12, this.player.y - 22);

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
      // never mirrors them. Name label sits at y-22; indicator at y-11
      // (just below name, above head). X-clamp keeps long labels like
      // `structure-planner` from clipping at corner-desk x positions.
      this.clampLabelX(npc.nameLabel, npc.x);
      npc.nameLabel.y = Math.max(12, npc.y - 22);
      this.clampLabelX(npc.indicator, npc.x);
      npc.indicator.y = Math.max(10, npc.y - 11);
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
