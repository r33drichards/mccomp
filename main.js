/*
 *
 * A bot that checks nearby chests for iron ingots, compresses them into iron blocks
 * using a crafting table, and returns the blocks to the chest (stationary)
 *
 */
const mineflayer = require('mineflayer')
const autoEat = require('mineflayer-auto-eat')


const bot = mineflayer.createBot({
  host: 'centerbeam.proxy.rlwy.net',
  port: 40387,
  username: 'crafter',
  password: 'qwerty123'
})


bot.once('spawn', () => {

  bot.loadPlugin(autoEat.loader)
  bot.autoEat.enableAuto()

  // Wait for chunks to load before starting
  setTimeout(() => {
    console.log('Bot ready, starting iron compression cycle...')
    compressIronCycle()
    setInterval(() => {
      compressIronCycle()
    }, 30000) // Check every 30 seconds
  }, 3000) // Wait 3 seconds for chunks to load
})

async function compressIronCycle() {
  try {
    console.log('Starting iron compression cycle...')

    const mcData = require('minecraft-data')(bot.version)
    const chestBlockId = mcData.blocksByName.chest.id
    const trappedChestBlockId = mcData.blocksByName.trapped_chest.id
    const ironIngotId = mcData.itemsByName.iron_ingot.id
    const ironBlockId = mcData.itemsByName.iron_block.id

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

    // Find all chests within interaction range (4 blocks max)
    const chests = bot.findBlocks({
      matching: [chestBlockId, trappedChestBlockId],
      maxDistance: 4,
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

        // Get items FROM THE CHEST
        const allItems = chestWindow.containerItems()
        const ironIngots = allItems.filter(item => item.type === ironIngotId)

        if (ironIngots.length === 0) {
          console.log('No iron ingots in this chest')
          chestWindow.close()
          continue
        }

        const ingotsInChest = ironIngots.reduce((sum, item) => sum + item.count, 0)
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
          await returnItemsToChest(chestBlock, ironIngotId)
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

        // Try to deposit any items we're holding back to this chest
        try {
          await returnItemsToChest(chestBlock, ironIngotId)
          await returnItemsToChest(chestBlock, ironBlockId)
        } catch (depositErr) {
          console.log(`Could not return items: ${depositErr.message}`)
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
  try {
    const chestWindow = await bot.openChest(chest)

    const items = bot.inventory.items().filter(item => item.type === itemId)
    for (const item of items) {
      await chestWindow.deposit(item.type, null, item.count)
    }

    chestWindow.close()
  } catch (err) {
    console.log('Error returning items to chest:', err.message)
  }
}
