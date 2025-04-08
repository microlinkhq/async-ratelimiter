'use strict'

const time = Date.now()
const start = process.hrtime.bigint()

// Return high-precision timestamp in milliseconds
module.exports.now = () => time + Number(process.hrtime.bigint() - start) / 1e6
