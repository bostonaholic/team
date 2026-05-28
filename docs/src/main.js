// Team plugin office demo — Phaser 3 scene.
//
// Slice 2: Phaser bootstrap (canvas + camera zoom).
// Slice 4: player-controlled sprite with movement, walk animation, flip,
//          and an "asset load failed" overlay if the loader errors.
//
// Source of truth for the design and slicing:
// docs/plans/2026-05-28-phaser-office-demo/{design,structure,plan}.md

const GAME_WIDTH = 320;
const GAME_HEIGHT = 240;
const PLAYER_SPEED = 60; // pixels per second; tuned for the 320x240 world

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

    // Background fills the 320x240 world; origin centered at (160, 120).
    this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'office');

    // Walk animation: frames 0-3 at 8 fps, looping. Idle: just frame 0.
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

    // Player sprite (Arcade physics).
    this.player = this.physics.add.sprite(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'agent', 0);
    this.player.body.setSize(12, 14).setOffset(2, 1);
    this.player.setCollideWorldBounds(true);
    this.player.play('idle');

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
