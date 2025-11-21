/*
 *
 * A bot that checks nearby chests for iron ingots, compresses them into iron blocks
 * using a crafting table, and returns the blocks to the chest (stationary)
 *
 */
const mineflayer = require('mineflayer')
const autoEat = require('mineflayer-auto-eat')

const botOptions = {
  host: 'centerbeam.proxy.rlwy.net',
  port: 40387,
  username: 'crafter',
  password: 'qwerty123'
}

let bot
let compressionInterval

function createBot() {
  bot = mineflayer.createBot(botOptions)

  bot.on('spawn', () => {
    bot.loadPlugin(autoEat.loader)
    bot.autoEat.enableAuto()

    // Wait for chunks to load before starting
    setTimeout(() => {
      console.log('Bot ready, starting iron compression cycle...')
      compressIronCycle()
      compressionInterval = setInterval(() => {
        compressIronCycle()
      }, 30000) // Check every 30 seconds
    }, 3000) // Wait 3 seconds for chunks to load
  })

  bot.on('end', (reason) => {
    console.log(`Disconnected: ${reason}. Reconnecting in 5 seconds...`)
    if (compressionInterval) {
      clearInterval(compressionInterval)
      compressionInterval = null
    }
    setTimeout(createBot, 5000)
  })

  bot.on('error', (err) => {
    console.log(`Error: ${err.message}`)
  })
}

async function compressIronCycle() {
  console.log("Sleeping");
  const beds = bot.findBlocks({
    matching: bot.registry.blocksByName["white_bed"].id,
    maxDistance: 128,
  });
  beds.forEach(async (bed) => {
    try {

      // wait 1 second
      const bedBlock = bot.blockAt(bed);
      if (bedBlock) {
        await bot.sleep(bedBlock);
      } else {
        console.log("No bed block found");
      }
    } catch (e) {
      console.log("Failed to sleep in bed " + e);
    }
  });

  console.log("Sleeping done");
  try {
    
    console.log('Starting iron compression cycle...')

    const mcData = require('minecraft-data')(bot.version)
    const chestBlockId = mcData.blocksByName.chest.id
    const trappedChestBlockId = mcData.blocksByName.trapped_chest.id
    const ironIngotId = mcData.itemsByName.iron_ingot.id
    const ironBlockId = mcData.itemsByName.iron_block.id
    const poppyId = mcData.itemsByName.poppy.id

    // Find crafting table first - we need it to proceed
    const craftingTableBlockId = mcData.blocksByName.crafting_table.id
    const craftingTable = bot.findBlock({
      matching: craftingTableBlockId,
      maxDistance: 4
    })

    if (!craftingTable) {
      console.log('No crafting table found within reach')
      return
    }

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

    // Find all chests within interaction range (3 blocks for reliable opening)
    const chests = bot.findBlocks({
      matching: [chestBlockId, trappedChestBlockId],
      maxDistance: 3,
      count: 20
    })

    if (chests.length === 0) {
      console.log('No chests found within reach')
      return
    }

    console.log(`Found ${chests.length} chest(s)`)

    // First, deposit any iron blocks/ingots we're already holding
    const heldBlocks = bot.inventory.items().filter(item => item.type === ironBlockId)
    const heldIngots = bot.inventory.items().filter(item => item.type === ironIngotId)

    if (heldBlocks.length > 0 || heldIngots.length > 0) {
      console.log('Depositing items from previous run...')
      const firstChest = bot.blockAt(chests[0])
      if (firstChest) {
        try {
          const depositWindow = await bot.openChest(firstChest)
          for (const item of heldBlocks) {
            await depositWindow.deposit(item.type, null, item.count)
          }
          for (const item of heldIngots) {
            await depositWindow.deposit(item.type, null, item.count)
          }
          depositWindow.close()
          console.log('Deposited leftover items')
          await new Promise(resolve => setTimeout(resolve, 500))
        } catch (err) {
          console.log(`Could not deposit leftover items: ${err.message}`)
        }
      }
    }

    // Process each chest individually - withdraw, craft, deposit back
    for (const chestPos of chests) {
      const chestBlock = bot.blockAt(chestPos)
      if (!chestBlock) continue

      console.log(`\nChecking chest at ${chestPos}`)

      try {
        const chestWindow = await bot.openChest(chestBlock)
        await new Promise(resolve => setTimeout(resolve, 200))

        // Get items FROM THE CHEST
        const allItems = chestWindow.containerItems()

        // Check for poppies to clean
        const poppies = allItems.filter(item => item.type === poppyId)
        const poppyCount = poppies.reduce((sum, item) => sum + item.count, 0)

        if (poppyCount > 0 && cactus) {
          console.log(`Found ${poppyCount} poppy/poppies in chest - withdrawing`)

          // Withdraw all poppies
          for (const item of poppies) {
            await chestWindow.withdraw(item.type, null, item.count)
          }

          // Immediately toss poppies after withdrawing (before checking for iron)
          const heldPoppies = bot.inventory.items().filter(item => item.type === poppyId)
          if (heldPoppies.length > 0) {
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
        } else if (poppyCount > 0 && !cactus) {
          console.log(`Found ${poppyCount} poppy/poppies but no cactus available - skipping`)
        }

        const ironIngots = allItems.filter(item => item.type === ironIngotId)
        const ingotsInChest = ironIngots.reduce((sum, item) => sum + item.count, 0)

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

        // Calculate available inventory space (each slot holds 64 ingots)
        const emptySlots = bot.inventory.emptySlotCount()
        const maxWithdraw = Math.min(ingotsInChest, emptySlots * 64)

        if (maxWithdraw < 9) {
          console.log(`Not enough space or ingots to craft (need 9, can withdraw ${maxWithdraw})`)
          chestWindow.close()
          continue
        }

        // Withdraw iron ingots up to our capacity
        let withdrawn = 0
        for (const item of ironIngots) {
          const toWithdraw = Math.min(item.count, maxWithdraw - withdrawn)
          if (toWithdraw <= 0) break

          await chestWindow.withdraw(item.type, null, toWithdraw)
          withdrawn += toWithdraw
        }

        chestWindow.close()
        console.log(`Withdrew ${withdrawn} iron ingots`)

        // Craft iron blocks
        const ironBlockRecipe = bot.recipesFor(ironBlockId, null, 1, craftingTable)[0]

        if (!ironBlockRecipe) {
          console.log('Could not find iron block recipe')
          try {
            await returnItemsToChest(chestBlock, ironIngotId)
          } catch (returnErr) {
            console.log(`Could not return iron ingots: ${returnErr.message}`)
          }
          continue
        }

        const blocksToMake = Math.floor(withdrawn / 9)
        console.log(`Crafting ${blocksToMake} iron blocks`)

        await bot.craft(ironBlockRecipe, blocksToMake, craftingTable)

        // Small delay after crafting before opening chest
        await new Promise(resolve => setTimeout(resolve, 500))

        // Deposit iron blocks and leftover ingots back to same chest
        console.log('Opening chest for deposit...')
        const depositWindow = await bot.openChest(chestBlock)

        const ironBlocks = bot.inventory.items().filter(item => item.type === ironBlockId)
        for (const item of ironBlocks) {
          try {
            await depositWindow.deposit(item.type, null, item.count)
          } catch (err) {
            console.log(`Could not deposit iron blocks: ${err.message}`)
          }
        }

        const leftoverIngots = bot.inventory.items().filter(item => item.type === ironIngotId)
        for (const item of leftoverIngots) {
          try {
            await depositWindow.deposit(item.type, null, item.count)
          } catch (err) {
            console.log(`Could not deposit leftover ingots: ${err.message}`)
          }
        }

        depositWindow.close()
        console.log(`Deposited ${blocksToMake} iron blocks back to chest`)

      } catch (err) {
        console.log(`Error processing chest at ${chestPos}: ${err.message}`)

        // Only try to return items if error wasn't a timeout (chest might be unreachable)
        if (!err.message.includes('timeout') && !err.message.includes('windowOpen')) {
          try {
            await returnItemsToChest(chestBlock, ironIngotId)
            await returnItemsToChest(chestBlock, ironBlockId)
          } catch (depositErr) {
            console.log(`Could not return items: ${depositErr.message}`)
          }
        }
        continue
      }
    }

    console.log('\nIron compression cycle complete')

  } catch (err) {
    console.log('Error in iron compression cycle:', err.message)
  }
}

async function returnItemsToChest(chest, itemId) {
  // Check if we have any items to return first
  const items = bot.inventory.items().filter(item => item.type === itemId)
  if (items.length === 0) {
    return // No items to return, skip chest opening
  }

  const chestWindow = await bot.openChest(chest)
  await new Promise(resolve => setTimeout(resolve, 200))

  for (const item of items) {
    await chestWindow.deposit(item.type, null, item.count)
  }

  chestWindow.close()
}

createBot()
