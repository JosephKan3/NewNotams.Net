import { Redis } from "@upstash/redis"

let _kv: Redis | null = null

export function getKv(): Redis {
  if (!_kv) {
    _kv = new Redis({
      url: process.env.KV_REST_API_URL!,
      token: process.env.KV_REST_API_TOKEN!,
    })
  }
  return _kv
}
