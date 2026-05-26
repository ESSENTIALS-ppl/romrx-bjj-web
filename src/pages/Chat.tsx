import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { Send, Loader2, Settings, Trash2 } from 'lucide-react'
import { cn } from '../lib/utils'

const AI_CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`

interface Message {
  role: 'user' | 'assistant'
  content: string
}

const PROVIDERS = [
  { value: 'rombot',      label: 'ROMBot (included)' },
  { value: 'openai',      label: 'OpenAI (BYOK)' },
  { value: 'anthropic',   label: 'Anthropic (BYOK)' },
  { value: 'google',      label: 'Google Gemini (BYOK)' },
  { value: 'perplexity',  label: 'Perplexity (BYOK)' },
]

function formatMessage(text: string) {
  // Convert basic markdown to JSX-friendly HTML
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/^- (.+)$/gm, '• $1')
    .split('\n')
    .filter(Boolean)
}

function MessageBubble({ msg }: { msg: Message }) {
  const lines = formatMessage(msg.content)
  return (
    <div className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
      <div className={cn(
        'max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-relaxed',
        msg.role === 'user'
          ? 'bg-teal text-white rounded-br-md'
          : 'bg-white border border-teal-light text-charcoal rounded-bl-md'
      )}>
        {lines.map((line, i) => (
          <p key={i} dangerouslySetInnerHTML={{ __html: line }} className={i > 0 ? 'mt-1' : ''} />
        ))}
      </div>
    </div>
  )
}

export function Chat() {
  const { user, session } = useAuth()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [conversationId, setConversationId] = useState<string | undefined>()
  const [showSettings, setShowSettings] = useState(false)
  const [provider, setProvider] = useState('rombot')
  const [providerKey, setProviderKey] = useState('')
  const [error, setError] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Load saved provider prefs
  useEffect(() => {
    const saved = localStorage.getItem('romrx_provider_pref')
    if (saved) {
      const p = JSON.parse(saved)
      setProvider(p.provider ?? 'rombot')
      setProviderKey(p.key ?? '')
    }
  }, [])

  // Welcome message
  useEffect(() => {
    if (messages.length === 0 && user) {
      setMessages([{
        role: 'assistant',
        content: `Hey! I'm ROMBot — your AI mobility assistant. I have access to your ROM scores and technique readiness.\n\nAsk me anything:\n- "Why is my Triangle Choke RED?"\n- "What exercises unlock De La Riva?"\n- "Which techniques am I closest to unlocking?"`
      }])
    }
  }, [user, messages.length])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = async () => {
    if (!input.trim() || loading || !session) return
    const msg = input.trim()
    setInput('')
    setError('')
    setMessages(prev => [...prev, { role: 'user', content: msg }])
    setLoading(true)

    try {
      const res = await fetch(AI_CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,  // Real Supabase JWT
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          message: msg,
          conversation_id: conversationId,
          sport: 'bjj',
          provider,
          provider_key: providerKey,
        }),
      })

      const data = await res.json()
      if (data.error) throw new Error(data.error)

      setConversationId(data.conversation_id)
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const clearChat = () => {
    setMessages([])
    setConversationId(undefined)
  }

  const saveProviderPrefs = () => {
    localStorage.setItem('romrx_provider_pref', JSON.stringify({ provider, key: providerKey }))
    setShowSettings(false)
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="font-display font-bold text-2xl text-charcoal">ROMBot</h1>
          <p className="text-xs text-charcoal-light mt-0.5">
            {PROVIDERS.find(p => p.value === provider)?.label}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={clearChat} className="p-2 rounded-full hover:bg-red-50 text-charcoal-light hover:text-red-tier transition-colors">
            <Trash2 size={16} />
          </button>
          <button onClick={() => setShowSettings(s => !s)} className="p-2 rounded-full hover:bg-teal-light text-charcoal-light hover:text-teal transition-colors">
            <Settings size={16} />
          </button>
        </div>
      </div>

      {/* Provider settings panel */}
      {showSettings && (
        <div className="card mb-4 space-y-3">
          <h3 className="text-sm font-semibold text-charcoal">AI Provider</h3>
          <div className="text-xs text-charcoal-light bg-teal-light rounded-lg px-3 py-2">
            ROMBot (GPT-4o-mini) is included free. Bring your own key for other models.
          </div>
          <select
            value={provider}
            onChange={e => setProvider(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-teal-light bg-surface text-sm focus:outline-none focus:border-teal"
          >
            {PROVIDERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          {provider !== 'rombot' && (
            <input
              type="password"
              value={providerKey}
              onChange={e => setProviderKey(e.target.value)}
              placeholder="API key..."
              className="w-full px-3 py-2 rounded-xl border border-teal-light bg-surface text-sm font-mono focus:outline-none focus:border-teal"
            />
          )}
          <div className="flex gap-2">
            <button onClick={saveProviderPrefs} className="btn-primary flex-1 text-sm py-2">Save</button>
            <button onClick={() => setShowSettings(false)} className="flex-1 text-sm py-2 rounded-xl border border-teal-light text-charcoal-light hover:bg-surface">Cancel</button>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 pb-2">
        {messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-teal-light rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex gap-1.5">
                {[0, 150, 300].map(delay => (
                  <div
                    key={delay}
                    className="w-2 h-2 bg-teal rounded-full animate-bounce"
                    style={{ animationDelay: `${delay}ms` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
        {error && (
          <p className="text-xs text-center text-red-tier bg-red-tier-bg rounded-lg px-3 py-2">{error}</p>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2 mt-3 pt-3 border-t border-teal-light">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
          placeholder="Ask about your mobility, techniques, or protocol..."
          rows={1}
          className="flex-1 px-4 py-2.5 rounded-xl border border-teal-light bg-surface text-sm resize-none focus:outline-none focus:border-teal focus:bg-white transition-colors"
          style={{ minHeight: 42, maxHeight: 120 }}
        />
        <button
          onClick={sendMessage}
          disabled={loading || !input.trim()}
          className="btn-primary px-4 py-2.5 flex items-center gap-1.5 shrink-0"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </button>
      </div>
    </div>
  )
}
