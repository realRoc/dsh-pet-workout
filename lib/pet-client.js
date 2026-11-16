// dsh-pet 第三方 HTTP 接口（/dsh-pet-7340）的最小客户端。
// 契约见 https://github.com/PC2005-cloud/dsh-pet/blob/main/openapi.yaml
// 业务失败一律是 HTTP 200 + { ok: false, reason }，这里把非 JSON 的响应（比如 dsh-pet 没装时的 404）也折成同一种形状。
//
// surface 是「宠物显示在哪一端」：web / desktop。只有指定到具体一端，broadcast 的 speak 才会真的念出来。

const PREFIX = '/dsh-pet-7340'

export function createPetClient(getOrigin, fetchImpl = globalThis.fetch) {
  async function call(method, path, query = {}, body) {
    let url
    try {
      url = new URL(PREFIX + path, getOrigin())
    } catch (err) {
      return { ok: false, reason: 'no-origin', message: err.message }
    }
    for (const [k, v] of Object.entries(query)) if (v != null) url.searchParams.set(k, String(v))
    let res
    try {
      res = await fetchImpl(url, {
        method,
        headers: body ? { 'content-type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      })
    } catch (err) {
      return { ok: false, reason: 'network', message: err.message }
    }
    const text = await res.text()
    try {
      return JSON.parse(text)
    } catch {
      return { ok: false, reason: `http-${res.status}`, message: text.slice(0, 200) }
    }
  }

  return {
    lock: (pet, surface, lockId, ttl) =>
      call('POST', '/lock', { pet, surface }, { ...(lockId ? { lockId } : {}), ...(ttl ? { ttl } : {}) }),
    release: (pet, lockId) => call('POST', '/lock/release', { pet }, { lockId }),
    anim: (pet, surface, lock, body) => call('POST', '/anim', { pet, surface, lock }, body),
    playback: (id, timeout) =>
      call('GET', `/playback/${encodeURIComponent(id)}`, { wait: 'ended,failed,cancelled', timeout }),
    say: (pet, surface, lock, body) => call('POST', '/broadcast', { pet, surface, lock }, body),
    position: (pet, surface, lock, body) => call('POST', '/position', { pet, surface, lock }, body),
    pose: (pet) => call('GET', '/pose', { pet }),
    menuSet: (owner, labels) => call('POST', '/menu/item', {}, { owner, labels }),
    menuClear: (owner) => call('DELETE', '/menu/item', { owner }),
    menuEvents: (owner, wait) => call('GET', '/menu/events', { owner, wait }),
  }
}
