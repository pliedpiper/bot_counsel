import React, { useState, useEffect, useRef, useCallback } from 'react'
import { 
  ChevronDown, 
  Loader2, 
  Play, 
  Square, 
  MessageSquare, 
  ArrowRightLeft,
  Trash2,
  Copy
} from 'lucide-react'

const DualAgentChat = () => {
  const [availableModels, setAvailableModels] = useState([])
  const [modelA, setModelA] = useState('')
  const [modelB, setModelB] = useState('')
  const [initialPrompt, setInitialPrompt] = useState('')
  const [maxTurns, setMaxTurns] = useState(10)
  const [conversation, setConversation] = useState([])
  const [isRunning, setIsRunning] = useState(false)
  const [currentTurn, setCurrentTurn] = useState(0)
  const [currentSpeaker, setCurrentSpeaker] = useState(null)
  const [streamingMessage, setStreamingMessage] = useState('')
  
  const abortControllerRef = useRef(null)

  // Load models on mount
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
        // Set default selections
        if (models.length >= 2) {
          const gptModel = models.find(m => m.id.includes('gpt')) || models[0]
          const claudeModel = models.find(m => m.id.includes('claude')) || models[1]
          setModelA(gptModel.id)
          setModelB(claudeModel.id)
        }
      })
      .catch((err) => console.error('Failed to load models:', err))
  }, [])

  const getModelName = useCallback((modelId) => {
    const model = availableModels.find((m) => m.id === modelId)
    return model?.name || modelId
  }, [availableModels])

  const streamMessage = useCallback(async (model, messages, signal) => {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        webSearch: false,
      }),
      signal,
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`API error: ${response.status} - ${error}`)
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let fullContent = ''

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
              fullContent += content
              setStreamingMessage(fullContent)
            }
          } catch (e) {
            // Skip malformed JSON chunks
          }
        }
      }
    }

    return fullContent
  }, [])

  const runConversation = useCallback(async () => {
    if (!modelA || !modelB || !initialPrompt.trim()) {
      alert('Please select both models and enter an initial prompt')
      return
    }

    setIsRunning(true)
    setCurrentTurn(0)
    setConversation([])
    setStreamingMessage('')
    
    abortControllerRef.current = new AbortController()
    const signal = abortControllerRef.current.signal

    const modelAName = getModelName(modelA)
    const modelBName = getModelName(modelB)

    // Enhanced system prompts that emphasize memory and context awareness
    const createSystemPrompt = (yourName, otherName, isModelA) => `You are ${yourName}, engaging in an ongoing discussion with ${otherName} (another AI assistant).

IMPORTANT - CONVERSATION MEMORY:
- You must remember and reference your previous statements throughout this conversation
- Build upon your earlier points and maintain consistency with what you've said before
- Acknowledge and respond directly to specific points ${otherName} has made
- Reference earlier parts of the discussion when relevant

Your role in this discussion:
${isModelA 
  ? '- Lead with clear, well-reasoned positions\n- Ask thought-provoking questions to deepen the dialogue\n- Develop and evolve your arguments as the conversation progresses'
  : '- Offer alternative perspectives and build on ideas\n- Respectfully challenge points when you disagree\n- Find common ground while maintaining your distinct viewpoint'}

Keep responses focused (under 200 words) but substantive. Express your perspective clearly while engaging genuinely with ${otherName}'s contributions.`

    // Maintain separate conversation memories for each model's perspective
    let conversationHistoryA = [] // Model A's memory (its own messages as assistant)
    let conversationHistoryB = [] // Model B's memory (its own messages as assistant)
    let fullConversation = []     // Full conversation for display
    
    // Add initial prompt as the starting point
    const initialMessage = {
      role: 'user',
      speaker: 'user',
      content: initialPrompt.trim(),
      model: null,
    }
    
    setConversation([initialMessage])
    fullConversation.push(initialMessage)

    try {
      for (let turn = 0; turn < maxTurns; turn++) {
        if (signal.aborted) break

        // Determine current speaker
        const isModelATurn = turn % 2 === 0
        const currentModel = isModelATurn ? modelA : modelB
        const speakerLabel = isModelATurn ? 'A' : 'B'
        const currentName = isModelATurn ? modelAName : modelBName
        const otherName = isModelATurn ? modelBName : modelAName

        setCurrentTurn(turn + 1)
        setCurrentSpeaker(speakerLabel)
        setStreamingMessage('')

        // Build messages for the API call with proper memory context
        const systemPrompt = createSystemPrompt(currentName, otherName, isModelATurn)
        
        // Build the conversation from this model's perspective
        // Each model sees its own messages as 'assistant' and others as 'user'
        const apiMessages = [{ role: 'system', content: systemPrompt }]
        
        // For proper role alternation, we need to group messages correctly
        // Start with the initial topic
        let lastRole = null
        let pendingContent = ''
        
        for (const msg of fullConversation) {
          let msgRole
          let msgContent = msg.content
          
          if (msg.speaker === 'user') {
            // Initial prompt is always from user
            msgRole = 'user'
            msgContent = `[Discussion Topic]: ${msg.content}`
          } else if (msg.speaker === speakerLabel) {
            // This model's own previous messages
            msgRole = 'assistant'
            msgContent = msg.content
          } else {
            // Other model's messages - presented as user with speaker label
            msgRole = 'user'
            msgContent = `[${otherName}]: ${msg.content}`
          }
          
          // Handle consecutive same-role messages by combining them
          if (lastRole === msgRole) {
            pendingContent += '\n\n' + msgContent
          } else {
            // Push pending content if exists
            if (pendingContent) {
              apiMessages.push({ role: lastRole, content: pendingContent })
            }
            pendingContent = msgContent
            lastRole = msgRole
          }
        }
        
        // Push any remaining pending content
        if (pendingContent) {
          apiMessages.push({ role: lastRole, content: pendingContent })
        }

        // Stream the response
        const responseContent = await streamMessage(currentModel, apiMessages, signal)

        if (signal.aborted) break

        // Add to conversation
        const newMessage = {
          role: 'assistant',
          speaker: speakerLabel,
          content: responseContent,
          model: currentModel,
          turn: turn + 1,
        }

        fullConversation.push(newMessage)
        setConversation([...fullConversation])
        setStreamingMessage('')

        // Small delay between turns for readability
        if (turn < maxTurns - 1 && !signal.aborted) {
          await new Promise(resolve => setTimeout(resolve, 500))
        }
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error('Conversation error:', error)
        const errorMessage = {
          role: 'error',
          speaker: 'system',
          content: `Error: ${error.message}`,
          model: null,
        }
        setConversation(prev => [...prev, errorMessage])
      }
    } finally {
      setIsRunning(false)
      setCurrentSpeaker(null)
      setStreamingMessage('')
      abortControllerRef.current = null
    }
  }, [modelA, modelB, initialPrompt, maxTurns, streamMessage, getModelName])

  const stopConversation = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    setIsRunning(false)
    setCurrentSpeaker(null)
    setStreamingMessage('')
  }, [])

  const clearConversation = () => {
    setConversation([])
    setCurrentTurn(0)
    setStreamingMessage('')
  }

  const copyConversation = () => {
    const text = conversation.map(msg => {
      if (msg.speaker === 'user') {
        return `[Initial Prompt]\n${msg.content}`
      }
      const modelName = getModelName(msg.model)
      return `[${msg.speaker === 'A' ? 'Model A' : 'Model B'}: ${modelName}]\n${msg.content}`
    }).join('\n\n---\n\n')
    
    navigator.clipboard.writeText(text)
  }

  // Render text with clickable links
  const renderTextWithLinks = (text) => {
    if (!text) return null
    const urlPattern = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/g
    const parts = text.split(urlPattern)
    
    return parts.map((part, index) => {
      if (urlPattern.test(part)) {
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

  return (
    <div className="min-h-screen bg-parchment-100 flex flex-col items-center pt-24 pb-10 px-4 font-body text-walnut-900">
      {/* Subtle background pattern */}
      <div className="fixed inset-0 opacity-[0.02] pointer-events-none" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23704214' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
      }}></div>

      {/* Header */}
      <div className="w-full max-w-4xl mb-6 relative z-10 animate-fade-in-up">
        <div className="text-center mb-2">
          <div className="flex items-center justify-center gap-3 mb-2">
            <ArrowRightLeft className="text-terracotta-500" size={28} />
            <h1 className="text-3xl font-display font-bold text-walnut-800">Dual Agent Dialogue</h1>
          </div>
          <p className="text-walnut-600 italic">Watch two AI models engage in automated discussion</p>
        </div>
      </div>

      {/* Configuration Panel */}
      <div className="w-full max-w-4xl warm-card paper-texture p-6 mb-6 relative z-10 animate-fade-in-up" style={{ animationDelay: '100ms' }}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* Model A Selection */}
          <div>
            <label className="font-display font-semibold text-lg text-walnut-800 block mb-2 flex items-center gap-2">
              <span className="w-8 h-8 rounded-full bg-terracotta-500 text-parchment-50 flex items-center justify-center text-sm font-bold">A</span>
              Model A
            </label>
            <div className="relative">
              <select
                value={modelA}
                onChange={(e) => setModelA(e.target.value)}
                disabled={isRunning}
                className="select-organic w-full px-3 py-2 pr-8 text-sm disabled:opacity-50"
              >
                <option value="">— Select Model A —</option>
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

          {/* Model B Selection */}
          <div>
            <label className="font-display font-semibold text-lg text-walnut-800 block mb-2 flex items-center gap-2">
              <span className="w-8 h-8 rounded-full bg-sage-600 text-parchment-50 flex items-center justify-center text-sm font-bold">B</span>
              Model B
            </label>
            <div className="relative">
              <select
                value={modelB}
                onChange={(e) => setModelB(e.target.value)}
                disabled={isRunning}
                className="select-organic w-full px-3 py-2 pr-8 text-sm disabled:opacity-50"
              >
                <option value="">— Select Model B —</option>
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
        </div>

        {/* Initial Prompt */}
        <div className="mb-4">
          <label className="font-display font-semibold text-walnut-800 block mb-2">
            Discussion Topic / Initial Prompt
          </label>
          <textarea
            value={initialPrompt}
            onChange={(e) => setInitialPrompt(e.target.value)}
            disabled={isRunning}
            placeholder="Enter a topic or question for the AI models to discuss... (e.g., 'Debate the pros and cons of artificial general intelligence')"
            className="input-organic w-full h-20 p-3 text-sm resize-none disabled:opacity-50"
          />
        </div>

        {/* Controls Row */}
        <div className="flex flex-wrap items-center gap-4">
          {/* Turn Limit */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-walnut-700">Max Turns:</label>
            <input
              type="number"
              value={maxTurns}
              onChange={(e) => setMaxTurns(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
              disabled={isRunning}
              min="1"
              max="50"
              className="input-organic w-20 px-2 py-1 text-sm text-center disabled:opacity-50"
            />
          </div>

          <div className="flex-grow" />

          {/* Action Buttons */}
          <div className="flex gap-2">
            {!isRunning ? (
              <button
                onClick={runConversation}
                disabled={!modelA || !modelB || !initialPrompt.trim()}
                className="btn-primary py-2 px-5 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
              >
                <Play size={18} />
                Start Discussion
              </button>
            ) : (
              <button
                onClick={stopConversation}
                className="bg-red-500 hover:bg-red-600 text-parchment-50 font-semibold py-2 px-5 rounded-xl flex items-center gap-2 shadow-warm transition-all"
              >
                <Square size={18} />
                Stop
              </button>
            )}

            <button
              onClick={clearConversation}
              disabled={isRunning || conversation.length === 0}
              className="btn-secondary py-2 px-4 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Clear conversation"
            >
              <Trash2 size={18} />
            </button>

            <button
              onClick={copyConversation}
              disabled={conversation.length === 0}
              className="btn-secondary py-2 px-4 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Copy conversation"
            >
              <Copy size={18} />
            </button>
          </div>
        </div>

        {/* Progress indicator */}
        {isRunning && (
          <div className="mt-4 pt-4 border-t border-parchment-300/50">
            <div className="flex items-center gap-3">
              <Loader2 size={18} className="animate-spin text-terracotta-500" />
              <span className="text-sm text-walnut-600">
                Turn {currentTurn} of {maxTurns} — 
                <span className={`font-semibold ml-1 ${currentSpeaker === 'A' ? 'text-terracotta-600' : 'text-sage-600'}`}>
                  {currentSpeaker === 'A' ? getModelName(modelA) : getModelName(modelB)}
                </span>
                {' '}is responding...
              </span>
            </div>
            {/* Progress bar */}
            <div className="mt-2 h-1.5 bg-parchment-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-terracotta-400 to-sage-500 transition-all duration-300"
                style={{ width: `${(currentTurn / maxTurns) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Conversation Display */}
      <div className="w-full max-w-4xl warm-card paper-texture p-6 relative z-10 animate-fade-in-up min-h-[400px] max-h-[600px] flex flex-col" style={{ animationDelay: '200ms' }}>
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-parchment-300/50">
          <h2 className="font-display font-semibold text-lg text-walnut-800 flex items-center gap-2">
            <MessageSquare size={20} className="text-terracotta-500" />
            Conversation
          </h2>
          {conversation.length > 0 && (
            <span className="text-xs bg-parchment-200 text-walnut-600 px-2 py-1 rounded-full">
              {conversation.filter(m => m.speaker !== 'user').length} messages
            </span>
          )}
        </div>

        <div className="flex-grow overflow-y-auto pr-2 space-y-4">
          {conversation.length === 0 && !isRunning && (
            <div className="h-full flex items-center justify-center text-walnut-400 italic">
              <div className="text-center">
                <ArrowRightLeft size={48} className="mx-auto mb-3 opacity-30" />
                <p>Configure the models above and start a discussion</p>
              </div>
            </div>
          )}

          {conversation.map((message, index) => (
            <div
              key={index}
              className={`animate-fade-in-up ${
                message.speaker === 'user' 
                  ? 'text-center' 
                  : message.speaker === 'A'
                    ? 'mr-8'
                    : 'ml-8'
              }`}
              style={{ animationDelay: `${index * 50}ms` }}
            >
              {message.speaker === 'user' ? (
                /* Initial Prompt */
                <div className="inline-block bg-ochre-100 border border-ochre-200 rounded-xl px-5 py-3 max-w-2xl">
                  <span className="text-xs font-medium text-ochre-700 block mb-1">Initial Topic</span>
                  <p className="text-walnut-700 text-sm">{message.content}</p>
                </div>
              ) : message.speaker === 'system' ? (
                /* Error message */
                <div className="text-center">
                  <div className="inline-block bg-red-50 border border-red-200 rounded-xl px-4 py-2">
                    <p className="text-red-600 text-sm">{message.content}</p>
                  </div>
                </div>
              ) : (
                /* Model responses */
                <div className={`rounded-2xl p-4 ${
                  message.speaker === 'A'
                    ? 'bg-gradient-to-br from-terracotta-50 to-terracotta-100/50 border border-terracotta-200/60'
                    : 'bg-gradient-to-br from-sage-50 to-sage-100/50 border border-sage-200/60'
                }`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-parchment-50 ${
                      message.speaker === 'A' ? 'bg-terracotta-500' : 'bg-sage-600'
                    }`}>
                      {message.speaker}
                    </span>
                    <span className={`text-sm font-semibold ${
                      message.speaker === 'A' ? 'text-terracotta-700' : 'text-sage-700'
                    }`}>
                      {getModelName(message.model)}
                    </span>
                    <span className="text-xs text-walnut-400 ml-auto">Turn {message.turn}</span>
                  </div>
                  <p className="text-walnut-700 text-sm leading-relaxed whitespace-pre-wrap">
                    {renderTextWithLinks(message.content)}
                  </p>
                </div>
              )}
            </div>
          ))}

          {/* Streaming message */}
          {isRunning && streamingMessage && (
            <div 
              className={`animate-fade-in-up ${currentSpeaker === 'A' ? 'mr-8' : 'ml-8'}`}
            >
              <div className={`rounded-2xl p-4 ${
                currentSpeaker === 'A'
                  ? 'bg-gradient-to-br from-terracotta-50 to-terracotta-100/50 border border-terracotta-200/60'
                  : 'bg-gradient-to-br from-sage-50 to-sage-100/50 border border-sage-200/60'
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-parchment-50 ${
                    currentSpeaker === 'A' ? 'bg-terracotta-500' : 'bg-sage-600'
                  }`}>
                    {currentSpeaker}
                  </span>
                  <span className={`text-sm font-semibold ${
                    currentSpeaker === 'A' ? 'text-terracotta-700' : 'text-sage-700'
                  }`}>
                    {getModelName(currentSpeaker === 'A' ? modelA : modelB)}
                  </span>
                  <Loader2 size={14} className="animate-spin text-walnut-400 ml-auto" />
                </div>
                <p className="text-walnut-700 text-sm leading-relaxed whitespace-pre-wrap">
                  {renderTextWithLinks(streamingMessage)}
                  <span className="inline-block w-1.5 h-4 bg-walnut-400 ml-0.5 animate-pulse" />
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default DualAgentChat

