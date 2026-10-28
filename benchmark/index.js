'use strict'

const { writeFileSync } = require('fs')
const { join } = require('path')
const { setFlagsFromString } = require('v8')
const { runInNewContext } = require('vm')
const Redis = require('ioredis')

const RateLimiter = require('..')

const RUNS = 7
const CONCURRENCY = 100
const FRESH_IDS = 10000
const FILL_MAX = 10000
const LIMITED_MAX = 100
const LIMITED_CALLS = 10000
const PEEK_CALLS = 10000
const DURATION_MS = 60000

const median = values => {
  const sorted = values.slice().sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

setFlagsFromString('--expose-gc')
const collectGarbage = runInNewContext('gc')

const now = () => process.hrtime.bigint()

const elapsed = started => Number(now() - started) / 1e6

const inBatches = async (count, call) => {
  const results = []
  for (let offset = 0; offset < count; offset += CONCURRENCY) {
    const batch = []
    for (let index = offset; index < Math.min(offset + CONCURRENCY, count); index++) {
      batch.push(call(index))
    }
    results.push(...(await Promise.all(batch)))
  }
  return results
}

const exhaust = (limiter, id, max) => inBatches(max, () => limiter.get({ id, max }))

const freshIdsCase = {
  name: 'first hit per id',
  extra: `${FRESH_IDS} ids hit once, ${CONCURRENCY} in flight`,
  timed: async ({ limiter, nextId }) => {
    const prefix = nextId()
    const limits = await inBatches(FRESH_IDS, index => limiter.get({ id: `${prefix}:${index}` }))
    return limits.filter(limit => limit.remaining === limiter.max && limit.total === limiter.max)
      .length
  },
  verify: fresh => fresh === FRESH_IDS
}

const fillCase = {
  name: `fill one id to ${FILL_MAX}`,
  extra: `${FILL_MAX} hits on one id with max ${FILL_MAX}, ${CONCURRENCY} in flight`,
  timed: async ({ limiter, nextId }) => {
    const id = nextId()
    await exhaust(limiter, id, FILL_MAX)
    return limiter.get({ id, max: FILL_MAX, peek: true })
  },
  verify: limit => limit.remaining === 0 && limit.total === FILL_MAX
}

const limitedCase = {
  name: 'hits over the limit',
  extra: `${LIMITED_CALLS} hits on one exhausted id with max ${LIMITED_MAX}, ${CONCURRENCY} in flight`,
  timed: async ({ limiter, nextId }) => {
    const id = nextId()
    await exhaust(limiter, id, LIMITED_MAX)
    const limits = await inBatches(LIMITED_CALLS, () => limiter.get({ id, max: LIMITED_MAX }))
    return limits.filter(limit => limit.remaining === 0 && limit.total === LIMITED_MAX).length
  },
  verify: limited => limited === LIMITED_CALLS
}

const peekCase = {
  name: 'peek a half full id',
  extra: `${PEEK_CALLS} peeks on one id holding ${
    LIMITED_MAX / 2
  } of ${LIMITED_MAX}, ${CONCURRENCY} in flight`,
  timed: async ({ limiter, nextId }) => {
    const id = nextId()
    await exhaust(limiter, id, LIMITED_MAX / 2)
    const limits = await inBatches(PEEK_CALLS, () =>
      limiter.get({ id, max: LIMITED_MAX, peek: true })
    )
    return limits.filter(
      limit => limit.remaining === LIMITED_MAX / 2 && limit.total === LIMITED_MAX
    ).length
  },
  verify: peeked => peeked === PEEK_CALLS
}

const CASES = [freshIdsCase, fillCase, limitedCase, peekCase]

const fmt = value => value.toFixed(1)

const report = slot => {
  const med = slot.walls.length ? median(slot.walls) : Number.NaN
  const min = slot.walls.length ? Math.min(...slot.walls) : Number.NaN
  const max = slot.walls.length ? Math.max(...slot.walls) : Number.NaN
  const extra = `${slot.entry.extra}, errors ${slot.errors}, runs ${RUNS}`
  console.log(`${slot.entry.name}  median ${fmt(med)}ms  range ${fmt(min)}-${fmt(max)}  ${extra}`)
  return {
    name: slot.entry.name,
    unit: 'ms',
    value: Number(med.toFixed(1)),
    range: `${fmt(min)}-${fmt(max)}`,
    extra
  }
}

const takeSample = async (slot, context, run) => {
  try {
    collectGarbage()
    const started = now()
    const outcome = await slot.entry.timed(context)
    const wall = elapsed(started)
    if (!slot.entry.verify(outcome)) {
      console.error(`${slot.entry.name} run ${run} produced unexpected output`)
      slot.errors++
      return
    }
    slot.walls.push(wall)
  } catch (error) {
    console.error(error)
    slot.errors++
  }
}

const createContext = () => {
  const db = new Redis({ maxRetriesPerRequest: 1 })
  const limiter = new RateLimiter({
    db,
    duration: DURATION_MS,
    namespace: `benchmark:${process.pid}`
  })
  let ids = 0
  return { db, limiter, nextId: () => `${Date.now()}:${ids++}` }
}

const main = async () => {
  const context = createContext()
  try {
    const slots = []
    for (const entry of CASES) {
      await entry.timed(context)
      slots.push({ entry, walls: [], errors: 0 })
    }
    for (let run = 0; run < RUNS; run++) {
      for (const slot of slots) await takeSample(slot, context, run)
    }
    const results = slots.map(report)
    writeFileSync(
      join(__dirname, '..', 'benchmark-output.json'),
      JSON.stringify(results, null, 2) + '\n'
    )
    const errors = slots.reduce((total, slot) => total + slot.errors, 0)
    if (errors > 0 || results.some(result => !Number.isFinite(result.value))) {
      process.exitCode = 1
    }
  } finally {
    context.db.disconnect()
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
