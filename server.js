import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json())

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' })
})

// Streaming chat completion endpoint
app.post('/api/chat', async (req, res) => {
  const { model, messages } = req.body

  if (!model || !messages) {
    return res.status(400).json({ error: 'Model and messages are required' })
  }

  const apiKey = process.env.OPENROUTER_API_KEY

  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured on server' })
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.APP_URL || 'http://localhost:5174',
        'X-Title': 'Bot Council',
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      return res.status(response.status).json({ 
        error: `OpenRouter API error: ${response.status} - ${errorText}` 
      })
    }

    // Set headers for streaming
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    // Pipe the stream from OpenRouter to the client
    const reader = response.body.getReader()

    const pump = async () => {
      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          res.end()
          break
        }
        res.write(value)
      }
    }

    // Handle client disconnect
    req.on('close', () => {
      reader.cancel()
    })

    await pump()
  } catch (error) {
    console.error('Server error:', error)
    if (!res.headersSent) {
      res.status(500).json({ error: error.message })
    } else {
      res.end()
    }
  }
})

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`)
})


