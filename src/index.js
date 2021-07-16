'use strict'

const assert = require('assert')

const microtime = require('./microtime')

const toNumber = str => parseInt(str, 10)

module.exports = class Limiter {
  constructor ({ id, db, max = 2500, duration = 3600000, namespace = 'limit' }) {
    assert(db, 'db required')
    this.db = db
    this.id = id
    this.max = max
    this.duration = duration
    this.namespace = namespace
  }

  async get ({
    id = this.id,
    max = this.max,
    duration = this.duration
  } = {}) {
    assert(id, 'id required')
    assert(max, 'max required')
    assert(duration, 'duration required')

    const key = `${this.namespace}:${id}`
    const now = microtime.now()
    const start = now - duration * 1000

    const operations = [
      ['zremrangebyscore', key, 0, start],
      ['zcard', key],
      ['zadd', key, now, now],
      ['zrange', key, 0, 0],
      ['zrange', key, -max, -max],
      ['zremrangebyrank', key, 0, -(max + 1)],
      ['pexpire', key, duration]
    ]

    const res = await this.db.multi(operations).exec()
    const isIoRedis = Array.isArray(res[0])
    const count = toNumber(isIoRedis ? res[1][1] : res[1])
    const oldest = toNumber(isIoRedis ? res[3][1] : res[3])
    const oldestInRange = toNumber(isIoRedis ? res[4][1] : res[4])
    const resetMicro = (Number.isNaN(oldestInRange) ? oldest : oldestInRange) + duration * 1000

    return {
      remaining: count < max ? max - count : 0,
      reset: Math.floor(resetMicro / 1000000),
      resetMs: Math.floor(resetMicro / 1000),
      total: max
    }
  }
}

/**
 * Check whether the first item of multi replies is null,
 * works with ioredis and node_redis
 *
 * @param {Array} replies
 * @return {Boolean}
 * @api private
 */
/* eslint-disable-next-line */
function isFirstReplyNull(replies) {
  if (!replies) {
    return true
  }

  return Array.isArray(replies[0])
    // ioredis
    ? !replies[0][1]
    // node_redis
    : !replies[0]
}
