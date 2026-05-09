import type { Message, MessageType, ResponseFor } from '@/types/messages'

export const sendMessage = <T extends MessageType>(msg: Extract<Message, { type: T }>): Promise<ResponseFor<T>> =>
  new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, (response: ResponseFor<T>) => {
      const error = chrome.runtime.lastError
      if (error) {
        reject(new Error(error.message ?? 'chrome.runtime error'))
        return
      }
      resolve(response)
    })
  })

type Handler<T extends MessageType> = (
  msg: Extract<Message, { type: T }>,
  sender: chrome.runtime.MessageSender
) => Promise<ResponseFor<T>> | ResponseFor<T>

type HandlerMap = {
  [K in MessageType]?: Handler<K>
}

export const registerMessageHandlers = (handlers: HandlerMap): void => {
  chrome.runtime.onMessage.addListener((rawMsg, sender, sendResponse) => {
    const msg = rawMsg as Message
    const handler = handlers[msg.type]
    if (!handler) return false

    Promise.resolve()
      .then(() => (handler as Handler<MessageType>)(msg, sender))
      .then(result => sendResponse(result))
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        sendResponse({ ok: false, error: message })
      })
    return true
  })
}
