'use strict'

const RateLimiter = require('..')
const Redis = require('ioredis')
const { performance } = require('perf_hooks')

// Configuration
const CONFIG = {
  // Benchmark settings
  iterations: 10000,
  concurrency: 100,
  warmup: 1000,
  // Rate limiter settings
  maxRequests: 100,
  duration: 60, // seconds
  // Distribution settings
  ipCount: 200,
  hotIpPercentage: 20, // percentage of requests that hit "hot" IPs
  hotIpCount: 10,
  // Redis settings
  redisOptions: {
    host: 'localhost',
    port: 6379
  }
}

// Generate test IPs
function generateIps () {
  const ips = []
  // Regular IPs
  for (let i = 0; i < CONFIG.ipCount; i++) {
    ips.push(`192.168.1.${i % 255}`)
  }
  // Hot IPs (will be rate limited)
  const hotIps = []
  for (let i = 0; i < CONFIG.hotIpCount; i++) {
    hotIps.push(`10.0.0.${i % 255}`)
  }

  return { ips, hotIps }
}

// Select an IP based on our distribution
function selectIp (ips, hotIps) {
  // Determine if this request should use a hot IP
  const useHotIp = Math.random() * 100 < CONFIG.hotIpPercentage

  if (useHotIp) {
    return hotIps[Math.floor(Math.random() * hotIps.length)]
  } else {
    return ips[Math.floor(Math.random() * ips.length)]
  }
}

// Run the benchmark
async function runBenchmark () {
  console.log('=== Async RateLimiter Benchmark ===')
  console.log(`Iterations: ${CONFIG.iterations}`)
  console.log(`Concurrency: ${CONFIG.concurrency}`)
  console.log(`Rate limit: ${CONFIG.maxRequests} requests per ${CONFIG.duration} seconds`)
  console.log(
    `IP distribution: ${CONFIG.ipCount} IPs (${CONFIG.hotIpCount} hot IPs receiving ${CONFIG.hotIpPercentage}% of traffic)`
  )
  console.log(`Redis: ${CONFIG.redisOptions.host}:${CONFIG.redisOptions.port}`)
  console.log('-----------------------------------')

  try {
    // Connect to Redis using ioredis
    const redis = new Redis(CONFIG.redisOptions)

    // Create rate limiter
    const limiter = new RateLimiter({
      db: redis,
      max: CONFIG.maxRequests,
      duration: CONFIG.duration
    })

    // Generate IPs
    const { ips, hotIps } = generateIps()

    // Warmup
    console.log(`Warming up with ${CONFIG.warmup} requests...`)
    for (let i = 0; i < CONFIG.warmup; i++) {
      const ip = selectIp(ips, hotIps)
      await limiter.get({ id: ip })
    }

    // Reset Redis for accurate measurement
    console.log('Resetting Redis before benchmark...')
    await redis.flushdb()

    // Wait a moment for Redis to settle
    await new Promise(resolve => setTimeout(resolve, 1000))

    // Run benchmark
    console.log(`Running ${CONFIG.iterations} iterations...`)

    const results = {
      totalTime: 0,
      successCount: 0,
      limitedCount: 0,
      latencies: []
    }

    const start = performance.now()

    // Create batches for concurrency
    const batchSize = Math.min(CONFIG.concurrency, CONFIG.iterations)
    const batches = Math.ceil(CONFIG.iterations / batchSize)

    for (let b = 0; b < batches; b++) {
      const currentBatchSize = Math.min(batchSize, CONFIG.iterations - b * batchSize)
      const promises = []

      for (let i = 0; i < currentBatchSize; i++) {
        const ip = selectIp(ips, hotIps)

        promises.push(
          (async () => {
            const requestStart = performance.now()
            const limit = await limiter.get({ id: ip })
            const requestEnd = performance.now()

            results.latencies.push(requestEnd - requestStart)

            if (limit.remaining > 0) {
              results.successCount++
            } else {
              results.limitedCount++
            }
          })()
        )
      }

      await Promise.all(promises)

      // Show progress
      if (batches > 10 && b % Math.floor(batches / 10) === 0) {
        const progress = Math.floor((b / batches) * 100)
        console.log(`Progress: ${progress}%`)
      }
    }

    const end = performance.now()
    results.totalTime = end - start

    // Calculate statistics
    results.totalRequests = results.successCount + results.limitedCount
    results.limitedPercentage = (results.limitedCount / results.totalRequests) * 100
    results.averageLatency = results.latencies.reduce((a, b) => a + b, 0) / results.latencies.length

    // Sort latencies for percentiles
    results.latencies.sort((a, b) => a - b)
    results.p50Latency = results.latencies[Math.floor(results.latencies.length * 0.5)]
    results.p95Latency = results.latencies[Math.floor(results.latencies.length * 0.95)]
    results.p99Latency = results.latencies[Math.floor(results.latencies.length * 0.99)]

    results.requestsPerSecond = (results.totalRequests / results.totalTime) * 1000

    // Print results
    console.log('\n=== Benchmark Results ===')
    console.log(`Total requests: ${results.totalRequests}`)
    console.log(`Successful requests: ${results.successCount}`)
    console.log(
      `Rate limited requests: ${results.limitedCount} (${results.limitedPercentage.toFixed(2)}%)`
    )
    console.log(`Total time: ${results.totalTime.toFixed(2)}ms`)
    console.log(`Requests per second: ${results.requestsPerSecond.toFixed(2)}`)
    console.log('\nLatency:')
    console.log(`  Average: ${results.averageLatency.toFixed(2)}ms`)
    console.log(`  p50: ${results.p50Latency.toFixed(2)}ms`)
    console.log(`  p95: ${results.p95Latency.toFixed(2)}ms`)
    console.log(`  p99: ${results.p99Latency.toFixed(2)}ms`)

    // Clean up
    await redis.quit()
  } catch (error) {
    console.error('Benchmark error:', error)
    process.exit(1)
  }
}

// Run the benchmark
runBenchmark().catch(err => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
