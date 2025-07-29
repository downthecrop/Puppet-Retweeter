import { TwitterApi } from 'twitter-api-v2'
import { readFile, writeFile } from 'fs/promises'
import { XMLParser } from 'fast-xml-parser'
import fetch from 'node-fetch'
import dotenv from 'dotenv'
dotenv.config()

const TARGET_USERNAME  = process.env.TARGET_USERNAME
const NITTER_BASE      = (process.env.NITTER_BASE ?? 'https://nitter.privacyredirect.com/').replace(/\/$/, '')
const POLL_INTERVAL_MS = 600_000                              // 10 min
const BACK_FILL        = Math.min(Number(process.env.BACK_FILL ?? 0), 10)
const INCLUDE_REPLIES  = /^(1|true|yes|on)$/i.test(process.env.INCLUDE_REPLIES ?? '')
const STATE_FILE       = 'state.json'

const client = new TwitterApi({
  appKey:       process.env.TWITTER_APP_KEY,
  appSecret:    process.env.TWITTER_APP_SECRET,
  accessToken:  process.env.TWITTER_ACCESS_TOKEN,
  accessSecret: process.env.TWITTER_ACCESS_SECRET
}).readWrite

const parser = new XMLParser({ ignoreAttributes: false })

async function loadState () {
  try { return JSON.parse(await readFile(STATE_FILE, 'utf8')).since_id ?? null }
  catch { return null }
}

const saveState = id => writeFile(STATE_FILE, JSON.stringify({ since_id: id }), 'utf8')

function classify (title) {
  if (title.startsWith('R ') || title.startsWith('R to ')) return 'reply'
  if (title.startsWith('RT ') || title.startsWith('RT by ')) return 'retweet'
  return 'tweet'
}

async function fetchFeed (since) {
  const url = `${NITTER_BASE}/${TARGET_USERNAME}/rss`
  try {
    const xml = await fetch(url, { headers: { 'User-Agent': 'puppet-retweeter/1.0' } })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text() })

    let items = parser.parse(xml)?.rss?.channel?.item
    if (!items) return []
    if (!Array.isArray(items)) items = [items]

    const ids = []
    for (const it of items) {
      const link = typeof it.link === 'string' ? it.link : it.link?.['#text'] ?? ''
      const id   = link.match(/status\/(\d+)/)?.[1]
      if (!id) continue
      if (!INCLUDE_REPLIES && classify(it.title) === 'reply') continue
      if (since && BigInt(id) <= BigInt(since)) break
      ids.push(id)
    }
    return ids
  } catch (e) {
    console.error(`RSS fetch failed (${url}): ${e.message ?? e}`)
    return []
  }
}

async function retweet (botId, id) {
  try {
    await client.v2.retweet(botId, id)
    console.log(`Retweeted https://twitter.com/${TARGET_USERNAME}/status/${id}`)
  } catch (e) {
    if (!e?.data?.errors?.some(err => err.code === 327))
      console.error(`Retweet error ${id}:`, e)
  }
}

;(async () => {
  if (!TARGET_USERNAME) throw new Error('TARGET_USERNAME missing')

  const bot   = await client.v2.me()
  const botId = bot.data.id

  console.log(`Relay started: @${TARGET_USERNAME} -> @${bot.data.username}`)
  console.log(`Replies: ${INCLUDE_REPLIES ? 'on' : 'off'} | back‑fill: ${BACK_FILL}`)
  console.log(`Polling every ${POLL_INTERVAL_MS / 1000}s\n`)

  let since = await loadState()

  const backlog = (await fetchFeed(since)).slice(0, BACK_FILL).reverse()
  if (backlog.length) console.log(`Back‑filling ${backlog.length} item(s)`)
  for (const id of backlog) {
    await retweet(botId, id)
    since = id
  }
  if (backlog.length) await saveState(since)

  while (true) {
    const ids = (await fetchFeed(since)).reverse()
    if (ids.length) console.log(`→ ${ids.length} new item(s)`)
    for (const id of ids) {
      await retweet(botId, id)
      since = id
    }
    if (ids.length) await saveState(since)
    else console.log(`Up to date (last ID ${since ?? 'none'})`)

    console.log(`Waiting ${POLL_INTERVAL_MS / 1000}s …\n`)
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))
  }
})().catch(e => { console.error(e); process.exit(1) })
