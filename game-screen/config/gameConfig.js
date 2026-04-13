import { BootScene } from "../scenes/BootScene.js";
import { GameScene } from "../scenes/GameScene.js";

export const gameConfig = {
    type: Phaser.AUTO,
    width: 1280,
    height: 720,
    backgroundColor: "#1d1d1d",
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
    physics: {
        default: "arcade",
        arcade: {
            debug: false
        }
    },
    scene: [BootScene, GameScene]
};