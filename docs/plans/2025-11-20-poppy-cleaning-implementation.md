# Poppy Cleaning Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add automatic poppy removal from chests by tossing them onto a nearby cactus for destruction.

**Architecture:** Integrate poppy detection and removal into the existing chest processing loop in `compressIronCycle()`. Find cactus block at cycle start, detect poppies when opening each chest, withdraw and toss them before processing iron ingots.

**Tech Stack:** Node.js, Mineflayer bot framework, minecraft-data

---

## Task 1: Add Cactus Finding Logic

**Files:**
- Modify: `/Users/robertwendt/mc-comp/main.js:66-76`

**Step 1: Add cactus block lookup after crafting table**

In `compressIronCycle()`, after the crafting table lookup (line 76), add:

```javascript
    // Find cactus for poppy disposal
    const cactusBlockId = mcData.blocksByName.cactus.id
    const cactus = bot.findBlock({
      matching: cactusBlockId,
      maxDistance: 4
    })

    if (!cactus) {
      console.log('No cactus found within throwing range - poppy cleaning disabled')
    } else {
      console.log('Cactus found for poppy disposal')
    }
```

**Location:** Insert between lines 76-77 (after crafting table check, before chest finding)

**Step 2: Verify the changes**

Run: `node main.js` (in test environment or check console output)
Expected: Should see either "Cactus found" or "No cactus found" message in logs

**Step 3: Commit**

```bash
git add main.js
git commit -m "feat: add cactus finding for poppy disposal

Locate cactus block within throwing range (4 blocks) at the start
of each compression cycle. Log whether cactus is available.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 2: Add Poppy Detection in Chest Loop

**Files:**
- Modify: `/Users/robertwendt/mc-comp/main.js:125-135`

**Step 1: Get poppy item ID at the start of the function**

In `compressIronCycle()`, add poppy ID with the other item IDs (around line 63):

```javascript
    const ironIngotId = mcData.itemsByName.iron_ingot.id
    const ironBlockId = mcData.itemsByName.iron_block.id
    const poppyId = mcData.itemsByName.poppy.id
```

**Step 2: Add poppy detection after chest opening**

Inside the chest processing loop, after line 128 (`const allItems = chestWindow.containerItems()`), add:

```javascript
        // Check for poppies to clean
        const poppies = allItems.filter(item => item.type === poppyId)
        const poppyCount = poppies.reduce((sum, item) => sum + item.count, 0)

        if (poppyCount > 0) {
          console.log(`Found ${poppyCount} poppy/poppies in chest`)
        }
```

**Step 3: Verify the changes**

Run: `node main.js`
Expected: Should see poppy count logged when chests contain poppies

**Step 4: Commit**

```bash
git add main.js
git commit -m "feat: detect poppies in chests

Add poppy detection logic to identify and count poppies in each
chest during the processing loop.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 3: Add Poppy Withdrawal Logic

**Files:**
- Modify: `/Users/robertwendt/mc-comp/main.js:128-135`

**Step 1: Add poppy withdrawal after detection**

Modify the poppy detection block to include withdrawal:

```javascript
        // Check for poppies to clean
        const poppies = allItems.filter(item => item.type === poppyId)
        const poppyCount = poppies.reduce((sum, item) => sum + item.count, 0)

        if (poppyCount > 0 && cactus) {
          console.log(`Found ${poppyCount} poppy/poppies in chest - withdrawing`)

          // Withdraw all poppies
          for (const item of poppies) {
            await chestWindow.withdraw(item.type, null, item.count)
          }
        } else if (poppyCount > 0 && !cactus) {
          console.log(`Found ${poppyCount} poppy/poppies but no cactus available - skipping`)
        }
```

**Step 2: Verify the changes**

Run: `node main.js`
Expected: Poppies should be withdrawn from chests (check bot inventory)

**Step 3: Commit**

```bash
git add main.js
git commit -m "feat: withdraw poppies from chests

Add logic to withdraw all poppies from chests when a cactus is
available. Skip withdrawal if no cactus found.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 4: Add Poppy Tossing Logic

**Files:**
- Modify: `/Users/robertwendt/mc-comp/main.js:160-162`

**Step 1: Add tossing logic after chest close**

After closing the chest window (around line 160), add poppy tossing before iron processing:

```javascript
        chestWindow.close()
        console.log(`Withdrew ${withdrawn} iron ingots`)

        // Toss poppies on cactus if we withdrew any
        const heldPoppies = bot.inventory.items().filter(item => item.type === poppyId)
        if (heldPoppies.length > 0 && cactus) {
          console.log('Tossing poppies on cactus...')
          for (const item of heldPoppies) {
            try {
              await bot.tossStack(item)
              console.log(`Tossed ${item.count} poppy/poppies`)
            } catch (err) {
              console.log(`Failed to toss poppies: ${err.message}`)
              // Try to return poppies to chest
              try {
                await returnItemsToChest(chestBlock, poppyId)
                console.log('Returned poppies to chest')
              } catch (returnErr) {
                console.log(`Could not return poppies: ${returnErr.message}`)
              }
            }
          }
        }

        // Continue with iron processing...
```

**Note:** This goes AFTER withdrawing iron but BEFORE crafting, so poppies are disposed of and don't interfere with iron processing.

**Step 2: Verify the changes**

Run: `node main.js`
Expected:
- Poppies should be withdrawn, tossed, and destroyed by cactus
- Bot inventory should be clear of poppies
- Iron processing should continue normally

**Step 3: Commit**

```bash
git add main.js
git commit -m "feat: toss poppies on cactus for disposal

Add logic to toss withdrawn poppies onto the cactus for automatic
destruction. Include error handling to return poppies to chest if
tossing fails.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 5: Handle Edge Case - Chests with Only Poppies

**Files:**
- Modify: `/Users/robertwendt/mc-comp/main.js:129-135`

**Step 1: Update the iron ingot check**

Modify the existing check for iron ingots (around line 131) to allow processing chests with only poppies:

```javascript
        const ironIngots = allItems.filter(item => item.type === ironIngotId)
        const ingotsInChest = ironIngots.reduce((sum, item) => sum + item.count, 0)

        // Process poppies first (already in place from Task 3)

        // Then check if there are iron ingots to process
        if (ingotsInChest === 0 && poppyCount === 0) {
          console.log('Chest is empty - skipping')
          chestWindow.close()
          continue
        }

        if (ingotsInChest === 0) {
          console.log('No iron ingots in this chest (poppies already handled)')
          chestWindow.close()
          continue
        }

        console.log(`Found ${ingotsInChest} iron ingots`)
```

**Reasoning:** We need to handle three cases:
1. Chest has both poppies and iron → Process both
2. Chest has only poppies → Process poppies, skip iron logic
3. Chest has only iron → Skip poppy logic, process iron (existing behavior)

**Step 2: Verify the changes**

Run: `node main.js`
Expected:
- Chests with only poppies should have poppies removed
- Chests with only iron should work as before
- Chests with both should have both processed

**Step 3: Commit**

```bash
git add main.js
git commit -m "fix: handle chests with only poppies

Update chest processing logic to correctly handle chests that
contain only poppies (no iron ingots). Poppies are cleaned and
the bot moves to the next chest.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 6: Integration Testing & Refinement

**Files:**
- Modify: `/Users/robertwendt/mc-comp/main.js` (as needed)

**Step 1: Manual testing checklist**

Test the following scenarios in Minecraft:

1. **Chest with only poppies:**
   - Place poppies in a chest
   - Verify poppies are withdrawn and tossed
   - Verify poppies are destroyed by cactus
   - Verify bot moves to next chest

2. **Chest with only iron:**
   - Verify iron processing works as before
   - Verify no poppy-related errors

3. **Chest with both poppies and iron:**
   - Verify poppies are cleaned first
   - Verify iron is then processed normally
   - Verify both operations complete successfully

4. **No cactus present:**
   - Remove cactus from bot's range
   - Verify warning message appears
   - Verify iron processing continues
   - Verify poppies are NOT withdrawn

5. **Multiple chests:**
   - Set up 3-4 chests with different contents
   - Verify all are processed in sequence
   - Verify no items left in bot inventory after cycle

**Step 2: Check console output**

Expected console output pattern:
```
Starting iron compression cycle...
Cactus found for poppy disposal
Found X chest(s)

Checking chest at [position]
Found Y poppies in chest - withdrawing
Found Z iron ingots
Withdrew Z iron ingots
Tossing poppies on cactus...
Tossed Y poppies
Crafting N iron blocks
Opening chest for deposit...
Deposited N iron blocks back to chest

Iron compression cycle complete
```

**Step 3: Fix any issues**

If errors occur:
- Check bot.tossStack() works correctly
- Verify cactus is within 4 blocks
- Verify item IDs are correct
- Add additional error logging if needed

**Step 4: Final commit (if changes made)**

```bash
git add main.js
git commit -m "fix: refine poppy cleaning based on testing

Address edge cases and improve error handling based on
integration testing results.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Verification Checklist

Before considering this feature complete, verify:

- [ ] Cactus is found and logged at cycle start
- [ ] Poppies are detected in chests
- [ ] Poppies are withdrawn from chests
- [ ] Poppies are tossed and destroyed by cactus
- [ ] Iron processing continues to work normally
- [ ] Mixed chests (poppies + iron) are handled correctly
- [ ] Poppy-only chests are handled correctly
- [ ] Missing cactus is handled gracefully
- [ ] No items left in bot inventory after cycle
- [ ] Console logging is clear and informative

---

## Notes for Engineer

### Mineflayer API Reference

**Finding blocks:**
```javascript
bot.findBlock({
  matching: blockId,  // Block type ID from minecraft-data
  maxDistance: 4      // Search radius in blocks
})
```

**Opening chests:**
```javascript
const window = await bot.openChest(block)
const items = window.containerItems()  // Get chest contents
await window.withdraw(itemType, metadata, count)
await window.deposit(itemType, metadata, count)
window.close()
```

**Tossing items:**
```javascript
await bot.tossStack(item)  // Throws entire stack
```

**Inventory access:**
```javascript
bot.inventory.items()  // Get all items in bot's inventory
bot.inventory.items().filter(item => item.type === itemId)
```

### Debugging Tips

- Add `console.log()` liberally to track execution flow
- Check `bot.inventory.items()` to see what bot is holding
- Watch Minecraft client to see items being tossed/destroyed
- Cactus destroys items on contact - no special logic needed
- `bot.tossStack()` automatically aims toward nearby blocks

### Common Issues

**"No cactus found" always appearing:**
- Verify cactus is placed within 4 blocks of bot
- Check bot's position with `bot.entity.position`
- Try increasing maxDistance temporarily for debugging

**Items not being destroyed:**
- Verify cactus is accessible (not blocked by glass/barriers)
- Items must physically contact the cactus block
- Bot throws toward "nearest" target - may need cactus positioning

**Chest opening errors:**
- Ensure chests are within 4 blocks
- Verify bot isn't moving (should be stationary)
- Check chest isn't already open
