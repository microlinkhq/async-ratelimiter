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

    const { db } = this
    const key = `${this.namespace}:${id}`
    const now = microtime.now()
    const start = now - duration * 1000

    const res = await db
      .multi()
      .zrange([key, 0, start, 'WITHSCORES'])
      .zcard([key])
      .zadd([key, now, now])
      .zrange([key, 0, 0])
      .pexpire([key, duration])
      .exec()

    const count = parseInt(Array.isArray(res[0]) ? res[1][1] : res[1])
    const oldest = parseInt(Array.isArray(res[0]) ? res[3][1] : res[3])

    return {
      remaining: count < max ? max - count : 0,
      reset: Math.floor((oldest + duration * 1000) / 1000000),
      total: max
    }
  }
}
