import React, { useState, useEffect } from 'react'
import { Copy, Send, ChevronDown, Loader2, Leaf, Globe, MessageSquare, Settings, Info, Sparkles } from 'lucide-react'

// Navigation Bar Component
const Navbar = ({ transparent = false }) => {
  const navLinks = [
    { name: 'Council', href: '#', icon: MessageSquare, active: true },
    { name: 'Settings', href: '#', icon: Settings, active: false },
    { name: 'About', href: '#', icon: Info, active: false },
  ]

  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 font-body ${
      transparent 
        ? 'bg-parchment-100/60 backdrop-blur-md border-b border-parchment-300/30' 
        : 'bg-parchment-50 border-b border-parchment-300/50 shadow-warm'
    }`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo / Brand */}
          <div className="flex items-center gap-2">
            <Leaf size={24} className="text-sage-600" />
            <span className="text-xl font-display font-bold tracking-tight text-walnut-800">
              Bot Council
            </span>
          </div>

          {/* Navigation Links */}
          <div className="flex items-center gap-1">
            {navLinks.map((link) => (
              <a
                key={link.name}
                href={link.href}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  link.active
                    ? 'bg-terracotta-100 text-terracotta-700 border border-terracotta-200/50'
                    : 'text-walnut-600 hover:bg-parchment-200 hover:text-walnut-800'
                }`}
              >
                <link.icon size={18} />
                <span className="hidden sm:inline">{link.name}</span>
              </a>
            ))}
          </div>
        </div>
      </div>
    </nav>
  )
}

const BotCounsel = () => {
  const [hasStarted, setHasStarted] = useState(false)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [availableModels, setAvailableModels] = useState([])
  const [selectedModels, setSelectedModels] = useState(['', '', '', ''])
  const [responses, setResponses] = useState(['', '', '', ''])
  const [loading, setLoading] = useState([false, false, false, false])
  const [webSearchEnabled, setWebSearchEnabled] = useState(false)
  const [reviewResponse, setReviewResponse] = useState('')
  const [reviewLoading, setReviewLoading] = useState(false)

  const handleStart = () => {
    setIsTransitioning(true)
    setTimeout(() => {
      setHasStarted(true)
    }, 600)
  }

  // Load models from models.txt on mount
  useEffect(() => {
    fetch('/models.txt')
      .then((res) => res.text())
      .then((text) => {
        const lines = text.split('\n').filter((line) => line.trim() && !line.startsWith('#'))
        const models = lines.map((line) => {
          const [id, name] = line.split(',').map((s) => s.trim())
          return { id, name }
        })
        setAvailableModels(models)
        // Set default selections for each panel
        const defaultModelIds = [
          'openai/gpt-5.1',
          'anthropic/claude-opus-4.5',
          'google/gemini-3-pro-preview',
          'x-ai/grok-4'
        ]
        // Use defaults if available, otherwise fall back to first 4 models
        const defaults = defaultModelIds.map((id, idx) => {
          const found = models.find((m) => m.id === id)
          return found ? found.id : (models[idx]?.id || '')
        })
        setSelectedModels(defaults)
      })
      .catch((err) => console.error('Failed to load models:', err))
  }, [])

  const panels = [
    { id: 1, fallbackLabel: 'LLM 1' },
    { id: 2, fallbackLabel: 'LLM 2' },
    { id: 3, fallbackLabel: 'LLM 3' },
    { id: 4, fallbackLabel: 'LLM 4' },
  ]

  const getModelName = (modelId) => {
    const model = availableModels.find((m) => m.id === modelId)
    return model?.name || null
  }

  // Render text with clickable links
  const renderTextWithLinks = (text) => {
    if (!text) return null
    // URL regex pattern
    const urlPattern = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/g
    const parts = text.split(urlPattern)
    
    return parts.map((part, index) => {
      if (urlPattern.test(part)) {
        // Reset lastIndex since we're reusing the regex
        urlPattern.lastIndex = 0
        return (
          <a
            key={index}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-terracotta-600 hover:text-terracotta-700 underline decoration-terracotta-300 underline-offset-2 break-all"
          >
            {part}
          </a>
        )
      }
      return part
    })
  }

  const handleModelChange = (panelIndex, modelId) => {
    setSelectedModels((prev) => {
      const updated = [...prev]
      updated[panelIndex] = modelId
      return updated
    })
  }

  const streamResponse = async (panelIndex, model, userPrompt, useWebSearch) => {
    // Set loading state
    setLoading((prev) => {
      const updated = [...prev]
      updated[panelIndex] = true
      return updated
    })
    // Clear previous response
    setResponses((prev) => {
      const updated = [...prev]
      updated[panelIndex] = ''
      return updated
    })

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: model,
          messages: [
            {
              role: 'user',
              content: userPrompt,
            },
          ],
          webSearch: useWebSearch,
        }),
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(`API error: ${response.status} - ${error}`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n').filter((line) => line.trim() !== '')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') continue

            try {
              const parsed = JSON.parse(data)
              const content = parsed.choices?.[0]?.delta?.content
              if (content) {
                setResponses((prev) => {
                  const updated = [...prev]
                  updated[panelIndex] = updated[panelIndex] + content
                  return updated
                })
              }
            } catch (e) {
              // Skip malformed JSON chunks
            }
          }
        }
      }
    } catch (error) {
      setResponses((prev) => {
        const updated = [...prev]
        updated[panelIndex] = `Error: ${error.message}`
        return updated
      })
    } finally {
      setLoading((prev) => {
        const updated = [...prev]
        updated[panelIndex] = false
        return updated
      })
    }
  }

  const handleSend = () => {
    if (!prompt.trim()) {
      alert('Please enter a prompt')
      return
    }

    // Start streaming for all 4 models in parallel
    selectedModels.forEach((model, index) => {
      if (model) {
        streamResponse(index, model, prompt, webSearchEnabled)
      }
    })

    // Clear the input
    setPrompt('')
  }

  const handleReview = async () => {
    // Check if we have at least one response to review
    const filledResponses = responses.filter((r) => r && !r.startsWith('Error:'))
    if (filledResponses.length === 0) {
      alert('Please generate responses first before reviewing')
      return
    }

    setReviewLoading(true)
    setReviewResponse('')

    // Build the review prompt with all model outputs
    const modelOutputs = responses
      .map((response, index) => {
        const modelName = getModelName(selectedModels[index]) || `Model ${index + 1}`
        if (response && !response.startsWith('Error:')) {
          return `=== ${modelName} ===\n${response}`
        }
        return null
      })
      .filter(Boolean)
      .join('\n\n')

    const reviewPrompt = `You are an expert AI response synthesizer. Analyze the following responses from different AI models to the same prompt and create a single, improved response that:

1. Combines the best insights from each model
2. Corrects any errors or inaccuracies
3. Provides the most comprehensive and accurate answer
4. Maintains clarity and coherence

Here are the model responses:

${modelOutputs}

Please provide a synthesized, improved response that represents the best combined output:`

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-3-pro-preview',
          messages: [
            {
              role: 'user',
              content: reviewPrompt,
            },
          ],
          webSearch: false,
        }),
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(`API error: ${response.status} - ${error}`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n').filter((line) => line.trim() !== '')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') continue

            try {
              const parsed = JSON.parse(data)
              const content = parsed.choices?.[0]?.delta?.content
              if (content) {
                setReviewResponse((prev) => prev + content)
              }
            } catch (e) {
              // Skip malformed JSON chunks
            }
          }
        }
      }
    } catch (error) {
      setReviewResponse(`Error: ${error.message}`)
    } finally {
      setReviewLoading(false)
    }
  }

  // Start Screen Component
  if (!hasStarted) {
    return (
      <>
        {/* Background for Start Screen */}
        <div className="start-background" aria-hidden="true" />
        
        {/* Navbar - transparent on start screen */}
        <Navbar transparent />
        
        <div className="min-h-screen flex flex-col items-center justify-center px-4 font-body relative pt-16">
          {/* Main content container */}
          <div className={`text-center z-10 relative px-12 py-14 rounded-3xl warm-card paper-texture animate-fade-in-up ${isTransitioning ? 'opacity-0 scale-95 transition-all duration-500' : ''}`}>
            {/* Decorative corner elements */}
            <div className="absolute -top-3 -left-3 w-8 h-8 border-t-2 border-l-2 border-terracotta-400/40 rounded-tl-lg"></div>
            <div className="absolute -top-3 -right-3 w-8 h-8 border-t-2 border-r-2 border-terracotta-400/40 rounded-tr-lg"></div>
            <div className="absolute -bottom-3 -left-3 w-8 h-8 border-b-2 border-l-2 border-terracotta-400/40 rounded-bl-lg"></div>
            <div className="absolute -bottom-3 -right-3 w-8 h-8 border-b-2 border-r-2 border-terracotta-400/40 rounded-br-lg"></div>
            
            {/* Small leaf decoration */}
            <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-2xl">🌿</div>
            
            {/* Title */}
            <h1 className="text-6xl md:text-8xl font-display font-bold mb-6 tracking-tight text-walnut-800">
              Bot Council
            </h1>
            
            {/* Decorative line */}
            <div className="flex items-center justify-center gap-3 mb-6">
              <div className="w-12 h-px bg-gradient-to-r from-transparent via-terracotta-400 to-transparent"></div>
              <Leaf size={16} className="text-sage-500" />
              <div className="w-12 h-px bg-gradient-to-r from-transparent via-terracotta-400 to-transparent"></div>
            </div>
            
            {/* Subtitle */}
            <p className="text-xl md:text-2xl text-walnut-600 mb-10 font-light tracking-wide max-w-lg mx-auto italic">
              Compare AI responses side by side
            </p>
            
            {/* Start Button */}
            <button
              onClick={handleStart}
              className="btn-primary inline-flex items-center gap-3 px-10 py-4 text-lg animate-warm-pulse"
            >
              <Leaf size={22} />
              <span>Enter the Council</span>
            </button>
            
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      {/* Navbar - solid on main view */}
      <Navbar />
      
      <div className="min-h-screen bg-parchment-100 flex flex-col items-center pt-24 pb-10 px-4 font-body text-walnut-900">
        {/* Subtle background pattern */}
        <div className="fixed inset-0 opacity-[0.02] pointer-events-none" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23704214' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
        }}></div>
        
        <div className="w-full max-w-[1600px] grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-16 relative z-10">
        {panels.map((panel, index) => (
          <div
            key={panel.id}
            className="warm-card paper-texture p-4 flex flex-col h-80 animate-fade-in-up"
            style={{ animationDelay: `${index * 100}ms` }}
          >
            <div className="mb-3">
              <label className="font-display font-semibold text-lg text-walnut-800 block mb-1">
                {getModelName(selectedModels[index]) || panel.fallbackLabel}
              </label>
              <div className="relative">
                <select
                  value={selectedModels[index]}
                  onChange={(e) => handleModelChange(index, e.target.value)}
                  className="select-organic w-full px-3 py-2 pr-8 text-sm"
                >
                  <option value="">— Select a model —</option>
                  {availableModels.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={16}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-walnut-400 pointer-events-none"
                />
              </div>
            </div>

            <div className="flex-grow bg-parchment-100/80 rounded-xl p-4 relative border border-parchment-300/50 overflow-hidden">
              <div className="h-full overflow-y-auto pr-4">
                {loading[index] && !responses[index] ? (
                  <div className="flex items-center gap-2 text-walnut-500">
                    <Loader2 size={16} className="animate-spin text-terracotta-500" />
                    <span className="font-medium italic">Gathering thoughts...</span>
                  </div>
                ) : responses[index] ? (
                  <p className="text-walnut-700 whitespace-pre-wrap text-sm leading-relaxed">{renderTextWithLinks(responses[index])}</p>
                ) : (
                  <p className="text-walnut-400">Generated text will appear here...</p>
                )}
              </div>

              <button 
                onClick={() => navigator.clipboard.writeText(responses[index])}
                className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-parchment-200 text-walnut-400 hover:text-walnut-600 transition-colors"
                title="Copy to clipboard"
              >
                <Copy size={18} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Input section */}
      <div className="w-full max-w-4xl warm-card paper-texture p-6 relative z-10">

        <div className="flex flex-col gap-4 items-center">
          <div className="relative w-full">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.ctrlKey && e.key === 'Enter' && !loading.some((l) => l)) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              placeholder="Enter your prompt here... (Ctrl+Enter to send)"
              className="input-organic w-full h-24 p-3 text-lg resize-none"
            />
          </div>

          <div className="flex flex-row gap-2 shrink-0">
            <button
              onClick={() => setWebSearchEnabled(!webSearchEnabled)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all ${
                webSearchEnabled
                  ? 'bg-sage-600 text-parchment-50 shadow-md'
                  : 'btn-secondary'
              }`}
              title="Enable web search for real-time information"
            >
              <Globe size={18} />
              <span className="text-sm">{webSearchEnabled ? 'Web Search On' : 'Web Search'}</span>
            </button>

            <button
              onClick={handleSend}
              disabled={loading.some((l) => l)}
              className="btn-primary py-3 px-6 flex items-center gap-2 h-12 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none"
            >
              {loading.some((l) => l) ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  Send
                  <Send size={18} />
                </>
              )}
            </button>

            <button
              onClick={handleReview}
              disabled={loading.some((l) => l) || reviewLoading || !responses.some((r) => r && !r.startsWith('Error:'))}
              className="bg-gradient-to-r from-ochre-500 to-ochre-600 hover:from-ochre-600 hover:to-ochre-700 text-parchment-50 font-semibold py-3 px-6 rounded-xl flex items-center gap-2 shadow-warm h-12 shrink-0 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              title="Analyze all responses and create a combined, improved response"
            >
              {reviewLoading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Synthesizing...
                </>
              ) : (
                <>
                  Synthesize
                  <Sparkles size={18} />
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Review Output Panel */}
      {(reviewResponse || reviewLoading) && (
        <div className="w-full max-w-4xl mt-6 rounded-2xl p-6 shadow-warm-lg border border-ochre-200 relative z-10 paper-texture" style={{
          background: 'linear-gradient(135deg, rgba(249, 240, 208, 0.9) 0%, rgba(242, 222, 158, 0.6) 100%)'
        }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Sparkles size={20} className="text-ochre-600" />
              <h3 className="font-display font-bold text-lg text-ochre-800">Synthesized Wisdom</h3>
              <span className="text-xs bg-ochre-100 text-ochre-700 px-2 py-1 rounded-full font-medium border border-ochre-200">
                Gemini 3 Pro Preview
              </span>
            </div>
            <button 
              onClick={() => navigator.clipboard.writeText(reviewResponse)}
              className="p-2 rounded-lg hover:bg-ochre-100 text-ochre-500 hover:text-ochre-700 transition-colors"
              title="Copy to clipboard"
            >
              <Copy size={18} />
            </button>
          </div>
          
          <div className="bg-parchment-50/80 rounded-xl p-4 border border-ochre-200/50 max-h-96 overflow-y-auto">
            {reviewLoading && !reviewResponse ? (
              <div className="flex items-center gap-2 text-ochre-600">
                <Loader2 size={16} className="animate-spin" />
                <span className="font-medium italic">Weaving insights together...</span>
              </div>
            ) : (
              <p className="text-walnut-700 whitespace-pre-wrap text-sm leading-relaxed">{renderTextWithLinks(reviewResponse)}</p>
            )}
          </div>
        </div>
      )}
    </div>
    </>
  )
}

export default BotCounsel
