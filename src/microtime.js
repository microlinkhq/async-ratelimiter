'use strict'

const time = Date.now() * 1e3
const start = process.hrtime()

module.exports.now = function () {
  const diff = process.hrtime(start)
  return time + diff[0] * 1e6 + Math.round(diff[1] * 1e-3)
}
