'use strict'

const assert = require('assert')
const microtime = require('./microtime')

module.exports = class Limiter {
  constructor ({ id, db, max = 2500, duration = 3600000, namespace = 'limit' }) {
    assert(db, 'db required')
    this.db = db
    this.id = id
    this.max = max
    this.duration = duration
    this.namespace = namespace

    this.db.defineCommand('ratelimiter', {
      numberOfKeys: 1,
      lua: `
        local key = KEYS[1]
        local now = tonumber(ARGV[1])
        local duration = tonumber(ARGV[2])
        local max = tonumber(ARGV[3])
        local start = now - duration * 1000

        -- Remove expired entries
        redis.call('zremrangebyscore', key, 0, start)

        -- Get current count
        local count = redis.call('zcard', key)

        -- Calculate remaining
        local remaining = max - count

        -- Add current request
        redis.call('zadd', key, now, now)

        -- Optimize: Only fetch oldest entry if we need it
        local oldest
        local oldest_result = redis.call('zrange', key, 0, 0)
        oldest = #oldest_result > 0 and tonumber(oldest_result[1]) or now

        -- Optimize: Only fetch oldestInRange if count is at or above max
        local oldestInRange = now
        if count >= max then
          local oldest_in_range_result = redis.call('zrange', key, -max, -max)
          oldestInRange = #oldest_in_range_result > 0 and tonumber(oldest_in_range_result[1]) or now
        end

        -- Calculate reset time
        local resetMicro = (oldestInRange ~= now and oldestInRange or oldest) + duration * 1000

        -- Optimize: Only trim if necessary
        if count >= max then
          redis.call('zremrangebyrank', key, 0, -(max + 1))
        end

        -- Set expiration
        redis.call('pexpire', key, duration)

        -- Ensure remaining is never negative
        if remaining < 0 then remaining = 0 end

        return {remaining, resetMicro / 1000000, max}
      `
    })
  }

  async get ({ id = this.id, max = this.max, duration = this.duration } = {}) {
    assert(id, 'id required')
    assert(max, 'max required')
    assert(duration, 'duration required')

    const result = await this.db.ratelimiter(
      `${this.namespace}:${id}`,
      microtime.now(),
      duration,
      max
    )

    return {
      remaining: result[0],
      reset: Math.floor(result[1]),
      total: result[2]
    }
  }
}
