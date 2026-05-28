// Team plugin office demo — Phaser 3 scene.
//
// Slice 2: Phaser bootstrap (canvas + camera zoom).
// Slice 4: player-controlled sprite + walk/idle anims + flip + load-error overlay.
// Slice 5: office desks (hitbox config), occupation Set, 12 NPC sprites with
//          deterministic spawn positions and distinct tints. No NPC behavior
//          yet — slice 6 adds the patrol state machine.
//
// Source of truth for the design and slicing:
// docs/plans/2026-05-28-phaser-office-demo/{design,structure,plan}.md

const GAME_WIDTH = 320;
const GAME_HEIGHT = 240;
const PLAYER_SPEED = 60; // pixels per second; tuned for the 320x240 world

// Desk hitboxes match the background art generator (docs/scripts/generate-assets.mjs).
// Two rows of three desks, each 36x18, top-left coords as below.
// Slice 6 will track occupation by id; slice 5 only defines the geometry.
const DESKS = [
  { id: 'desk-0', x: 20, y: 110, w: 36, h: 18 },
  { id: 'desk-1', x: 142, y: 110, w: 36, h: 18 },
  { id: 'desk-2', x: 264, y: 110, w: 36, h: 18 },
  { id: 'desk-3', x: 20, y: 180, w: 36, h: 18 },
  { id: 'desk-4', x: 142, y: 180, w: 36, h: 18 },
  { id: 'desk-5', x: 264, y: 180, w: 36, h: 18 }
];

// Module-level occupation tracker (slice 6 mutates this).
const OCCUPIED = new Set();

// Twelve deterministic NPC spawn positions, chosen to avoid:
//   - the player spawn at (160, 120),
//   - every desk hitbox above,
//   - and the canvas edges (sprite is 16x16; keep a 4-px margin).
// Positions cluster in the walkable aisles between desks and along the
// wall stripe so the visitor sees a full crowd of 13 from the first frame.
// Walkable bands (sprites must NOT spawn on a desk hitbox):
//   y=88..104  : above row-1 desks (desks start at y=110)
//   y=140..168 : aisle between rows (desks end at y=128, next row starts y=180)
//   y=204..220 : below row-2 desks (desks end at y=198)
// All x values are picked to sit fully between desk columns (gaps at
// x=56..142, x=178..264) or in the side margins (x<20, x>300).
const NPC_SPAWNS = [
  { x: 80, y: 96 },
  { x: 200, y: 96 },
  { x: 240, y: 96 },
  { x: 100, y: 144 },
  { x: 200, y: 144 },
  { x: 90, y: 160 },
  { x: 230, y: 160 },
  { x: 80, y: 212 },
  { x: 200, y: 212 },
  { x: 240, y: 212 },
  { x: 120, y: 144 },
  { x: 220, y: 144 }
];

// Distinct tints per NPC give visible identity even before name labels (slice 7).
// Colors chosen for contrast against the office wall (#d2d7dc) and floor (#b4a082).
const NPC_TINTS = [
  0xe05050, 0xe09a50, 0xd0c050, 0x70b050,
  0x50b09a, 0x5090d0, 0x7060c0, 0xc060b0,
  0xc06060, 0x90a060, 0x60a090, 0xa07060
];

// Debug flag: when true, draws each desk's hitbox as a translucent rectangle.
const DEBUG_DESKS = false;

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

    // Fail-fast per design §Edge cases "Empty desk set".
    if (DESKS.length === 0) {
      throw new Error('DESKS config must contain at least one desk');
    }

    // Background fills the 320x240 world; origin centered at (160, 120).
    this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'office');

    if (DEBUG_DESKS) {
      for (const desk of DESKS) {
        const rect = this.add.rectangle(
          desk.x + desk.w / 2,
          desk.y + desk.h / 2,
          desk.w,
          desk.h,
          0xff0000,
          0.3
        );
        rect.setOrigin(0.5, 0.5);
      }
    }

    // Animations (shared by player and NPCs).
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

    // Player sprite.
    this.player = this.physics.add.sprite(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'agent', 0);
    this.player.body.setSize(12, 14).setOffset(2, 1);
    this.player.setCollideWorldBounds(true);
    this.player.play('idle');

    // NPC sprites — one per NPC_SPAWNS entry. No behavior yet (slice 6).
    this.npcs = [];
    for (let i = 0; i < NPC_SPAWNS.length; i++) {
      const spawn = NPC_SPAWNS[i];
      const npc = this.physics.add.sprite(spawn.x, spawn.y, 'agent', 0);
      npc.body.setSize(12, 14).setOffset(2, 1);
      npc.setCollideWorldBounds(true);
      npc.setTint(NPC_TINTS[i]);
      npc.play('idle');
      this.npcs.push(npc);
    }

    // Input: arrow keys + WASD.
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys('W,A,S,D');
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

  update() {
    if (this.assetLoadFailed || !this.player) return;

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

    const moving = vx !== 0 || vy !== 0;
    if (moving) {
      if (this.player.anims.currentAnim?.key !== 'walk') this.player.play('walk');
      if (vx < 0) this.player.setFlipX(true);
      else if (vx > 0) this.player.setFlipX(false);
    } else {
      if (this.player.anims.currentAnim?.key !== 'idle') this.player.play('idle');
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
