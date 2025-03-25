// Voice feedback module using Eleven Labs Conversational AI
import { Conversation } from '@11labs/client';

class VoiceFeedbackManager {
  constructor() {
    this.conversation = null;
    this.isActive = false;
    this.isCooldown = true; // Start with cooldown active (10 seconds initial lock)
    this.lastFeedbackTime = 0;
    this.feedbackQueue = [];
    // Your public ElevenLabs agent ID goes here
    this.agentId = 'YOUR_AGENT_ID_HERE'; 
    this.feedbackTimeout = null;
    this.cooldownDuration = 10000; // 10 seconds initial lock
    this.sessionCooldown = 5000; // 5 seconds between feedback sessions
    
    // Remove cooldown after initial 10 seconds
    setTimeout(() => {
      this.isCooldown = false;
      console.log('Voice feedback enabled after initial cooldown');
    }, this.cooldownDuration);
  }

  /**
   * Queue feedback to be spoken by the AI agent
   * @param {Object} feedbackData - Data about the error
   * @param {string} feedbackData.exercise - Current exercise (plank, chaturanga)
   * @param {string[]} feedbackData.incorrectParts - Body parts that need correction
   * @param {string[]} feedbackData.feedback - Feedback messages to convey
   * @returns {boolean} - Whether the feedback was queued successfully
   */
  queueFeedback(feedbackData) {
    if (this.isCooldown) {
      console.log('Still in cooldown period, not queuing feedback');
      return false;
    }
    
    const now = Date.now();
    
    // Don't queue similar feedback too frequently
    if (now - this.lastFeedbackTime < this.sessionCooldown) {
      return false;
    }
    
    // If we already have a similar feedback in the queue, don't add another
    const feedbackKey = JSON.stringify(feedbackData.feedback.sort());
    if (this.feedbackQueue.some(item => JSON.stringify(item.feedback.sort()) === feedbackKey)) {
      return false;
    }
    
    this.feedbackQueue.push(feedbackData);
    
    // If no active conversation, process the queue
    if (!this.isActive) {
      this.processQueue();
    }
    
    return true;
  }

  /**
   * Process the feedback queue by starting a conversation with the agent
   */
  async processQueue() {
    if (this.feedbackQueue.length === 0 || this.isActive) {
      return;
    }
    
    const feedbackData = this.feedbackQueue.shift();
    this.lastFeedbackTime = Date.now();
    this.isActive = true;
    
    try {
      // Create system prompt and first message from feedback data
      const { exercise, incorrectParts, feedback } = feedbackData;
      
      // Create a personalized system prompt based on the exercise and errors
      const systemPrompt = this.createSystemPrompt(exercise, incorrectParts, feedback);
      
      // Create first message that the agent will say
      const firstMessage = this.createFirstMessage(exercise, feedback);
      
      console.log('Starting voice feedback session');
      console.log('System prompt:', systemPrompt);
      console.log('First message:', firstMessage);
      
      // Simple configuration using just the agent ID
      const sessionConfig = {
        agentId: this.agentId,
        overrides: {
          agent: {
            prompt: {
              prompt: systemPrompt
            },
            firstMessage: firstMessage,
            language: "en"
          }
        },
        onConnect: () => {
          console.log('Voice feedback connected');
          this.updateFeedbackStatus('Speaking');
        },
        onDisconnect: () => {
          console.log('Voice feedback disconnected');
          this.isActive = false;
          this.updateFeedbackStatus('Inactive');
          
          // Process next item in queue after a short delay
          setTimeout(() => this.processQueue(), 1000);
        },
        onError: (error) => {
          console.error('Voice feedback error:', error);
          this.isActive = false;
          this.updateFeedbackStatus('Error');
          
          // Try to process next item in queue after error recovery time
          setTimeout(() => this.processQueue(), 3000);
        },
        onModeChange: (mode) => {
          console.log('Voice feedback mode changed:', mode.mode);
          if (mode.mode === 'speaking') {
            this.updateFeedbackStatus('Speaking');
          } else {
            this.updateFeedbackStatus('Listening');
          }
        }
      };
      
      // Start the conversation session
      this.conversation = await Conversation.startSession(sessionConfig);
    } catch (error) {
      console.error('Failed to start voice feedback session:', error);
      this.isActive = false;
      this.updateFeedbackStatus('Error');
      
      // Try again with next item after error recovery time
      setTimeout(() => this.processQueue(), 3000);
    }
  }

  /**
   * End the current conversation session
   */
  async endSession() {
    if (this.conversation) {
      try {
        await this.conversation.endSession();
      } catch (error) {
        console.error('Error ending voice feedback session:', error);
      }
      this.conversation = null;
      this.isActive = false;
      this.updateFeedbackStatus('Inactive');
    }
  }

  /**
   * Create a system prompt for the AI agent based on feedback data
   */
  createSystemPrompt(exercise, incorrectParts, feedback) {
    const exerciseName = exercise.charAt(0).toUpperCase() + exercise.slice(1);
    
    const prompt = `You are a yoga and fitness instructor helping a student with their ${exerciseName} pose. 
You're providing real-time feedback on their form through voice guidance.

The student is currently making the following mistakes:
${feedback.map(msg => `- ${msg}`).join('\n')}

Focus areas: ${incorrectParts.join(', ')}

Important instructions:
1. Be encouraging but direct about form corrections
2. Use clear, simple instructions
3. Keep responses brief (under 10 seconds)
4. Avoid asking questions - just provide guidance
5. Speak as if you're watching them right now
6. Don't introduce yourself or use pleasantries - get straight to the feedback

Your goal is to help them correct their form immediately with clear, actionable guidance.`;

    return prompt;
  }

  /**
   * Create the first message for the AI agent based on feedback data
   */
  createFirstMessage(exercise, feedback) {
    // Take the first feedback item as the primary correction
    const primaryFeedback = feedback[0] || `Adjust your ${exercise} pose`;
    
    // Make it more direct for voice feedback
    const message = primaryFeedback.replace('your', 'your').trim();
    
    return message.charAt(0).toUpperCase() + message.slice(1);
  }

  /**
   * Update the UI to show feedback status
   */
  updateFeedbackStatus(status) {
    const statusElement = document.getElementById('voiceFeedbackStatus');
    if (statusElement) {
      // Update text content
      const textSpan = statusElement.querySelector('span:not(.voice-indicator)');
      if (textSpan) {
        textSpan.textContent = `Voice Feedback: ${status}`;
      }
      
      // Update status class
      if (status === 'Speaking') {
        statusElement.className = 'voice-status status-speaking';
      } else if (status === 'Inactive') {
        statusElement.className = 'voice-status status-inactive';
      } else if (status === 'Error') {
        statusElement.className = 'voice-status status-error';
      } else {
        statusElement.className = 'voice-status status-listening';
      }
    }
  }
}

// Create and export a singleton instance
const voiceFeedback = new VoiceFeedbackManager();
export default voiceFeedback;
