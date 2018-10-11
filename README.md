# async-ratelimiter

![Last version](https://img.shields.io/github/tag/microlinkhq/async-ratelimiter.svg?style=flat-square)
[![Build Status](https://img.shields.io/travis/microlinkhq/async-ratelimiter/master.svg?style=flat-square)](https://travis-ci.org/microlinkhq/async-ratelimiter)
[![Coverage Status](https://img.shields.io/coveralls/microlinkhq/async-ratelimiter.svg?style=flat-square)](https://coveralls.io/github/microlinkhq/async-ratelimiter)
[![Dependency status](https://img.shields.io/david/microlinkhq/async-ratelimiter.svg?style=flat-square)](https://david-dm.org/microlinkhq/async-ratelimiter)
[![Dev Dependencies Status](https://img.shields.io/david/dev/microlinkhq/async-ratelimiter.svg?style=flat-square)](https://david-dm.org/microlinkhq/async-ratelimiter#info=devDependencies)
[![NPM Status](https://img.shields.io/npm/dm/async-ratelimiter.svg?style=flat-square)](https://www.npmjs.org/package/async-ratelimiter)

> Rate limit made simple, easy, async. Based on [ratelimiter](https://github.com/tj/node-ratelimiter).

> **NOTE**: It requires Redis 2.6.12+.

## Install

```bash
$ npm install async-ratelimiter --save
```

## Usage

A simple middleware implementation for whatever HTTP server:

```js
'use strict'

const RateLimiter = require('async-ratelimiter')
const Redis = require('ioredis')

const limit = new RateLimiter({
  db: new Redis()
})

const apiQuota = async (req, res, handler) => {
  const limit = await rateLimiter.get({ id: req.clientIp })

  if (!res.finished && !res.headersSent) {
    res.setHeader('X-Rate-Limit-Limit', limit.total)
    res.setHeader('X-Rate-Limit-Remaining', Math.max(0, limit.remaining - 1))
    res.setHeader('X-Rate-Limit-Reset', limit.reset)
  }

  return !limit.remaining
    ? sendFail({ req,
      res,
      code: HTTPStatus.TOO_MANY_REQUESTS,
      message: MESSAGES.RATE_LIMIT_EXCEDEED()
    })
    : handler(req, res)
}
```

## API

### constructor(options)

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

The identifier to limit against (typically a user id).

##### max

Type: `number`

The maximum number of requests within `duration`. If provided, it overrides the default `max` value. This is useful for custom limits that differ between IDs.

##### duration

Type: `number`

How long keep records of requests in milliseconds. If provided, it overrides the default `duration` value.

##### decrease

Type: `boolean`

When set to `false`, the remaining number of calls is not decreased. This is useful for just reading the remaining calls without actually decreasing them.


## License

**async-ratelimiter** © [microlink.io](https://microlink.io), released under the [MIT](https://github.com/microlinkhq/async-ratelimiter/blob/master/LICENSE.md) License.<br>
Authored and maintained by microlink.io with help from [contributors](https://github.com/microlinkhq/async-ratelimiter/contributors).

> [microlink.io](https://microlink.io) · GitHub [microlink.io](https://github.com/microlinkhq) · Twitter [@microlinkhq](https://twitter.com/microlinkhq)
