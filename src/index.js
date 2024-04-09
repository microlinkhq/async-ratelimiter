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
  }

  async get ({ id = this.id, max = this.max, duration = this.duration } = {}) {
    assert(id, 'id required')
    assert(max, 'max required')
    assert(duration, 'duration required')

    const result = await this.db.eval(
      `
      local key = KEYS[1]
      local now = tonumber(ARGV[1])
      local duration = tonumber(ARGV[2])
      local max = tonumber(ARGV[3])
      local start = now - duration * 1000

      redis.call('zremrangebyscore', key, 0, start)
      local count = redis.call('zcard', key)

      redis.call('zadd', key, now, now)
      local oldest = tonumber(redis.call('zrange', key, 0, 0)[1] or now)
      local oldestInRange = tonumber(redis.call('zrange', key, -max, -max)[1] or now)
      local resetMicro = (oldestInRange ~= now and oldestInRange or oldest) + duration * 1000

      redis.call('zremrangebyrank', key, 0, -(max + 1))
      redis.call('pexpire', key, duration)

      return {max - count, resetMicro / 1000000, max}
      `,
      1,
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
