import React, { useState, useEffect } from 'react'
import { Copy, Send, ChevronDown, Loader2 } from 'lucide-react'

const OPENROUTER_API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY

const BotCounsel = () => {
  const [prompt, setPrompt] = useState('')
  const [availableModels, setAvailableModels] = useState([])
  const [selectedModels, setSelectedModels] = useState(['', '', '', ''])
  const [responses, setResponses] = useState(['', '', '', ''])
  const [loading, setLoading] = useState([false, false, false, false])

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
        if (models.length >= 4) {
          setSelectedModels([models[0].id, models[1].id, models[2].id, models[3].id])
        }
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

  const handleModelChange = (panelIndex, modelId) => {
    setSelectedModels((prev) => {
      const updated = [...prev]
      updated[panelIndex] = modelId
      return updated
    })
  }

  const streamResponse = async (panelIndex, model, userPrompt) => {
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
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': window.location.origin,
          'X-Title': 'Bot Council',
        },
        body: JSON.stringify({
          model: model,
          messages: [
            {
              role: 'user',
              content: userPrompt,
            },
          ],
          stream: true,
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
    if (!OPENROUTER_API_KEY || OPENROUTER_API_KEY === 'your_openrouter_api_key_here') {
      alert('Please set your VITE_OPENROUTER_API_KEY in the .env file')
      return
    }
    if (!prompt.trim()) {
      alert('Please enter a prompt')
      return
    }

    // Start streaming for all 4 models in parallel
    selectedModels.forEach((model, index) => {
      if (model) {
        streamResponse(index, model, prompt)
      }
    })

    // Clear the input
    setPrompt('')
  }

  return (
    <div className="min-h-screen bg-white flex flex-col items-center py-10 px-4 font-sans text-slate-900">
      <h1 className="text-4xl font-extrabold mb-12 tracking-tight">Bot Council</h1>

      <div className="w-full max-w-[1600px] grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-16">
        {panels.map((panel, index) => (
          <div
            key={panel.id}
            className="bg-white border border-gray-300 rounded-xl shadow-lg p-4 flex flex-col h-80"
          >
            <div className="mb-3">
              <label className="font-bold text-lg text-black block mb-1">
                {getModelName(selectedModels[index]) || panel.fallbackLabel}
              </label>
              <div className="relative">
                <select
                  value={selectedModels[index]}
                  onChange={(e) => handleModelChange(index, e.target.value)}
                  className="w-full appearance-none bg-white border border-gray-300 rounded-lg px-3 py-2 pr-8 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer"
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

            <div className="flex-grow bg-[#EFEFF1] rounded-lg p-4 relative group border border-gray-200 overflow-hidden">
              <div className="h-full overflow-y-auto pr-6">
                {loading[index] && !responses[index] ? (
                  <div className="flex items-center gap-2 text-gray-500">
                    <Loader2 size={16} className="animate-spin" />
                    <span className="font-medium">Generating...</span>
                  </div>
                ) : responses[index] ? (
                  <p className="text-gray-700 whitespace-pre-wrap text-sm leading-relaxed">{responses[index]}</p>
                ) : (
                  <p className="text-gray-500 font-medium">Response will appear here...</p>
                )}
              </div>

              <button 
                onClick={() => navigator.clipboard.writeText(responses[index])}
                className="absolute top-3 right-3 p-1 rounded hover:bg-gray-200 transition-colors text-gray-500"
                title="Copy to clipboard"
              >
                <Copy size={18} />
              </button>

              <div className="absolute bottom-2 right-2 w-2 h-2 border-r-2 border-b-2 border-gray-400 rounded-sm opacity-50"></div>
            </div>
          </div>
        ))}
      </div>

      <div className="w-full max-w-4xl bg-white border border-gray-300 rounded-xl shadow-xl p-6">
        <label className="block text-black font-bold mb-2 ml-1">input text here</label>

        <div className="flex flex-col sm:flex-row gap-4 items-end">
          <div className="relative w-full">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Enter your prompt here..."
              className="w-full h-24 border-2 border-blue-400 rounded-lg p-3 text-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-gray-700 placeholder-gray-400"
            />

            <div className="absolute bottom-3 right-3 pointer-events-none">
              <div className="w-2 h-2 border-r-2 border-b-2 border-gray-400/50"></div>
            </div>
          </div>

          <button
            onClick={handleSend}
            disabled={loading.some((l) => l)}
            className="bg-[#1976D2] hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed text-white font-medium py-3 px-6 rounded-lg flex items-center gap-2 transition-colors shadow-md h-12 mb-px shrink-0"
          >
            {loading.some((l) => l) ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Generating...
              </>
            ) : (
              <>
                Send Prompt
                <Send size={18} className="-rotate-12 transform" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

export default BotCounsel
