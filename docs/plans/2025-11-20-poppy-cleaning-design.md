# Poppy Cleaning Design

**Date:** 2025-11-20
**Feature:** Automatic poppy removal from chests using nearby cactus

## Overview

Add functionality to the stationary Mineflayer bot to automatically clean poppies from chests by tossing them onto a nearby cactus for destruction. This prevents poppies from clogging iron chests and frees up inventory space for iron processing.

## Requirements

- **Trigger:** Only run when poppies are detected in chests
- **Scope:** Process poppies from ALL chests (not just iron chests)
- **Cactus placement:** User will place a cactus within throwing distance of the bot (4 blocks max)
- **Integration:** Integrate into existing chest processing loop to minimize chest openings

## Architecture

### Approach: Integrated Into Chest Loop

The poppy cleaning logic will be integrated directly into the existing `compressIronCycle()` chest processing loop. This provides:
- **Efficiency:** Single chest opening per cycle (vs. opening twice for separate passes)
- **Simplicity:** Minimal code changes, follows existing patterns
- **Reliability:** Same error handling as iron processing

### System Flow

```
compressIronCycle() start
  ↓
Find crafting table (existing)
  ↓
Find cactus block (NEW)
  ↓
For each chest:
  ├─ Open chest
  ├─ Check for poppies (NEW)
  ├─ Check for iron ingots (existing)
  ├─ Withdraw poppies first (NEW)
  ├─ Close chest
  ├─ Toss poppies on cactus (NEW)
  ├─ Withdraw iron & craft blocks (existing)
  └─ Deposit iron blocks back (existing)
  ↓
Cycle complete
```

## Components

### 1. Cactus Finding

**Location:** Start of `compressIronCycle()`, after crafting table lookup

**Logic:**
```javascript
const cactusBlockId = mcData.blocksByName.cactus.id
const cactus = bot.findBlock({
  matching: cactusBlockId,
  maxDistance: 4  // Throwing range
})

if (!cactus) {
  console.log('No cactus found within throwing range')
  // Continue with iron processing, skip poppy cleaning
}
```

**Behavior:**
- Search within 4 blocks (maximum throwing distance)
- If not found, log warning but don't block iron processing
- Only skip poppy withdrawal/tossing, iron processing continues normally

### 2. Poppy Detection & Withdrawal

**Location:** Inside chest processing loop, immediately after opening chest window

**Logic:**
```javascript
const poppyId = mcData.itemsByName.poppy.id
const poppies = allItems.filter(item => item.type === poppyId)

if (poppies.length > 0 && cactus) {
  const poppyCount = poppies.reduce((sum, item) => sum + item.count, 0)
  console.log(`Found ${poppyCount} poppies in chest`)

  // Withdraw all poppies
  for (const item of poppies) {
    await chestWindow.withdraw(item.type, null, item.count)
  }
}
```

**Behavior:**
- Detect poppies in chest contents
- Calculate total count for logging
- Withdraw ALL poppies (no inventory space constraint since we toss immediately)
- Only withdraw if cactus was found earlier

### 3. Item Tossing

**Location:** After closing chest, before iron processing

**Logic:**
```javascript
// Toss poppies on cactus
const heldPoppies = bot.inventory.items().filter(item => item.type === poppyId)
for (const item of heldPoppies) {
  try {
    await bot.tossStack(item)
    console.log(`Tossed ${item.count} poppies on cactus`)
  } catch (err) {
    console.log(`Failed to toss poppies: ${err.message}`)
    // Try to return to chest
    await returnItemsToChest(chestBlock, poppyId)
  }
}
```

**Behavior:**
- Use `bot.tossStack()` to throw entire stacks
- Bot will automatically throw toward nearby blocks/entities
- Cactus destroys items on contact
- If tossing fails, attempt to return poppies to chest

## Error Handling

### Missing Cactus
- **Scenario:** No cactus found within 4 blocks
- **Response:** Log warning, skip poppy cleaning, continue iron processing
- **Impact:** Poppies remain in chests but iron processing unaffected

### Inventory Full
- **Scenario:** Not applicable - poppies are withdrawn and immediately tossed
- **Response:** N/A - tossing happens before iron withdrawal, no conflict

### Tossing Failure
- **Scenario:** `bot.tossStack()` throws an error
- **Response:**
  - Log error message
  - Use existing `returnItemsToChest()` helper to put poppies back
  - Continue to next chest
- **Impact:** Poppies remain in that chest, other chests still processed

### Mixed Chest Contents
- **Scenario:** Chest contains poppies, iron, both, or neither
- **Response:**
  - Poppies only: Withdraw and toss, skip iron processing for that chest
  - Iron only: Skip poppy logic, process iron normally (existing behavior)
  - Both: Process poppies first, then iron
  - Neither: Skip chest entirely (existing behavior)

## Code Changes

### Modified Function: `compressIronCycle()`

**Changes:**
1. Add cactus finding after crafting table lookup (~5 lines)
2. Add poppy detection in chest loop (~10 lines)
3. Add poppy withdrawal logic (~8 lines)
4. Add tossing logic with error handling (~12 lines)

**Total:** ~35 lines of new code, no changes to existing iron processing logic

### No New Functions Required
- Reuse existing `returnItemsToChest()` helper for error recovery
- All logic fits naturally into existing chest processing loop

## Testing Considerations

### Manual Testing Scenarios
1. **Chest with poppies only:** Verify poppies are withdrawn and tossed
2. **Chest with iron only:** Verify iron processing unchanged
3. **Chest with both:** Verify poppies cleaned first, then iron processed
4. **No cactus present:** Verify warning logged, iron processing continues
5. **Tossing failure:** Verify poppies returned to chest
6. **Multiple chests:** Verify all chests processed independently

### Observable Behaviors
- Console logs showing poppy counts found
- Console logs showing successful tosses
- Poppies disappear from chests
- Iron processing continues normally
- No inventory clutter (poppies destroyed, iron blocks deposited)

## Deployment

### Prerequisites
- User must place a cactus within 4 blocks of bot's position
- Cactus should be accessible (not blocked by other blocks)
- No bot movement required - remains stationary

### Rollout
- Single file change: `main.js`
- No configuration needed
- Backward compatible: works with or without cactus present

## Success Criteria

1. Poppies are automatically removed from chests when detected
2. Poppies are successfully destroyed by cactus
3. Iron processing continues unaffected
4. No inventory clutter remains after cycle
5. Bot remains stationary throughout operation
