// 每个 tab 共用一把异步写锁：detection / dynamic / bundle / webRequest 这些并发 writer
// 必须串行化进入 read-modify-write 段,否则它们各自读到的快照可能没包含彼此的最新写入,
// 互相把对方的字段覆盖掉(用户视觉:popup 上数字 7 → 13 → 3 → 7 来回闪)
const tabWriteLocks = new Map<number, Promise<void>>()

export const withTabWriteLock = async <T>(tabId: number, task: () => Promise<T>): Promise<T> => {
  if (typeof tabId !== 'number' || tabId < 0) return task()
  const previous = tabWriteLocks.get(tabId) || Promise.resolve()
  let release: () => void = () => {}
  const next = new Promise<void>(resolve => {
    release = resolve
  })
  tabWriteLocks.set(
    tabId,
    previous.then(() => next)
  )
  try {
    await previous
    return await task()
  } finally {
    release()
    if (tabWriteLocks.get(tabId) === next) {
      tabWriteLocks.delete(tabId)
    }
  }
}

export const clearTabWriteLock = (tabId: number): void => {
  tabWriteLocks.delete(tabId)
}
