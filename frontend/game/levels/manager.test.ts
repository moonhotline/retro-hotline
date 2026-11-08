import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { LevelManager } from './manager'
import { STAGE_01_BAY_BRIDGE } from './manifests/stage01_bay_bridge'
import { STAGE_02_NEON_DOCKS } from './manifests/stage02_neon_docks'

describe('LevelManager', () => {
  it('initializes with default stages and starts at chapter 1', () => {
    const manager = new LevelManager([STAGE_01_BAY_BRIDGE, STAGE_02_NEON_DOCKS])
    expect(manager.currentStage.id).toBe('stage-01-bay-bridge')
    expect(manager.stageIndex).toBe(0)
    expect(manager.roomIndex).toBe(0)
    expect(manager.currentRoom?.roomId).toBe('room-01-causeway')
  })

  it('detects interaction proximity with story entities', () => {
    const manager = new LevelManager([STAGE_01_BAY_BRIDGE])
    // Terminal is at [0, 1.8, -120], radius 3.5
    const farPlayer = new THREE.Vector3(0, 1.8, 0)
    const resFar = manager.update(farPlayer, 0.016)
    expect(resFar.canInteract).toBeNull()
    expect(manager.activeInteractable).toBeNull()

    const nearPlayer = new THREE.Vector3(0, 1.8, -121)
    const resNear = manager.update(nearPlayer, 0.016)
    expect(resNear.canInteract).not.toBeNull()
    expect(resNear.canInteract?.id).toBe('terminal-ch01-relay')
    expect(manager.activeInteractable?.promptLabel).toBe('◻︎ BREACH TERMINAL')
  })

  it('opens and closes story dialogue modals with completion actions', () => {
    const manager = new LevelManager([STAGE_01_BAY_BRIDGE])
    const nearPlayer = new THREE.Vector3(0, 1.8, -121)
    manager.update(nearPlayer, 0.016)

    expect(manager.interact()).toBe(true)
    expect(manager.storyModal.open).toBe(true)
    expect(manager.storyModal.title).toBe('TACTICAL INTERCEPT // RELAY 09')
    expect(manager.storyModal.lines).toHaveLength(2)

    const result = manager.closeDialogue()
    expect(manager.storyModal.open).toBe(false)
    expect(result.action).toBe('unlock_door')
  })

  it('advances room encounters when cleared and transitions stages', () => {
    const manager = new LevelManager([STAGE_01_BAY_BRIDGE, STAGE_02_NEON_DOCKS])
    expect(manager.roomIndex).toBe(0)
    manager.onRoomClear('room-01-causeway')
    expect(manager.roomIndex).toBe(1)
    expect(manager.currentRoom?.roomId).toBe('room-02-main-span')

    expect(manager.nextStage()).toBe(true)
    expect(manager.stageIndex).toBe(1)
    expect(manager.currentStage.id).toBe('stage-02-neon-docks')
  })

  it('triggers shouldSpawnRoomWave strictly once upon room entry and prevents infinite spawning', () => {
    const manager = new LevelManager([STAGE_01_BAY_BRIDGE])
    // room-01-causeway bounds: { minX: -30, maxX: 30, minZ: -380, maxZ: -120 }
    const inRoom = new THREE.Vector3(0, 1.8, -250)
    const firstUpdate = manager.update(inRoom, 0.016)
    expect(firstUpdate.shouldSpawnRoomWave).toBe(true)

    // Subsequent updates in the exact same room bounds must NOT spawn again
    const secondUpdate = manager.update(inRoom, 0.016)
    expect(secondUpdate.shouldSpawnRoomWave).toBe(false)

    const thirdUpdate = manager.update(inRoom, 0.016)
    expect(thirdUpdate.shouldSpawnRoomWave).toBe(false)
  })
})
