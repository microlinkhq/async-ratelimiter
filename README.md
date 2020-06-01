<div align="center">
  <img src="https://cdn.microlink.io/logo/banner.png" alt="microlink">
</div>

![Last version](https://img.shields.io/github/tag/microlinkhq/async-ratelimiter.svg?style=flat-square)
[![Build Status](https://img.shields.io/travis/com/microlinkhq/async-ratelimiter/master.svg?style=flat-square)](https://travis-ci.com/microlinkhq/async-ratelimiter)
[![Coverage Status](https://img.shields.io/coveralls/microlinkhq/async-ratelimiter.svg?style=flat-square)](https://coveralls.io/github/microlinkhq/async-ratelimiter)
[![Dependency status](https://img.shields.io/david/microlinkhq/async-ratelimiter.svg?style=flat-square)](https://david-dm.org/microlinkhq/async-ratelimiter)
[![Dev Dependencies Status](https://img.shields.io/david/dev/microlinkhq/async-ratelimiter.svg?style=flat-square)](https://david-dm.org/microlinkhq/async-ratelimiter#info=devDependencies)
[![NPM Status](https://img.shields.io/npm/dm/async-ratelimiter.svg?style=flat-square)](https://www.npmjs.org/package/async-ratelimiter)

> Rate limit made simple, easy, async. Based on [ratelimiter](https://github.com/tj/node-ratelimiter).

## Install

```bash
$ npm install async-ratelimiter --save
```

## Usage

A simple middleware implementation for whatever HTTP server:

```js
'use strict'

const RateLimiter = require('async-ratelimiter')
const { getClientIp } = require('request-ip')
const Redis = require('ioredis')

const rateLimiter = new RateLimiter({
  db: new Redis()
})

const apiQuota = async (req, res, next) => {
  const clientIp = getClientIp(req)
  const limit = await rateLimiter.get({ id: req.clientIp })

  if (!res.finished && !res.headersSent) {
    res.setHeader('X-Rate-Limit-Limit', limit.total)
    res.setHeader('X-Rate-Limit-Remaining', Math.max(0, limit.remaining - 1))
    res.setHeader('X-Rate-Limit-Reset', limit.reset)
  }

  return !limit.remaining
    ? sendFail({
      req,
      res,
      code: HTTPStatus.TOO_MANY_REQUESTS,
      message: MESSAGES.RATE_LIMIT_EXCEDEED()
    })
    : next(req, res)
}
```

## API

### constructor(options)

It creates an rate limiter instance.

#### options

##### db

*Required*<br>
Type: `object`

The redis connection instance.

##### max

Type: `number`<br>
Default: `2500`

The maximum number of requests within `duration`.

##### duration

Type: `number`<br>
Default: `3600000`

How long keep records of requests in milliseconds.

##### namespace

Type: `string`<br>
Default: `'limit'`

The prefix used for compound the key.

##### id

Type: `string`

The identifier to limit against (typically a user id).

You can pass this value using when you use `.get` method as well.

### .get(options)

Given an `id`, returns a Promise with the status of the limit with the following structure:
  - `total`: `max` value.
  - `remaining`: number of calls left in current `duration` without decreasing current `get`.
  - `reset`: time since epoch in seconds that the rate limiting period will end (or already ended).

#### options

##### id

Type: `string`
Default: `this.id`

The identifier to limit against (typically a user id).

##### max

Type: `number`</br>
Default: `this.max`

The maximum number of requests within `duration`. If provided, it overrides the default `max` value. This is useful for custom limits that differ between IDs.

##### duration

Type: `number`</br>
Default: `this.max`

How long keep records of requests in milliseconds. If provided, it overrides the default `duration` value.

##### decrease

Type: `boolean`</br>
Default: `true`

When set to `false`, the remaining number of calls is not decreased.

In some scenarios it might be useful to be able to read the current "remaining" value for a limiter.

```js
const loginHandler = async (req, res, next) => {
  const clientIp = getClientIp(req)
  const limit = await rateLimiter.get({ id: clientIp, decrease: false })

  if (!limit.remaining) return sendError(req, res, 429)

  try {
    await doLogin(req)
  } catch (err) {
    if (err) {
      await rateLimiter.get({ id: req.clientIp })
      return sendError(req, res, 401)
    }
  }

  next(req, res)
}
```

In this example, new login attempts are rejected when more at least 10 unsuccessful login attempts happened in the last 60 seconds.

## Related

- [express-slow-down](https://github.com/nfriedly/express-slow-down) – Slow down repeated requests; use as an alternative (or addition) to express-rate-limit.

## License

**async-ratelimiter** © [microlink.io](https://microlink.io), released under the [MIT](https://github.com/microlinkhq/async-ratelimiter/blob/master/LICENSE.md) License.<br>
Authored and maintained by microlink.io with help from [contributors](https://github.com/microlinkhq/async-ratelimiter/contributors).

> [microlink.io](https://microlink.io) · GitHub [microlink.io](https://github.com/microlinkhq) · Twitter [@microlinkhq](https://twitter.com/microlinkhq)
