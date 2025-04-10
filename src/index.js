'use strict'

const assert = require('assert')
const microtime = require('./microtime')

const ratelimiter = {
  numberOfKeys: 1,
  lua: `
    local key = KEYS[1]
    local now = tonumber(ARGV[1])
    local duration = tonumber(ARGV[2])
    local max = tonumber(ARGV[3])
    local start = now - duration

    -- Check if the key exists
    local exists = redis.call('EXISTS', key)

    local count = 0
    local oldest = now

    if exists == 1 then
      -- Remove expired entries based on the current duration
      redis.call('ZREMRANGEBYSCORE', key, 0, start)

      -- Get count
      count = redis.call('ZCARD', key)

      -- Get oldest timestamp if we have entries
      if count > 0 then
        local oldest_result = redis.call('ZRANGE', key, 0, 0)
        oldest = tonumber(oldest_result[1])
      end
    end

    -- Calculate remaining (before adding current request)
    local remaining = max - count

    -- Early return if already at limit
    if remaining <= 0 then
      local resetMicro = oldest + duration
      return {0, math.floor(resetMicro / 1000), max}
    end

    -- Add current request with current timestamp
    redis.call('ZADD', key, now, now)

    -- Calculate reset time and handle trimming if needed
    local resetMicro

    -- Only perform trim if we're at or over max (based on count before adding)
    if count >= max then
      -- Get the entry at position -max for reset time calculation
      local oldest_in_range_result = redis.call('ZRANGE', key, -max, -max)
      local oldestInRange = oldest

      if #oldest_in_range_result > 0 then
        oldestInRange = tonumber(oldest_in_range_result[1])
      end

      -- Trim the set
      redis.call('ZREMRANGEBYRANK', key, 0, -(max + 1))

      -- Calculate reset time based on the entry at position -max
      resetMicro = oldestInRange + duration
    else
      -- We're under the limit, use the oldest entry for reset time
      resetMicro = oldest + duration
    end

    -- Set expiration using the provided duration
    redis.call('PEXPIRE', key, duration)

    return {remaining, math.floor(resetMicro / 1000), max}
  `
}

module.exports = class Limiter {
  constructor ({ id, db, max = 2500, duration = 3600000, namespace = 'limit' }) {
    assert(db, 'db required')
    this.db = db
    this.id = id
    this.max = max
    this.duration = duration
    this.namespace = namespace
    if (!this.db.ratelimiter) {
      this.db.defineCommand('ratelimiter', ratelimiter)
    }
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

module.exports.defineCommand = { ratelimiter }
