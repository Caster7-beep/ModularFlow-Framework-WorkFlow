import { getWsUrl } from '@/config'

export type WsMessage = any

export type WsHandlers = {
  onOpen?: () => void
  onClose?: (ev?: CloseEvent) => void
  onError?: (ev?: Event) => void
  onMessage?: (data: WsMessage) => void
}

export class ReconnectableWS {
  private url: string
  private ws: WebSocket | null = null
  private reconnectDelay = 1500
  private maxDelay = 15000
  private timer: number | null = null
  private closedByUser = false
  private handlers: WsHandlers

  constructor(url = getWsUrl(), handlers: WsHandlers = {}) {
    this.url = url
    this.handlers = handlers
  }

  get isOpen() {
    return this.ws?.readyState === WebSocket.OPEN
  }

  start() {
    this.closedByUser = false
    this.connect()
  }

  private connect() {
    try {
      this.ws = new WebSocket(this.url)

      this.ws.onopen = () => {
        this.handlers.onOpen?.()
        // reset backoff on successful connect
        this.reconnectDelay = 1500
      }

      this.ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data)
          this.handlers.onMessage?.(data)
        } catch {
          this.handlers.onMessage?.(ev.data)
        }
      }

      this.ws.onclose = (ev) => {
        this.handlers.onClose?.(ev)
        if (!this.closedByUser) {
          this.scheduleReconnect()
        }
      }

      this.ws.onerror = (ev) => {
        this.handlers.onError?.(ev)
      }
    } catch (e) {
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect() {
    if (this.closedByUser) return
    if (this.timer) {
      window.clearTimeout(this.timer)
      this.timer = null
    }
    this.timer = window.setTimeout(() => {
      this.reconnectDelay = Math.min(this.reconnectDelay * 1.6, this.maxDelay)
      this.connect()
    }, this.reconnectDelay)
  }

  send(obj: object): boolean {
    const payload = typeof obj === 'string' ? obj : JSON.stringify(obj)
    if (this.isOpen) {
      this.ws!.send(payload as any)
      return true
    }
    return false
  }

  close(code = 1000, reason = 'client closing') {
    this.closedByUser = true
    if (this.timer) {
      window.clearTimeout(this.timer)
      this.timer = null
    }
    this.ws?.close(code, reason)
    this.ws = null
  }
}