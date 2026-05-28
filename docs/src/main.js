// Team plugin office demo — Phaser 3 scene.
//
// Slice 2: minimal Phaser bootstrap. A 320x240 canvas scaled 2x with a
// solid placeholder background color. Empty preload/create/update so a
// visitor sees a non-empty colored canvas before any assets exist.
//
// Source of truth for the design and slicing:
// docs/plans/2026-05-28-phaser-office-demo/{design,structure,plan}.md

const GAME_WIDTH = 320;
const GAME_HEIGHT = 240;

class OfficeScene extends Phaser.Scene {
  constructor() {
    super({ key: 'OfficeScene' });
  }

  preload() {
    // Asset loading is added in slice 4.
  }

  create() {
    this.cameras.main.setZoom(2);
  }

  update() {
    // Per-frame logic is added in slice 4.
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
