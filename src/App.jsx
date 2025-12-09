import React, { useState, useEffect } from 'react'
import { Copy, Send, ChevronDown, Loader2, Sparkles, Globe, MessageSquare, Settings, Info } from 'lucide-react'

// Navigation Bar Component
const Navbar = ({ transparent = false }) => {
  const navLinks = [
    { name: 'Council', href: '#', icon: MessageSquare, active: true },
    { name: 'Settings', href: '#', icon: Settings, active: false },
    { name: 'About', href: '#', icon: Info, active: false },
  ]

  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 ${transparent ? 'bg-white/10 backdrop-blur-md' : 'bg-white shadow-md'}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo / Brand */}
          <div className="flex items-center gap-2">
            <Sparkles size={24} className={transparent ? 'text-slate-700' : 'text-blue-600'} />
            <span className={`text-xl font-bold tracking-tight ${transparent ? 'text-slate-800' : 'text-slate-800'}`}>
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
                    ? transparent
                      ? 'bg-white/20 text-slate-800'
                      : 'bg-blue-50 text-blue-700'
                    : transparent
                      ? 'text-slate-600 hover:bg-white/10 hover:text-slate-800'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800'
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
            className="text-blue-600 hover:text-blue-800 underline break-all"
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

  // Start Screen Component
  if (!hasStarted) {
    return (
      <>
        {/* Background for Start Screen */}
        <div className="start-background" aria-hidden="true" />
        
        {/* Navbar - transparent on start screen */}
        <Navbar transparent />
        
        <div className="min-h-screen flex flex-col items-center justify-center px-4 font-sans relative pt-16">
          {/* Main content container */}
          <div className="text-center z-10 relative px-12 py-14 rounded-3xl bg-white/25 backdrop-blur-[2px] shadow-lg shadow-black/5 border border-white/20">
            {/* Title */}
            <h1 className="text-6xl md:text-8xl font-black mb-6 tracking-tight text-slate-800">
              Bot Council
            </h1>
            
            {/* Subtitle */}
            <p className="text-xl md:text-2xl text-slate-600 mb-12 font-light tracking-wide max-w-lg mx-auto">
              Compare AI responses side by side
            </p>
            
            {/* Start Button */}
            <button
              onClick={handleStart}
              className="inline-flex items-center gap-3 px-10 py-4 text-lg font-semibold text-white bg-slate-800 hover:bg-slate-700 rounded-2xl shadow-xl transition-colors"
            >
              <Sparkles size={22} />
              <span>Enter the Council</span>
            </button>
            
            {/* Decorative elements */}
            <div className="mt-12 flex items-center justify-center gap-2 text-slate-400">
              <div className="w-8 h-px bg-slate-400"></div>
              <span className="text-sm font-medium tracking-widest uppercase">Click to Begin</span>
              <div className="w-8 h-px bg-slate-400"></div>
            </div>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      {/* Navbar - solid on main view */}
      <Navbar />
      
      <div className="min-h-screen bg-slate-50 flex flex-col items-center pt-24 pb-10 px-4 font-sans text-slate-900">
        <div className="w-full max-w-[1600px] grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-16">
        {panels.map((panel, index) => (
          <div
            key={panel.id}
            className="bg-white rounded-2xl p-4 flex flex-col h-80 shadow-lg border border-gray-200"
          >
            <div className="mb-3">
              <label className="font-bold text-lg text-slate-800 block mb-1">
                {getModelName(selectedModels[index]) || panel.fallbackLabel}
              </label>
              <div className="relative">
                <select
                  value={selectedModels[index]}
                  onChange={(e) => handleModelChange(index, e.target.value)}
                  className="w-full appearance-none bg-white border border-gray-300 rounded-xl px-3 py-2 pr-8 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400 cursor-pointer"
                >
                  <option value="">-- Select a model --</option>
                  {availableModels.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={16}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"
                />
              </div>
            </div>

            <div className="flex-grow bg-slate-100 rounded-xl p-4 relative border border-gray-200 overflow-hidden">
              <div className="h-full overflow-y-auto pr-6">
                {loading[index] && !responses[index] ? (
                  <div className="flex items-center gap-2 text-slate-500">
                    <Loader2 size={16} className="animate-spin" />
                    <span className="font-medium">Generating...</span>
                  </div>
                ) : responses[index] ? (
                  <p className="text-slate-700 whitespace-pre-wrap text-sm leading-relaxed">{renderTextWithLinks(responses[index])}</p>
                ) : (
                  <p className="text-slate-400 font-medium">Response will appear here...</p>
                )}
              </div>

              <button 
                onClick={() => navigator.clipboard.writeText(responses[index])}
                className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-slate-200 text-slate-500 hover:text-slate-700"
                title="Copy to clipboard"
              >
                <Copy size={18} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="w-full max-w-4xl bg-white rounded-2xl p-6 shadow-lg border border-gray-200">
        <label className="block text-slate-800 font-bold mb-2 ml-1">input text here</label>

        <div className="flex flex-col sm:flex-row gap-4 items-end">
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
              className="w-full h-24 border-2 border-blue-400 bg-white rounded-xl p-3 text-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none text-gray-700 placeholder-gray-400"
            />
          </div>

          <div className="flex flex-col gap-2 shrink-0">
            <button
              onClick={() => setWebSearchEnabled(!webSearchEnabled)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all ${
                webSearchEnabled
                  ? 'bg-emerald-500 text-white shadow-md'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-300'
              }`}
              title="Enable web search for real-time information"
            >
              <Globe size={18} />
              <span className="text-sm">{webSearchEnabled ? 'Web Search On' : 'Web Search'}</span>
            </button>

            <button
              onClick={handleSend}
              disabled={loading.some((l) => l)}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed text-white font-medium py-3 px-6 rounded-xl flex items-center gap-2 shadow-md h-12 shrink-0"
            >
              {loading.some((l) => l) ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  Send Prompt
                  <Send size={18} />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
    </>
  )
}

export default BotCounsel
