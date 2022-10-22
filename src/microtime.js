'use strict'

const time = Date.now() * 1e3
const start = process.hrtime.bigint()

module.exports.now = () => time + Number(process.hrtime.bigint() - start) * 1e-3
